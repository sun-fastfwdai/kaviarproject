"use server";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { getBrand } from "@/lib/queries/brands";
import type { ChangeStatus } from "@/lib/db/schema";
import { autopilotRun, setPilotMode, settle } from "@/lib/growth/autopilot";
import { undoChange, writeTest } from "@/lib/meta/apply";
import { MODES, type Mode } from "@/lib/growth/pilot";

const fresh = (slug: string) => { revalidatePath(`/brands/${slug}/performance`); revalidatePath(`/brands/${slug}/today`); };

/** Approve, skip, mark as switched by hand in Ads Manager, or put back — for one or many changes. Approving applies on Meta when Kaviar may. */
export async function decide(slug: string, ids: string[], status: ChangeStatus): Promise<void> {
  const me = await requireMember();
  const brand = await getBrand(slug);
  if (!ids.length) return;
  if (status === "approved") await settle(brand.id, ids.slice(0, 50), me.id);
  else await db.update(schema.optimizeChanges).set({
    status, decidedBy: me.id, decidedAt: new Date(),
    ...(status === "applied" ? { appliedAt: new Date(), result: { verdict: "too-early" as const, detail: "Too early to tell", checkedAt: new Date().toISOString() } } : {}),
    ...(status === "proposed" ? { appliedAt: null, result: null } : {}),
  }).where(and(eq(schema.optimizeChanges.brandId, brand.id), inArray(schema.optimizeChanges.id, ids.slice(0, 50))));
  fresh(slug);
}

/** Put back on Meta what Kaviar changed, and return the change to the list. */
export async function undo(slug: string, id: string): Promise<{ error?: string }> {
  await requireMember();
  const brand = await getBrand(slug), C = schema.optimizeChanges;
  const [c] = await db.select().from(C).where(and(eq(C.brandId, brand.id), eq(C.id, id)));
  if (!c?.target.applied) return { error: "Nothing to undo" };
  const r = c.target.applied.prev.length ? await undoChange(brand.id, c.target.applied.prev) : { ok: true };
  if (!r.ok) return { error: r.message ?? "Meta refused" };
  const { applied: _a, ...target } = c.target;
  void _a;
  await db.update(C).set({ status: "skipped", appliedAt: null, result: null, target }).where(eq(C.id, id));
  fresh(slug);
  return {};
}

/** Prove Kaviar can change this ad account: a paused, empty test campaign is made, changed and deleted. Owners only. */
export async function accessTest(slug: string): Promise<void> {
  const me = await requireMember();
  if (me.role !== "owner") return;
  await writeTest((await getBrand(slug)).id);
  fresh(slug);
}

const ref = (b: { id: string; timezone: string | null; currency: string | null }) => ({ id: b.id, timezone: b.timezone ?? "UTC", currency: b.currency ?? "USD" });

/** How much Kaviar may decide on its own. What is already waiting falls under the new setting straight away. */
export async function setMode(slug: string, mode: Mode): Promise<void> {
  await requireMember();
  if (!(mode in MODES)) return;
  await setPilotMode(ref(await getBrand(slug)), mode);
  fresh(slug);
}

/** Run today's check now instead of waiting for the morning one. */
export async function checkNow(slug: string): Promise<void> {
  await requireMember();
  await autopilotRun(ref(await getBrand(slug)), "team");
  fresh(slug);
}
