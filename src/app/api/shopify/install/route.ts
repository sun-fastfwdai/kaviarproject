import { NextResponse, type NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getMember } from "@/lib/auth";
import { env } from "@/lib/env";
import { authorizeUrl, normalizeShop, verifyQueryHmac } from "@/lib/shopify/oauth";
import { resolveShopDomain } from "@/lib/shopify/resolve";
import { startOAuth } from "@/lib/oauth-state";

/**
 * Starts the Shopify install. Two entry points:
 *  - from Kaviar's Integrations page: ?brand=<slug>&shop=<domain>
 *  - from Shopify (app URL / install link): ?shop=&hmac=&timestamp= — we match the store to a brand on callback.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const member = await getMember();
  if (!member) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`, req.url));
  if (!env.shopifyConfigured()) return NextResponse.json({ error: "Shopify app keys are not configured" }, { status: 500 });

  const slug = q.get("brand");
  const back = (error: string) => NextResponse.redirect(new URL(slug ? `/brands/${slug}/integrations?error=${error}` : `/brands?error=${error}`, req.url));
  // Shopify's own install requests always send x.myshopify.com; people may type the store's real domain.
  const shop = q.has("hmac") ? normalizeShop(q.get("shop")) : await resolveShopDomain(q.get("shop"));
  if (!shop) return back(q.get("shop")?.includes(".") && !q.get("shop")?.includes("myshopify") ? "shop_lookup" : "shop");
  if (q.has("hmac") && !verifyQueryHmac(q, env.shopify().apiSecret)) return back("hmac");

  let brandId: string | null = null;
  if (slug) {
    const [b] = await db.select({ id: schema.brands.id }).from(schema.brands).where(eq(schema.brands.slug, slug)).limit(1);
    if (!b) return back("shop");
    brandId = b.id;
  } else {
    const [c] = await db.select({ brandId: schema.connections.brandId }).from(schema.connections)
      .where(and(eq(schema.connections.provider, "shopify"), eq(schema.connections.externalId, shop))).limit(1);
    brandId = c?.brandId ?? null;
  }
  const state = await startOAuth("kv_shopify_oauth", { brandId, shop, memberId: member.id });
  return NextResponse.redirect(authorizeUrl(shop, state));
}
