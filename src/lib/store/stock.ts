import "server-only";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { SALE, since } from "../queries/common";
import { read, write } from "../seo/run";
import { and, eq } from "drizzle-orm";
import { schema } from "../db";
import { shopifyGraphql } from "../shopify/client";
import { forecastAll, STOCK, stockTotals, type Placed, type StockIn, type StockRow } from "./stock-rules";

/** The stock forecast for a brand, from its Shopify products, stock on hand and the last 30 days of orders. */
const KEY = "stock";
export const STOCK_SCOPE = "write_inventory"; // Shopify's permission to change stock counts — asked for only when a brand chooses to
type Saved = { leadDays?: number; orders?: Record<string, Placed> };
export type Stock = { rows: StockRow[]; totals: ReturnType<typeof stockTotals>; leadDays: number; leadSet: boolean; untracked: number };

export async function getStock(brandId: string, tz: string): Promise<Stock> {
  const [set, res] = await Promise.all([
    read<Saved>(brandId, KEY),
    db.execute(sql`
      with sold as (
        select l.product_id, sum(l.quantity) as units from shop_order_lines l join shop_orders o on o.brand_id = l.brand_id and o.id = l.order_id
        where l.brand_id = ${brandId} and ${SALE} and o.created_at >= ${since(tz, STOCK.windowDays)} group by 1
      ),
      v as (
        select product_id, sum(greatest(inventory_quantity, 0)) filter (where inventory_quantity is not null) as inv, count(*) filter (where inventory_quantity is not null) as counted,
          avg(unit_cost) filter (where unit_cost > 0) as cost, count(*) as n, min(sku) filter (where sku <> '') as sku
        from shop_variants where brand_id = ${brandId} group by 1
      )
      select p.id::text as "id", p.title, p.image_url as "image", p.price_min::float8 as "price", v.cost::float8 as "cost",
        case when coalesce(v.counted, 0) > 0 then v.inv::int else p.total_inventory end as "inventory", coalesce(sold.units, 0)::int as "units30",
        coalesce(v.n, 0)::int as "variants", case when coalesce(v.n, 0) = 1 then v.sku end as "sku"
      from shop_products p left join sold on sold.product_id = p.id left join v on v.product_id = p.id
      where p.brand_id = ${brandId} and lower(coalesce(p.status, 'active')) = 'active'`),
  ]);
  const all = res.rows as (Omit<StockIn, "inventory"> & { inventory: number | null })[];
  const counted = all.filter((p): p is StockIn => p.inventory != null); // a product Shopify doesn't count stock for can't be forecast
  const leadDays = set?.leadDays && set.leadDays > 0 ? Math.round(set.leadDays) : STOCK.leadDefault;
  // An order counts as on its way until three weeks after it was due — by then it has landed (and the count shows it) or needs another look.
  const open = Object.fromEntries(Object.entries(set?.orders ?? {}).filter(([, o]) => Date.parse(o.eta) > Date.now() - 21 * 86_400_000));
  const rows = forecastAll(counted.map((p) => ({ ...p, ordered: open[p.id] ?? null })), leadDays);
  return { rows, totals: stockTotals(rows), leadDays, leadSet: Boolean(set?.leadDays), untracked: all.length - counted.length };
}
export async function setLead(brandId: string, days: number): Promise<void> {
  const cur = (await read<Saved>(brandId, KEY)) ?? {};
  await write(brandId, KEY, { ...cur, leadDays: Math.max(1, Math.min(365, Math.round(days))) });
}

// ---------------------------------------------------------------- restocking
/** The brand has placed the order: remember how many and when it should land, so the product stops asking. */
export async function markOrdered(brandId: string, productId: string, qty: number): Promise<void> {
  const cur = (await read<Saved>(brandId, KEY)) ?? {}, lead = cur.leadDays && cur.leadDays > 0 ? cur.leadDays : STOCK.leadDefault, now = new Date();
  await write(brandId, KEY, { ...cur, orders: { ...(cur.orders ?? {}), [productId]: { qty: Math.max(1, Math.round(qty)), at: now.toISOString(), eta: new Date(now.getTime() + lead * 86_400_000).toISOString().slice(0, 10) } } });
}
export async function clearOrder(brandId: string, productId: string): Promise<void> {
  const cur = (await read<Saved>(brandId, KEY)) ?? {}, orders = { ...(cur.orders ?? {}) };
  delete orders[productId];
  await write(brandId, KEY, { ...cur, orders });
}

