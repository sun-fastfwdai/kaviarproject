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
import { forecast, inDays, moments, rankPlans, salesReason, stageOf, type Brief, type OnMeta, type OwnPlan, type PlanAds, type PlanCard, type Reason, type SavedPlans } from "./plans-rules";
import { campaigns } from "../queries/growth";
import { SALE } from "../queries/common";
import { rivalAds } from "../seo/bench";
import type { AdsRead } from "../research/types";
import type { Audit } from "../seo/types";
import { getPilot } from "./autopilot";
import type { Mode } from "./pilot";

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
  shop: { buyers: number; repeaters: number; lapsed: number; adDays: number; adSpend: number; adBack: number | null }; // the store's own customers, and its own ad history
  /** What a brand can choose from when it starts a campaign of its own. */
  options: { products: { title: string; price: number; stock: number; image: string | null }[]; audiences: { key: string; label: string; kind: "cold" | "lookalike" | "warm"; size: number | null }[] };
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
        left join brand_assets ai on a.image_url = '/api/assets/' || ai.id::text and coalesce((ai.meta->>'ai')::boolean, false) and ai.meta->>'plan' is null
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
    const ads = adsFor(c.signal), stage = stageOf(Boolean(s.approvedAt), ads, Boolean(s.meta));
    return { key: c.key, reason, title, why, when: o.when, c, image: pic(c.product), budget, days, out: forecast(c, budget, days, rest), stage, ads, urgent: Boolean(o.urgent) && stage !== "ready" && stage !== "live", approvedAt: s.approvedAt ?? null, approvedBy: s.by ?? null, meta: s.meta ?? null };
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
  // The brand's own campaigns: its reason is its own, so they are always listed.
  for (const o of saved?.own ?? []) {
    const pr = d.products.find((x) => x.title === o.product) ?? d.products[0];
    if (!pr) continue;
    list.push(make({ key: o.key, name: o.name, why: o.who, kind: o.kind, audience: o.audience, product: pr.title, price: pr.price, stock: pr.stock, signal: o.key, rank: 0 }, "own", o.name, `${pr.title} · ${o.who}`));
  }
  // A plan that is under way keeps its page even after its reason has passed (the holiday came, sales recovered).
  const listed = new Set(list.map((x) => x.key));
  for (const [key, s] of Object.entries(plans)) if (!listed.has(key) && (s.meta || s.approvedAt) && key.startsWith("holiday:") && hero) {
    const name = key.slice(8).replace(/-\d{4}$/, "").replace(/-/g, " ").replace(/^./, (x) => x.toUpperCase());
    list.push(make({ key, name, why: "", kind: d.orders.buyers >= 100 ? "warm" : "cold", audience: d.orders.buyers >= 100 ? d.orders.buyers : null, product: top?.product ?? hero.title, price: top?.price ?? hero.price, stock: top?.stock ?? hero.stock, signal: key, rank: 9 }, "holiday", name, top?.product ?? hero.title));
  }
  const loose = live.filter((b) => !b.signal || !used.has(b.signal)).length;
  const options: Plans["options"] = { products: d.products.map((x) => ({ title: x.title, price: x.price, stock: x.stock, image: x.image })), audiences: [
    ...(d.orders.buyers >= 25 ? [{ key: "buyers", label: `People who bought before · ${n(d.orders.buyers)}`, kind: "warm" as const, size: d.orders.buyers }] : []),
    ...(d.orders.lapsed >= 25 ? [{ key: "lapsed", label: `Buyers who have gone quiet · ${n(d.orders.lapsed)}`, kind: "warm" as const, size: d.orders.lapsed }] : []),
    ...(d.orders.buyers >= 100 ? [{ key: "lookalike", label: "People like your buyers", kind: "lookalike" as const, size: null }] : []),
    ...candidates.filter((c) => c.key.startsWith("seg:")).map((c) => ({ key: c.key, label: `${c.name}${c.audience ? ` · ${n(c.audience)}` : ""}`, kind: "cold" as const, size: c.audience })),
    { key: "new", label: "New people", kind: "cold" as const, size: null },
  ] };
  // Kaviar doesn't suggest spending money to lose it: a new plan must at least pay for itself at the likely rates. One already under way stays.
  const worth = list.filter((x) => x.stage !== "suggested" || x.reason === "own" || x.out[1].profit >= 0);
  const h = d.history, shop = { buyers: d.orders.buyers, repeaters: d.orders.repeaters, lapsed: d.orders.lapsed, adDays: h?.days ?? 0, adSpend: h?.spend ?? 0, adBack: h && h.spend > 0 ? h.value / h.spend : null };
  return { list: rankPlans(worth), options, shop, input: rest, minBudget: round(p.minToLearn), currency, level: levelOf(d.history), sales: { ...sales, on: sr.on, why: sr.why }, target, loose };
}

