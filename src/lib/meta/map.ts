/** Pure helpers for Meta Marketing API payloads (unit-tested). */

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
