import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { summary } from "../queries/growth";
import { getNotes } from "../ai/notes";
import { STRENGTH_NAME, evidenceValue, type MarketReport, type Positioning } from "./types";

/**
 * Everything Kaviar knows about a product's market, in one place: the store (Shopify), live ads (Meta),
 * the web research, competitors' ads (Ad Library) and the positioning Iris built from them.
 * Remy reads it when he writes ads, photo prompts and storyboards, and casts people; Iris reads it when she plans.
 */

/** The store's own numbers, for the whole brand and (when given) one product. */
export async function storeFacts(brandId: string, product?: string | null) {
  const [b] = await db.select({ timezone: schema.brands.timezone }).from(schema.brands).where(eq(schema.brands.id, brandId));
  const s = await summary(brandId, b?.timezone ?? "UTC", 90).catch(() => null);
  const [x] = (await db.execute(sql`
    select (select count(*) from shop_customers where brand_id = ${brandId})::int as customers,
      (select count(*) from shop_customers where brand_id = ${brandId} and number_of_orders >= 2)::int as repeaters,
      (select count(*) filter (where cardinality(discount_codes) > 0)::float8 / nullif(count(*), 0) from shop_orders o where o.brand_id = ${brandId} and not o.test and o.cancelled_at is null and o.created_at > now() - interval '90 days') as "discountShare",
      (select string_agg(distinct c, ', ') from (select unnest(discount_codes) as c from (select discount_codes from shop_orders where brand_id = ${brandId} and cardinality(discount_codes) > 0 order by created_at desc limit 50) o) d) as codes
  `)).rows as { customers: number; repeaters: number; discountShare: number | null; codes: string | null }[];
  const [p] = product ? (await db.execute(sql`
    select coalesce(sum(l.quantity), 0)::int as units, coalesce(sum(l.total), 0)::float8 as revenue, count(distinct l.order_id)::int as orders
    from shop_order_lines l join shop_orders o on o.brand_id = l.brand_id and o.id = l.order_id
    where l.brand_id = ${brandId} and l.title = ${product} and not o.test and o.cancelled_at is null and o.created_at > now() - interval '90 days'`)).rows as { units: number; revenue: number; orders: number }[] : [];
  if (!s?.orders && !x?.customers) return null;
  return {
    last90Days: s ? { orders: s.orders, revenue: Math.round(s.revenue), averageOrder: s.orders ? Math.round(s.revenue / s.orders) : null, newCustomers: s.newCustomers, returningOrders: s.returningOrders } : null,
    customers: x?.customers ?? 0, repeatRate: x?.customers ? Math.round((x.repeaters / x.customers) * 100) : null,
    ordersWithACode: x?.discountShare != null ? Math.round(x.discountShare * 100) : null, codesInUse: x?.codes?.split(", ").slice(0, 5) ?? [],
    product: p && product ? { title: product, unitsLast90Days: p.units, ordersLast90Days: p.orders, revenueLast90Days: Math.round(p.revenue) } : null,
    ads: s?.spend ? { spendLast90Days: Math.round(s.spend), realReturn: s.metaRevenue ? +(s.metaRevenue / s.spend).toFixed(2) : 0, metaClaims: s.metaValue ? +(s.metaValue / s.spend).toFixed(2) : 0, clickRate: s.impressions ? +((s.clicks / s.impressions) * 100).toFixed(2) : null } : null,
  };
}

/** The research row for a product (or the whole brand) in a market — the product's own first. */
export async function researchFor(brandId: string, product?: string | null, market = "US") {
  const R = schema.marketResearch;
  const rows = await db.select({ id: R.id, subject: R.subject, report: R.report, adsRead: R.adsRead, positioning: R.positioning, plan: R.plan })
    .from(R).where(and(eq(R.brandId, brandId), eq(R.market, market))).orderBy(desc(R.updatedAt)).limit(12);
  return rows.find((r) => r.subject === (product ?? "") && r.report) ?? rows.find((r) => r.subject === "" && r.report) ?? null;
}

/** Positioning, buyers, competitors' angles and gaps, in a compact form for prompts. Null when nothing has been researched. */
export async function marketContext(brandId: string, product?: string | null) {
  const r = await researchFor(brandId, product);
  if (!r?.report) return null;
  const rep: MarketReport = r.report, pos: Positioning | null = r.positioning;
  return {
    researchedFor: r.subject || "the whole brand",
    positioning: pos ? { statement: pos.statement, primaryBuyer: pos.primary, pillars: pos.pillars.map((x) => `${x.title}: ${x.message}`), proofWeCanUse: pos.proof.map((x) => x.fact), voice: pos.voice, stayAwayFrom: pos.avoid, accepted: pos.status === "accepted" } : null,
    demand: `${rep.demand.verdict} — ${rep.demand.line}`,
    buyers: rep.segments.filter((s) => s.status !== "rejected").map((s) => ({ name: s.name, who: s.who, need: s.need, objections: s.objections, message: s.angle, accepted: s.status === "accepted" })),
    priceRange: rep.price.low != null || rep.price.high != null ? `${rep.price.low ?? "?"}–${rep.price.high ?? "?"}: ${rep.price.note}` : null,
    competitorsSay: r.adsRead ? r.adsRead.angles.map((a) => r.adsRead!.counted && a.n != null ? `${a.name} (${a.n} of ${r.adsRead!.creatives} of their live ads, ${a.proven ?? 0} running 30+ days)` : `${a.name} (${a.share}% of their ads)`) : [],
    gapsNobodyOwns: [...(r.adsRead?.gaps.filter((g) => g.status !== "rejected").map((g) => g.text) ?? []), ...rep.opportunities.filter((o) => o.status !== "rejected").map((o) => o.text)].slice(0, 8),
  };
}
export type MarketContext = NonNullable<Awaited<ReturnType<typeof marketContext>>>;