export async function planBrief(brandId: string, key: string): Promise<Brief> {
  const b = (await read<SavedPlans>(brandId, KEY))?.plans?.[key]?.brief;
  return { refs: b?.refs ?? [], note: b?.note ?? "", shoot: Boolean(b?.shoot) };
}
export async function savePlanChoice(brandId: string, key: string, v: { budget?: number; days?: number; approve?: boolean; by?: string; meta?: OnMeta; brief?: Brief }): Promise<void> {
  const cur = (await read<SavedPlans>(brandId, KEY)) ?? {}, was = cur.plans?.[key] ?? {};
  const budget = v.budget && Number.isFinite(v.budget) ? Math.min(1_000_000, Math.max(50, Math.round(v.budget))) : was.budget, days = v.days && Number.isFinite(v.days) ? Math.min(90, Math.max(3, Math.round(v.days))) : was.days;
  await write(brandId, KEY, { ...cur, plans: { ...(cur.plans ?? {}), [key]: { ...was, budget, days, ...(v.approve ? { approvedAt: new Date().toISOString(), by: v.by } : {}), ...(v.meta ? { meta: v.meta } : {}), ...(v.brief ? { brief: { refs: v.brief.refs.slice(0, 8), note: v.brief.note.slice(0, 600), shoot: v.brief.shoot } } : {}) } } });
}
export async function saveTarget(brandId: string, target: number | null): Promise<void> {
  const cur = (await read<SavedPlans>(brandId, KEY)) ?? {};
  await write(brandId, KEY, { ...cur, target: target && target > 0 ? Math.round(target) : undefined });
}

/** A campaign the brand starts itself. Starting it is its approval: the budget is the brand's own choice. */
export async function addOwnPlan(brandId: string, o: Omit<OwnPlan, "key" | "at">, budget: number, days: number): Promise<string> {
  const cur = (await read<SavedPlans>(brandId, KEY)) ?? {}, key = `own:${crypto.randomUUID().slice(0, 8)}`, at = new Date().toISOString();
  await write(brandId, KEY, { ...cur, own: [...(cur.own ?? []), { ...o, key, at }].slice(-30),
    plans: { ...(cur.plans ?? {}), [key]: { budget: Math.max(50, Math.round(budget)), days: Math.min(90, Math.max(3, Math.round(days))), approvedAt: at, by: o.by } } });
  return key;
}
export async function removeOwnPlan(brandId: string, key: string): Promise<void> {
  const cur = (await read<SavedPlans>(brandId, KEY)) ?? {}, plans = { ...(cur.plans ?? {}) };
  delete plans[key];
  await write(brandId, KEY, { ...cur, own: (cur.own ?? []).filter((x) => x.key !== key), plans });
}

