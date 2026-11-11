import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "../db";
import { excludedSet } from "../db/upsert";
import { env } from "../env";
import { runBulkQuery, readJsonl } from "./bulk";
import { mapCustomer, mapLine, mapOrder, mapProduct, mapVariant, recordType } from "./map";
import { customersBulk, ordersBulk, productsBulk } from "./queries";

type Conn = typeof schema.connections.$inferSelect;
export type ShopifyResource = "orders" | "products" | "customers";
export const SHOPIFY_RESOURCES: ShopifyResource[] = ["orders", "products", "customers"];

const T = schema;
const orderSet = excludedSet(T.shopOrders, ["brandId", "id"]);
const lineSet = excludedSet(T.shopOrderLines, ["brandId", "id"]);
const productSet = excludedSet(T.shopProducts, ["brandId", "id"]);
const variantSet = excludedSet(T.shopVariants, ["brandId", "id"]);
const customerSet = excludedSet(T.shopCustomers, ["brandId", "id"]);

/** Search filter: incremental runs re-read anything updated since the cursor; first runs look back N days. */
function filterFor(resource: ShopifyResource, cursor: string | null): string {
  if (cursor) return `updated_at:>='${cursor}'`;
  if (resource === "orders") {
    const since = new Date(Date.now() - env.shopify().backfillDays * 864e5).toISOString();
    return `created_at:>='${since}'`;
  }
  return "";
}

export async function syncShopifyResource(conn: Conn, resource: ShopifyResource, cursor: string | null): Promise<number> {
  const brandId = conn.brandId;
  const host = (conn.details?.primaryHost as string | undefined) ?? undefined;
  const q = { orders: ordersBulk, products: productsBulk, customers: customersBulk }[resource](filterFor(resource, cursor));
  const url = await runBulkQuery(conn.id, q);
  if (!url) return 0;

  let rows = 0;
  await readJsonl(url, async (batch) => {
    const byType: Record<string, Record<string, unknown>[]> = {};
    for (const r of batch) (byType[recordType(r)] ??= []).push(r);

    if (byType.Order?.length) {
      const orders = byType.Order.map((r) => mapOrder(brandId, r, host));
      // Edited orders can lose lines: clear before the fresh lines (which follow their parent) arrive.
      if (cursor) {
        await db.delete(T.shopOrderLines).where(and(eq(T.shopOrderLines.brandId, brandId), inArray(T.shopOrderLines.orderId, orders.map((o) => o.id))));
      }
      await db.insert(T.shopOrders).values(orders).onConflictDoUpdate({ target: [T.shopOrders.brandId, T.shopOrders.id], set: orderSet });
      rows += orders.length;
    }
    if (byType.LineItem?.length) {
      const lines = byType.LineItem.map((r) => mapLine(brandId, r));
      await db.insert(T.shopOrderLines).values(lines).onConflictDoUpdate({ target: [T.shopOrderLines.brandId, T.shopOrderLines.id], set: lineSet });
    }
    if (byType.Product?.length) {
      const products = byType.Product.map((r) => mapProduct(brandId, r));
      await db.insert(T.shopProducts).values(products).onConflictDoUpdate({ target: [T.shopProducts.brandId, T.shopProducts.id], set: productSet });
      rows += products.length;
    }
    if (byType.ProductVariant?.length) {
      const variants = byType.ProductVariant.map((r) => mapVariant(brandId, r));
      await db.insert(T.shopVariants).values(variants).onConflictDoUpdate({ target: [T.shopVariants.brandId, T.shopVariants.id], set: variantSet });
    }
    if (byType.Customer?.length) {
      const customers = byType.Customer.map((r) => mapCustomer(brandId, r));
      await db.insert(T.shopCustomers).values(customers).onConflictDoUpdate({ target: [T.shopCustomers.brandId, T.shopCustomers.id], set: customerSet });
      rows += customers.length;
    }
  });
  return rows;
}
