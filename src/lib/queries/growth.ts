import "server-only";
import { sql } from "drizzle-orm";
import { one, rows, SALE, since, sinceDate } from "./common";
import type { Channel } from "../db/schema";

export type Summary = {
  revenue: number; orders: number; metaRevenue: number; metaOrders: number; newCustomers: number;
  returningOrders: number; customerOrders: number; prevRevenue: number;
  spend: number; impressions: number; clicks: number; metaPurchases: number; metaValue: number;
};

/** Shopify sales and Meta's own numbers for the same window, side by side. */
export async function summary(brandId: string, tz: string, days: number): Promise<Summary> {
  const shop = await one<Omit<Summary, "spend" | "impressions" | "clicks" | "metaPurchases" | "metaValue">>(sql`
    with firsts as (
      select customer_id, min(created_at) f from shop_orders
      where brand_id = ${brandId} and not test and cancelled_at is null and customer_id is not null group by customer_id
    ), o as (
      select o.* from shop_orders o where o.brand_id = ${brandId} and ${SALE} and o.created_at >= ${since(tz, days)}
    )
    select coalesce(sum(o.total - o.refunded), 0)::float8 as "revenue", count(*)::int as "orders",
      coalesce(sum(o.total - o.refunded) filter (where o.channel = 'meta'), 0)::float8 as "metaRevenue",
      (count(*) filter (where o.channel = 'meta'))::int as "metaOrders",
      (count(distinct o.customer_id) filter (where f.f >= ${since(tz, days)}))::int as "newCustomers",
      (count(*) filter (where o.customer_id is not null and f.f < o.created_at))::int as "returningOrders",
      (count(*) filter (where o.customer_id is not null))::int as "customerOrders",
      (select coalesce(sum(p.total - p.refunded), 0) from shop_orders p where p.brand_id = ${brandId} and not p.test and p.cancelled_at is null
         and p.created_at >= ${since(tz, days * 2)} and p.created_at < ${since(tz, days)})::float8 as "prevRevenue"
    from o left join firsts f on f.customer_id = o.customer_id`);
  const meta = await one<Pick<Summary, "spend" | "impressions" | "clicks" | "metaPurchases" | "metaValue">>(sql`
    select coalesce(sum(spend), 0)::float8 as "spend", coalesce(sum(impressions), 0)::float8 as "impressions",
      coalesce(sum(clicks), 0)::float8 as "clicks", coalesce(sum(purchases), 0)::float8 as "metaPurchases",
      coalesce(sum(purchase_value), 0)::float8 as "metaValue"
    from meta_insights_daily where brand_id = ${brandId} and date >= ${sinceDate(tz, days)}`);
  return { ...shop, ...meta };
}

export type Day = { day: string; revenue: number; meta: number; spend: number };

export function daily(brandId: string, tz: string, days: number) {
  return rows<Day>(sql`
    with d as (select generate_series(${sinceDate(tz, days)}, (now() at time zone ${tz})::date, interval '1 day')::date as day),
    o as (
      select (o.created_at at time zone ${tz})::date as day, sum(o.total - o.refunded) as rev,
        sum(o.total - o.refunded) filter (where o.channel = 'meta') as meta
      from shop_orders o where o.brand_id = ${brandId} and ${SALE} and o.created_at >= ${since(tz, days)} group by 1
    ),
    s as (select date as day, sum(spend) as spend from meta_insights_daily where brand_id = ${brandId} and date >= ${sinceDate(tz, days)} group by 1)
    select d.day::text as "day", coalesce(o.rev, 0)::float8 as "revenue", coalesce(o.meta, 0)::float8 as "meta", coalesce(s.spend, 0)::float8 as "spend"
    from d left join o using (day) left join s using (day) order by d.day`);
}

export type ChannelRow = { channel: Channel; orders: number; revenue: number };
export function channels(brandId: string, tz: string, days: number) {
  return rows<ChannelRow>(sql`
    select o.channel, count(*)::int as "orders", sum(o.total - o.refunded)::float8 as "revenue"
    from shop_orders o where o.brand_id = ${brandId} and ${SALE} and o.created_at >= ${since(tz, days)}
    group by 1 order by 3 desc`);
}

export type CampaignRow = {
  id: string; name: string; objective: string | null; status: string | null; budget: number | null; spend: number;
  impressions: number; clicks: number; purchases: number; value: number; verifiedOrders: number; verifiedRevenue: number;
};

