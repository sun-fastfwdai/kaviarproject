import "server-only";
import { env } from "../env";
import { hmacBase64, safeEqual } from "../crypto";
import { shopifyGraphql } from "./client";

/** Topics Kaviar subscribes to after install. Compliance topics are set in the app config (Dev Dashboard), not here. */
export const WEBHOOK_TOPICS = ["ORDERS_CREATE", "ORDERS_UPDATED", "PRODUCTS_UPDATE", "APP_UNINSTALLED"] as const;

export function verifyWebhook(rawBody: string, hmacHeader: string | null): boolean {
  if (!hmacHeader) return false;
  return safeEqual(hmacBase64(env.shopify().apiSecret, rawBody), hmacHeader);
}

const CREATE = `mutation Sub($topic: WebhookSubscriptionTopic!, $uri: String!) {
  webhookSubscriptionCreate(topic: $topic, webhookSubscription: { uri: $uri, format: JSON }) {
    webhookSubscription { id } userErrors { message }
  }
}`;

const LIST = `{ webhookSubscriptions(first: 50) { nodes { id topic endpoint { __typename ... on WebhookHttpEndpoint { callbackUrl } } } } }`;
type Sub = { id: string; topic: string; endpoint: { __typename: string; callbackUrl?: string } };

export type WebhookState = { registered: string[]; missing: string[]; errors: string[]; checkedAt: string };

/**
 * What Shopify actually has for this store, after registering anything missing.
 * Runs after every Shopify sync at most once a day (and right after install), so a failed
 * registration is retried and the reason is shown on Data sync.
 */
export async function ensureWebhooks(connectionId: string): Promise<WebhookState> {
  const now = new Date().toISOString();
  const base = env.appUrl();
  if (!base.startsWith("https://")) return { registered: [], missing: [...WEBHOOK_TOPICS], errors: ["Webhooks need a public https address; the hourly pull covers it."], checkedAt: now };
  const uri = `${base}/api/shopify/webhooks`;
  const list = async () => (await shopifyGraphql<{ webhookSubscriptions: { nodes: Sub[] } }>(connectionId, LIST, {})).webhookSubscriptions.nodes
    .filter((n) => n.endpoint.callbackUrl === uri).map((n) => n.topic);
  const have = new Set(await list());
  const errors: string[] = [];
  for (const topic of WEBHOOK_TOPICS.filter((t) => !have.has(t))) {
    try {
      const r = await shopifyGraphql<{ webhookSubscriptionCreate: { userErrors: { message: string }[] } }>(connectionId, CREATE, { topic, uri });
      const errs = r.webhookSubscriptionCreate.userErrors.filter((e) => !/taken|already/i.test(e.message));
      if (errs.length) errors.push(`${topic}: ${errs[0].message}`);
    } catch (e) {
      errors.push(`${topic}: ${(e as Error).message}`);
    }
  }
  const after = new Set(await list());
  return { registered: WEBHOOK_TOPICS.filter((t) => after.has(t)), missing: WEBHOOK_TOPICS.filter((t) => !after.has(t)), errors, checkedAt: now };
}

/** Registers webhooks when the app has a public https URL. Returns how many succeeded. */
export async function registerWebhooks(connectionId: string): Promise<{ ok: number; skipped?: string; errors: string[] }> {
  const base = env.appUrl();
  if (!base.startsWith("https://")) return { ok: 0, skipped: "APP_URL is not https — webhooks need a public URL", errors: [] };
  const uri = `${base}/api/shopify/webhooks`;
  let ok = 0;
  const errors: string[] = [];
  for (const topic of WEBHOOK_TOPICS) {
    try {
      const r = await shopifyGraphql<{ webhookSubscriptionCreate: { userErrors: { message: string }[] } }>(connectionId, CREATE, { topic, uri });
      const errs = r.webhookSubscriptionCreate.userErrors;
      // "already taken" means it exists from a previous install — that's fine.
      if (errs.length && !errs.every((e) => /taken|already/i.test(e.message))) errors.push(`${topic}: ${errs[0].message}`);
      else ok++;
    } catch (e) {
      errors.push(`${topic}: ${(e as Error).message}`);
    }
  }
  return { ok, errors };
}
