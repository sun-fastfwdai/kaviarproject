import "server-only";
import { z } from "zod";
import { and, desc, eq, isNotNull, ne } from "drizzle-orm";
import { db, schema } from "../db";
import { decrypt } from "../crypto";
import { ask } from "../ai/client";
import { metaGet } from "../meta/client";
import { storeFacts } from "./context";
import { adLibraryUrl, marketName, type AdsRead, type Evidence, type MarketReport, type RivalAds, type Segment } from "./types";

/**
 * "Measure the market": numbers read from real sources, each kept as an evidence record with its source and date.
 * Free and always on: the brand's own Shopify and Meta results, Meta's audience-size estimate for every buyer group, and counts from
 * competitors' ads in the Ad Library. Google search volume switches on when a DataForSEO login is set for the project.
 */
type Row = { brandId: string; subject: string; market: string };
type Draft = Omit<Evidence, "id" | "at">;
const today = () => new Date().toLocaleDateString("en-GB", { month: "short", year: "numeric" });

// ---------------------------------------------------------------- the brand's own numbers
async function own(row: Row): Promise<Draft[]> {
  const f = await storeFacts(row.brandId, row.subject || null).catch(() => null);
  if (!f) return [];
  const out: Draft[] = [], shop = { source: "Shopify" as const, quality: "measured" as const, kind: "store" as const, subject: "This brand’s store", period: "last 90 days" };
  if (f.last90Days) {
    out.push({ ...shop, metric: "Orders placed", value: f.last90Days.orders, unit: "orders" });
    if (f.last90Days.averageOrder != null) out.push({ ...shop, metric: "Average order", value: f.last90Days.averageOrder, unit: "$", quality: "calculated" });
    if (f.last90Days.returningOrders) out.push({ ...shop, metric: "Orders from returning customers", value: f.last90Days.returningOrders, unit: "orders" });
  }
  if (f.customers) out.push({ ...shop, metric: "Customers on file", value: f.customers, unit: "customers", period: "all time" });
  if (f.repeatRate != null && f.customers >= 20) out.push({ ...shop, metric: "Customers who bought again", value: f.repeatRate, unit: "%", quality: "calculated", period: "all time" });
  if (f.ordersWithACode != null && f.last90Days?.orders) out.push({ ...shop, metric: "Orders that used a discount code", value: f.ordersWithACode, unit: "%", quality: "calculated" });
  if (f.product) out.push({ ...shop, subject: f.product.title, metric: "Units sold", value: f.product.unitsLast90Days, unit: "units" });
  if (f.ads) {
    const ads = { source: "Meta Ads" as const, kind: "ads" as const, subject: "This brand’s Meta ads", period: "last 90 days" };
    out.push({ ...ads, metric: "Ad spend", value: f.ads.spendLast90Days, unit: "$", quality: "measured" });
    out.push({ ...ads, metric: "Real return on ad spend (Shopify orders ÷ spend)", value: f.ads.realReturn, unit: "×", quality: "calculated" });
    if (f.ads.clickRate != null) out.push({ ...ads, metric: "Link click rate", value: f.ads.clickRate, unit: "%", quality: "calculated" });
  }
  return out;
}

// ---------------------------------------------------------------- Meta: how many people each buyer group is
/** An ad account to ask with: this brand's, else any the team has connected (the estimate is about the audience, not the account). */
async function metaAccount(brandId: string): Promise<{ act: string; token: string } | null> {
  const C = schema.connections;
  const rows = await db.select({ brandId: C.brandId, act: C.externalId, token: C.accessToken, status: C.status }).from(C)
    .where(and(eq(C.provider, "meta"), isNotNull(C.accessToken), isNotNull(C.externalId), ne(C.status, "disconnected"), ne(C.status, "sample"))).orderBy(desc(C.connectedAt)).limit(10);
  const c = rows.find((r) => r.brandId === brandId) ?? rows[0];
  if (!c?.token || !c.act) return null;
  try { return { act: c.act, token: decrypt(c.token) }; } catch { return null; }
}

const ages = (s: string) => {
  const m = /(\d{2})\D+(\d{2})/.exec(s), one = /(\d{2})\s*\+/.exec(s);
  const lo = m ? Number(m[1]) : one ? Number(one[1]) : 18, hi = m ? Number(m[2]) : 65;
  return { age_min: Math.min(65, Math.max(18, lo)), age_max: Math.min(65, Math.max(18, hi)) };
};
type Interest = { id: string; name: string };
async function interestsFor(names: string[], token: string, cache: Map<string, Interest | null>): Promise<Interest[]> {
  const out: Interest[] = [];
  for (const raw of names.slice(0, 5)) {
    const q = raw.trim().slice(0, 60), k = q.toLowerCase();
    if (!q) continue;
    if (!cache.has(k)) {
      const r = await metaGet<{ data?: { id: string; name: string }[] }>("search", { type: "adinterest", q, limit: "3" }, token).catch(() => null);
      const hit = r?.data?.find((x) => x.name.toLowerCase() === k) ?? r?.data?.[0];
      cache.set(k, hit ? { id: hit.id, name: hit.name } : null);
    }
    const i = cache.get(k);
    if (i && !out.some((x) => x.id === i.id)) out.push(i);
  }
  return out;
}

