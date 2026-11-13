import "server-only";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { decrypt } from "../crypto";
import { env } from "../env";

const T = schema;
const BATCH = 5000;

/** Child tables, deepest first. Each is purged in small batches so a big brand never holds long locks. */
const CHILD_TABLES = [
  "shop_order_lines", "shop_orders", "shop_variants", "shop_products", "shop_customers",
  "meta_insights_daily", "meta_ads", "meta_campaigns",
  "sync_runs", "sync_cursors", "webhook_events", "ads", "ad_batches", "brand_assets", "agent_notes", "connections",
] as const;

export type Footprint = { orders: number; lines: number; products: number; customers: number; metaRows: number; ads: number };

export async function brandFootprint(brandId: string): Promise<Footprint> {
  const r = (await db.execute(sql`select
    (select count(*) from shop_orders where brand_id = ${brandId})::int as orders,
    (select count(*) from shop_order_lines where brand_id = ${brandId})::int as lines,
    (select count(*) from shop_products where brand_id = ${brandId})::int as products,
    (select count(*) from shop_customers where brand_id = ${brandId})::int as customers,
    (select count(*) from meta_insights_daily where brand_id = ${brandId})::int as "metaRows",
    (select count(*) from meta_ads where brand_id = ${brandId})::int as ads`)).rows[0];
  return r as Footprint;
}

/**
 * Step 1 (instant, in the request): hide the brand, stop syncing, revoke Meta access, forget every token.
 * The slug is freed so a brand with the same name can be added again.
 */
export async function retireBrand(brandId: string, slug: string) {
  const conns = await db.select().from(T.connections).where(eq(T.connections.brandId, brandId));
  const meta = conns.find((c) => c.provider === "meta" && c.accessToken);
  if (meta && env.metaConfigured()) {
    // Best effort: tell Meta to drop Kaviar's permissions for this login.
    try {
      await fetch(`https://graph.facebook.com/${env.meta().apiVersion}/me/permissions?access_token=${encodeURIComponent(decrypt(meta.accessToken!))}`, { method: "DELETE", cache: "no-store" });
    } catch {}
  }
  await db.update(T.connections)
    .set({ status: "disconnected", accessToken: null, refreshToken: null, accessExpiresAt: null, refreshExpiresAt: null, lastError: "Brand removed", updatedAt: new Date() })
    .where(eq(T.connections.brandId, brandId));
  await db.update(T.brands)
    .set({ deletedAt: new Date(), slug: `${slug}--removed-${brandId.slice(0, 8)}` })
    .where(eq(T.brands.id, brandId));
}

/** Step 2 (background): delete the synced data in batches, then the brand row. Safe to run again after an interruption. */
export async function purgeBrand(brandId: string, deadline = Date.now() + 240_000): Promise<boolean> {
  for (const table of CHILD_TABLES) {
    for (;;) {
      if (Date.now() > deadline) return false; // the hourly job continues from here
      const res = await db.execute(sql.raw(
        `delete from ${table} where ctid in (select ctid from ${table} where brand_id = '${brandId.replace(/[^0-9a-f-]/gi, "")}' limit ${BATCH})`,
      ));
      if (!res.rowCount) break;
    }
  }
  await db.delete(T.brands).where(and(eq(T.brands.id, brandId), isNotNull(T.brands.deletedAt)));
  return true;
}

/** Finishes any removal that was cut short (called by the hourly cron). */
export async function purgePendingBrands() {
  const pending = await db.select({ id: T.brands.id }).from(T.brands).where(isNotNull(T.brands.deletedAt));
  for (const b of pending) await purgeBrand(b.id);
  return pending.length;
}
