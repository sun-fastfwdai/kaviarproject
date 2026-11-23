/** Pure helpers for Meta Marketing API payloads (unit-tested). */
import type { AdCreative, AdDetail, AdSeg } from "../db/schema";

type Action = { action_type: string; value: string };
const PURCHASE_TYPES = ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"];

/** Meta reports the same purchase under several action types; take the first, most complete one. */
export function purchaseMetric(actions: Action[] | undefined): number {
  if (!actions?.length) return 0;
  for (const t of PURCHASE_TYPES) {
    const a = actions.find((x) => x.action_type === t);
    if (a) return Number(a.value) || 0;
  }
  return 0;
}

// Currencies Meta stores budgets for without a minor unit (offset 1). Everything else is in cents.
const NO_MINOR = new Set(["CLP", "COP", "CRC", "HUF", "ISK", "IDR", "JPY", "KRW", "PYG", "TWD", "VND"]);
export function budget(v: string | number | null | undefined, currency: string): number | null {
  if (v == null || v === "" || Number(v) === 0) return null;
  return Number(v) / (NO_MINOR.has(currency.toUpperCase()) ? 1 : 100);
}

export type InsightRow = {
  ad_id: string;
  campaign_id?: string;
  date_start: string;
  spend?: string;
  impressions?: string;
  inline_link_clicks?: string;
  actions?: Action[];
  action_values?: Action[];
};

export function mapInsight(brandId: string, r: InsightRow) {
  return {
    brandId,
    adId: r.ad_id,
    campaignId: r.campaign_id ?? null,
    date: r.date_start,
    spend: Number(r.spend ?? 0),
    impressions: Number(r.impressions ?? 0),
    clicks: Number(r.inline_link_clicks ?? 0),
    purchases: purchaseMetric(r.actions),
    purchaseValue: purchaseMetric(r.action_values),
  };
}

/** Split [since, until] (YYYY-MM-DD) into windows of `days` so each insights call stays small. */
export function dateWindows(since: string, until: string, days = 30): { since: string; until: string }[] {
  const out: { since: string; until: string }[] = [];
  let a = new Date(`${since}T00:00:00Z`);
  const end = new Date(`${until}T00:00:00Z`);
  while (a <= end) {
    const b = new Date(Math.min(a.getTime() + (days - 1) * 864e5, end.getTime()));
    out.push({ since: a.toISOString().slice(0, 10), until: b.toISOString().slice(0, 10) });
    a = new Date(b.getTime() + 864e5);
  }
  return out;
}

export type MonthRow = { date_start: string; date_stop: string; spend?: string; impressions?: string };
/**
 * Which stretches of an account's past are worth reading day by day: only the months Meta says had any delivery, newest first, kept
 * inside [since, until]. An account that never ran ads gives none, so its history costs one read.
 */
export function historyWindows(months: MonthRow[], since: string, until: string): { since: string; until: string }[] {
  return months
    .filter((m) => Number(m.impressions ?? 0) > 0 || Number(m.spend ?? 0) > 0)
    .map((m) => ({ since: m.date_start < since ? since : m.date_start, until: m.date_stop > until ? until : m.date_stop }))
    .filter((w) => w.since <= w.until)
    .sort((a, b) => (a.since < b.since ? 1 : a.since > b.since ? -1 : 0));
}

// ---------------------------------------------------------------- the ad as it ran, and its results in slices

