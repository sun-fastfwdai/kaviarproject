import { after, NextResponse, type NextRequest } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { verifyWebhook } from "@/lib/shopify/webhooks";
import { runBrandSync } from "@/lib/sync/run";

const T = schema;

/**
 * All Shopify webhooks, including the mandatory privacy topics. Verified with the app secret over the raw body,
 * de-duplicated by event id, answered fast; real work happens after the response.
 */
export async function POST(req: NextRequest) {
  if (!env.shopifyConfigured()) return new NextResponse("shopify app not configured", { status: 503 });
  const raw = await req.text();
  if (!verifyWebhook(raw, req.headers.get("x-shopify-hmac-sha256"))) return new NextResponse("invalid hmac", { status: 401 });

  const topic = (req.headers.get("x-shopify-topic") ?? "").toLowerCase();
  const shop = (req.headers.get("x-shopify-shop-domain") ?? "").toLowerCase();
  const eventId = req.headers.get("x-shopify-event-id") ?? req.headers.get("x-shopify-webhook-id") ?? `${topic}:${Date.now()}`;
  const [conn] = await db.select().from(T.connections).where(and(eq(T.connections.provider, "shopify"), eq(T.connections.externalId, shop))).limit(1);
  const brandId = conn?.brandId ?? null;

  const inserted = await db.insert(T.webhookEvents).values({ id: eventId, brandId, shop, topic }).onConflictDoNothing().returning({ id: T.webhookEvents.id });
  if (!inserted.length) return NextResponse.json({ ok: true, duplicate: true });

  const body = JSON.parse(raw || "{}");
  switch (topic) {
    case "app/uninstalled":
      if (conn) {
        await db.update(T.connections).set({ status: "disconnected", accessToken: null, refreshToken: null, lastError: "App uninstalled from Shopify", updatedAt: new Date() })
          .where(eq(T.connections.id, conn.id));
      }
      break;
    case "customers/data_request":
      // Kaviar stores customer ids, order counts and spend only — nothing else to export. Logged above.
      break;
    case "customers/redact": {
      const id = Number(body.customer?.id);
      if (brandId && id) {
        await db.delete(T.shopCustomers).where(and(eq(T.shopCustomers.brandId, brandId), eq(T.shopCustomers.id, id)));
        await db.update(T.shopOrders).set({ customerId: null }).where(and(eq(T.shopOrders.brandId, brandId), eq(T.shopOrders.customerId, id)));
      }
      break;
    }
    case "shop/redact":
      if (brandId) {
        for (const t of [T.shopOrderLines, T.shopOrders, T.shopVariants, T.shopProducts, T.shopCustomers]) await db.delete(t).where(eq(t.brandId, brandId));
        await db.delete(T.syncCursors).where(and(eq(T.syncCursors.brandId, brandId), eq(T.syncCursors.provider, "shopify")));
        await db.delete(T.connections).where(and(eq(T.connections.brandId, brandId), eq(T.connections.provider, "shopify")));
      }
      break;
    default:
      if (brandId && conn?.status === "connected" && /^(orders|products)\//.test(topic)) {
        after(() => runBrandSync(brandId, "webhook", ["shopify"]).catch((e) => console.error("webhook sync", e)));
      }
  }
  // Keep the log small.
  after(() => db.execute(sql`delete from webhook_events where received_at < now() - interval '30 days'`));
  return NextResponse.json({ ok: true });
}
