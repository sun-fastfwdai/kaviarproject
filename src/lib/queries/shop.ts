import "server-only";
import { sql } from "drizzle-orm";
import { one, rows, SALE, since } from "./common";
import type { Channel } from "../db/schema";

export function shopCounts(brandId: string) {
  return one<{ orders: number; lines: number; products: number; variants: number; customers: number; firstOrder: Date | null }>(sql`
    select (select count(*) from shop_orders where brand_id = ${brandId})::int as "orders",
      (select count(*) from shop_order_lines where brand_id = ${brandId})::int as "lines",
      (select count(*) from shop_products where brand_id = ${brandId})::int as "products",
      (select count(*) from shop_variants where brand_id = ${brandId})::int as "variants",
      (select count(*) from shop_customers where brand_id = ${brandId})::int as "customers",
      (select min(created_at) from shop_orders where brand_id = ${brandId}) as "firstOrder"`);
}

export type OrderRow = {
  id: number; name: string; createdAt: Date; total: number; refunded: number; financialStatus: string | null;
  fulfillmentStatus: string | null; channel: Channel; utmCampaign: string | null; campaign: string | null;
  items: string | null; itemCount: number; priorOrders: number | null;
};

export function orders(brandId: string, opts: { limit: number; offset: number; channel?: Channel | null }) {
  return rows<OrderRow>(sql`
    select o.id::float8 as "id", o.name, o.created_at as "createdAt", o.total::float8 as "total", o.refunded::float8 as "refunded",
      o.financial_status as "financialStatus", o.fulfillment_status as "fulfillmentStatus", o.channel, o.utm_campaign as "utmCampaign",
      c.name as "campaign",
      (select string_agg(l.title || case when l.quantity > 1 then ' × ' || l.quantity else '' end, ', ' order by l.total desc)
         from shop_order_lines l where l.brand_id = o.brand_id and l.order_id = o.id) as "items",
      (select count(*) from shop_order_lines l where l.brand_id = o.brand_id and l.order_id = o.id)::int as "itemCount",
      case when o.customer_id is null then null else
        (select count(*) from shop_orders p where p.brand_id = o.brand_id and p.customer_id = o.customer_id and p.created_at < o.created_at)::int end as "priorOrders"
    from shop_orders o
    left join meta_campaigns c on c.brand_id = o.brand_id and c.id = o.meta_campaign_id
    where o.brand_id = ${brandId} and not o.test ${opts.channel ? sql`and o.channel = ${opts.channel}` : sql``}
    order by o.created_at desc limit ${opts.limit} offset ${opts.offset}`);
}

export function orderCount(brandId: string, channel?: Channel | null) {
  return one<{ n: number }>(sql`select count(*)::int as n from shop_orders o where o.brand_id = ${brandId} and not o.test ${channel ? sql`and o.channel = ${channel}` : sql``}`);
}

export type ProductRow = {
  id: number; title: string; imageUrl: string | null; status: string | null; variants: number; inventory: number | null;
  price: number | null; units: number; revenue: number; daysOfStock: number | null; margin: number | null;
};

export function products(brandId: string, tz: string, days: number, limit = 100) {
  return rows<ProductRow>(sql`
    with sold as (
      select l.product_id, sum(l.quantity) as units, sum(l.total) as revenue from shop_order_lines l
      join shop_orders o on o.brand_id = l.brand_id and o.id = l.order_id
      where l.brand_id = ${brandId} and ${SALE} and o.created_at >= ${since(tz, days)} group by 1
    ),
    v as (
      select product_id, count(*) as n, sum(greatest(inventory_quantity, 0)) as inv,
        avg(case when unit_cost > 0 and price > 0 then 1 - unit_cost / price end) as margin
      from shop_variants where brand_id = ${brandId} group by 1
    )
    select p.id::float8 as "id", p.title, p.image_url as "imageUrl", p.status, coalesce(v.n, 0)::int as "variants",
      coalesce(v.inv, p.total_inventory)::int as "inventory", p.price_min::float8 as "price",
      coalesce(sold.units, 0)::int as "units", coalesce(sold.revenue, 0)::float8 as "revenue",
      case when coalesce(sold.units, 0) > 0 then (coalesce(v.inv, p.total_inventory) / (sold.units::float8 / ${days}::int))::float8 end as "daysOfStock",
      v.margin::float8 as "margin"
    from shop_products p left join sold on sold.product_id = p.id left join v on v.product_id = p.id
    where p.brand_id = ${brandId}
    order by coalesce(sold.revenue, 0) desc, p.title limit ${limit}`);
}
