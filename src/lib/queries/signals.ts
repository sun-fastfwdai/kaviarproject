import "server-only";
import { sql } from "drizzle-orm";
import { one, rows, SALE, since } from "./common";

/** Everything the store data says, as numbers an ad can use. One round-trip per group. */
export async function signalData(brandId: string, tz: string) {
  const days = 30;
  const [catalog, best, pair, stock, orders, codes, customers, reorder, lapsed, refunds, types] = await Promise.all([
    one<{ products: number; variants: number; withImage: number; withCost: number; avgMargin: number | null }>(sql`
      select (select count(*) from shop_products where brand_id = ${brandId} and coalesce(status, 'ACTIVE') = 'ACTIVE')::int as "products",
        (select count(*) from shop_variants where brand_id = ${brandId})::int as "variants",
        (select count(*) from shop_products where brand_id = ${brandId} and image_url is not null)::int as "withImage",
        (select count(*) from shop_variants where brand_id = ${brandId} and unit_cost > 0)::int as "withCost",
        (select avg(1 - unit_cost / price) from shop_variants where brand_id = ${brandId} and unit_cost > 0 and price > 0)::float8 as "avgMargin"`),
    rows<{ title: string; units: number; revenue: number }>(sql`
      select l.title, sum(l.quantity)::int as "units", sum(l.total)::float8 as "revenue" from shop_order_lines l
      join shop_orders o on o.brand_id = l.brand_id and o.id = l.order_id
      where l.brand_id = ${brandId} and ${SALE} and o.created_at >= ${since(tz, days)} group by 1 order by 2 desc limit 3`),
    one<{ a: string; b: string; n: number; total: number } | undefined>(sql`
      with l as (
        select distinct l.order_id, l.title from shop_order_lines l join shop_orders o on o.brand_id = l.brand_id and o.id = l.order_id
        where l.brand_id = ${brandId} and ${SALE} and o.created_at >= ${since(tz, 90)}
      )
      select a.title as "a", b.title as "b", count(*)::int as "n",
        (select count(distinct order_id) from l)::int as "total"
      from l a join l b on a.order_id = b.order_id and a.title < b.title group by 1, 2 order by 3 desc limit 1`),
    rows<{ title: string; inventory: number; daysOfStock: number }>(sql`
      with sold as (
        select l.variant_id, sum(l.quantity) as units from shop_order_lines l join shop_orders o on o.brand_id = l.brand_id and o.id = l.order_id
        where l.brand_id = ${brandId} and ${SALE} and o.created_at >= ${since(tz, days)} and l.variant_id is not null group by 1
      )
      select p.title || case when v.title is null or v.title = 'Default Title' then '' else ' · ' || v.title end as "title",
        v.inventory_quantity as "inventory", (v.inventory_quantity / (sold.units::float8 / ${days}::int))::float8 as "daysOfStock"
      from shop_variants v join sold on sold.variant_id = v.id join shop_products p on p.brand_id = v.brand_id and p.id = v.product_id
      where v.brand_id = ${brandId} and v.inventory_quantity is not null order by 3 asc limit 3`),
    one<{ orders: number; metaOrders: number; firstOrders: number }>(sql`
      select count(*)::int as "orders", (count(*) filter (where channel = 'meta'))::int as "metaOrders",
        (count(*) filter (where customer_id is not null and not exists (
          select 1 from shop_orders p where p.brand_id = o.brand_id and p.customer_id = o.customer_id and p.created_at < o.created_at)))::int as "firstOrders"
      from shop_orders o where o.brand_id = ${brandId} and ${SALE} and o.created_at >= ${since(tz, days)}`),
    rows<{ code: string; n: number }>(sql`
      select upper(c) as "code", count(*)::int as "n" from shop_orders o, unnest(o.discount_codes) c
      where o.brand_id = ${brandId} and ${SALE} and o.created_at >= ${since(tz, days)} group by 1 order by 2 desc limit 1`),
    one<{ total: number; consented: number; repeat: number; recent: number; top10: number; top10Share: number | null }>(sql`
      with c as (select * from shop_customers where brand_id = ${brandId}),
      ranked as (select amount_spent, ntile(10) over (order by amount_spent desc nulls last) as dec from c)
      select (select count(*) from c)::int as "total", (select count(*) from c where marketing_consent)::int as "consented",
        (select count(*) from c where number_of_orders >= 2)::int as "repeat",
        (select count(distinct customer_id) from shop_orders o where o.brand_id = ${brandId} and ${SALE} and o.created_at >= ${since(tz, days)})::int as "recent",
        (select count(*) from ranked where dec = 1)::int as "top10",
        ((select sum(amount_spent) from ranked where dec = 1) / nullif((select sum(amount_spent) from c), 0))::float8 as "top10Share"`),
    one<{ medianDays: number | null; product: string | null }>(sql`
      with x as (
        select customer_id, created_at, row_number() over (partition by customer_id order by created_at) rn
        from shop_orders where brand_id = ${brandId} and not test and cancelled_at is null and customer_id is not null
      )
      select percentile_cont(0.5) within group (order by extract(epoch from (b.created_at - a.created_at)) / 86400)::float8 as "medianDays",
        null::text as "product"
      from x a join x b on a.customer_id = b.customer_id and a.rn = 1 and b.rn = 2`),
    one<{ lapsed: number }>(sql`
      select count(*)::int as "lapsed" from (
        select customer_id, max(created_at) last from shop_orders
        where brand_id = ${brandId} and not test and cancelled_at is null and customer_id is not null group by 1
      ) t where last < now() - interval '60 days' and last >= now() - interval '180 days'`),
    one<{ refunded: number; orders: number }>(sql`
      select (count(*) filter (where refunded > 0))::int as "refunded", count(*)::int as "orders"
      from shop_orders o where o.brand_id = ${brandId} and ${SALE} and o.created_at >= ${since(tz, days)}`),
    rows<{ name: string; n: number }>(sql`
      select coalesce(nullif(product_type, ''), 'Other') as "name", count(*)::int as "n" from shop_products
      where brand_id = ${brandId} and coalesce(status, 'ACTIVE') = 'ACTIVE' group by 1 order by 2 desc`),
  ]);
  return { catalog, best, pair: pair ?? null, stock, orders, code: codes[0] ?? null, customers, reorder, lapsed, refunds, types: types.filter((t) => t.name !== "Other" || types.length === 1) };
}
