import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { read, write } from "../seo/run";
import { trend } from "../queries/growth";
import { getStock, type Stock } from "../store/stock";
import { paceText } from "../store/stock-rules";
import { planData } from "./plan-data";
import { planFor } from "./plan-for";
import { halves, sumOf, type Day } from "./trend";
import { levelOf, type Candidate, type PlanInput } from "./plan";
import { forecast, inDays, moments, rankPlans, salesReason, stageOf, type PlanAds, type PlanCard, type Reason, type SavedPlans } from "./plans-rules";

/**
 * The brand's plans, worked out from its own data: each one a reason to advertise, a budget, what that should bring back, and where
 * it has got to. A plan appears only when its reason is true today (or it already has ads) — nothing is proposed for its own sake.
 */
const KEY = "plans";
export type Plans = {
  list: PlanCard[]; // ranked: what needs the brand first
  input: Omit<PlanInput, "candidates">; minBudget: number; currency: string; level: 0 | 1 | 2; // level: 0 a scenario from starting assumptions, 2 from the brand's own results
  sales: { cur: number; prev: number; on: boolean; why: string }; target: number | null;
  loose: number; // batches of ads that belong to no plan (free ideas, or a reason that no longer holds)
};
const realPic = sql`coalesce(case when ai.id is null then a.image_url end, (select sp.image_url from shop_products sp where sp.brand_id = a.brand_id and sp.title = a.product and sp.image_url is not null limit 1))`;

