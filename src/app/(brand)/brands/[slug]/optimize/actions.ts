"use server";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { getBrand } from "@/lib/queries/brands";
import type { ChangeStatus } from "@/lib/db/schema";
import { autopilotRun, setPilotMode } from "@/lib/growth/autopilot";
import { MODES, type Mode } from "@/lib/growth/pilot";

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
  revalidatePath(`/brands/${slug}/performance`);
  revalidatePath(`/brands/${slug}/today`);
}

const ref = (b: { id: string; timezone: string | null; currency: string | null }) => ({ id: b.id, timezone: b.timezone ?? "UTC", currency: b.currency ?? "USD" });

/** How much Kaviar may decide on its own. What is already waiting falls under the new setting straight away. */
export async function setMode(slug: string, mode: Mode): Promise<void> {
  await requireMember();
  if (!(mode in MODES)) return;
  await setPilotMode(ref(await getBrand(slug)), mode);
  revalidatePath(`/brands/${slug}/performance`);
  revalidatePath(`/brands/${slug}/today`);
}

/** Run today's check now instead of waiting for the morning one. */
export async function checkNow(slug: string): Promise<void> {
  await requireMember();
  await autopilotRun(ref(await getBrand(slug)), "team");
  revalidatePath(`/brands/${slug}/performance`);
  revalidatePath(`/brands/${slug}/today`);
}
