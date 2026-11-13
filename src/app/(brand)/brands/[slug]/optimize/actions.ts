"use server";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { getBrand } from "@/lib/queries/brands";
import type { ChangeStatus } from "@/lib/db/schema";

/** Approve, skip, mark as applied in Ads Manager, or undo — for one or many of this week's changes. */
export async function decide(slug: string, ids: string[], status: ChangeStatus): Promise<void> {
  const me = await requireMember();
  const brand = await getBrand(slug);
  if (!ids.length) return;
  await db.update(schema.optimizeChanges).set({
    status, decidedBy: me.id, decidedAt: new Date(),
    ...(status === "applied" ? { appliedAt: new Date(), result: { verdict: "too-early" as const, detail: "Too early to tell", checkedAt: new Date().toISOString() } } : {}),
    ...(status === "proposed" ? { appliedAt: null, result: null } : {}),
  }).where(and(eq(schema.optimizeChanges.brandId, brand.id), inArray(schema.optimizeChanges.id, ids.slice(0, 50))));
  revalidatePath(`/brands/${slug}/optimize`);
}
