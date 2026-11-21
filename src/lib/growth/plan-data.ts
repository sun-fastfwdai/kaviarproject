import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "../db";
import type { Candidate, History } from "./plan";

/**
 * Everything the spend plan reads, from data Kaviar already holds: products, prices, costs and stock; what sold; who bought and who has
 * lapsed; past Meta results; and the buyer groups and audience sizes from market research. Nothing here is estimated.
 */
export type PlanData = {
  currency: string; history: History | null; margin: { value: number | null; from: "costs" | "saved" | "none"; withCost: number; variants: number };
  hero: { title: string; price: number; stock: number; sold30: number; coverDays: number | null } | null;
  products: { title: string; price: number; stock: number; sold30: number }[];
  orders: { count: number; aov: number | null; tagged: number; buyers: number; repeaters: number; lapsed: number };
  candidates: Candidate[]; saved: SavedPlan | null; hasResearch: boolean;
};
export type SavedPlan = { margin?: number; budget?: number; days?: number; goal?: "profit" | "revenue" | "customers"; discount?: number; approvedAt?: string; by?: string };
const KEY = "spend-plan";
const N = schema.agentNotes;

export async function savedPlan(brandId: string): Promise<SavedPlan | null> {
  const [r] = await db.select({ body: N.body }).from(N).where(and(eq(N.brandId, brandId), eq(N.key, KEY))).limit(1);
  return (r?.body as SavedPlan | undefined) ?? null;
}
export async function savePlan(brandId: string, body: SavedPlan): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(N).where(and(eq(N.brandId, brandId), eq(N.key, KEY)));
    await tx.insert(N).values({ brandId, key: KEY, body } as typeof N.$inferInsert);
  });
}