/** Whether Kaviar may change this store's stock counts. */
export async function stockAccess(brandId: string): Promise<{ connectionId: string | null; canAdd: boolean; shop: string | null }> {
  const C = schema.connections;
  const [c] = await db.select({ id: C.id, status: C.status, scopes: C.scopes, shop: C.externalId }).from(C).where(and(eq(C.brandId, brandId), eq(C.provider, "shopify")));
  const on = c?.status === "connected";
  return { connectionId: on ? c.id : null, canAdd: on && c.scopes.includes(STOCK_SCOPE), shop: c?.shop ?? null };
}

type Level = { location: { id: string; name: string }; quantities: { name: string; quantity: number }[] };
type Target = { product: { variants: { nodes: { id: string; inventoryItem: { id: string; tracked: boolean; inventoryLevels: { nodes: Level[] } } }[] } } | null };
export type StockTarget = { ok: true; available: number; place: string; itemId: string; locationId: string } | { ok: false; why: string };
/** Where a product's stock is counted. Kaviar adds stock only where there is one answer: one variant, counted by Shopify, in one place. */
export async function stockTarget(connectionId: string, productId: string): Promise<StockTarget> {
  const r = await shopifyGraphql<Target>(connectionId, `query($id: ID!) { product(id: $id) { variants(first: 5) { nodes { id inventoryItem { id tracked inventoryLevels(first: 5) { nodes { location { id name } quantities(names: ["available"]) { name quantity } } } } } } } }`, { id: `gid://shopify/Product/${productId}` });
  const vs = r.product?.variants.nodes ?? [];
  if (!vs.length) return { ok: false, why: "Shopify no longer has this product" };
  if (vs.length > 1) return { ok: false, why: `It comes in ${vs.length} versions, each with its own count` };
  const item = vs[0].inventoryItem, levels = item.inventoryLevels.nodes;
  if (!item.tracked) return { ok: false, why: "Shopify isn’t counting stock for it" };
  if (levels.length !== 1) return { ok: false, why: levels.length ? `It is stocked in ${levels.length} places` : "It isn’t stocked at any location" };
  const q = levels[0].quantities.find((x) => x.name === "available");
  if (!q) return { ok: false, why: "Shopify didn’t say how many are available" };
  return { ok: true, available: q.quantity, place: levels[0].location.name, itemId: item.id, locationId: levels[0].location.id };
}

type Adjusted = { inventoryAdjustQuantities: { inventoryAdjustmentGroup: { id: string } | null; userErrors: { message: string; code: string | null }[] } };
/**
 * The restock has arrived: add the units to the store's available count. Shopify is told the count Kaviar last saw, so it refuses if
 * someone changed it in between; the count is then read back, and only that is reported.
 */
export async function addStock(brandId: string, productId: string, qty: number): Promise<{ ok: true; available: number } | { ok: false; error: string }> {
  const a = await stockAccess(brandId), n = Math.round(qty);
  if (!a.connectionId) return { ok: false, error: "Connect the Shopify store first" };
  if (!a.canAdd) return { ok: false, error: "This store hasn’t allowed Kaviar to change stock" };
  if (!(n > 0) || n > 100_000) return { ok: false, error: "Enter how many arrived" };
  const t = await stockTarget(a.connectionId, productId);
  if (!t.ok) return { ok: false, error: `${t.why} — set it in Shopify` };
  const r = await shopifyGraphql<Adjusted>(a.connectionId, `mutation($input: InventoryAdjustQuantitiesInput!, $key: String!) { inventoryAdjustQuantities(input: $input) @idempotent(key: $key) { inventoryAdjustmentGroup { id } userErrors { message code } } }`,
    { key: crypto.randomUUID(), input: { name: "available", reason: "received", changes: [{ inventoryItemId: t.itemId, locationId: t.locationId, delta: n, changeFromQuantity: t.available }] } });
  const err = r.inventoryAdjustQuantities.userErrors[0];
  if (err) return { ok: false, error: err.code === "CHANGE_FROM_QUANTITY_STALE" ? "The count changed in Shopify just now — open it again" : err.message };
  const after = await stockTarget(a.connectionId, productId);
  if (!after.ok) return { ok: false, error: "Shopify took the change, but the new count couldn’t be read back" };
  // Kaviar's own copy, so the forecast is right before the next sync.
  await db.execute(sql`update shop_variants set inventory_quantity = ${after.available} where brand_id = ${brandId} and product_id = ${productId}`);
  await db.execute(sql`update shop_products set total_inventory = ${after.available} where brand_id = ${brandId} and id = ${productId}`);
  await clearOrder(brandId, productId);
  return { ok: true, available: after.available };
}
