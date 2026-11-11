import { after, NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { env } from "@/lib/env";
import { slugify } from "@/lib/format";
import { exchangeCode, missingScopes, normalizeShop, verifyQueryHmac } from "@/lib/shopify/oauth";
import { SHOP_INFO } from "@/lib/shopify/queries";
import { registerWebhooks } from "@/lib/shopify/webhooks";
import { runBrandSync } from "@/lib/sync/run";
import { finishOAuth } from "@/lib/oauth-state";

type ShopInfo = { shop: { name: string; myshopifyDomain: string; currencyCode: string; ianaTimezone: string; primaryDomain: { host: string } } };

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const st = await finishOAuth<{ brandId: string | null; shop: string; memberId: string }>("kv_shopify_oauth", q.get("state"));
  const brandPath = async (id: string | null) => {
    if (!id) return "/brands";
    const [b] = await db.select({ slug: schema.brands.slug }).from(schema.brands).where(eq(schema.brands.id, id));
    return b ? `/brands/${b.slug}` : "/brands";
  };
  const fail = async (error: string) => {
    const path = await brandPath(st?.brandId ?? null);
    return NextResponse.redirect(new URL(path === "/brands" ? `/brands?error=${error}` : `${path}/integrations?error=${error}`, req.url));
  };

  const shop = normalizeShop(q.get("shop"));
  if (!st) return fail("state");
  if (!shop || shop !== st.shop) return fail("shop");
  if (!verifyQueryHmac(q, env.shopify().apiSecret)) return fail("hmac");
  const code = q.get("code");
  if (!code) return fail("denied");

  let tokens;
  try {
    tokens = await exchangeCode(shop, code);
  } catch (e) {
    console.error("shopify token exchange", e);
    return fail("token");
  }
  if (missingScopes(tokens.scopes, env.shopify().scopes).length) return fail("scopes");

  // Read the shop before saving, with the fresh token.
  const res = await fetch(`https://${shop}/admin/api/${env.shopify().apiVersion}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": tokens.accessToken },
    body: JSON.stringify({ query: SHOP_INFO }),
    cache: "no-store",
  });
  const info = ((await res.json()) as { data?: ShopInfo }).data?.shop;
  if (!info) return fail("token");

  let brandId = st.brandId;
  if (!brandId) {
    let slug = slugify(info.name) || shop.split(".")[0];
    const [taken] = await db.select({ id: schema.brands.id }).from(schema.brands).where(eq(schema.brands.slug, slug));
    if (taken) slug = `${slug}-${shop.split(".")[0]}`.slice(0, 60);
    const [b] = await db.insert(schema.brands).values({ slug, name: info.name, currency: info.currencyCode, timezone: info.ianaTimezone, createdBy: st.memberId }).returning();
    brandId = b.id;
  } else {
    await db.update(schema.brands).set({ currency: info.currencyCode, timezone: info.ianaTimezone }).where(eq(schema.brands.id, brandId));
  }

  const values = {
    status: "connected" as const,
    externalId: shop,
    displayName: info.name,
    scopes: tokens.scopes,
    accessToken: encrypt(tokens.accessToken),
    refreshToken: tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
    accessExpiresAt: tokens.accessExpiresAt,
    refreshExpiresAt: tokens.refreshExpiresAt,
    details: { primaryHost: info.primaryDomain.host, currency: info.currencyCode, timezone: info.ianaTimezone, apiVersion: env.shopify().apiVersion },
    lastError: null,
    connectedBy: st.memberId,
    connectedAt: new Date(),
    updatedAt: new Date(),
  };
  const [conn] = await db
    .insert(schema.connections)
    .values({ brandId, provider: "shopify", ...values })
    .onConflictDoUpdate({ target: [schema.connections.brandId, schema.connections.provider], set: values })
    .returning({ id: schema.connections.id });

  const id = brandId;
  after(async () => {
    const hooks = await registerWebhooks(conn.id);
    if (hooks.errors.length) console.warn("webhook registration", hooks.errors);
    await runBrandSync(id, "connect", ["shopify"]);
  });
  return NextResponse.redirect(new URL(`${await brandPath(brandId)}/sync?connected=shopify`, req.url));
}
