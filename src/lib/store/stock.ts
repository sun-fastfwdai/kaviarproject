import "server-only";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { SALE, since } from "../queries/common";
import { read, write } from "../seo/run";
import { forecastAll, STOCK, stockTotals, type StockIn, type StockRow } from "./stock-rules";

/** The stock forecast for a brand, from its Shopify products, stock on hand and the last 30 days of orders. */
const KEY = "stock";
export type Stock = { rows: StockRow[]; totals: ReturnType<typeof stockTotals>; leadDays: number; leadSet: boolean; untracked: number };

export async function getStock(brandId: string, tz: string): Promise<Stock> {
  const [set, res] = await Promise.all([
    read<{ leadDays?: number }>(brandId, KEY),
    db.execute(sql`
      with sold as (
        select l.product_id, sum(l.quantity) as units from shop_order_lines l join shop_orders o on o.brand_id = l.brand_id and o.id = l.order_id
        where l.brand_id = ${brandId} and ${SALE} and o.created_at >= ${since(tz, STOCK.windowDays)} group by 1
      ),
      v as (
        select product_id, sum(greatest(inventory_quantity, 0)) filter (where inventory_quantity is not null) as inv, count(*) filter (where inventory_quantity is not null) as counted,
          avg(unit_cost) filter (where unit_cost > 0) as cost
        from shop_variants where brand_id = ${brandId} group by 1
      )
      select p.id::text as "id", p.title, p.image_url as "image", p.price_min::float8 as "price", v.cost::float8 as "cost",
        case when coalesce(v.counted, 0) > 0 then v.inv::int else p.total_inventory end as "inventory", coalesce(sold.units, 0)::int as "units30"
      from shop_products p left join sold on sold.product_id = p.id left join v on v.product_id = p.id
      where p.brand_id = ${brandId} and lower(coalesce(p.status, 'active')) = 'active'`),
  ]);
  const all = res.rows as (Omit<StockIn, "inventory"> & { inventory: number | null })[];
  const counted = all.filter((p): p is StockIn => p.inventory != null); // a product Shopify doesn't count stock for can't be forecast
  const leadDays = set?.leadDays && set.leadDays > 0 ? Math.round(set.leadDays) : STOCK.leadDefault;
  const rows = forecastAll(counted, leadDays);
  return { rows, totals: stockTotals(rows), leadDays, leadSet: Boolean(set?.leadDays), untracked: all.length - counted.length };
}
export async function setLead(brandId: string, days: number): Promise<void> {
  await write(brandId, KEY, { leadDays: Math.max(1, Math.min(365, Math.round(days))), at: new Date().toISOString() });
}