export async function planData(brandId: string, currency: string): Promise<PlanData> {
  const rows = <T,>(r: { rows: unknown[] }) => r.rows as T[];
  const [prod, ord, cust, hist, costs, research, saved] = await Promise.all([
    db.execute(sql`select p.id, p.title, coalesce(min(v.price), p.price_min)::float8 as price, coalesce(sum(v.inventory_quantity), p.total_inventory, 0)::int as stock,
        coalesce((select sum(l.quantity) from shop_order_lines l join shop_orders o on o.id = l.order_id and o.brand_id = l.brand_id
          where l.brand_id = ${brandId} and l.product_id = p.id and o.cancelled_at is null and o.created_at >= now() - interval '30 days'), 0)::int as sold30
      from shop_products p left join shop_variants v on v.product_id = p.id and v.brand_id = p.brand_id
      where p.brand_id = ${brandId} group by p.id, p.title, p.price_min, p.total_inventory order by sold30 desc, stock desc limit 12`),
    db.execute(sql`select count(*)::int as count, avg(total)::float8 as aov, count(*) filter (where coalesce(utm_source, '') <> '' or meta_campaign_id is not null)::int as tagged
      from shop_orders where brand_id = ${brandId} and cancelled_at is null and not coalesce(test, false)`),
    db.execute(sql`with last as (select customer_id, max(created_at) as at, count(*) as n from shop_orders where brand_id = ${brandId} and cancelled_at is null and customer_id is not null group by customer_id)
      select count(*)::int as buyers, count(*) filter (where n >= 2)::int as repeaters, count(*) filter (where at < now() - interval '60 days' and at >= now() - interval '180 days')::int as lapsed from last`),
    db.execute(sql`select count(distinct date)::int as days, coalesce(sum(spend), 0)::float8 as spend, coalesce(sum(impressions), 0)::float8 as impressions, coalesce(sum(clicks), 0)::float8 as clicks,
        coalesce(sum(purchases), 0)::float8 as purchases, coalesce(sum(purchase_value), 0)::float8 as value from meta_insights_daily where brand_id = ${brandId}`),
    db.execute(sql`select count(*)::int as variants, count(unit_cost)::int as with_cost, avg(case when unit_cost is not null and price > 0 then (price - unit_cost) / price end)::float8 as margin from shop_variants where brand_id = ${brandId}`),
    db.select({ id: schema.marketResearch.id, subject: schema.marketResearch.subject, report: schema.marketResearch.report, positioning: schema.marketResearch.positioning, evidence: schema.marketResearch.evidence })
      .from(schema.marketResearch).where(and(eq(schema.marketResearch.brandId, brandId), eq(schema.marketResearch.market, "US"))).orderBy(desc(schema.marketResearch.updatedAt)).limit(4).catch(() => []),
    savedPlan(brandId),
  ]);
  const products = rows<{ id: string; title: string; price: number | null; stock: number; sold30: number }>(prod).filter((p) => (p.price ?? 0) > 0);
  const o = rows<{ count: number; aov: number | null; tagged: number }>(ord)[0] ?? { count: 0, aov: null, tagged: 0 };
  const c = rows<{ buyers: number; repeaters: number; lapsed: number }>(cust)[0] ?? { buyers: 0, repeaters: 0, lapsed: 0 };
  const h = rows<History>(hist)[0], k = rows<{ variants: number; with_cost: number; margin: number | null }>(costs)[0] ?? { variants: 0, with_cost: 0, margin: null };
  const top = products[0] ?? null;
  const hero = top ? { title: top.title, price: top.price!, stock: top.stock, sold30: top.sold30, coverDays: top.sold30 > 0 ? Math.round(top.stock / (top.sold30 / 30)) : null } : null;
  const productFor = (subject: string) => products.find((p) => subject && (p.title.toLowerCase().includes(subject.toLowerCase()) || subject.toLowerCase().includes(p.title.toLowerCase()))) ?? top;
  const same = (a: string, b: string) => { const x = a.trim().toLowerCase(), y = b.trim().toLowerCase(); return Boolean(x && y) && (x === y || x.includes(y) || y.includes(x)); };

  const candidates: Candidate[] = [];
  // Warm audiences from the store's own customers.
  if (c.lapsed >= 25 && top) candidates.push({ key: "lapsed", name: "Win back lapsed buyers", why: `${c.lapsed.toLocaleString("en-US")} people bought 2–6 months ago and haven’t been back`, kind: "warm", audience: c.lapsed, product: top.title, price: top.price!, stock: top.stock, signal: "lapsed", rank: 0 });
  if (c.buyers >= 100 && top) candidates.push({ key: "lookalike", name: "People like your best buyers", why: `Built from your ${c.buyers.toLocaleString("en-US")} buyers — Meta finds people who resemble them`, kind: "lookalike", audience: null, product: top.title, price: top.price!, stock: top.stock, signal: "top-customers", rank: 1 });
  // Buyer groups from market research, each with the audience size Meta estimated for it.
  let rank = 2;
  for (const r of research) for (const s of (r.report?.segments ?? []).filter((x) => x.status !== "rejected")) {
    const p = productFor(r.subject);
    if (!p || candidates.length >= 6) continue;
    const size = (r.evidence ?? []).find((e) => e.kind === "audience_size" && same(e.subject, s.name));
    candidates.push({ key: `seg:${r.id.slice(0, 8)}:${s.id}`, name: s.name, why: s.angle || s.need, kind: "cold", audience: size ? Math.round(size.value) : null, product: p.title, price: p.price!, stock: p.stock,
      signal: `seg:${r.id.slice(0, 8)}:${s.id}`, rank: (r.positioning?.primary === s.name || s.priority === "Primary" ? 0 : 1) + rank++ });
  }
  if (!candidates.length && top) candidates.push({ key: "broad", name: "A broad first audience", why: "No buyer groups yet — run market research to replace this with real ones", kind: "cold", audience: null, product: top.title, price: top.price!, stock: top.stock, signal: null, rank: 9 });
  const fromCosts = k.with_cost > 0 && k.margin != null && k.margin > 0 && k.margin < 1;
  return {
    currency, history: h && h.days > 0 ? h : null,
    margin: { value: fromCosts ? k.margin : saved?.margin ?? null, from: fromCosts ? "costs" : saved?.margin ? "saved" : "none", withCost: k.with_cost, variants: k.variants },
    hero, products: products.slice(0, 8).map((x) => ({ title: x.title, price: x.price!, stock: x.stock, sold30: x.sold30 })), orders: { count: o.count, aov: o.aov, tagged: o.tagged, buyers: c.buyers, repeaters: c.repeaters, lapsed: c.lapsed }, candidates, saved, hasResearch: research.length > 0,
  };
}
