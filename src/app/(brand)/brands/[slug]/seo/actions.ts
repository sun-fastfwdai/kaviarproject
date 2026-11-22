"use server";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { getBrand } from "@/lib/queries/brands";
import { applyFixes, undoFix } from "@/lib/seo/apply";
import { setAuto, storeRun } from "@/lib/seo/run";
import { fit, LIMIT } from "@/lib/seo/types";

const F = schema.storeFixes;
const fresh = (slug: string) => { revalidatePath(`/brands/${slug}/seo`); revalidatePath(`/brands/${slug}/today`); revalidatePath(`/brands/${slug}/competitors`); };
const ref = (b: { id: string; timezone: string | null }) => ({ id: b.id, timezone: b.timezone ?? "UTC" });

/** Read the store again now, and have Cleo write whatever is new. */
export async function checkStore(slug: string): Promise<{ error?: string }> {
  await requireMember();
  try { if (!(await storeRun(ref(await getBrand(slug)), "team"))) return { error: "Connect the Shopify store first" }; }
  catch (e) { console.error("store check", (e as Error).message.slice(0, 200)); return { error: (e as Error).name === "ShopifyAuthError" ? "Shopify refused Kaviar’s access — reconnect the store" : "Kaviar couldn’t read the store just now — try again" }; }
  fresh(slug);
  return {};
}

/** Save these fixes to the Shopify store (all the open ones when no list is given). */
export async function fix(slug: string, ids: string[] | "all"): Promise<{ fields: number; failed: number; error?: string }> {
  const me = await requireMember(), brand = await getBrand(slug);
  const r = await applyFixes(brand.id, ids, { by: "team", memberId: me.id });
  fresh(slug);
  return { fields: r.fields, failed: r.failed, error: r.error ?? undefined };
}

/** Skip, put back on the list, or mark as done by hand in Shopify. */
export async function mark(slug: string, ids: string[], status: "skipped" | "proposed" | "applied"): Promise<void> {
  const me = await requireMember(), brand = await getBrand(slug);
  if (!ids.length) return;
  await db.update(F).set({ status, decidedBy: me.id, by: status === "applied" ? "team" : null, appliedAt: status === "applied" ? new Date() : null, error: null, updatedAt: new Date() })
    .where(and(eq(F.brandId, brand.id), inArray(F.id, ids.slice(0, 500))));
  fresh(slug);
}

export async function undo(slug: string, id: string): Promise<{ error?: string }> {
  await requireMember();
  const r = await undoFix((await getBrand(slug)).id, id);
  fresh(slug);
  return r;
}

/** Change Cleo's wording before it is saved. */
export async function edit(slug: string, id: string, text: string): Promise<void> {
  await requireMember();
  const brand = await getBrand(slug);
  const [r] = await db.select({ kind: F.kind }).from(F).where(and(eq(F.brandId, brand.id), eq(F.id, id), eq(F.status, "proposed")));
  if (!r || r.kind === "thin") return;
  const after = fit(text, r.kind === "search_title" ? LIMIT.title : r.kind === "search_description" ? LIMIT.description : LIMIT.alt);
  if (after) await db.update(F).set({ after, updatedAt: new Date() }).where(eq(F.id, id));
  fresh(slug);
}

/** Ask first, or fill in what is empty without asking. */
export async function setStoreAuto(slug: string, auto: boolean): Promise<void> {
  const me = await requireMember();
  await setAuto(ref(await getBrand(slug)), auto, me.id);
  fresh(slug);
}

