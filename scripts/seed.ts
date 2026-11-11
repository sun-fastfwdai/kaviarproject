/**
 * Sample brand for local development and demos: `npm run db:seed`.
 * Deterministic, flagged `is_sample`, and kept apart from real connections (status "sample" never syncs).
 * Re-running replaces the sample brand.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import * as s from "../src/lib/db/schema";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema: s });

// mulberry32 — same numbers every run
let seed = 20261107;
const rnd = () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T,>(xs: T[], w?: number[]) => {
  if (!w) return xs[Math.floor(rnd() * xs.length)];
  let r = rnd() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < xs.length; i++) if ((r -= w[i]) <= 0) return xs[i];
  return xs[xs.length - 1];
};

const SLUG = "jmella-sample";
const TZ = "America/Los_Angeles";
const DAYS = 400;

const PRODUCTS = [
  { title: "Queen 5 Eau de Parfum · 50 ml", price: 48, cost: 13.4, stock: 410, w: 30 },
  { title: "Lime Basil & Mandarin · 50 ml", price: 48, cost: 13.9, stock: 520, w: 22 },
  { title: "Discovery Set · 6 × 5 ml", price: 32, cost: 9.1, stock: 260, w: 26 },
  { title: "Blooming Peony Duo", price: 72, cost: 24.5, stock: 12, w: 11 },
  { title: "Body Mist Set", price: 30, cost: 8.2, stock: 140, w: 9 },
  { title: "French Lily Hand Cream", price: 18, cost: 4.1, stock: 380, w: 8 },
  { title: "Queen 5 Body Wash · 500 ml", price: 24, cost: 5.6, stock: 22, w: 7 },
  { title: "Gift Box · Signature Trio", price: 96, cost: 31, stock: 64, w: 3 },
];
const CAMPAIGNS = [
  { id: "120210000000000001", name: "Prospecting · Queen 5 EDP", objective: "OUTCOME_SALES", status: "ACTIVE", budget: 140, share: 0.43, roas: 2.12, verified: 1.39 },
  { id: "120210000000000002", name: "Retargeting · viewed, not bought", objective: "OUTCOME_SALES", status: "ACTIVE", budget: 80, share: 0.24, roas: 3.24, verified: 2.11 },
  { id: "120210000000000003", name: "Lookalike 1% · Discovery set", objective: "OUTCOME_SALES", status: "ACTIVE", budget: 70, share: 0.21, roas: 1.7, verified: 1.37 },
  { id: "120210000000000004", name: "Gift sets · holiday teaser", objective: "OUTCOME_SALES", status: "PAUSED", budget: 40, share: 0.12, roas: 1.25, verified: 0.6 },
];
const ADS = [
  { id: "120220000000000011", c: 0, name: "Queen 5 · ritual video" },
  { id: "120220000000000012", c: 0, name: "Lime Basil · flatlay" },
  { id: "120220000000000021", c: 1, name: "Peony duo · ‘still thinking?’" },
  { id: "120220000000000022", c: 1, name: "Queen 5 · reviews carousel" },
  { id: "120220000000000031", c: 2, name: "Discovery set · 6 scents" },
  { id: "120220000000000032", c: 2, name: "Discovery set · unboxing" },
  { id: "120220000000000041", c: 3, name: "Gift box · holiday teaser" },
];

const dayStart = (daysAgo: number) => {
  const d = new Date();
  d.setUTCHours(8, 0, 0, 0); // ≈ midnight Pacific
  return new Date(d.getTime() - daysAgo * 864e5);
};
const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

async function batch<T>(rows: T[], fn: (b: T[]) => Promise<unknown>, size = 1000) {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}

async function main() {
  await db.delete(s.brands).where(eq(s.brands.slug, SLUG));
  const [brand] = await db
    .insert(s.brands)
    .values({ slug: SLUG, name: "Jmella", category: "Fragrance & body care", currency: "USD", timezone: TZ, isSample: true })
    .returning();
  const b = brand.id;
  const now = new Date();

  await db.insert(s.connections).values([
    { brandId: b, provider: "shopify", status: "sample", externalId: "jmella-sample.myshopify.com", displayName: "Jmella", connectedAt: new Date(now.getTime() - 21 * 864e5),
      scopes: ["read_orders", "read_all_orders", "read_products", "read_inventory", "read_customers"], details: { primaryHost: "jmella.com", currency: "USD", apiVersion: "2026-10" } },
    { brandId: b, provider: "meta", status: "sample", externalId: "act_000000004821", displayName: "Jmella · US & KR", connectedAt: new Date(now.getTime() - 18 * 864e5),
      scopes: ["ads_read", "business_management"], details: { currency: "USD", timezone: TZ } },
  ]);

  // Catalog
  const products = PRODUCTS.map((p, i) => ({ ...p, id: 9000 + i, variantId: 19000 + i }));
  await db.insert(s.shopProducts).values(products.map((p) => ({
    brandId: b, id: p.id, title: p.title, handle: p.title.toLowerCase().replace(/[^a-z0-9]+/g, "-"), status: "ACTIVE",
    productType: "Fragrance", vendor: "Jmella", imageUrl: null, totalInventory: p.stock, priceMin: p.price,
    createdAt: dayStart(700), updatedAt: dayStart(3),
  })));
  await db.insert(s.shopVariants).values(products.map((p) => ({
    brandId: b, id: p.variantId, productId: p.id, title: "Default Title", sku: `JM-${p.id}`, price: p.price, unitCost: p.cost, inventoryQuantity: p.stock,
  })));

  // Orders, lines, customers
  type C = { id: number; createdAt: Date; orders: number; spent: number; consent: boolean };
  const customers: C[] = [];
  const orders: (typeof s.shopOrders.$inferInsert)[] = [];
  const lines: (typeof s.shopOrderLines.$inferInsert)[] = [];
  let orderId = 500000, lineId = 800000, custId = 70000, n = 18406 - 1;
  const channels = ["meta", "direct", "google", "email", "other"] as const;

  for (let ago = DAYS - 1; ago >= 0; ago--) {
    const t = DAYS - ago;
    const base = 26 + 10 * (t / DAYS) + 4 * Math.sin((t / 7) * 2 * Math.PI + 1.1);
    const count = Math.max(8, Math.round(base * (0.85 + rnd() * 0.3)));
    for (let k = 0; k < count; k++) {
      const at = new Date(dayStart(ago).getTime() + rnd() * 864e5);
      if (at > now) continue;
      const returning = customers.length > 50 && rnd() < 0.41;
      const c: C = returning ? customers[Math.floor(rnd() * customers.length)] : { id: custId++, createdAt: at, orders: 0, spent: 0, consent: rnd() < 0.65 };
      if (!returning) customers.push(c);
      const ch = pick([...channels], [29, 30, 18, 15, 8]);
      const nLines = pick([1, 2, 3], [70, 24, 6]);
      let total = 0;
      const chosen = new Set<number>();
      for (let j = 0; j < nLines; j++) {
        const p = pick(products, products.map((x) => x.w));
        if (chosen.has(p.id)) continue;
        chosen.add(p.id);
        const qty = rnd() < 0.08 ? 2 : 1;
        total += p.price * qty;
        lines.push({ brandId: b, id: lineId++, orderId, productId: p.id, variantId: p.variantId, title: p.title, variantTitle: null, sku: `JM-${p.id}`, quantity: qty, unitPrice: p.price, total: p.price * qty });
      }
      const camp = ch === "meta" ? pick(CAMPAIGNS, CAMPAIGNS.map((x) => x.share * x.verified)) : null;
      const ad = camp ? pick(ADS.filter((a) => CAMPAIGNS[a.c] === camp)) : null;
      const tagged = camp ? rnd() < 0.86 : false;
      const refunded = rnd() < 0.035 ? total : 0;
      c.orders++; c.spent += total - refunded;
      orders.push({
        brandId: b, id: orderId++, name: `#${(n++).toString()}`, createdAt: at, processedAt: at, updatedAt: at, test: false, currency: "USD",
        total, subtotal: total, discounts: 0, refunded, financialStatus: refunded ? "REFUNDED" : "PAID",
        fulfillmentStatus: ago > 2 ? "FULFILLED" : "UNFULFILLED", customerId: c.id, sourceName: "web",
        discountCodes: !returning && rnd() < 0.21 ? ["WELCOME10"] : [],
        utmSource: ch === "meta" ? "facebook" : ch === "google" ? "google" : ch === "email" ? "klaviyo" : null,
        utmMedium: ch === "meta" ? "paid" : ch === "google" ? "organic" : ch === "email" ? "email" : null,
        utmCampaign: camp ? (tagged ? camp.id : camp.name) : null, utmContent: tagged && ad ? ad.id : null, utmTerm: null,
        referrer: ch === "other" ? "https://www.pinterest.com/" : null, landingPage: "https://jmella.com/",
        channel: ch, metaCampaignId: tagged && camp ? camp.id : null, metaAdId: tagged && ad ? ad.id : null,
      });
    }
  }
  // Order names should increase with time
  orders.forEach((o, i) => (o.name = `#${18406 - orders.length + 1 + i}`));

  await batch(customers, (x) => db.insert(s.shopCustomers).values(x.map((c) => ({
    brandId: b, id: c.id, numberOfOrders: c.orders, amountSpent: Math.round(c.spent * 100) / 100, marketingConsent: c.consent, createdAt: c.createdAt, updatedAt: c.createdAt,
  }))));
  await batch(orders, (x) => db.insert(s.shopOrders).values(x));
  await batch(lines, (x) => db.insert(s.shopOrderLines).values(x));

  // Meta: campaigns, ads, daily insights (Meta-reported value runs above verified, as it does in life)
  await db.insert(s.metaCampaigns).values(CAMPAIGNS.map((c) => ({
    brandId: b, id: c.id, accountId: "act_000000004821", name: c.name, objective: c.objective, status: c.status, effectiveStatus: c.status,
    dailyBudget: c.budget, createdTime: dayStart(200), updatedTime: dayStart(5),
  })));
  await db.insert(s.metaAds).values(ADS.map((a) => ({
    brandId: b, id: a.id, campaignId: CAMPAIGNS[a.c].id, adsetId: `1202300000000000${a.c}`, name: a.name,
    status: CAMPAIGNS[a.c].status, effectiveStatus: CAMPAIGNS[a.c].status, thumbnailUrl: null, createdTime: dayStart(120),
  })));
  const insights: (typeof s.metaInsightsDaily.$inferInsert)[] = [];
  for (let ago = 119; ago >= 0; ago--) {
    const date = ymd(dayStart(ago));
    const daySpend = 300 + 60 * ((120 - ago) / 120) + 25 * Math.sin(ago * 1.7);
    for (const a of ADS) {
      const c = CAMPAIGNS[a.c];
      if (c.status === "PAUSED" && ago < 6) continue;
      const siblings = ADS.filter((x) => x.c === a.c).length;
      const spend = Math.round(((daySpend * c.share) / siblings) * (0.8 + rnd() * 0.4) * 100) / 100;
      const value = Math.round(spend * c.roas * (0.75 + rnd() * 0.5) * 100) / 100;
      const impressions = Math.round(spend * (130 + rnd() * 40));
      insights.push({ brandId: b, adId: a.id, campaignId: c.id, date, spend, impressions, clicks: Math.round(impressions * (0.009 + rnd() * 0.01)),
        purchases: Math.round(value / 52), purchaseValue: value });
    }
  }
  await batch(insights, (x) => db.insert(s.metaInsightsDaily).values(x));

  // Sync history + freshness
  const runs: (typeof s.syncRuns.$inferInsert)[] = [
    { brandId: b, provider: "shopify", trigger: "connect", mode: "backfill", status: "success", rows: orders.length + products.length + customers.length,
      detail: { orders: orders.length, products: products.length, customers: customers.length }, startedAt: dayStart(21), finishedAt: new Date(dayStart(21).getTime() + 252e3) },
    { brandId: b, provider: "meta", trigger: "connect", mode: "backfill", status: "success", rows: insights.length, detail: { campaigns: 4, ads: ADS.length, insights: insights.length },
      startedAt: dayStart(18), finishedAt: new Date(dayStart(18).getTime() + 41e3) },
  ];
  for (let h = 5; h >= 0; h--) {
    const at = new Date(now.getTime() - h * 36e5 - 6e5);
    runs.push({ brandId: b, provider: "shopify", trigger: h === 2 ? "webhook" : "schedule", mode: "incremental", status: "success", rows: 30 + Math.round(rnd() * 20), detail: { orders: 31, products: 0, customers: 12 }, startedAt: at, finishedAt: new Date(at.getTime() + 8e3) });
    runs.push({ brandId: b, provider: "meta", trigger: "schedule", mode: "incremental", status: "success", rows: 60, detail: { campaigns: 4, ads: ADS.length, insights: 49 }, startedAt: new Date(at.getTime() + 2e3), finishedAt: new Date(at.getTime() + 9e3) });
  }
  await db.insert(s.syncRuns).values(runs);
  const fresh = new Date(now.getTime() - 6e5);
  await db.insert(s.syncCursors).values([
    ...["orders", "products", "customers"].map((r) => ({ brandId: b, provider: "shopify" as const, resource: r, cursor: fresh.toISOString(), lastSuccessAt: fresh })),
    ...["campaigns", "ads", "insights"].map((r) => ({ brandId: b, provider: "meta" as const, resource: r, cursor: ymd(now), lastSuccessAt: fresh })),
  ]);

  console.log(`Sample brand "${SLUG}": ${orders.length} orders, ${lines.length} lines, ${customers.length} customers, ${insights.length} insight rows`);
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  await pool.end();
  process.exit(1);
});