/** Everything one plan's page shows beyond the plan itself: its ads, what its Meta campaign has done, and what Autopilot is doing about it. */
export type PlanAd = { id: string; status: "review" | "approved" | "rejected"; hook: string; headline: string; text: string; cta: string; image: string | null };
/** What a plan rests on, source by source. Each is something Kaviar read — from the store, its customers, last year, competitors' ads, the product page. */
export type PlanFacts = {
  store: { units30: number; inventory: number; runway: number | null } | null; // Shopify: how the product sells and how long its stock lasts
  lastYear: { revenue: number; orders: number } | null; // the same stretch of days a year ago
  rivals: { ads: number; brands: number; new30: number; angle: { name: string; share: number } | null; gap: string | null } | null; // Meta's Ad Library
  page: { open: number; stars: boolean | null } | null; // the product page the ads send people to
};
export type PlanExtras = {
  ads: PlanAd[]; facts: PlanFacts;
  brief: { note: string; shoot: boolean; refs: { id: string; name: string }[] }; productPhoto: string | null;
  results: { status: string | null; spend: number; orders: number; revenue: number } | null; // null until the campaign is on Meta
  pilot: { mode: Mode; last: string | null; canAct: boolean; changes: { id: string; kind: string; title: string; why: string; before: string; after: string }[] };
};
/** A plan's ads as the brand sees them — the same words and the same picture that go to Meta. */
export async function planAds(batchId: string): Promise<PlanAd[]> {
  const r = await db.execute(sql`select a.id, a.status, a.hook, a.headline, a.primary_text as text, a.cta, ${realPic} as image from ads a
    left join brand_assets ai on a.image_url = '/api/assets/' || ai.id::text and coalesce((ai.meta->>'ai')::boolean, false) and ai.meta->>'plan' is null
    where a.batch_id = ${batchId} and a.status in ('review', 'approved') order by a.position limit 12`);
  return r.rows as PlanAd[];
}
/** The product page an ad sends people to, on the store's own address. Null when Kaviar doesn't know it. */
export async function productLink(brandId: string, product: string): Promise<string | null> {
  const r = await db.execute(sql`select (select c.details->>'primaryHost' from connections c where c.brand_id = ${brandId} and c.provider = 'shopify' limit 1) as host,
    (select p.handle from shop_products p where p.brand_id = ${brandId} and p.title = ${product} and p.handle is not null limit 1) as handle`);
  const x = r.rows[0] as { host: string | null; handle: string | null } | undefined;
  return x?.host && x.handle ? `https://${x.host}/products/${x.handle}` : null;
}
/** The market the brand was last researched in — where its ads are shown unless it says otherwise. */
export async function planMarket(brandId: string): Promise<string | null> {
  const r = await db.execute(sql`select market from market_research where brand_id = ${brandId} order by updated_at desc limit 1`).catch(() => ({ rows: [] }));
  return (r.rows[0] as { market: string } | undefined)?.market ?? null;
}
export async function planExtras(brand: { id: string; timezone: string }, p: PlanCard): Promise<PlanExtras> {
  const [ads, pilot, camps, changes] = await Promise.all([
    p.ads ? planAds(p.ads.batchId).catch(() => []) : Promise.resolve([] as PlanAd[]),
    getPilot(brand.id),
    p.meta ? campaigns(brand.id, brand.timezone, 90).catch(() => []) : Promise.resolve([]),
    p.meta ? db.execute(sql`select id, kind, title, why, before, after from optimize_changes where brand_id = ${brand.id} and status = 'proposed' and target->>'campaignId' = ${p.meta.campaignId} order by created_at desc limit 5`)
      .then((r) => r.rows as PlanExtras["pilot"]["changes"]).catch(() => []) : Promise.resolve([]),
  ]);
  // What the plan rests on. Each read fails on its own: a missing source leaves its block out, never the page.
  const R = schema.marketResearch;
  const [stock, lastYear, rivals, said, fixes, audit] = await Promise.all([
    getStock(brand.id, brand.timezone).then((x) => x.rows.find((r) => r.title === p.c.product) ?? null).catch(() => null),
    db.execute(sql`select coalesce(sum(o.total - o.refunded), 0)::float8 as revenue, count(*)::int as orders from shop_orders o
        where o.brand_id = ${brand.id} and ${SALE} and o.created_at >= now() - interval '1 year' and o.created_at < now() - interval '1 year' + make_interval(days => ${p.days})`)
      .then((r) => (r.rows as { revenue: number; orders: number }[])[0] ?? null).catch(() => null),
    rivalAds(brand.id).catch(() => null),
    db.select({ adsRead: R.adsRead }).from(R).where(sql`${R.brandId} = ${brand.id} and ${R.adsRead} is not null`).orderBy(desc(R.updatedAt)).limit(1).then((r) => (r[0]?.adsRead as AdsRead | undefined) ?? null).catch(() => null),
    db.execute(sql`select count(*)::int as n from store_fixes where brand_id = ${brand.id} and status = 'proposed' and product_title = ${p.c.product}`).then((r) => (r.rows as { n: number }[])[0]?.n ?? 0).catch(() => null),
    read<Audit>(brand.id, "store-audit").catch(() => null),
  ]);
  const top = said?.angles?.[0], gap = said?.gaps?.find((g) => g.status === "accepted") ?? said?.gaps?.find((g) => g.status !== "rejected");
  const facts: PlanFacts = {
    store: stock ? { units30: stock.units30, inventory: stock.inventory, runway: stock.runway } : null,
    lastYear: lastYear && lastYear.orders > 0 ? lastYear : null,
    rivals: rivals?.rows.length ? { ads: rivals.rows.reduce((k, x) => k + x.ads, 0), brands: rivals.rows.length, new30: rivals.rows.reduce((k, x) => k + x.new30, 0), angle: top ? { name: top.name, share: Math.round(top.share) } : null, gap: gap?.text ?? null } : null,
    page: audit?.at && fixes != null ? { open: fixes, stars: audit.site?.find((x) => x.key === "reviews")?.ok ?? null } : null,
  };
  const b = await planBrief(brand.id, p.key);
  const refs = b.refs.length ? (await db.select({ id: schema.brandAssets.id, name: schema.brandAssets.name }).from(schema.brandAssets).where(sql`${schema.brandAssets.brandId} = ${brand.id} and ${schema.brandAssets.id}::text in (${sql.join(b.refs.map((x) => sql`${x}`), sql`, `)})`).catch(() => [])) : [];
  const c = p.meta ? camps.find((x) => x.id === p.meta!.campaignId) : undefined;
  return { ads, facts, brief: { note: b.note, shoot: b.shoot, refs: b.refs.map((id) => refs.find((r) => r.id === id)).filter((r): r is { id: string; name: string } => Boolean(r)) }, productPhoto: p.image, results: p.meta ? { status: c?.status ?? null, spend: c?.spend ?? 0, orders: c?.verifiedOrders ?? 0, revenue: c?.verifiedRevenue ?? 0 } : null,
    pilot: { mode: pilot.mode, last: pilot.runs[0]?.at ?? null, canAct: pilot.canAct, changes } };
}
