import { env } from "../env";
import { hmacHex, safeEqual } from "../crypto";

export const SHOP_RE = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;

/** Accepts "jmella", "jmella.myshopify.com" or "https://jmella.myshopify.com/admin". */
export function normalizeShop(input: string | null | undefined): string | null {
  if (!input) return null;
  const admin = input.match(/admin\.shopify\.com\/store\/([a-z0-9][a-z0-9-]*)/i);
  if (admin) return `${admin[1].toLowerCase()}.myshopify.com`;
  let s = input.trim().toLowerCase().replace(/^https?:\/\//, "").split(/[/?#]/)[0];
  if (!s.includes(".")) s = `${s}.myshopify.com`;
  return SHOP_RE.test(s) ? s : null;
}

export function authorizeUrl(shop: string, state: string): string {
  const { apiKey, scopes } = env.shopify();
  const q = new URLSearchParams({
    client_id: apiKey,
    scope: scopes.join(","),
    redirect_uri: `${env.appUrl()}/api/shopify/callback`,
    state,
  });
  return `https://${shop}/admin/oauth/authorize?${q}`;
}

/** Callback + app-URL requests: drop hmac/signature, sort, re-encode, HMAC-SHA256 hex with the app secret. */
export function verifyQueryHmac(params: URLSearchParams, secret: string): boolean {
  const given = params.get("hmac");
  if (!given) return false;
  const entries = [...params.entries()].filter(([k]) => k !== "hmac" && k !== "signature").sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const message = new URLSearchParams(entries).toString();
  return safeEqual(hmacHex(secret, message), given);
}

export type TokenSet = {
  accessToken: string;
  scopes: string[];
  refreshToken: string | null;
  accessExpiresAt: Date | null;
  refreshExpiresAt: Date | null;
};

type TokenResponse = {
  access_token: string;
  scope?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
};

function toTokenSet(r: TokenResponse, now = Date.now()): TokenSet {
  return {
    accessToken: r.access_token,
    scopes: (r.scope ?? "").split(",").filter(Boolean),
    refreshToken: r.refresh_token ?? null,
    accessExpiresAt: r.expires_in ? new Date(now + r.expires_in * 1000) : null,
    refreshExpiresAt: r.refresh_token_expires_in ? new Date(now + r.refresh_token_expires_in * 1000) : null,
  };
}

async function tokenRequest(shop: string, body: Record<string, string>): Promise<TokenSet> {
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(body),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new ShopifyAuthError(`Shopify token request failed (${res.status}): ${text.slice(0, 200)}`, res.status);
  return toTokenSet(JSON.parse(text) as TokenResponse);
}

/** Authorization code → expiring offline token (1h access, 90-day rotating refresh). */
export function exchangeCode(shop: string, code: string): Promise<TokenSet> {
  const { apiKey, apiSecret } = env.shopify();
  return tokenRequest(shop, { client_id: apiKey, client_secret: apiSecret, code, expiring: "1" });
}

export function refreshToken(shop: string, refresh: string): Promise<TokenSet> {
  const { apiKey, apiSecret } = env.shopify();
  return tokenRequest(shop, { client_id: apiKey, client_secret: apiSecret, grant_type: "refresh_token", refresh_token: refresh });
}

export class ShopifyAuthError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "ShopifyAuthError";
  }
}

/** write_x implies read_x. Returns scopes we asked for but did not get. */
export function missingScopes(granted: string[], wanted: string[]): string[] {
  const g = new Set(granted);
  return wanted.filter((s) => !g.has(s) && !(s.startsWith("read_") && g.has(`write_${s.slice(5)}`)));
}