/** Meta lessons Iris keeps (what wins in this brand's live ads). */
export async function metaLessons(brandId: string) {
  const notes = await getNotes(brandId);
  return (notes.insights?.lessons ?? []).filter((l) => l.strength !== "Weak").map((l) => `${l.dimension}: ${l.lesson} (${l.evidence})`);
}

/** Research buyer groups as "who it's for" signals — usable wherever a Shopify signal is (Plan, Shoots' Data node). */
export type ResearchSignal = { key: string; data: string; value: string | null; group: string; evidence: [string, string][]; use: string; why: string; product: string };
export async function researchSignals(brandId: string): Promise<ResearchSignal[]> {
  const R = schema.marketResearch;
  const rows = await db.select({ id: R.id, subject: R.subject, report: R.report, positioning: R.positioning }).from(R)
    .where(and(eq(R.brandId, brandId), eq(R.market, "US"))).orderBy(desc(R.updatedAt)).limit(6);
  return rows.flatMap((r) => (r.report?.segments ?? []).filter((s) => s.status !== "rejected").map((s) => ({
    key: `seg:${r.id.slice(0, 8)}:${s.id}`, data: s.name, value: s.who.slice(0, 80), group: "Market research",
    evidence: [["Needs", s.need], ["Say", s.angle], ["Targeting", [s.reach.ages, s.reach.gender === "All" ? "" : s.reach.gender, s.reach.interests.slice(0, 3).join(", ")].filter(Boolean).join(" · ")], ["For", r.subject || "the whole brand"]] as [string, string][],
    use: s.angle, why: `${s.why}${r.positioning?.primary === s.name ? " — the primary buyer in the positioning" : ""}`, product: r.subject,
  }))).sort((a, b) => Number(b.why.includes("primary buyer")) - Number(a.why.includes("primary buyer")));
}

/**
 * Tests ready to build, straight from the research: each buyer group Iris found becomes a hypothetical audience with the messages to
 * try on it — from the test plan's cells, the group's own angle and the positioning pillars — and the hypothesis the test would settle.
 */
export type ReadyTest = { key: string; name: string; primary: boolean; who: string; targeting: string; product: string; size: string | null; hypothesis: string | null; strength: string | null; messages: string[]; visual: string; why: string };
export async function readyTests(brandId: string): Promise<ReadyTest[]> {
  const R = schema.marketResearch;
  const rows = await db.select({ id: R.id, subject: R.subject, report: R.report, positioning: R.positioning, plan: R.plan, evidence: R.evidence }).from(R)
    .where(and(eq(R.brandId, brandId), eq(R.market, "US"))).orderBy(desc(R.updatedAt)).limit(6);
  const same = (a: string, b: string) => { const x = a.trim().toLowerCase(), y = b.trim().toLowerCase(); return Boolean(x && y) && (x === y || x.includes(y) || y.includes(x)); };
  const short = (t: string) => t.trim().replace(/\s+/g, " ").replace(/[.]$/, "").slice(0, 90);
  return rows.flatMap((r) => (r.report?.segments ?? []).filter((s) => s.status !== "rejected").map((s) => {
    const cells = (r.plan?.cells ?? []).filter((c) => c.on !== false && same(c.segment, s.name));
    const pool = [...cells.map((c) => c.angle), s.angle, ...(r.positioning?.pillars ?? []).map((p) => p.message || p.title)].map(short).filter(Boolean);
    const messages = pool.filter((m, i) => pool.findIndex((x) => x.toLowerCase() === m.toLowerCase()) === i).slice(0, 4);
    const hyp = (r.plan?.hypotheses ?? []).find((h) => cells.some((c) => c.hypothesisId === h.id)) ?? null;
    const size = (r.evidence ?? []).find((e) => e.kind === "audience_size" && same(e.subject, s.name));
    return {
      key: `seg:${r.id.slice(0, 8)}:${s.id}`, name: s.name, primary: r.positioning?.primary === s.name || s.priority === "Primary", who: s.who.slice(0, 200),
      targeting: [s.reach.ages, s.reach.gender === "All" ? "" : s.reach.gender, s.reach.interests.slice(0, 3).join(", ")].filter(Boolean).join(" · "), product: r.subject,
      size: size ? `${evidenceValue(size)} on Meta` : null, hypothesis: (hyp?.claim ?? cells[0]?.hypothesis ?? "").slice(0, 220) || null, strength: hyp ? STRENGTH_NAME[hyp.strength] : null,
      messages, visual: (cells[0]?.visual ?? "").slice(0, 200), why: s.why.slice(0, 220),
    };
  })).filter((t) => t.messages.length >= 2).sort((a, b) => Number(b.primary) - Number(a.primary)).slice(0, 3);
}
