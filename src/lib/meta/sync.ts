import "server-only";
import { db, schema } from "../db";
import { excludedSet } from "../db/upsert";
import { decrypt } from "../crypto";
import { env } from "../env";
import { metaGetAll } from "./client";
import { budget, dateWindows, mapInsight, type InsightRow } from "./map";

type Conn = typeof schema.connections.$inferSelect;
const T = schema;
const campaignSet = excludedSet(T.metaCampaigns, ["brandId", "id"]);
const adSet = excludedSet(T.metaAds, ["brandId", "id"]);
const insightSet = excludedSet(T.metaInsightsDaily, ["brandId", "adId", "date"]);

type Campaign = { id: string; name: string; objective?: string; status?: string; effective_status?: string; daily_budget?: string; lifetime_budget?: string; created_time?: string; updated_time?: string };
type Ad = { id: string; name: string; status?: string; effective_status?: string; campaign_id?: string; adset_id?: string; created_time?: string; updated_time?: string; creative?: { thumbnail_url?: string } };

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
    fields: "id,name,status,effective_status,campaign_id,adset_id,created_time,updated_time,creative{thumbnail_url}",
    limit: "200",
  }, token);
  await chunks(ads, 200, (b) =>
    db.insert(T.metaAds).values(b.map((a) => ({
      brandId, id: a.id, name: a.name, campaignId: a.campaign_id ?? null, adsetId: a.adset_id ?? null, status: a.status ?? null,
      effectiveStatus: a.effective_status ?? null, thumbnailUrl: a.creative?.thumbnail_url ?? null,
      createdTime: a.created_time ? new Date(a.created_time) : null, updatedTime: a.updated_time ? new Date(a.updated_time) : null,
    }))).onConflictDoUpdate({ target: [T.metaAds.brandId, T.metaAds.id], set: adSet }),
  );

  const until = day(new Date(), tz);
  const since = cursor
    ? day(new Date(new Date(`${cursor}T00:00:00Z`).getTime() - 7 * 864e5), "UTC")
    : day(new Date(Date.now() - env.meta().backfillDays * 864e5), tz);

  let insightRows = 0;
  for (const w of dateWindows(since, until, 30)) {
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
    insightRows += rows.length;
  }
  return { campaigns: campaigns.length, ads: ads.length, insights: insightRows };
}

export const metaCursorFor = (conn: Conn) => day(new Date(), String(conn.details?.timezone ?? "UTC"));
