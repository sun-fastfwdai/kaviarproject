import "server-only";
import { db, schema } from "../db";
import { excludedSet } from "../db/upsert";
import { decrypt } from "../crypto";
import { env } from "../env";
import { metaGetAll } from "./client";
import { and, eq } from "drizzle-orm";
import { budget, dateWindows, historyWindows, mapCreative, mapDetail, mapInsight, type InsightRow, type MonthRow, type RawCreative, type SliceRow, type TotalRow } from "./map";

type Conn = typeof schema.connections.$inferSelect;
const T = schema;
const campaignSet = excludedSet(T.metaCampaigns, ["brandId", "id"]);
const adSet = excludedSet(T.metaAds, ["brandId", "id", "detail"]); // `detail` is written by its own daily read, never wiped by the hourly one
const insightSet = excludedSet(T.metaInsightsDaily, ["brandId", "adId", "date"]);

type Campaign = { id: string; name: string; objective?: string; status?: string; effective_status?: string; daily_budget?: string; lifetime_budget?: string; created_time?: string; updated_time?: string };
type Ad = { id: string; name: string; status?: string; effective_status?: string; campaign_id?: string; adset_id?: string; created_time?: string; updated_time?: string; creative?: RawCreative };

const day = (d: Date, timeZone: string) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