type Range = { lo: number; hi: number };
/** Meta's estimate of how many people a targeting reaches: the reach estimate, or the delivery estimate where that isn't offered. */
async function audienceSize(act: string, token: string, spec: Record<string, unknown>): Promise<Range | null> {
  const targeting_spec = JSON.stringify(spec);
  try {
    const r = await metaGet<{ data?: unknown }>(`${act}/reachestimate`, { targeting_spec }, token);
    const d = (Array.isArray(r.data) ? r.data[0] : r.data) as { users_lower_bound?: number; users_upper_bound?: number; users?: number } | undefined;
    const lo = d?.users_lower_bound ?? d?.users, hi = d?.users_upper_bound ?? d?.users;
    if (lo && hi) return { lo, hi };
  } catch (e) { console.error("reachestimate", (e as Error).message.slice(0, 160)); }
  try {
    const r = await metaGet<{ data?: { estimate_mau_lower_bound?: number; estimate_mau_upper_bound?: number; estimate_mau?: number }[] }>(`${act}/delivery_estimate`, { optimization_goal: "LINK_CLICKS", targeting_spec }, token);
    const d = r.data?.[0], lo = d?.estimate_mau_lower_bound ?? d?.estimate_mau, hi = d?.estimate_mau_upper_bound ?? d?.estimate_mau;
    if (lo && hi) return { lo, hi };
  } catch (e) { console.error("delivery_estimate", (e as Error).message.slice(0, 160)); }
  return null;
}

async function audiences(row: Row, segments: Segment[], note: (s: string) => void): Promise<Draft[]> {
  const acct = await metaAccount(row.brandId);
  if (!acct || !segments.length) return [];
  const out: Draft[] = [], cache = new Map<string, Interest | null>();
  for (const s of segments.slice(0, 6)) {
    const interests = await interestsFor(s.reach.interests, acct.token, cache);
    const spec = {
      geo_locations: { countries: [row.market] }, ...ages(s.reach.ages), ...(s.reach.gender === "Women" ? { genders: [2] } : s.reach.gender === "Men" ? { genders: [1] } : {}),
      ...(interests.length ? { flexible_spec: [{ interests }] } : {}),
    };
    const r = await audienceSize(acct.act, acct.token, spec);
    if (!r) continue;
    const who = `${s.reach.gender === "All" ? "People" : s.reach.gender} ${spec.age_min}–${spec.age_max}${spec.age_max === 65 ? "+" : ""} in ${marketName(row.market)}`;
    out.push({
      kind: "audience_size", source: "Meta audience estimate", quality: "platform_estimate", subject: s.name, metric: "People Meta can reach with this targeting", value: r.lo, high: r.hi, unit: "people", period: today(),
      note: interests.length ? `${who} interested in ${interests.map((i) => i.name).join(", ")}` : `${who} — none of the interests matched one of Meta’s, so this is everyone of that age and gender`,
    });
  }
  if (!out.length) note("Meta didn’t return audience sizes");
  return out;
}

// ---------------------------------------------------------------- competitors' ads, counted
function competitors(rivals: RivalAds[], read: AdsRead | null, market: string): Draft[] {
  const out: Draft[] = [], base = { kind: "competitor_ads" as const, source: "Meta Ad Library" as const, period: today() };
  for (const r of rivals) {
    const s = r.stats;
    if (!s?.creatives) continue;
    const link = adLibraryUrl({ q: r.name, country: market });
    out.push({ ...base, subject: r.name, metric: "Live ads that reached the EU or UK", value: s.ads, unit: "ads", quality: "measured", link });
    if (s.proven) out.push({ ...base, subject: r.name, metric: "Ad creatives running 30 days or more", value: s.proven, unit: "creatives", quality: "measured", link, note: `longest ${s.longest} days` });
    if (s.reach) out.push({ ...base, subject: r.name, metric: "People reached in the EU by live ads", value: s.reach, unit: "people", quality: "platform_estimate", link });
  }
  if (read?.counted && read.creatives) for (const a of read.angles.slice(0, 6)) {
    if (!a.n) continue;
    out.push({ ...base, subject: `Competitors’ message: ${a.name}`, metric: `Share of ${read.creatives} competitor ads using it`, value: a.share, unit: "%", quality: "calculated", note: `${a.n} ads${a.proven ? `, ${a.proven} running 30+ days` : ""}` });
  }
  return out;
}

// ---------------------------------------------------------------- Google search volume (when DataForSEO is connected)
const GEO: Record<string, number> = { US: 2840, CA: 2124, GB: 2826, AU: 2036 };
type DfsItem = { keyword: string; search_volume: number | null; monthly_searches?: { year: number; month: number; search_volume: number | null }[] | null };
export const searchReady = () => Boolean(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD);