type Cta = { type?: string; value?: { link?: string } };
export type RawCreative = {
  title?: string; body?: string; image_url?: string; thumbnail_url?: string; video_id?: string; object_type?: string; call_to_action_type?: string;
  object_story_spec?: {
    link_data?: { message?: string; name?: string; description?: string; picture?: string; link?: string; call_to_action?: Cta; child_attachments?: unknown[] };
    video_data?: { message?: string; title?: string; link_description?: string; image_url?: string; video_id?: string; call_to_action?: Cta };
  };
  asset_feed_spec?: { bodies?: { text?: string }[]; titles?: { text?: string }[]; descriptions?: { text?: string }[]; images?: { url?: string }[]; videos?: { video_id?: string }[]; link_urls?: { website_url?: string }[] };
};
/** Meta keeps an ad's words in one of three places depending on how it was made; the first that has them wins. */
export function mapCreative(c: RawCreative | undefined): AdCreative | null {
  if (!c) return null;
  const ld = c.object_story_spec?.link_data, vd = c.object_story_spec?.video_data, af = c.asset_feed_spec;
  const body = c.body ?? ld?.message ?? vd?.message ?? af?.bodies?.[0]?.text ?? "", title = c.title ?? ld?.name ?? vd?.title ?? af?.titles?.[0]?.text ?? "";
  const image = c.image_url ?? ld?.picture ?? vd?.image_url ?? af?.images?.[0]?.url ?? c.thumbnail_url ?? null, videoId = c.video_id ?? vd?.video_id ?? af?.videos?.[0]?.video_id ?? null;
  if (!body && !title && !image && !videoId) return null;
  const cards = ld?.child_attachments?.length ?? 0;
  return {
    kind: cards > 1 ? "carousel" : videoId || c.object_type === "VIDEO" ? "video" : image ? "image" : "other",
    body: body.slice(0, 2000), title: title.slice(0, 300), description: (ld?.description ?? vd?.link_description ?? af?.descriptions?.[0]?.text ?? "").slice(0, 500),
    cta: c.call_to_action_type ?? ld?.call_to_action?.type ?? vd?.call_to_action?.type ?? null, image, videoId,
    link: ld?.link ?? vd?.call_to_action?.value?.link ?? ld?.call_to_action?.value?.link ?? af?.link_urls?.[0]?.website_url ?? null, ...(cards > 1 ? { cards } : {}),
  };
}

export type TotalRow = { ad_id: string; impressions?: string; reach?: string; frequency?: string; video_play_actions?: Action[]; video_p25_watched_actions?: Action[]; video_p50_watched_actions?: Action[];
  video_p75_watched_actions?: Action[]; video_p100_watched_actions?: Action[]; video_thruplay_watched_actions?: Action[]; video_avg_time_watched_actions?: Action[] };
export type SliceRow = InsightRow & { age?: string; gender?: string; publisher_platform?: string; platform_position?: string };
const first = (a: Action[] | undefined) => Number(a?.[0]?.value ?? 0) || 0;
const seg = (key: string, r: SliceRow): AdSeg => ({ key, impressions: Number(r.impressions ?? 0), spend: Number(r.spend ?? 0), clicks: Number(r.inline_link_clicks ?? 0), purchases: purchaseMetric(r.actions), value: purchaseMetric(r.action_values) });
const words = (v: string | undefined) => (v ?? "unknown").replace(/_/g, " ");

/** Put the three reads together, per ad: totals, who saw it, where it ran. Slices come biggest first. */
export function mapDetail(totals: TotalRow[], ages: SliceRow[], places: SliceRow[], w: { since: string; until: string }, at: string): Record<string, AdDetail> {
  const out: Record<string, AdDetail> = {};
  for (const t of totals) {
    const plays = first(t.video_play_actions), p25 = first(t.video_p25_watched_actions);
    out[t.ad_id] = { at, since: w.since, until: w.until, reach: Number(t.reach ?? 0), frequency: Number(t.frequency ?? 0) || (Number(t.reach) > 0 ? Number(t.impressions ?? 0) / Number(t.reach) : 0),
      video: plays || p25 ? { plays, p25, p50: first(t.video_p50_watched_actions), p75: first(t.video_p75_watched_actions), p100: first(t.video_p100_watched_actions), thruplays: first(t.video_thruplay_watched_actions), avgSeconds: first(t.video_avg_time_watched_actions) } : null,
      ages: [], places: [] };
  }
  for (const r of ages) out[r.ad_id]?.ages.push(seg(`${words(r.gender)} ${r.age ?? "unknown"}`, r));
  // Meta repeats the platform in some placement names ("instagram_reels"); once is enough.
  for (const r of places) { const where = words(r.publisher_platform), spot = words(r.platform_position); out[r.ad_id]?.places.push(seg(`${where} · ${spot.startsWith(`${where} `) ? spot.slice(where.length + 1) : spot}`, r)); }
  for (const d of Object.values(out)) { d.ages.sort((a, b) => b.impressions - a.impressions); d.places.sort((a, b) => b.impressions - a.impressions); d.ages = d.ages.slice(0, 14); d.places = d.places.slice(0, 12); }
  return out;
}
