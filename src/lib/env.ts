import "server-only";

function read(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

function need(name: string): string {
  const v = read(name);
  if (!v) throw new Error(`Missing environment variable ${name}. See .env.example.`);
  return v;
}

export const env = {
  appUrl: () => (read("APP_URL") ?? "http://localhost:3000").replace(/\/$/, ""),
  sessionSecret: () => need("SESSION_SECRET"),
  tokenKey: () => need("TOKEN_ENCRYPTION_KEY"),
  cronSecret: () => read("CRON_SECRET"),
  shopify: () => ({
    apiKey: need("SHOPIFY_API_KEY"),
    apiSecret: need("SHOPIFY_API_SECRET"),
    apiVersion: read("SHOPIFY_API_VERSION") ?? "2026-10",
    scopes: (read("SHOPIFY_SCOPES") ?? "read_orders,read_all_orders,read_products,read_inventory,read_customers")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    backfillDays: Number(read("SHOPIFY_BACKFILL_DAYS") ?? 365),
  }),
  meta: () => ({
    appId: need("META_APP_ID"),
    appSecret: need("META_APP_SECRET"),
    apiVersion: read("META_API_VERSION") ?? "v26.0",
    scopes: (read("META_SCOPES") ?? "ads_read,business_management").split(",").map((s) => s.trim()),
    // Facebook Login for Business: a saved login configuration (permissions picked in the Meta app).
    configId: read("META_CONFIG_ID"),
    backfillDays: Number(read("META_BACKFILL_DAYS") ?? 90),
  }),
  shopifyConfigured: () => Boolean(read("SHOPIFY_API_KEY") && read("SHOPIFY_API_SECRET")),
  aiConfigured: () => Boolean(read("ANTHROPIC_API_KEY")),
  // Higgsfield Cloud API key: "<key id>:<key secret>" (or the two halves in HIGGSFIELD_API_KEY_ID / _SECRET).
  higgsfield: () => read("HIGGSFIELD_API") ?? (read("HIGGSFIELD_API_KEY_ID") && read("HIGGSFIELD_API_KEY_SECRET") ? `${read("HIGGSFIELD_API_KEY_ID")}:${read("HIGGSFIELD_API_KEY_SECRET")}` : null),
  metaConfigured: () => Boolean(read("META_APP_ID") && read("META_APP_SECRET")),
};
