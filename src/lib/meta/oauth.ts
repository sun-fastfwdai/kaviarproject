import "server-only";
import { env } from "../env";
import { graphBase, metaGet, metaGetAll } from "./client";

const redirectUri = () => `${env.appUrl()}/api/meta/callback`;

export function metaAuthorizeUrl(state: string): string {
  const { appId, apiVersion, scopes } = env.meta();
  const q = new URLSearchParams({ client_id: appId, redirect_uri: redirectUri(), state, scope: scopes.join(","), response_type: "code" });
  return `https://www.facebook.com/${apiVersion}/dialog/oauth?${q}`;
}

type Token = { access_token: string; expires_in?: number };

async function tokenCall(params: Record<string, string>): Promise<Token> {
  const res = await fetch(`${graphBase()}/oauth/access_token?${new URLSearchParams(params)}`, { cache: "no-store" });
  const body = await res.json();
  if (!res.ok || body.error) throw new Error(`Meta token exchange failed: ${body.error?.message ?? res.status}`);
  return body as Token;
}

/** Code → short-lived token → long-lived (~60 day) user token. */
export async function metaExchangeCode(code: string): Promise<{ token: string; expiresAt: Date | null }> {
  const { appId, appSecret } = env.meta();
  const short = await tokenCall({ client_id: appId, client_secret: appSecret, redirect_uri: redirectUri(), code });
  const long = await tokenCall({ grant_type: "fb_exchange_token", client_id: appId, client_secret: appSecret, fb_exchange_token: short.access_token });
  return { token: long.access_token, expiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000) : null };
}

export type AdAccount = { id: string; account_id: string; name: string; currency: string; timezone_name: string; account_status: number };

export async function listAdAccounts(token: string): Promise<AdAccount[]> {
  return metaGetAll<AdAccount>("me/adaccounts", { fields: "id,account_id,name,currency,timezone_name,account_status", limit: "100" }, token);
}

export async function metaMe(token: string): Promise<{ id: string; name: string }> {
  return metaGet("me", { fields: "id,name" }, token);
}
