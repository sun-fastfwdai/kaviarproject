import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { decrypt, encrypt } from "../crypto";
import { env } from "../env";
import { refreshToken, ShopifyAuthError } from "./oauth";

type Conn = typeof schema.connections.$inferSelect;
const REFRESH_MARGIN_MS = 5 * 60_000;

/**
 * A valid access token for this connection. Expiring tokens are refreshed under a row lock so two
 * syncs never refresh at once (Shopify rotates refresh tokens; a parallel refresh would orphan one).
 */
export async function shopifyAccessToken(connectionId: string): Promise<{ shop: string; token: string }> {
  const [c] = await db.select().from(schema.connections).where(eq(schema.connections.id, connectionId));
  if (!c?.accessToken || !c.externalId) throw new ShopifyAuthError("Shopify is not connected");
  if (!needsRefresh(c)) return { shop: c.externalId, token: decrypt(c.accessToken) };

  return db.transaction(async (tx) => {
    const res = await tx.execute(sql`select * from connections where id = ${connectionId} for update`);
    const row = res.rows[0] as Record<string, unknown>;
    const fresh = {
      accessToken: row.access_token as string,
      refreshToken: row.refresh_token as string | null,
      accessExpiresAt: row.access_expires_at ? new Date(row.access_expires_at as string) : null,
    };
    if (!needsRefresh(fresh)) return { shop: c.externalId!, token: decrypt(fresh.accessToken) };
    if (!fresh.refreshToken) throw new ShopifyAuthError("Shopify token expired and there is no refresh token");
    const t = await refreshToken(c.externalId!, decrypt(fresh.refreshToken));
    await tx
      .update(schema.connections)
      .set({
        accessToken: encrypt(t.accessToken),
        refreshToken: t.refreshToken ? encrypt(t.refreshToken) : fresh.refreshToken,
        accessExpiresAt: t.accessExpiresAt,
        refreshExpiresAt: t.refreshExpiresAt,
        updatedAt: new Date(),
      })
      .where(eq(schema.connections.id, connectionId));
    return { shop: c.externalId!, token: t.accessToken };
  });
}

function needsRefresh(c: Pick<Conn, "accessExpiresAt" | "refreshToken">): boolean {
  return Boolean(c.accessExpiresAt && c.refreshToken && c.accessExpiresAt.getTime() - Date.now() < REFRESH_MARGIN_MS);
}

type GqlError = { message: string; extensions?: { code?: string } };
type GqlResponse<T> = {
  data?: T;
  errors?: GqlError[];
  extensions?: { cost?: { throttleStatus?: { currentlyAvailable: number; restoreRate: number } } };
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Admin GraphQL with token refresh and throttle-aware retries. */
export async function shopifyGraphql<T>(connectionId: string, query: string, variables?: Record<string, unknown>): Promise<T> {
  const { apiVersion } = env.shopify();
  for (let attempt = 0; ; attempt++) {
    const { shop, token } = await shopifyAccessToken(connectionId);
    const res = await fetch(`https://${shop}/admin/api/${apiVersion}/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
    });
    if (res.status === 401 || res.status === 403) {
      throw new ShopifyAuthError(`Shopify rejected the token (${res.status})`, res.status);
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 5) {
      await sleep(Number(res.headers.get("Retry-After") ?? 2) * 1000 * (attempt + 1));
      continue;
    }
    const body = (await res.json()) as GqlResponse<T>;
    const throttled = body.errors?.some((e) => e.extensions?.code === "THROTTLED");
    if (throttled && attempt < 6) {
      const s = body.extensions?.cost?.throttleStatus;
      await sleep(s ? Math.max(1000, (1000 / Math.max(1, s.restoreRate)) * 200) : 2000 * (attempt + 1));
      continue;
    }
    if (body.errors?.length) throw new Error(`Shopify GraphQL: ${body.errors.map((e) => e.message).join("; ")}`);
    if (!body.data) throw new Error(`Shopify GraphQL: empty response (${res.status})`);
    return body.data;
  }
}

export const gidNum = (gid: string | null | undefined): number | null => {
  if (!gid) return null;
  const n = Number(gid.slice(gid.lastIndexOf("/") + 1));
  return Number.isFinite(n) ? n : null;
};
export const gidType = (gid: string) => gid.split("/")[3] ?? "";