/** Meta's view of each campaign next to the Shopify orders that carry its UTM (id or exact name). */
export function campaigns(brandId: string, tz: string, days: number) {
  return rows<CampaignRow>(sql`
    with ins as (
      select campaign_id, sum(spend) spend, sum(impressions) impr, sum(clicks) clicks, sum(purchases) purch, sum(purchase_value) val
      from meta_insights_daily where brand_id = ${brandId} and date >= ${sinceDate(tz, days)} group by 1
    ),
    v as (
      select c.id, count(o.id) as orders, sum(o.total - o.refunded) as revenue
      from meta_campaigns c join shop_orders o on o.brand_id = c.brand_id and o.channel = 'meta' and ${SALE}
        and o.created_at >= ${since(tz, days)}
        and (o.meta_campaign_id = c.id or (o.meta_campaign_id is null and lower(o.utm_campaign) = lower(c.name)))
      where c.brand_id = ${brandId} group by c.id
    )
    select c.id, c.name, c.objective, c.effective_status as "status", c.daily_budget::float8 as "budget",
      coalesce(ins.spend, 0)::float8 as "spend", coalesce(ins.impr, 0)::float8 as "impressions", coalesce(ins.clicks, 0)::float8 as "clicks",
      coalesce(ins.purch, 0)::float8 as "purchases", coalesce(ins.val, 0)::float8 as "value",
      coalesce(v.orders, 0)::int as "verifiedOrders", coalesce(v.revenue, 0)::float8 as "verifiedRevenue"
    from meta_campaigns c left join ins on ins.campaign_id = c.id left join v on v.id = c.id
    where c.brand_id = ${brandId} and (coalesce(ins.spend, 0) > 0 or c.effective_status = 'ACTIVE')
    order by 6 desc, c.name`);
}

export type AdRow = {
  id: string; name: string; campaign: string | null; status: string | null; thumbnailUrl: string | null; spend: number;
  impressions: number; clicks: number; purchases: number; value: number; verifiedOrders: number; verifiedRevenue: number;
};
export function ads(brandId: string, tz: string, days: number, limit = 8) {
  return rows<AdRow>(sql`
    with ins as (
      select ad_id, sum(spend) spend, sum(impressions) impr, sum(clicks) clicks, sum(purchases) purch, sum(purchase_value) val
      from meta_insights_daily where brand_id = ${brandId} and date >= ${sinceDate(tz, days)} group by 1
    ),
    v as (
      select o.meta_ad_id as id, count(*) as orders, sum(o.total - o.refunded) as revenue from shop_orders o
      where o.brand_id = ${brandId} and ${SALE} and o.created_at >= ${since(tz, days)} and o.meta_ad_id is not null group by 1
    )
    select a.id, a.name, c.name as "campaign", a.effective_status as "status", a.thumbnail_url as "thumbnailUrl",
      ins.spend::float8 as "spend", ins.impr::float8 as "impressions", ins.clicks::float8 as "clicks",
      ins.purch::float8 as "purchases", ins.val::float8 as "value",
      coalesce(v.orders, 0)::int as "verifiedOrders", coalesce(v.revenue, 0)::float8 as "verifiedRevenue"
    from ins join meta_ads a on a.brand_id = ${brandId} and a.id = ins.ad_id
    left join meta_campaigns c on c.brand_id = a.brand_id and c.id = a.campaign_id
    left join v on v.id = a.id
    where ins.spend > 0 order by ins.spend desc limit ${limit}`);
}

/** How many Meta orders carry the ad id — the thing that answers "which ad sold which product". */
export function utmHealth(brandId: string, tz: string, days: number) {
  return one<{ metaOrders: number; withAd: number; withCampaign: number }>(sql`
    select count(*)::int as "metaOrders", (count(*) filter (where meta_ad_id is not null))::int as "withAd",
      (count(*) filter (where meta_campaign_id is not null or utm_campaign is not null))::int as "withCampaign"
    from shop_orders o where o.brand_id = ${brandId} and ${SALE} and o.channel = 'meta' and o.created_at >= ${since(tz, days)}`);
}

export type AdProductRow = { ad: string; adId: string; product: string; orders: number; units: number; revenue: number };
/** Sun's question: which ad sold which product. Orders carry utm_content={{ad.id}}; their lines carry the products. */
export function adProducts(brandId: string, tz: string, days: number, limit = 8) {
  return rows<AdProductRow>(sql`
    select coalesce(a.name, o.meta_ad_id) as "ad", o.meta_ad_id as "adId", l.title as "product",
      count(distinct o.id)::int as "orders", sum(l.quantity)::int as "units", sum(l.total)::float8 as "revenue"
    from shop_orders o join shop_order_lines l on l.brand_id = o.brand_id and l.order_id = o.id
    left join meta_ads a on a.brand_id = o.brand_id and a.id = o.meta_ad_id
    where o.brand_id = ${brandId} and ${SALE} and o.meta_ad_id is not null and o.created_at >= ${since(tz, days)}
    group by 1, 2, 3 order by 6 desc limit ${limit}`);
}
