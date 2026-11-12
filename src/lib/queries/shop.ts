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

export type OrderStatus = "paid" | "unfulfilled" | "fulfilled" | "refunded" | "cancelled";
export type OrderFilter = { channel?: Channel | null; q?: string | null; days?: number | null; status?: OrderStatus | null; tz: string };

function orderWhere(brandId: string, f: OrderFilter) {
  const q = f.q?.trim();
  return sql`o.brand_id = ${brandId} and not o.test
    ${f.channel ? sql`and o.channel = ${f.channel}` : sql``}
    ${f.days ? sql`and o.created_at >= ${since(f.tz, f.days)}` : sql``}
    ${q ? sql`and (o.name ilike ${"%" + q + "%"} or exists (select 1 from shop_order_lines l where l.brand_id = o.brand_id and l.order_id = o.id and l.title ilike ${"%" + q + "%"}) or o.utm_campaign ilike ${"%" + q + "%"} or o.discount_codes ilike ${"%" + q + "%"})` : sql``}
    ${f.status === "refunded" ? sql`and o.refunded > 0` : f.status === "cancelled" ? sql`and o.cancelled_at is not null`
      : f.status === "fulfilled" ? sql`and o.fulfillment_status = 'FULFILLED' and o.refunded = 0 and o.cancelled_at is null`
      : f.status === "unfulfilled" ? sql`and coalesce(o.fulfillment_status, '') <> 'FULFILLED' and o.cancelled_at is null`
      : f.status === "paid" ? sql`and o.financial_status in ('PAID', 'PARTIALLY_REFUNDED') and o.cancelled_at is null` : sql``}`;
}

export function orders(brandId: string, opts: { limit: number; offset: number } & OrderFilter) {
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
    where ${orderWhere(brandId, opts)}
    order by o.created_at desc limit ${opts.limit} offset ${opts.offset}`);
}

export function orderCount(brandId: string, f: OrderFilter) {
  return one<{ n: number }>(sql`select count(*)::int as n from shop_orders o where ${orderWhere(brandId, f)}`);
}

export type DayRow = { day: string; orders: number; revenue: number; meta: number; refunded: number; newCustomers: number };
/** The same filters, one row per day (the "By day" view). */
export function ordersByDay(brandId: string, f: OrderFilter) {
  return rows<DayRow>(sql`
    select to_char((o.created_at at time zone ${f.tz})::date, 'YYYY-MM-DD') as "day", count(*)::int as "orders",
      coalesce(sum(o.total - o.refunded), 0)::float8 as "revenue", count(*) filter (where o.channel = 'meta')::int as "meta",
      coalesce(sum(o.refunded), 0)::float8 as "refunded",
      count(*) filter (where o.customer_id is not null and not exists (select 1 from shop_orders p where p.brand_id = o.brand_id and p.customer_id = o.customer_id and p.created_at < o.created_at))::int as "newCustomers"
    from shop_orders o where ${orderWhere(brandId, f)}
    group by 1 order by 1 desc limit 400`);
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

export type VariantRow = { id: number; product: string; imageUrl: string | null; title: string | null; sku: string | null; price: number | null; unitCost: number | null; inventory: number | null; units: number };
export function variants(brandId: string, tz: string, limit: number, offset: number) {
  return rows<VariantRow>(sql`
    select v.id::float8 as "id", p.title as "product", p.image_url as "imageUrl", v.title, v.sku, v.price::float8 as "price", v.unit_cost::float8 as "unitCost",
      v.inventory_quantity as "inventory",
      coalesce((select sum(l.quantity) from shop_order_lines l join shop_orders o on o.brand_id = l.brand_id and o.id = l.order_id
        where l.brand_id = v.brand_id and l.variant_id = v.id and ${SALE} and o.created_at >= ${since(tz, 30)}), 0)::int as "units"
    from shop_variants v join shop_products p on p.brand_id = v.brand_id and p.id = v.product_id
    where v.brand_id = ${brandId} order by p.title, v.title limit ${limit} offset ${offset}`);
}

export type CustomerRow = { id: number; orders: number; spent: number | null; consent: boolean | null; createdAt: Date | null; lastOrder: Date | null };
export function customers(brandId: string, limit: number, offset: number) {
  return rows<CustomerRow>(sql`
    select c.id::float8 as "id", c.number_of_orders as "orders", c.amount_spent::float8 as "spent", c.marketing_consent as "consent", c.created_at as "createdAt",
      (select max(o.created_at) from shop_orders o where o.brand_id = c.brand_id and o.customer_id = c.id) as "lastOrder"
    from shop_customers c where c.brand_id = ${brandId}
    order by c.amount_spent desc nulls last, c.id limit ${limit} offset ${offset}`);
}

export type LineRow = { id: number; order: string; createdAt: Date; title: string; variantTitle: string | null; sku: string | null; quantity: number; unitPrice: number | null; total: number | null; channel: Channel };
export function orderLines(brandId: string, limit: number, offset: number) {
  return rows<LineRow>(sql`
    select l.id::float8 as "id", o.name as "order", o.created_at as "createdAt", l.title, l.variant_title as "variantTitle", l.sku, l.quantity,
      l.unit_price::float8 as "unitPrice", l.total::float8 as "total", o.channel
    from shop_order_lines l join shop_orders o on o.brand_id = l.brand_id and o.id = l.order_id
    where l.brand_id = ${brandId} order by o.created_at desc, l.id limit ${limit} offset ${offset}`);
}
