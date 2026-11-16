import "server-only";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { decrypt } from "../crypto";
import { metaGet } from "../meta/client";
import { purchaseMetric } from "../meta/map";
import { metaLessons, researchFor, storeFacts } from "../research/context";
import type { TestItem } from "./types";

/**
 * What Iris knows about the people a brand's ads reach: the store's buyers (Shopify), who Meta shows the ads to and who
 * clicks and buys (Meta, by age, gender, region and placement), and the buyer groups from market research.
 */

/** The brand's Meta login and ad account, when it can be read live. */
export async function metaConn(brandId: string): Promise<{ act: string; token: string } | null> {
  const C = schema.connections;
  const [c] = await db.select({ act: C.externalId, token: C.accessToken, status: C.status }).from(C)
    .where(and(eq(C.brandId, brandId), eq(C.provider, "meta"), isNotNull(C.accessToken), isNotNull(C.externalId)));
  if (!c?.token || !c.act || c.status === "disconnected" || c.status === "sample") return null;
  try { return { act: c.act, token: decrypt(c.token) }; } catch { return null; }
}

/** Does the brand have its own data to build "Your audience" from? */
export async function hasOwnData(brandId: string): Promise<{ store: boolean; ads: boolean }> {
  const [r] = (await db.execute(sql`select exists(select 1 from shop_orders where brand_id = ${brandId}) as store, exists(select 1 from meta_insights_daily where brand_id = ${brandId} and impressions > 0) as ads`)).rows as { store: boolean; ads: boolean }[];
  return { store: Boolean(r?.store), ads: Boolean(r?.ads) };
}

/** The store's buyers in more detail than storeFacts: what they buy, how often, how they arrive. */
async function shopper(brandId: string) {
  const [x] = (await db.execute(sql`
    with c as (select number_of_orders as n, amount_spent as spent, marketing_consent as ok from shop_customers where brand_id = ${brandId})
    select count(*)::int as customers,
      count(*) filter (where n = 1)::int as "once", count(*) filter (where n = 2)::int as "twice", count(*) filter (where n between 3 and 5)::int as "threeToFive", count(*) filter (where n >= 6)::int as "sixPlus",
      percentile_cont(0.5) within group (order by spent)::float8 as "medianSpent", percentile_cont(0.9) within group (order by spent)::float8 as "topTenthSpent",
      (count(*) filter (where ok)::float8 / nullif(count(*), 0)) as "emailOptIn"
    from c`)).rows as Record<string, number | null>[];
  const top = (await db.execute(sql`
    select l.title, sum(l.quantity)::int as units from shop_order_lines l join shop_orders o on o.brand_id = l.brand_id and o.id = l.order_id
    where l.brand_id = ${brandId} and not o.test and o.cancelled_at is null and o.created_at > now() - interval '90 days'
    group by l.title order by units desc limit 8`)).rows as { title: string; units: number }[];
  const channels = (await db.execute(sql`
    select channel, count(*)::int as orders from shop_orders where brand_id = ${brandId} and not test and cancelled_at is null and created_at > now() - interval '90 days'
    group by channel order by orders desc`)).rows as { channel: string; orders: number }[];
  const [basket] = (await db.execute(sql`
    select avg(n)::float8 as "itemsPerOrder" from (select sum(l.quantity) as n from shop_order_lines l join shop_orders o on o.brand_id = l.brand_id and o.id = l.order_id
    where l.brand_id = ${brandId} and not o.test and o.cancelled_at is null and o.created_at > now() - interval '90 days' group by l.order_id) b`)).rows as { itemsPerOrder: number | null }[];
  const total = channels.reduce((a, c) => a + c.orders, 0);
  const share = (n: number | null | undefined) => (x?.customers ? Math.round(((n ?? 0) / Number(x.customers)) * 100) : null);
  return x?.customers ? {
    customersByOrders: { once: share(x.once), twice: share(x.twice), threeToFive: share(x.threeToFive), sixOrMore: share(x.sixPlus) },
    medianLifetimeSpend: x.medianSpent != null ? Math.round(x.medianSpent) : null, topTenthSpend: x.topTenthSpent != null ? Math.round(x.topTenthSpent) : null,
    emailOptIn: x.emailOptIn != null ? Math.round(x.emailOptIn * 100) : null,
    itemsPerOrder: basket?.itemsPerOrder != null ? +basket.itemsPerOrder.toFixed(1) : null,
    topProductsLast90Days: top.map((t) => `${t.title} (${t.units})`),
    ordersByChannel: total ? channels.map((c) => `${c.channel} ${Math.round((c.orders / total) * 100)}%`) : [],
  } : null;
}

