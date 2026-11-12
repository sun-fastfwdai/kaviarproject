import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const tz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const money = (name: string) => numeric(name, { precision: 14, scale: 2, mode: "number" });
const gid = (name: string) => bigint(name, { mode: "number" });

// ---------------------------------------------------------------- Kaviar team (operators only; brands never log in)
export const members = pgTable("members", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: text("role").notNull().default("operator"), // owner | operator
  passwordHash: text("password_hash").notNull(),
  createdAt: tz("created_at").notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(), // sha256(token); the raw token only lives in the cookie
  memberId: uuid("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
  expiresAt: tz("expires_at").notNull(),
  createdAt: tz("created_at").notNull().defaultNow(),
});

// ---------------------------------------------------------------- Brands + their connected sources
export const brands = pgTable("brands", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  category: text("category"),
  website: text("website"),
  currency: text("currency").notNull().default("USD"),
  timezone: text("timezone").notNull().default("UTC"),
  imageUrl: text("image_url"),
  isSample: boolean("is_sample").notNull().default(false),
  createdBy: uuid("created_by").references(() => members.id, { onDelete: "set null" }),
  createdAt: tz("created_at").notNull().defaultNow(),
});

export type Provider = "shopify" | "meta";
export type ConnectionStatus = "connected" | "choose_account" | "needs_reauth" | "disconnected" | "sample";

export const connections = pgTable(
  "connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: uuid("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
    provider: text("provider").$type<Provider>().notNull(),
    status: text("status").$type<ConnectionStatus>().notNull(),
    externalId: text("external_id"), // shop domain (x.myshopify.com) or Meta ad account (act_123)
    displayName: text("display_name"),
    scopes: text("scopes").array().notNull().default(sql`'{}'::text[]`),
    accessToken: text("access_token"), // AES-256-GCM encrypted
    refreshToken: text("refresh_token"), // AES-256-GCM encrypted (Shopify expiring offline tokens)
    accessExpiresAt: tz("access_expires_at"),
    refreshExpiresAt: tz("refresh_expires_at"),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    lastError: text("last_error"),
    connectedBy: uuid("connected_by").references(() => members.id, { onDelete: "set null" }),
    connectedAt: tz("connected_at"),
    updatedAt: tz("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("connections_brand_provider").on(t.brandId, t.provider), index("connections_external").on(t.provider, t.externalId)],
);

// ---------------------------------------------------------------- Sync bookkeeping
export type SyncTrigger = "connect" | "manual" | "schedule" | "webhook";

export const syncRuns = pgTable(
  "sync_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: uuid("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
    provider: text("provider").$type<Provider>().notNull(),
    trigger: text("trigger").$type<SyncTrigger>().notNull(),
    mode: text("mode").$type<"backfill" | "incremental">().notNull(),
    status: text("status").$type<"running" | "success" | "error">().notNull().default("running"),
    rows: integer("rows").notNull().default(0),
    detail: jsonb("detail").$type<Record<string, number>>().notNull().default({}),
    message: text("message"),
    error: text("error"),
    startedAt: tz("started_at").notNull().defaultNow(),
    finishedAt: tz("finished_at"),
  },
  (t) => [
    index("sync_runs_brand_started").on(t.brandId, t.startedAt),
    // At most one running sync per brand + source: the insert itself is the lock.
    uniqueIndex("sync_runs_one_running").on(t.brandId, t.provider).where(sql`status = 'running'`),
  ],
);

export const syncCursors = pgTable(
  "sync_cursors",
  {
    brandId: uuid("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
    provider: text("provider").$type<Provider>().notNull(),
    resource: text("resource").notNull(),
    cursor: text("cursor"),
    lastSuccessAt: tz("last_success_at"),
  },
  (t) => [primaryKey({ columns: [t.brandId, t.provider, t.resource] })],
);

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: text("id").primaryKey(), // X-Shopify-Event-Id (falls back to webhook id) — makes delivery idempotent
    brandId: uuid("brand_id").references(() => brands.id, { onDelete: "cascade" }),
    shop: text("shop").notNull(),
    topic: text("topic").notNull(),
    receivedAt: tz("received_at").notNull().defaultNow(),
  },
  (t) => [index("webhook_events_brand").on(t.brandId, t.receivedAt)],
);