export async function getPlans(brand: { id: string; currency: string | null; timezone: string }, have: { byDay?: Day[]; stock?: Stock | null } = {}): Promise<Plans> {
  const B = schema.adBatches, currency = brand.currency ?? "USD";
  const [d, saved, byDay, stock, batches, tested, pics] = await Promise.all([
    planData(brand.id, currency), read<SavedPlans>(brand.id, KEY),
    have.byDay ? Promise.resolve(have.byDay) : trend(brand.id, brand.timezone, 30).catch(() => [] as Day[]),
    have.stock !== undefined ? Promise.resolve(have.stock) : getStock(brand.id, brand.timezone).catch(() => null),
    db.select({ id: B.id, signal: B.signal,
      review: sql<number>`(select count(*) from ads a where a.batch_id = "ad_batches"."id" and a.status = 'review')::int`,
      approved: sql<number>`(select count(*) from ads a where a.batch_id = "ad_batches"."id" and a.status = 'approved')::int` }).from(B).where(eq(B.brandId, brand.id)).orderBy(desc(B.createdAt)).limit(60),
    db.execute(sql`select distinct source->>'batchId' as id from audience_tests where brand_id = ${brand.id} and status = 'done' and source->>'type' = 'batch'`).then((r) => new Set((r.rows as { id: string | null }[]).map((x) => x.id).filter(Boolean) as string[])).catch(() => new Set<string>()),
    db.execute(sql`select * from (select a.batch_id as batch, a.position, ${realPic} as url from ads a join ad_batches b on b.id = a.batch_id
        left join brand_assets ai on a.image_url = '/api/assets/' || ai.id::text and coalesce((ai.meta->>'ai')::boolean, false)
        where b.brand_id = ${brand.id} and a.status in ('review', 'approved')) x where x.url is not null order by x.batch, x.position`).then((r) => r.rows as { batch: string; url: string }[]).catch(() => []),
  ]);
  const { p, input } = planFor(d), { candidates, ...rest } = input, plans = saved?.plans ?? {}, target = saved?.target && saved.target > 0 ? saved.target : null;
  const { prev, cur } = halves(byDay), sales = { cur: sumOf(cur, "revenue"), prev: sumOf(prev, "revenue") }, sr = salesReason(sales.cur, sales.prev, target);
  // The newest batch that still has ads, per plan.
  const live = batches.filter((b) => b.review + b.approved > 0), used = new Set<string>();
  const adsFor = (signal: string | null): PlanAds | null => {
    const b = signal ? live.find((x) => x.signal === signal) : undefined;
    if (!b) return null;
    used.add(b.signal!);
    return { batchId: b.id, review: b.review, approved: b.approved, tested: tested.has(b.id), thumbs: [...new Set(pics.filter((x) => x.batch === b.id).map((x) => x.url))].slice(0, 5) };
  };
  const pic = (title: string) => d.products.find((x) => x.title === title)?.image ?? stock?.rows.find((x) => x.title === title)?.image ?? null;
  const round = (v: number) => Math.max(50, Math.round(v / 50) * 50);
  const make = (c: Candidate, reason: Reason, title: string, why: string, o: { when?: string; urgent?: boolean; days?: number } = {}): PlanCard => {
    const s = plans[c.key] ?? {}, funded = p.rows.find((r) => r.c.key === c.key);
    const budget = s.budget && s.budget > 0 ? s.budget : round(funded?.spend ?? p.minToLearn), days = s.days && s.days > 0 ? s.days : o.days ?? 14;
    const ads = adsFor(c.signal), stage = stageOf(Boolean(s.approvedAt), ads);
    return { key: c.key, reason, title, why, when: o.when, c, image: pic(c.product), budget, days, out: forecast(c, budget, days, rest), stage, ads, urgent: Boolean(o.urgent) && stage !== "ready", approvedAt: s.approvedAt ?? null };
  };
  const list: PlanCard[] = [], hero = d.hero, top = candidates[0] ?? null, n = (v: number) => v.toLocaleString("en-US");

  // A holiday coming: the best seller, to the people who already know the brand.
  if (hero) for (const m of moments(new Date(), "US").filter((x) => x.days >= 2).slice(0, 2)) {
    const key = `holiday:${m.key}`, known = d.orders.buyers >= 100;
    list.push(make({ key, name: `${m.name} · ${hero.title}`, why: `${m.name} is ${inDays(m.days)}`, kind: known ? "warm" : "cold", audience: known ? d.orders.buyers : null, product: top?.product ?? hero.title, price: top?.price ?? hero.price, stock: top?.stock ?? hero.stock, signal: key, rank: -1 },
      "holiday", `${m.name} is ${inDays(m.days)}`, `${top?.product ?? hero.title}${known ? ` · to your ${n(d.orders.buyers)} buyers` : ""}`, { when: inDays(m.days), urgent: m.days <= 10, days: m.days <= 7 ? 7 : 14 }));
  }
  // Stock sitting: the product with the most on the shelf that isn't moving.
  // Something shoppers already buy, only too slowly, comes first. A product nobody bought in 30 days is offered only if it is priced like
  // the things this store's shoppers do buy — not a wholesale case at ten times the usual order.
  const usual = d.orders.count >= 5 && d.orders.aov ? d.orders.aov : null;
  const sitting = (stock?.rows ?? []).filter((r) => r.inventory >= 20 && (r.price ?? 0) > 0 && (r.state === "over" || (r.state === "idle" && usual != null && r.price! <= usual * 2)))
    .sort((a, b) => Number(b.state === "over") - Number(a.state === "over") || b.inventory * (b.price ?? 0) - a.inventory * (a.price ?? 0))[0];
  if (sitting) {
    const key = `stock:${sitting.id}`;
    list.push(make({ key, name: `Sell through ${sitting.title}`, why: `${n(sitting.inventory)} in stock, selling ${paceText(sitting.pace)} a day`, kind: d.orders.buyers >= 100 ? "lookalike" : "cold", audience: null, product: sitting.title, price: sitting.price!, stock: sitting.inventory, signal: key, rank: 5 },
      "overstock", `${n(sitting.inventory)} of ${sitting.title} are sitting`, sitting.pace > 0 ? `Selling ${paceText(sitting.pace)} a day — over a year of stock` : "None sold in 30 days"));
  }
  // The brand's own buyers going quiet is always a reason; new audiences only when sales are short.
  // When sales are short, the two new audiences that should bring the most — not every idea Kaviar has. One with ads already made stays.
  const grow: PlanCard[] = [];
  for (const c of candidates) {
    const has = Boolean(c.signal && live.some((b) => b.signal === c.signal));
    if (c.key === "lapsed") list.push(make(c, "lapsed", c.name, c.why));
    else if (has) list.push(make(c, "sales", c.name, c.why));
    else if (sr.on) grow.push(make(c, "sales", c.name, `${sr.why} · ${c.why}`));
  }
  list.push(...grow.sort((a, b) => b.out[1].profit - a.out[1].profit).slice(0, 2));
  const loose = live.filter((b) => !b.signal || !used.has(b.signal)).length;
  return { list: rankPlans(list), input: rest, minBudget: round(p.minToLearn), currency, level: levelOf(d.history), sales: { ...sales, on: sr.on, why: sr.why }, target, loose };
}

export async function savePlanChoice(brandId: string, key: string, v: { budget?: number; days?: number; approve?: boolean; by?: string }): Promise<void> {
  const cur = (await read<SavedPlans>(brandId, KEY)) ?? {}, was = cur.plans?.[key] ?? {};
  const budget = v.budget && Number.isFinite(v.budget) ? Math.min(1_000_000, Math.max(50, Math.round(v.budget))) : was.budget, days = v.days && Number.isFinite(v.days) ? Math.min(90, Math.max(3, Math.round(v.days))) : was.days;
  await write(brandId, KEY, { ...cur, plans: { ...(cur.plans ?? {}), [key]: { ...was, budget, days, ...(v.approve ? { approvedAt: new Date().toISOString(), by: v.by } : {}) } } });
}
export async function saveTarget(brandId: string, target: number | null): Promise<void> {
  const cur = (await read<SavedPlans>(brandId, KEY)) ?? {};
  await write(brandId, KEY, { ...cur, target: target && target > 0 ? Math.round(target) : undefined });
}