async function chunks<R>(rows: R[], size: number, fn: (b: R[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}

/**
 * Campaigns + ads every run; daily ad-level insights for the backfill window, then the last 7 days
 * on each run (Meta keeps restating recent days as late conversions arrive).
 */
export async function syncMeta(conn: Conn, cursor: string | null): Promise<Record<string, number>> {
  const act = conn.externalId!;
  const token = decrypt(conn.accessToken!);
  const currency = String(conn.details?.currency ?? "USD");
  const tz = String(conn.details?.timezone ?? "UTC");
  const brandId = conn.brandId;

  const campaigns = await metaGetAll<Campaign>(`${act}/campaigns`, {
    fields: "id,name,objective,status,effective_status,daily_budget,lifetime_budget,created_time,updated_time",
    limit: "200",
  }, token);
  await chunks(campaigns, 200, (b) =>
    db.insert(T.metaCampaigns).values(b.map((c) => ({
      brandId, id: c.id, accountId: act, name: c.name, objective: c.objective ?? null, status: c.status ?? null,
      effectiveStatus: c.effective_status ?? null, dailyBudget: budget(c.daily_budget, currency), lifetimeBudget: budget(c.lifetime_budget, currency),
      createdTime: c.created_time ? new Date(c.created_time) : null, updatedTime: c.updated_time ? new Date(c.updated_time) : null,
    }))).onConflictDoUpdate({ target: [T.metaCampaigns.brandId, T.metaCampaigns.id], set: campaignSet }),
  );

  const ads = await metaGetAll<Ad>(`${act}/ads`, {
    // The ad as it ran: its words, picture or video and link come with it, so what was said can be set beside what it brought.
    fields: "id,name,status,effective_status,campaign_id,adset_id,created_time,updated_time,creative{title,body,image_url,thumbnail_url,video_id,object_type,call_to_action_type,object_story_spec,asset_feed_spec}",
    limit: "100",
  }, token);
  await chunks(ads, 200, (b) =>
    db.insert(T.metaAds).values(b.map((a) => ({
      brandId, id: a.id, name: a.name, campaignId: a.campaign_id ?? null, adsetId: a.adset_id ?? null, status: a.status ?? null,
      effectiveStatus: a.effective_status ?? null, thumbnailUrl: a.creative?.thumbnail_url ?? null, creative: mapCreative(a.creative),
      createdTime: a.created_time ? new Date(a.created_time) : null, updatedTime: a.updated_time ? new Date(a.updated_time) : null,
    }))).onConflictDoUpdate({ target: [T.metaAds.brandId, T.metaAds.id], set: adSet }),
  );

  const until = day(new Date(), tz);
  const since = cursor
    ? day(new Date(new Date(`${cursor}T00:00:00Z`).getTime() - 7 * 864e5), "UTC")
    : day(new Date(Date.now() - env.meta().backfillDays * 864e5), tz);

  let insightRows = 0;
  for (const w of dateWindows(since, until, 30)) insightRows += await readDays(brandId, act, token, w);
  // Once a day: what the daily rows cannot hold. It never fails the sync — the numbers above are already saved.
  let detailed = 0;
  if (ads.length && cursor !== until) detailed = await syncDetail(brandId, act, token, tz).catch((e) => { console.error("meta ad detail", (e as Error).message.slice(0, 200)); return 0; });
  return { campaigns: campaigns.length, ads: ads.length, insights: insightRows, ...(detailed ? { detailed } : {}) };
}

/** One stretch of days, per ad per day, saved over whatever was there. */
async function readDays(brandId: string, act: string, token: string, w: { since: string; until: string }): Promise<number> {
  const rows = await metaGetAll<InsightRow>(`${act}/insights`, {
    level: "ad",
    time_increment: "1",
    time_range: JSON.stringify(w),
    fields: "ad_id,campaign_id,date_start,spend,impressions,inline_link_clicks,actions,action_values",
    limit: "500",
  }, token);
  await chunks(rows, 500, (b) =>
    db.insert(T.metaInsightsDaily).values(b.map((r) => mapInsight(brandId, r)))
      .onConflictDoUpdate({ target: [T.metaInsightsDaily.brandId, T.metaInsightsDaily.adId, T.metaInsightsDaily.date], set: insightSet }),
  );
  return rows.length;
}

/** Meta keeps daily totals for 37 months; this stays just inside that. */
const HISTORY_DAYS = 1100;
const shift = (d: string, days: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + days * 864e5).toISOString().slice(0, 10);

/**
 * The account's older results, as far back as Meta keeps them — so a brand that has run ads before starts with its own rates, not
 * assumptions. One light read finds the months that had any delivery; only those are read by day, newest first. `reached` is the
 * earliest day already read; it is saved after every month, and the read stops when its time is up, so a large account is finished
 * over a few hourly runs and never holds up a sync. Returns null once there is nothing older left to read.
 */
export async function syncHistory(conn: Conn, reached: string | null, save: (cursor: string) => Promise<void>, budgetMs = 60_000): Promise<number | null> {
  const act = conn.externalId!, tz = String(conn.details?.timezone ?? "UTC"), today = day(new Date(), tz);
  const floor = shift(today, -HISTORY_DAYS), edge = reached ?? shift(today, -env.meta().backfillDays);
  if (edge <= floor) return null;
  const token = decrypt(conn.accessToken!), started = Date.now();
  const months = await metaGetAll<MonthRow>(`${act}/insights`, { level: "account", time_increment: "monthly", time_range: JSON.stringify({ since: floor, until: shift(edge, -1) }), fields: "spend,impressions", limit: "100" }, token);
  let rows = 0;
  for (const w of historyWindows(months, floor, shift(edge, -1))) {
    rows += await readDays(conn.brandId, act, token, w);
    await save(w.since);
    if (Date.now() - started > budgetMs) return rows; // the rest on the next run
  }
  await save(floor);
  return rows;
}

/**
 * For each ad over the last 30 days: how many different people saw it and how often, how much of its video was watched, and its
 * results split by age and gender and by placement. Three reads for the whole account, not three per ad.
 */
async function syncDetail(brandId: string, act: string, token: string, tz: string): Promise<number> {
  const w = { since: day(new Date(Date.now() - 29 * 864e5), tz), until: day(new Date(), tz) };
  const ask = <R>(fields: string, breakdowns?: string) => metaGetAll<R>(`${act}/insights`, { level: "ad", time_range: JSON.stringify(w), fields, limit: "500", ...(breakdowns ? { breakdowns } : {}) }, token);
  const VIDEO = "video_play_actions,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p100_watched_actions,video_thruplay_watched_actions,video_avg_time_watched_actions";
  // If Meta refuses a video field on this version, the reach and frequency are still read.
  const totals = await ask<TotalRow>(`ad_id,impressions,reach,frequency,${VIDEO}`).catch(() => ask<TotalRow>("ad_id,impressions,reach,frequency"));
  if (!totals.length) return 0;
  const SLICE = "ad_id,spend,impressions,inline_link_clicks,actions,action_values";
  const [ages, places] = await Promise.all([ask<SliceRow>(SLICE, "age,gender").catch(() => [] as SliceRow[]), ask<SliceRow>(SLICE, "publisher_platform,platform_position").catch(() => [] as SliceRow[])]);
  const details = mapDetail(totals, ages, places, w, new Date().toISOString());
  for (const [id, d] of Object.entries(details)) await db.update(T.metaAds).set({ detail: d }).where(and(eq(T.metaAds.brandId, brandId), eq(T.metaAds.id, id)));
  return Object.keys(details).length;
}

export const metaCursorFor = (conn: Conn) => day(new Date(), String(conn.details?.timezone ?? "UTC"));
