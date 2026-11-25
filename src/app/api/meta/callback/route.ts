import { after, NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { env } from "@/lib/env";
import { listAdAccounts, metaExchangeCode } from "@/lib/meta/oauth";
import { runBrandSync } from "@/lib/sync/run";
import { grantedScopes } from "@/lib/meta/apply";
import { finishOAuth } from "@/lib/oauth-state";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const st = await finishOAuth<{ brandId: string; slug: string; memberId: string }>("kv_meta_oauth", q.get("state"));
  if (!st) return NextResponse.redirect(new URL("/brands", req.url));
  const back = (path: string) => NextResponse.redirect(new URL(`/brands/${st.slug}/${path}`, req.url));
  if (q.get("error") || !q.get("code")) return back("integrations?error=denied");

  let token: string, expiresAt: Date | null, accounts, granted: string[];
  try {
    ({ token, expiresAt } = await metaExchangeCode(q.get("code")!));
    accounts = await listAdAccounts(token);
    granted = await grantedScopes(token).catch(() => env.meta().scopes); // what the person really allowed, not what was asked for
  } catch (e) {
    console.error("meta oauth", e);
    return back("integrations?error=token");
  }
  if (!accounts.length) return back("integrations?error=no_accounts");

  const one = accounts.length === 1 ? accounts[0] : null;
  // Signing in again must not undo the access test: it was passed on an ad account, and holds for as long as the same account is used.
  const [was] = await db.select({ externalId: schema.connections.externalId, details: schema.connections.details }).from(schema.connections)
    .where(and(eq(schema.connections.brandId, st.brandId), eq(schema.connections.provider, "meta"))).limit(1);
  const tested = was?.externalId && (was.details as { write?: unknown } | null)?.write ? { write: (was.details as { write: unknown }).write, writeFor: was.externalId } : {};
  const values = {
    status: one ? ("connected" as const) : ("choose_account" as const),
    externalId: one?.id ?? null,
    displayName: one?.name ?? null,
    scopes: granted,
    accessToken: encrypt(token),
    refreshToken: null,
    accessExpiresAt: expiresAt,
    refreshExpiresAt: null,
    details: one
      ? { currency: one.currency, timezone: one.timezone_name, ...(tested.writeFor === one.id ? { write: tested.write } : {}) }
      : { ...tested, accounts: accounts.map(({ id, name, currency, timezone_name, account_status }) => ({ id, name, currency, timezone_name, account_status })) },
    lastError: null,
    connectedBy: st.memberId,
    connectedAt: new Date(),
    updatedAt: new Date(),
  };
  await db
    .insert(schema.connections)
    .values({ brandId: st.brandId, provider: "meta", ...values })
    .onConflictDoUpdate({ target: [schema.connections.brandId, schema.connections.provider], set: values });

  if (!one) return back("integrations");
  after(() => runBrandSync(st.brandId, "connect", ["meta"]).catch((e) => console.error("meta sync", e)));
  return back("sync?connected=meta");
}
