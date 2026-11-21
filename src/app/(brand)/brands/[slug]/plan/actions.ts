"use server";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth";
import { getBrand } from "@/lib/queries/brands";
import { planData, savePlan, savedPlan, type SavedPlan } from "@/lib/growth/plan-data";
import { readyTests } from "@/lib/research/context";
import { buildPipeline } from "../creative/actions";

/** Keep the brand's choices (margin, budget, period, goal, offer) and mark the plan approved. */
export async function approvePlan(slug: string, input: SavedPlan, approve: boolean): Promise<{ ok?: true; error?: string }> {
  const me = await requireMember();
  const brand = await getBrand(slug);
  const num = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : undefined);
  const before = (await savedPlan(brand.id)) ?? {};
  const goal = (["profit", "revenue", "customers"] as const).find((g) => g === input.goal);
  await savePlan(brand.id, { ...before, margin: num(input.margin, 0.05, 0.95) ?? before.margin, budget: num(input.budget, 0, 5_000_000) ?? before.budget, days: num(input.days, 7, 90) ?? before.days,
    goal: goal ?? before.goal, discount: num(input.discount, 0, 0.9) ?? before.discount, product: typeof input.product === "string" ? input.product.slice(0, 200) : before.product, order: num(input.order, 1, 100_000) ?? before.order, ...(approve ? { approvedAt: new Date().toISOString(), by: me.name } : {}) });
  revalidatePath(`/brands/${slug}/plan`);
  revalidatePath(`/brands/${slug}/today`);
  return { ok: true };
}

/**
 * One campaign from the plan, handed to the Creative studio: Remy writes the ads for that audience with the messages research found,
 * and Shoots opens with the pipeline ready. The team reviews before anything is spent.
 */
export async function makeAds(slug: string, key: string): Promise<{ error?: string } | undefined> {
  await requireMember();
  const brand = await getBrand(slug);
  const [d, tests] = await Promise.all([planData(brand.id, brand.currency ?? "USD"), readyTests(brand.id).catch(() => [])]);
  const c = d.candidates.find((x) => x.key === key);
  if (!c) return { error: "That campaign is no longer in the plan — open the Spend plan." };
  const t = tests.find((x) => x.key === c.signal);
  const r = await buildPipeline(slug, { format: "static", product: d.saved?.product ?? c.product, signal: c.signal ?? "", audience: t?.who ?? `${c.name} — ${c.why}`.slice(0, 200),
    angles: t?.messages?.length ? t.messages : [c.why.slice(0, 90)], count: 6, look: t?.visual ?? "", adLook: "Ad look · Big word", seconds: 0, why: t?.hypothesis ?? c.why });
  return r?.error ? { error: r.error } : undefined;
}
