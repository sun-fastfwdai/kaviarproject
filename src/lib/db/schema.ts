import { sql } from "drizzle-orm";
import type { Onboarding } from "../onboarding/types";
import {
  bigint,
  customType,
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
  deletedAt: tz("deleted_at"), // removed by an owner; data is purged in the background
  // New-brand onboarding: furthest step reached (1–5) while the brand is a draft; null once it's live.
  onboardingStep: integer("onboarding_step"),
  onboarding: jsonb("onboarding").$type<Onboarding>().notNull().default({}),
  // Store apps (Recharge, Judge.me, Klaviyo…): requested of the merchant / connected, set by the team.
  integrations: jsonb("integrations").$type<Record<string, { status: "requested" | "connected"; at: string; by?: string }>>().notNull().default({}),
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

// ---------------------------------------------------------------- Brand assets uploaded during onboarding (deck, logos, imagery…)
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });
export type AssetKind = "deck" | "logo" | "imagery" | "video" | "guidelines";
export const brandAssets = pgTable(
  "brand_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: uuid("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
    kind: text("kind").$type<AssetKind>().notNull(),
    name: text("name").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    data: bytea("data").notNull(),
    meta: jsonb("meta").$type<{ width?: number; height?: number; pages?: number; ai?: boolean; prompt?: string; product?: string; check?: { labelMatches: boolean; shapeExact: boolean; coloursOnBrand: boolean; noTextOrWatermark: boolean; note: string } }>().notNull().default({}),
    createdBy: uuid("created_by").references(() => members.id, { onDelete: "set null" }),
    createdAt: tz("created_at").notNull().defaultNow(),
  },
  (t) => [index("brand_assets_brand").on(t.brandId, t.kind)],
);

// ---------------------------------------------------------------- Notes the agents write from a brand's numbers (cached; rewritten when the numbers change)
export const agentNotes = pgTable(
  "agent_notes",
  {
    brandId: uuid("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
    key: text("key").notNull(), // performance | overview | sync | signals
    factsHash: text("facts_hash").notNull(),
    body: jsonb("body").$type<Record<string, unknown>>().notNull(),
    model: text("model"),
    createdAt: tz("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.brandId, t.key] })],
);

// ---------------------------------------------------------------- Creative studio: batches of ads Remy writes from a signal or an idea
export type AdStatus = "review" | "approved" | "rejected";
export type Layer = { id: string; kind: "text" | "button" | "badge" | "logo"; text: string; x: number; y: number; w: number; size: number; font: "serif" | "sans"; color: string; bg?: string; weight?: number; align?: "left" | "center"; src?: string };
export type AdDesign = { image: string | null; overlay: number; layers: Layer[] };
export const adBatches = pgTable(
  "ad_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: uuid("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
    signal: text("signal"), // signal key it came from, or null for a free idea
    title: text("title").notNull(),
    brief: text("brief").notNull(),
    audience: text("audience").notNull(),
    evidence: jsonb("evidence").$type<[string, string][]>().notNull().default([]),
    createdBy: uuid("created_by").references(() => members.id, { onDelete: "set null" }),
    createdAt: tz("created_at").notNull().defaultNow(),
  },
  (t) => [index("ad_batches_brand").on(t.brandId, t.createdAt)],
);
export const ads = pgTable(
  "ads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    batchId: uuid("batch_id").notNull().references(() => adBatches.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    format: text("format").$type<"static" | "video" | "ugc" | "carousel">().notNull(),
    hook: text("hook").notNull(),
    primaryText: text("primary_text").notNull(),
    headline: text("headline").notNull(),
    cta: text("cta").notNull(),
    offer: text("offer").notNull(),
    product: text("product"),
    imageUrl: text("image_url"),
    why: text("why").notNull(),
    status: text("status").$type<AdStatus>().notNull().default("review"),
    note: text("note"), // why it was rejected — Remy reads it on Redo
    edited: boolean("edited").notNull().default(false),
    design: jsonb("design").$type<AdDesign>(), // the Editor's layers; null until someone opens it
    updatedAt: tz("updated_at").notNull().defaultNow(),
  },
  (t) => [index("ads_batch").on(t.batchId, t.position)],
);

// ---------------------------------------------------------------- Optimize & repeat: weekly changes the agents propose, the team approves, and Kaviar checks a week later
export type ChangeKind = "hold" | "shift" | "refresh" | "pause" | "scale" | "add";
export type ChangeStatus = "proposed" | "approved" | "skipped" | "applied";
export const optimizeChanges = pgTable(
  "optimize_changes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: uuid("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
    week: date("week").notNull(), // Monday of the week it was proposed (brand time zone)
    key: text("key").notNull(), // stable per week, so re-proposing never duplicates
    kind: text("kind").$type<ChangeKind>().notNull(),
    title: text("title").notNull(),
    why: text("why").notNull(),
    before: text("before").notNull(),
    after: text("after").notNull(),
    target: jsonb("target").$type<{ campaignId?: string; adId?: string; signal?: string; product?: string; baseline?: number }>().notNull().default({}),
    status: text("status").$type<ChangeStatus>().notNull().default("proposed"),
    decidedBy: uuid("decided_by").references(() => members.id, { onDelete: "set null" }),
    decidedAt: tz("decided_at"),
    appliedAt: tz("applied_at"),
    result: jsonb("result").$type<{ verdict: "worked" | "didnt" | "too-early"; detail: string; checkedAt: string }>(),
    createdAt: tz("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("optimize_changes_key").on(t.brandId, t.week, t.key)],
);

// ---------------------------------------------------------------- Store builder: one build per brand — setup choices, Remy's content, progress, decisions and Otto's QA
export type StoreContent = {
  announcement: string;
  heroOptions: string[]; hero: string; subline: string; cta: string;
  promises: { title: string; body: string }[];
  bestsellersTitle: string;
  story: { title: string; body: string };
  faq: { q: string; a: string }[];
  newsletter: { title: string; body: string };
  nav: string[];
  aboutPage: string;
};
export type BuildTask = { key: string; label: string; agent: "iris" | "cleo" | "remy" | "otto"; status: "waiting" | "running" | "done" | "error"; detail: string };
export const storeBuilds = pgTable("store_builds", {
  brandId: uuid("brand_id").primaryKey().references(() => brands.id, { onDelete: "cascade" }),
  theme: text("theme").notNull().default("kaviar-starter"),
  pages: jsonb("pages").$type<string[]>().notNull().default(["home", "products", "collections", "story", "contact", "policies"]),
  apps: jsonb("apps").$type<Record<string, boolean>>().notNull().default({}),
  tasks: jsonb("tasks").$type<BuildTask[]>().notNull().default([]),
  content: jsonb("content").$type<StoreContent>(),
  approved: jsonb("approved").$type<string[]>().notNull().default([]),
  startedAt: tz("started_at"),
  finishedAt: tz("finished_at"),
  updatedAt: tz("updated_at").notNull().defaultNow(),
});
