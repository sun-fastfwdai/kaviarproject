/**
 * End-to-end sync against a real Postgres (DATABASE_URL_TEST, default kaviar_test) with Shopify and Meta mocked
 * at the fetch layer, using their real response shapes. Covers: expiring-token refresh, bulk query → JSONL → upserts,
 * attribution, cursors, incremental re-runs, the one-running-sync lock, and Meta insights.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";

const DB = process.env.DATABASE_URL_TEST ?? "postgres://localhost:5432/kaviar_test";
process.env.DATABASE_URL = DB;
process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
Object.assign(process.env, {
  SHOPIFY_API_KEY: "key", SHOPIFY_API_SECRET: "secret", SHOPIFY_API_VERSION: "2026-10", SHOPIFY_BACKFILL_DAYS: "365",
  META_APP_ID: "app", META_APP_SECRET: "msecret", META_API_VERSION: "v26.0", META_BACKFILL_DAYS: "30",
});

type Mods = {
  db: typeof import("@/lib/db");
  crypto: typeof import("@/lib/crypto");
  run: typeof import("@/lib/sync/run");
};
let m: Mods;
let brandId = "";
const calls: string[] = [];
let refreshes = 0;

const ordersJsonl = [
  { id: "gid://shopify/Order/1", name: "#1001", createdAt: "2026-11-01T10:00:00Z", updatedAt: "2026-11-01T10:00:00Z", test: false, currencyCode: "USD",
    totalPriceSet: { shopMoney: { amount: "96.00" } }, totalRefundedSet: { shopMoney: { amount: "0.00" } }, displayFinancialStatus: "PAID",
    customer: { id: "gid://shopify/Customer/7" }, discountCodes: [],
    customerJourneySummary: { lastVisit: { landingPage: "https://shop.test/", referrerUrl: null,
      utmParameters: { source: "facebook", medium: "paid", campaign: "120210000000000001", content: "120220000000000011", term: null } } } },
  { id: "gid://shopify/LineItem/11", __parentId: "gid://shopify/Order/1", title: "Queen 5", quantity: 2, product: { id: "gid://shopify/Product/3" },
    variant: { id: "gid://shopify/ProductVariant/33" }, originalUnitPriceSet: { shopMoney: { amount: "48.00" } }, discountedTotalSet: { shopMoney: { amount: "96.00" } } },
  { id: "gid://shopify/Order/2", name: "#1002", createdAt: "2026-11-02T10:00:00Z", test: false, currencyCode: "USD",
    totalPriceSet: { shopMoney: { amount: "32.00" } }, customer: null, discountCodes: ["WELCOME10"], customerJourneySummary: null },
  { id: "gid://shopify/LineItem/21", __parentId: "gid://shopify/Order/2", title: "Discovery Set", quantity: 1, product: { id: "gid://shopify/Product/4" } },
];
const productsJsonl = [
  { id: "gid://shopify/Product/3", title: "Queen 5", status: "ACTIVE", totalInventory: 40, priceRangeV2: { minVariantPrice: { amount: "48.0" } } },
  { id: "gid://shopify/ProductVariant/33", __parentId: "gid://shopify/Product/3", title: "Default Title", price: "48.00", inventoryQuantity: 40, inventoryItem: { unitCost: { amount: "13.00" } } },
];
const customersJsonl = [{ id: "gid://shopify/Customer/7", numberOfOrders: "1", amountSpent: { amount: "96.0" }, emailMarketingConsent: { marketingState: "SUBSCRIBED" } }];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function fakeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input instanceof Request ? input.url : input);
  calls.push(url.replace(/access_token=[^&]+/, "access_token=…"));
  // Shopify token refresh
  if (url.endsWith("/admin/oauth/access_token")) {
    refreshes++;
    const body = new URLSearchParams(String(init?.body));
    expect(body.get("grant_type")).toBe("refresh_token");
    return Promise.resolve(json({ access_token: `shpat_new_${refreshes}`, scope: "read_orders", expires_in: 3600, refresh_token: `shprt_${refreshes}`, refresh_token_expires_in: 7776000 }));
  }
  // Shopify GraphQL
  if (url.includes("/admin/api/2026-10/graphql.json")) {
    const token = (init?.headers as Record<string, string>)["X-Shopify-Access-Token"];
    expect(token).toMatch(/^shpat_new_/); // the expired token must never be used
    const { query } = JSON.parse(String(init?.body));
    if (query.includes("bulkOperationRunQuery")) {
      const kind = /orders\(/.test(JSON.parse(String(init?.body)).variables.q) ? "orders" : /products\(/.test(JSON.parse(String(init?.body)).variables.q) ? "products" : "customers";
      return Promise.resolve(json({ data: { bulkOperationRunQuery: { bulkOperation: { id: `gid://shopify/BulkOperation/${kind}`, status: "CREATED" }, userErrors: [] } } }));
    }
    if (query.includes("node(id:")) {
      const id = JSON.parse(String(init?.body)).variables.id as string;
      const kind = id.split("/").pop();
      return Promise.resolve(json({ data: { node: { id, status: "COMPLETED", errorCode: null, objectCount: "4", url: `https://storage.test/${kind}.jsonl`, partialDataUrl: null } } }));
    }
  }
  if (url.startsWith("https://storage.test/")) {
    const kind = url.split("/").pop()!.replace(".jsonl", "");
    const rows = { orders: ordersJsonl, products: productsJsonl, customers: customersJsonl }[kind]!;
    return Promise.resolve(new Response(rows.map((r) => JSON.stringify(r)).join("\n") + "\n"));
  }
  // Meta Graph API
  if (url.startsWith("https://graph.facebook.com/v26.0/")) {
    const u = new URL(url);
    expect(u.searchParams.get("appsecret_proof")).toMatch(/^[0-9a-f]{64}$/);
    if (u.pathname.endsWith("/campaigns")) return Promise.resolve(json({ data: [{ id: "120210000000000001", name: "Prospecting", status: "ACTIVE", effective_status: "ACTIVE", daily_budget: "14000" }] }));
    if (u.pathname.endsWith("/ads")) return Promise.resolve(json({ data: [{ id: "120220000000000011", name: "Ritual video", campaign_id: "120210000000000001", creative: { thumbnail_url: "https://x/t.jpg" } }] }));
    if (u.pathname.endsWith("/insights")) {
      const tr = JSON.parse(u.searchParams.get("time_range")!);
      return Promise.resolve(json({ data: [{ ad_id: "120220000000000011", campaign_id: "120210000000000001", date_start: tr.until, spend: "50.00", impressions: "7000", inline_link_clicks: "90",
        actions: [{ action_type: "omni_purchase", value: "3" }], action_values: [{ action_type: "omni_purchase", value: "150" }] }] }));
    }
  }
  return Promise.reject(new Error(`unexpected fetch ${url}`));
}

beforeAll(async () => {
  execSync(`dropdb --if-exists kaviar_test && createdb kaviar_test`, { stdio: "ignore" });
  execSync(`npx tsx --conditions=react-server scripts/migrate.ts`, { env: { ...process.env, DATABASE_URL: DB }, stdio: "ignore" });
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
  m = { db: await import("@/lib/db"), crypto: await import("@/lib/crypto"), run: await import("@/lib/sync/run") };
  const { db, schema } = m.db;
  const [b] = await db.insert(schema.brands).values({ slug: "test", name: "Test", timezone: "UTC" }).returning();
  brandId = b.id;
  await db.insert(schema.connections).values([
    { brandId, provider: "shopify", status: "connected", externalId: "test.myshopify.com", accessToken: m.crypto.encrypt("shpat_expired"),
      refreshToken: m.crypto.encrypt("shprt_0"), accessExpiresAt: new Date(Date.now() - 60_000), details: { primaryHost: "shop.test" } },
    { brandId, provider: "meta", status: "connected", externalId: "act_1", accessToken: m.crypto.encrypt("meta_token"), details: { currency: "USD", timezone: "UTC" } },
  ]);
}, 60_000);

afterAll(async () => {
  vi.unstubAllGlobals();
});

describe("runBrandSync", () => {
  it("backfills Shopify and Meta, refreshing the expired Shopify token once", async () => {
    const out = await m.run.runBrandSync(brandId, "connect");
    expect(out.map((o) => [o.provider, o.status])).toEqual([["shopify", "success"], ["meta", "success"]]);
    expect(refreshes).toBe(1);

    const { db, schema } = m.db;
    const orders = await db.select().from(schema.shopOrders);
    expect(orders).toHaveLength(2);
    const o1 = orders.find((o) => o.id === 1)!;
    expect(o1).toMatchObject({ total: 96, channel: "meta", metaCampaignId: "120210000000000001", metaAdId: "120220000000000011", customerId: 7 });
    expect(orders.find((o) => o.id === 2)).toMatchObject({ channel: "direct", customerId: null, discountCodes: ["WELCOME10"] });
    expect(await db.select().from(schema.shopOrderLines)).toHaveLength(2);
    expect((await db.select().from(schema.shopVariants))[0]).toMatchObject({ productId: 3, unitCost: 13, inventoryQuantity: 40 });
    expect((await db.select().from(schema.shopCustomers))[0]).toMatchObject({ numberOfOrders: 1, marketingConsent: true });

    const [camp] = await db.select().from(schema.metaCampaigns);
    expect(camp.dailyBudget).toBe(140);
    const ins = await db.select().from(schema.metaInsightsDaily);
    expect(ins.length).toBeGreaterThan(0);
    expect(ins[0]).toMatchObject({ spend: 50, purchases: 3, purchaseValue: 150, clicks: 90 });

    const cursors = await db.select().from(schema.syncCursors);
    expect(cursors.map((c) => c.resource).sort()).toEqual(["ads", "campaigns", "customers", "insights", "orders", "products"]);
    const runs = await db.select().from(schema.syncRuns);
    expect(runs.every((r) => r.status === "success" && r.mode === "backfill")).toBe(true);
  }, 60_000);

  it("stores the rotated refresh token encrypted", async () => {
    const { db, schema } = m.db;
    const rows = await db.select().from(schema.connections);
    const shop = rows.find((r) => r.provider === "shopify")!;
    expect(shop.refreshToken).not.toContain("shprt_1");
    expect(m.crypto.decrypt(shop.refreshToken!)).toBe("shprt_1");
    expect(shop.accessExpiresAt!.getTime()).toBeGreaterThan(Date.now() + 50 * 60_000);
  });

  it("runs incrementally next time, filtering by updated_at, without re-refreshing", async () => {
    calls.length = 0;
    const out = await m.run.runBrandSync(brandId, "manual", ["shopify"]);
    expect(out[0].status).toBe("success");
    expect(refreshes).toBe(1);
    const bulk = (vi.mocked(fetch).mock.calls as [string, RequestInit][])
      .map(([, init]) => (init?.body ? String(init.body) : ""))
      .filter((b) => b.includes("bulkOperationRunQuery"))
      .slice(-3);
    expect(bulk.every((b) => b.includes("updated_at:>="))).toBe(true);
    const { db, schema } = m.db;
    expect(await db.select().from(schema.shopOrderLines)).toHaveLength(2); // replaced, not duplicated
    expect((await db.select().from(schema.syncRuns)).filter((r) => r.mode === "incremental")).toHaveLength(1);
  }, 60_000);

  it("never runs two syncs of the same source at once", async () => {
    const { db, schema } = m.db;
    await db.insert(schema.syncRuns).values({ brandId, provider: "shopify", trigger: "manual", mode: "incremental", status: "running" });
    const out = await m.run.runBrandSync(brandId, "manual", ["shopify"]);
    expect(out[0]).toMatchObject({ status: "skipped", message: "already running" });
  });

  it("marks the connection for reauth when Shopify rejects the token", async () => {
    const { db, schema } = m.db;
    await db.update(schema.syncRuns).set({ status: "error" }).where(eq(schema.syncRuns.status, "running"));
    vi.mocked(fetch).mockImplementationOnce(() => Promise.resolve(new Response("unauthorized", { status: 401 })));
    const out = await m.run.runBrandSync(brandId, "manual", ["shopify"]);
    expect(out[0].status).toBe("error");
    const shop = (await db.select().from(schema.connections)).find((r) => r.provider === "shopify")!;
    expect(shop.status).toBe("needs_reauth");
  });
});