type BRow = { impressions?: string; inline_link_clicks?: string; spend?: string; actions?: { action_type: string; value: string }[]; age?: string; gender?: string; region?: string; publisher_platform?: string; platform_position?: string };
const split = (rows: BRow[], label: (r: BRow) => string, top = 12) => {
  const m = new Map<string, { imp: number; clicks: number; buys: number }>();
  for (const r of rows) {
    const k = label(r), v = m.get(k) ?? { imp: 0, clicks: 0, buys: 0 };
    v.imp += Number(r.impressions ?? 0); v.clicks += Number(r.inline_link_clicks ?? 0); v.buys += purchaseMetric(r.actions);
    m.set(k, v);
  }
  const t = [...m.values()].reduce((a, v) => ({ imp: a.imp + v.imp, clicks: a.clicks + v.clicks, buys: a.buys + v.buys }), { imp: 0, clicks: 0, buys: 0 });
  if (!t.imp) return [];
  return [...m.entries()].sort((a, b) => b[1].imp - a[1].imp).slice(0, top).map(([k, v]) => ({
    who: k, ofImpressions: `${Math.round((v.imp / t.imp) * 100)}%`, ofClicks: t.clicks ? `${Math.round((v.clicks / t.clicks) * 100)}%` : null,
    ofPurchases: t.buys ? `${Math.round((v.buys / t.buys) * 100)}%` : null, clickRate: v.imp ? `${((v.clicks / v.imp) * 100).toFixed(2)}%` : null,
  }));
};

/** Who Meta shows the ads to, and who clicks and buys — read live from the ad account. Null when Meta can't be read. */
async function metaAudience(brandId: string) {
  const c = await metaConn(brandId);
  if (!c) return null;
  const get = async (breakdowns: string, preset = "last_90d") => (await metaGet<{ data: BRow[] }>(`${c.act}/insights`, {
    level: "account", date_preset: preset, breakdowns, fields: "impressions,inline_link_clicks,spend,actions", limit: "500",
  }, c.token)).data ?? [];
  try {
    let preset = "last_90d";
    let ag = await get("age,gender", preset);
    if (ag.reduce((a, r) => a + Number(r.impressions ?? 0), 0) < 1000) { preset = "last_year"; ag = await get("age,gender", preset); }
    const [region, place] = await Promise.all([get("region", preset).catch(() => []), get("publisher_platform,platform_position", preset).catch(() => [])]);
    return {
      period: preset === "last_90d" ? "last 90 days" : "last 12 months",
      byAgeAndGender: split(ag, (r) => `${r.gender === "female" ? "Women" : r.gender === "male" ? "Men" : "Unknown"} ${r.age}`, 14),
      byRegion: split(region, (r) => r.region ?? "Unknown", 8),
      byPlacement: split(place, (r) => `${r.publisher_platform ?? ""} ${String(r.platform_position ?? "").replace(/_/g, " ")}`.trim(), 6),
    };
  } catch (e) { console.warn("audience: meta breakdowns", (e as Error).message); return null; }
}

/** Ads results from the synced mirror: how the account performs overall. */
async function adsSummary(brandId: string) {
  const [r] = (await db.execute(sql`select coalesce(sum(impressions),0)::float8 as imp, coalesce(sum(clicks),0)::float8 as clicks, coalesce(sum(spend),0)::float8 as spend,
    coalesce(sum(purchases),0)::float8 as buys, coalesce(sum(purchase_value),0)::float8 as value from meta_insights_daily where brand_id = ${brandId} and date > now() - interval '180 days'`)).rows as { imp: number; clicks: number; spend: number; buys: number; value: number }[];
  if (!r?.imp) return null;
  return { last180Days: { clickRate: `${((r.clicks / r.imp) * 100).toFixed(2)}%`, costPerClick: r.clicks ? +(r.spend / r.clicks).toFixed(2) : null, purchasesPer1000Views: +((r.buys / r.imp) * 1000).toFixed(2), metaReportedReturn: r.spend ? +(r.value / r.spend).toFixed(2) : null } };
}

/** Everything Iris builds a panel from. "general" leaves out the brand's own numbers. */
export async function audienceFacts(brandId: string, kind: "yours" | "general") {
  const [b] = await db.select({ name: schema.brands.name, category: schema.brands.category, website: schema.brands.website, currency: schema.brands.currency, onboarding: schema.brands.onboarding })
    .from(schema.brands).where(eq(schema.brands.id, brandId));
  const profile = b.onboarding?.profile ? Object.fromEntries(Object.entries(b.onboarding.profile).map(([k, v]) => [k, v.value])) : null;
  const products = (await db.execute(sql`select title, price_min::float8 as price, product_type as type from shop_products where brand_id = ${brandId} and coalesce(status, 'ACTIVE') = 'ACTIVE' order by total_inventory desc nulls last limit 15`)).rows as { title: string; price: number | null; type: string | null }[];
  const catalog = products.length ? products : (b.onboarding?.catalog?.products ?? []).slice(0, 15).map((p) => ({ title: p.title, price: p.variants[0]?.price ?? null, type: p.type || null }));
  const r = await researchFor(brandId, null);
  const research = r?.report ? {
    market: "US", demand: `${r.report.demand.verdict} — ${r.report.demand.line}`,
    buyers: r.report.segments.filter((s) => s.status !== "rejected").map((s) => ({ name: s.name, who: s.who, need: s.need, objections: s.objections, ages: s.reach.ages, gender: s.reach.gender, interests: s.reach.interests.slice(0, 5) })),
    price: r.report.price, competitors: r.report.competitors.slice(0, 6).map((c) => `${c.name}${c.price ? ` (${c.price})` : ""}`),
    positioning: r.positioning ? { statement: r.positioning.statement, primaryBuyer: r.positioning.primary, secondary: r.positioning.secondary } : null,
  } : null;
  const brand = { name: b.name, category: b.category, website: b.website, currency: b.currency, profile, catalog: catalog.map((p) => `${p.title}${p.price != null ? ` · ${p.price}` : ""}`) };
  if (kind === "general") return { brand, research };
  const [store, buyers, meta, ads, lessons] = await Promise.all([storeFacts(brandId), shopper(brandId), metaAudience(brandId), adsSummary(brandId), metaLessons(brandId)]);
  return { brand, research, store, buyers, metaAudience: meta, ads, whatWinsInLiveAds: lessons };
}

