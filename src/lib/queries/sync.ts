import "server-only";
import { sql } from "drizzle-orm";
import { rows } from "./common";

export type TableStat = { table: string; source: "shopify" | "meta"; rows: number; freshness: Date | null; how: string; icon: string };

export async function tableStats(brandId: string): Promise<TableStat[]> {
  const counts = (
    await rows<Record<string, number>>(sql`select
      (select count(*) from shop_orders where brand_id = ${brandId})::int as orders,
      (select count(*) from shop_order_lines where brand_id = ${brandId})::int as order_lines,
      (select count(*) from shop_products where brand_id = ${brandId})::int as products,
      (select count(*) from shop_variants where brand_id = ${brandId})::int as variants,
      (select count(*) from shop_customers where brand_id = ${brandId})::int as customers,
      (select count(*) from meta_campaigns where brand_id = ${brandId})::int as campaigns,
      (select count(*) from meta_ads where brand_id = ${brandId})::int as ads,
      (select count(*) from meta_insights_daily where brand_id = ${brandId})::int as insights`)
  )[0];
  const fresh = await rows<{ provider: string; resource: string; at: Date | null }>(sql`
    select provider, resource, last_success_at as at from sync_cursors where brand_id = ${brandId}`);
  const f = (p: string, r: string) => fresh.find((x) => x.provider === p && x.resource === r)?.at ?? null;
  return [
    { table: "orders", source: "shopify", rows: counts.orders, freshness: f("shopify", "orders"), how: "Webhook + hourly", icon: "receipt" },
    { table: "order_lines", source: "shopify", rows: counts.order_lines, freshness: f("shopify", "orders"), how: "With orders", icon: "rows" },
    { table: "products", source: "shopify", rows: counts.products, freshness: f("shopify", "products"), how: "Webhook + hourly", icon: "box" },
    { table: "variants · inventory", source: "shopify", rows: counts.variants, freshness: f("shopify", "products"), how: "With products", icon: "layers" },
    { table: "customers", source: "shopify", rows: counts.customers, freshness: f("shopify", "customers"), how: "Hourly pull", icon: "users" },
    { table: "campaigns", source: "meta", rows: counts.campaigns, freshness: f("meta", "campaigns"), how: "Hourly pull", icon: "megaphone" },
    { table: "ads", source: "meta", rows: counts.ads, freshness: f("meta", "ads"), how: "Hourly pull", icon: "image" },
    { table: "ad_insights_daily", source: "meta", rows: counts.insights, freshness: f("meta", "insights"), how: "Hourly · last 7 days restated", icon: "chart-bar" },
  ];
}

export type RunRow = {
  id: string; provider: "shopify" | "meta"; trigger: string; mode: string; status: string; rows: number;
  detail: Record<string, number>; error: string | null; startedAt: Date; finishedAt: Date | null;
};
export const runs = (brandId: string, limit = 12) =>
  rows<RunRow>(sql`select id, provider, trigger, mode, status, rows, detail, error, started_at as "startedAt", finished_at as "finishedAt"
    from sync_runs where brand_id = ${brandId} order by started_at desc limit ${limit}`);

export const webhookCount = async (brandId: string) =>
  (await rows<{ n: number; last: Date | null }>(sql`select count(*)::int as n, max(received_at) as last from webhook_events where brand_id = ${brandId} and received_at > now() - interval '24 hours'`))[0];
