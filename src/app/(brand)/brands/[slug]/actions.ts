"use server";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { getBrand } from "@/lib/queries/brands";
import { runBrandSync } from "@/lib/sync/run";
import type { Provider } from "@/lib/db/schema";

/** Kick off a sync and return at once; the page polls while the run row says "running". */
export async function syncNow(slug: string) {
  await requireMember();
  const brand = await getBrand(slug);
  after(() => runBrandSync(brand.id, "manual").catch((e) => console.error("sync failed", e)));
  return { started: true };
}

export async function chooseMetaAccount(slug: string, form: FormData) {
  await requireMember();
  const brand = await getBrand(slug);
  const accountId = String(form.get("account") ?? "");
  const [conn] = await db.select().from(schema.connections).where(and(eq(schema.connections.brandId, brand.id), eq(schema.connections.provider, "meta")));
  const accounts = (conn?.details?.accounts ?? []) as { id: string; name: string; currency: string; timezone_name: string }[];
  const acct = accounts.find((a) => a.id === accountId);
  if (!conn || !acct) redirect(`/brands/${slug}/integrations?error=meta_account`);
  await db
    .update(schema.connections)
    .set({
      status: "connected",
      externalId: acct.id,
      displayName: acct.name,
      details: { ...conn.details, currency: acct.currency, timezone: acct.timezone_name, accounts: undefined },
      updatedAt: new Date(),
    })
    .where(eq(schema.connections.id, conn.id));
  after(() => runBrandSync(brand.id, "connect", ["meta"]).catch((e) => console.error("meta sync failed", e)));
  redirect(`/brands/${slug}/sync?connected=meta`);
}

/** Stops syncing and forgets the token. Synced data stays so history isn't lost. */
export async function disconnect(slug: string, provider: Provider) {
  await requireMember();
  const brand = await getBrand(slug);
  await db
    .update(schema.connections)
    .set({ status: "disconnected", accessToken: null, refreshToken: null, accessExpiresAt: null, refreshExpiresAt: null, updatedAt: new Date() })
    .where(and(eq(schema.connections.brandId, brand.id), eq(schema.connections.provider, provider)));
  redirect(`/brands/${slug}/integrations`);
}