// ---------------------------------------------------------------- Shopify mirror (read-only copy; no names, emails or addresses)
export const shopProducts = pgTable(
  "shop_products",
  {
    brandId: uuid("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
    id: gid("id").notNull(),
    title: text("title").notNull(),
    handle: text("handle"),
    status: text("status"),
    productType: text("product_type"),
    vendor: text("vendor"),
    imageUrl: text("image_url"),
    totalInventory: integer("total_inventory"),
    priceMin: money("price_min"),
    createdAt: tz("created_at"),
    updatedAt: tz("updated_at"),
  },
  (t) => [primaryKey({ columns: [t.brandId, t.id] })],
);

export const shopVariants = pgTable(
  "shop_variants",
  {
    brandId: uuid("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
    id: gid("id").notNull(),
    productId: gid("product_id").notNull(),
    title: text("title"),
    sku: text("sku"),
    price: money("price"),
    unitCost: money("unit_cost"),
    inventoryQuantity: integer("inventory_quantity"),
  },
  (t) => [primaryKey({ columns: [t.brandId, t.id] }), index("shop_variants_product").on(t.brandId, t.productId)],
);

export const shopCustomers = pgTable(
  "shop_customers",
  {
    brandId: uuid("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
    id: gid("id").notNull(),
    numberOfOrders: integer("number_of_orders").notNull().default(0),
    amountSpent: money("amount_spent"),
    marketingConsent: boolean("marketing_consent"),
    createdAt: tz("created_at"),
    updatedAt: tz("updated_at"),
  },
  (t) => [primaryKey({ columns: [t.brandId, t.id] })],
);

export type Channel = "meta" | "google" | "email" | "direct" | "other";

export const shopOrders = pgTable(
  "shop_orders",
  {
    brandId: uuid("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
    id: gid("id").notNull(),
    name: text("name").notNull(),
    createdAt: tz("created_at").notNull(),
    processedAt: tz("processed_at"),
    updatedAt: tz("updated_at"),
    cancelledAt: tz("cancelled_at"),
    test: boolean("test").notNull().default(false),
    currency: text("currency"),
    total: money("total").notNull(),
    subtotal: money("subtotal"),
    discounts: money("discounts"),
    refunded: money("refunded").notNull().default(0),
    financialStatus: text("financial_status"),
    fulfillmentStatus: text("fulfillment_status"),
    customerId: gid("customer_id"),
    sourceName: text("source_name"),
    discountCodes: text("discount_codes").array().notNull().default(sql`'{}'::text[]`),
    landingPage: text("landing_page"),
    referrer: text("referrer"),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    utmContent: text("utm_content"),
    utmTerm: text("utm_term"),
    channel: text("channel").$type<Channel>().notNull().default("direct"),
    metaCampaignId: text("meta_campaign_id"), // set when utm_campaign carries {{campaign.id}}
    metaAdId: text("meta_ad_id"), // set when utm_content carries {{ad.id}}
  },
  (t) => [
    primaryKey({ columns: [t.brandId, t.id] }),
    index("shop_orders_brand_created").on(t.brandId, t.createdAt),
    index("shop_orders_brand_customer").on(t.brandId, t.customerId),
  ],
);

export const shopOrderLines = pgTable(
  "shop_order_lines",
  {
    brandId: uuid("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
    id: gid("id").notNull(),
    orderId: gid("order_id").notNull(),
    productId: gid("product_id"),
    variantId: gid("variant_id"),
    title: text("title").notNull(),
    variantTitle: text("variant_title"),
    sku: text("sku"),
    quantity: integer("quantity").notNull(),
    unitPrice: money("unit_price"),
    total: money("total"),
  },
  (t) => [primaryKey({ columns: [t.brandId, t.id] }), index("shop_order_lines_order").on(t.brandId, t.orderId)],
);

// ---------------------------------------------------------------- Meta Ads mirror
export const metaCampaigns = pgTable(
  "meta_campaigns",
  {
    brandId: uuid("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    accountId: text("account_id").notNull(),
    name: text("name").notNull(),
    objective: text("objective"),
    status: text("status"),
    effectiveStatus: text("effective_status"),
    dailyBudget: money("daily_budget"),
    lifetimeBudget: money("lifetime_budget"),
    createdTime: tz("created_time"),
    updatedTime: tz("updated_time"),
  },
  (t) => [primaryKey({ columns: [t.brandId, t.id] })],
);

export const metaAds = pgTable(
  "meta_ads",
  {
    brandId: uuid("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    campaignId: text("campaign_id"),
    adsetId: text("adset_id"),
    name: text("name").notNull(),
    status: text("status"),
    effectiveStatus: text("effective_status"),
    thumbnailUrl: text("thumbnail_url"),
    createdTime: tz("created_time"),
    updatedTime: tz("updated_time"),
  },
  (t) => [primaryKey({ columns: [t.brandId, t.id] })],
);

export const metaInsightsDaily = pgTable(
  "meta_insights_daily",
  {
    brandId: uuid("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
    adId: text("ad_id").notNull(),
    campaignId: text("campaign_id"),
    date: date("date", { mode: "string" }).notNull(),
    spend: money("spend").notNull().default(0),
    impressions: integer("impressions").notNull().default(0),
    clicks: integer("clicks").notNull().default(0), // link clicks
    purchases: numeric("purchases", { precision: 12, scale: 2, mode: "number" }).notNull().default(0),
    purchaseValue: money("purchase_value").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.brandId, t.adId, t.date] }), index("meta_insights_brand_date").on(t.brandId, t.date)],
);

// ---------------------------------------------------------------- Landing page enquiries
export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    brand: text("brand").notNull(),
    storeUrl: text("store_url"),
    message: text("message"),
    status: text("status").$type<"new" | "contacted" | "closed">().notNull().default("new"),
    createdAt: tz("created_at").notNull().defaultNow(),
  },
  (t) => [index("leads_created").on(t.createdAt)],
);

// ---------------------------------------------------------------- Invite links (owners share; people sign up with them)
export const invites = pgTable(
  "invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    codeHash: text("code_hash").notNull().unique(), // sha256(code); the code itself only lives in the link
    hint: text("hint").notNull(), // last 4 chars, so owners can tell links apart
    role: text("role").notNull().default("operator"),
    maxUses: integer("max_uses").notNull().default(10),
    uses: integer("uses").notNull().default(0),
    expiresAt: tz("expires_at").notNull(),
    revokedAt: tz("revoked_at"),
    createdBy: uuid("created_by").references(() => members.id, { onDelete: "set null" }),
    createdAt: tz("created_at").notNull().defaultNow(),
  },
  (t) => [index("invites_created").on(t.createdAt)],
);
