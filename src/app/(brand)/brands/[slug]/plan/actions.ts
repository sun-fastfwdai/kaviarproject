"use server";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth";
import { getBrand } from "@/lib/queries/brands";
import { savePlan, savedPlan, type SavedPlan } from "@/lib/growth/plan-data";

/** Keep the brand's choices (margin, budget, period, goal, offer) and mark the plan approved. */
export async function approvePlan(slug: string, input: SavedPlan, approve: boolean): Promise<{ ok?: true; error?: string }> {
  const me = await requireMember();
  const brand = await getBrand(slug);
  const num = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : undefined);
  const before = (await savedPlan(brand.id)) ?? {};
  const goal = (["profit", "revenue", "customers"] as const).find((g) => g === input.goal);
  await savePlan(brand.id, { ...before, margin: num(input.margin, 0.05, 0.95) ?? before.margin, budget: num(input.budget, 0, 5_000_000) ?? before.budget, days: num(input.days, 7, 90) ?? before.days,
    goal: goal ?? before.goal, discount: num(input.discount, 0, 0.9) ?? before.discount, ...(approve ? { approvedAt: new Date().toISOString(), by: me.name } : {}) });
  revalidatePath(`/brands/${slug}/plan`);
  return { ok: true };
}