// ---------------------------------------------------------------- the brand's own live ads, with their real results

type Creative = { title?: string; body?: string; image_url?: string; thumbnail_url?: string; object_type?: string; call_to_action_type?: string;
  object_story_spec?: { link_data?: { message?: string; name?: string; picture?: string; call_to_action?: { type?: string } }; video_data?: { message?: string; title?: string; image_url?: string; call_to_action?: { type?: string } } };
  asset_feed_spec?: { bodies?: { text?: string }[]; titles?: { text?: string }[]; images?: { url?: string }[] } };
const ctaName = (t?: string) => (t ? t.toLowerCase().split("_").map((w, i) => (i ? w : w[0].toUpperCase() + w.slice(1))).join(" ") : "Shop now");

/** Past Meta ads with enough views to judge, their copy and picture read live from Meta, and their real click rates. */
export async function liveAds(brandId: string, max = 24): Promise<TestItem[]> {
  const c = await metaConn(brandId);
  if (!c) return [];
  const rows = (await db.execute(sql`
    select i.ad_id as id, a.name, sum(i.impressions)::float8 as imp, sum(i.clicks)::float8 as clicks, sum(i.spend)::float8 as spend, sum(i.purchases)::float8 as buys, sum(i.purchase_value)::float8 as value
    from meta_insights_daily i left join meta_ads a on a.brand_id = i.brand_id and a.id = i.ad_id
    where i.brand_id = ${brandId} and i.date > now() - interval '365 days' group by i.ad_id, a.name having sum(i.impressions) >= 1500 order by sum(i.spend) desc limit ${max}`)).rows as { id: string; name: string | null; imp: number; clicks: number; spend: number; buys: number; value: number }[];
  if (!rows.length) return [];
  let found: Record<string, { id: string; name?: string; creative?: Creative }> = {};
  try {
    found = await metaGet<typeof found>("", {
      ids: rows.map((r) => r.id).join(","),
      fields: "name,creative{title,body,image_url,thumbnail_url,object_type,call_to_action_type,object_story_spec,asset_feed_spec}",
    }, c.token);
  } catch (e) { console.warn("audience: live ads", (e as Error).message); return []; }
  return rows.flatMap((r): TestItem[] => {
    const cr = found[r.id]?.creative;
    if (!cr) return [];
    const ld = cr.object_story_spec?.link_data, vd = cr.object_story_spec?.video_data, af = cr.asset_feed_spec;
    const body = cr.body ?? ld?.message ?? vd?.message ?? af?.bodies?.[0]?.text ?? "";
    const title = cr.title ?? ld?.name ?? vd?.title ?? af?.titles?.[0]?.text ?? "";
    const image = cr.image_url ?? ld?.picture ?? vd?.image_url ?? af?.images?.[0]?.url ?? cr.thumbnail_url ?? null;
    if (!body && !image) return [];
    const video = cr.object_type === "VIDEO" || Boolean(vd);
    return [{
      key: `live:${r.id}`, kind: "live", label: (r.name ?? found[r.id]?.name ?? "Live ad").slice(0, 80), metaAdId: r.id, format: video ? "video" : "static",
      hook: "", primaryText: body.slice(0, 700), headline: title.slice(0, 120), cta: ctaName(cr.call_to_action_type ?? ld?.call_to_action?.type ?? vd?.call_to_action?.type), offer: "", product: null, image,
      real: { ctr: r.clicks / r.imp, impressions: Math.round(r.imp), clicks: Math.round(r.clicks), purchases: Math.round(r.buys), spend: Math.round(r.spend), roas: r.spend ? +(r.value / r.spend).toFixed(2) : null },
    }];
  });
}

/** Shoots videos the panel can watch. */
export async function videosFor(brandId: string) {
  const A = schema.brandAssets;
  return db.select({ id: A.id, name: A.name, meta: A.meta, createdAt: A.createdAt }).from(A)
    .where(and(eq(A.brandId, brandId), eq(A.kind, "video"))).orderBy(desc(A.createdAt)).limit(24);
}
export async function videoRows(brandId: string, ids: string[]) {
  const A = schema.brandAssets;
  return ids.length ? db.select({ id: A.id, name: A.name, meta: A.meta }).from(A).where(and(eq(A.brandId, brandId), eq(A.kind, "video"), inArray(A.id, ids))) : [];
}