/** Year-on-year change from monthly searches: the latest three months against the same three a year before. */
export function yearOnYear(months: { year: number; month: number; search_volume: number | null }[]): number | null {
  const m = [...months].filter((x) => x.search_volume != null).sort((a, b) => b.year * 12 + b.month - (a.year * 12 + a.month));
  if (m.length < 15) return null;
  const sum = (xs: typeof m) => xs.reduce((a, x) => a + (x.search_volume ?? 0), 0);
  const now = sum(m.slice(0, 3)), then = sum(m.slice(12, 15));
  return then > 0 ? Math.round(((now - then) / then) * 100) : null;
}

async function searches(row: Row, report: MarketReport, brand: { name: string; category: string | null }, note: (s: string) => void): Promise<Draft[]> {
  if (!searchReady() || !GEO[row.market]) return [];
  const terms = await ask("cleo", {
    system: "List Google search terms shoppers type, to measure demand for a product in a market: the category and its close variants, the category with the origin word people use (e.g. 'korean'), the brand name, each competitor brand's name, and the main ingredient or benefit terms. Lower case, 1–4 words each, no duplicates, the way people really search.",
    content: JSON.stringify({ brand: brand.name, category: brand.category, product: row.subject || null, market: marketName(row.market), competitors: report.competitors.map((c) => c.name), buyerNeeds: report.segments.map((s) => s.need).slice(0, 5) }),
    schema: z.object({ terms: z.array(z.string()).describe("12–24 terms") }), maxTokens: 1200,
  });
  const keywords = [...new Set((terms?.terms ?? []).map((t) => t.toLowerCase().replace(/[^\p{L}\p{N} &'-]/gu, "").trim()).filter((t) => t.length >= 2 && t.length <= 60))].slice(0, 30);
  if (!keywords.length) return [];
  try {
    const from = new Date(Date.now() - 3.9 * 365 * 86_400_000).toISOString().slice(0, 10);
    const res = await fetch("https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live", {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(60_000),
      headers: { "Content-Type": "application/json", Authorization: `Basic ${Buffer.from(`${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`).toString("base64")}` },
      body: JSON.stringify([{ keywords, location_code: GEO[row.market], language_code: "en", date_from: from }]),
    });
    const body = (await res.json()) as { tasks?: { status_code?: number; status_message?: string; result?: DfsItem[] | null }[] };
    const task = body.tasks?.[0];
    if (!res.ok || !task || (task.status_code ?? 0) >= 40000) { note(`Search volume: ${task?.status_message ?? res.statusText}`.slice(0, 120)); return []; }
    return (task.result ?? []).map((k): Draft => {
      const yoy = k.monthly_searches ? yearOnYear(k.monthly_searches) : null;
      return {
        kind: "search_volume", source: "Google search volume", quality: "platform_estimate", subject: `“${k.keyword}”`, metric: `Google searches a month in ${marketName(row.market)}`, value: k.search_volume ?? 0, unit: "searches",
        ...(yoy != null ? { change: { pct: yoy, over: "YoY" as const } } : {}), period: "12-month average", link: `https://trends.google.com/trends/explore?geo=${row.market}&q=${encodeURIComponent(k.keyword)}`,
        ...(k.search_volume ? {} : { note: "Below measurable volume" }),
      };
    }).sort((a, b) => b.value - a.value);
  } catch (e) { note(`Search volume: ${(e as Error).message}`.slice(0, 120)); return []; }
}

/** Gather every measurable number for this research. Each source fails on its own without stopping the rest. */
export async function gatherEvidence(row: Row, report: MarketReport, rivals: RivalAds[], read: AdsRead | null, note: (s: string) => void): Promise<Evidence[]> {
  const [b] = await db.select({ name: schema.brands.name, category: schema.brands.category }).from(schema.brands).where(eq(schema.brands.id, row.brandId));
  const segments = report.segments.filter((s) => s.status !== "rejected");
  const notes: string[] = [];
  const [a, b2, c] = await Promise.all([
    own(row).catch(() => [] as Draft[]),
    audiences(row, segments, (s) => notes.push(s)).catch((e) => { console.error("audiences", e); return [] as Draft[]; }),
    b ? searches(row, report, b, (s) => notes.push(s)).catch(() => [] as Draft[]) : Promise.resolve([] as Draft[]),
  ]);
  const all = [...b2, ...c, ...a, ...competitors(rivals, read, row.market)];
  const at = new Date().toISOString();
  const by = (k: Evidence["kind"]) => all.filter((e) => e.kind === k).length;
  note([`${all.length} numbers`, by("audience_size") && `${by("audience_size")} audience sizes from Meta`, by("search_volume") && `${by("search_volume")} search terms`, by("store") + by("ads") && "the store’s own results", by("competitor_ads") && "competitors’ ads", ...notes].filter(Boolean).join(" · "));
  return all.map((e, i) => ({ ...e, id: `E${i + 1}`, at }));
}
