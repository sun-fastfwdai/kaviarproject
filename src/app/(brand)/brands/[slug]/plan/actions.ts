"use server";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth";
import { getBrand } from "@/lib/queries/brands";
import { savePlan, savedPlan, type SavedPlan } from "@/lib/growth/plan-data";
import { readyTests } from "@/lib/research/context";
import { getPlans } from "@/lib/growth/plans";
import { REASON_NAME } from "@/lib/growth/plans-rules";
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
 * The ads for one plan. Ads are never made for their own sake: the plan must exist — which means its reason holds today — and the
 * brand must have approved it. Then Remy writes three for that audience, filed under the plan, and Shoots opens with them.
 */
export async function makeAds(slug: string, key: string, stay = false): Promise<{ error?: string; batchId?: string } | undefined> {
  await requireMember();
  const brand = await getBrand(slug);
  const [plans, tests] = await Promise.all([getPlans({ id: brand.id, currency: brand.currency ?? null, timezone: brand.timezone }), readyTests(brand.id).catch(() => [])]);
  const p = plans.list.find((x) => x.key === key);
  if (!p) return { error: "That plan’s reason no longer holds — open Campaigns for today’s plans." };
  if (p.stage === "suggested") return { error: "Approve the plan first — ads are made once you’ve said yes to it." };
  const c = p.c, t = tests.find((x) => x.key === c.signal);
  const r = await buildPipeline(slug, { format: "static", product: c.product, signal: c.signal ?? key, audience: t?.who ?? `${c.name} — ${c.why}`.slice(0, 200),
    angles: t?.messages?.length ? t.messages : [`${p.title}`.slice(0, 90)], count: 3, look: t?.visual ?? "", adLook: "Ad look · Big word", seconds: 0, why: t?.hypothesis ?? p.why,
    reason: { data: p.title, value: p.when ?? null, use: `${REASON_NAME[p.reason]} — ${p.why}`, evidence: [["Why now", p.title], ["Detail", p.why], ["Budget", `${p.budget} over ${p.days} days`]] } }, stay);
  if (stay) { revalidatePath(`/brands/${slug}/campaigns`, "layout"); revalidatePath(`/brands/${slug}/today`); }
  return r?.error ? { error: r.error } : r?.batchId ? { batchId: r.batchId } : undefined;
}
