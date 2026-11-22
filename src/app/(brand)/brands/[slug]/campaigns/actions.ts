"use server";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth";
import { getBrand } from "@/lib/queries/brands";
import { savePlanChoice, saveTarget } from "@/lib/growth/plans";

const fresh = (slug: string) => { for (const p of ["campaigns", "today"]) revalidatePath(`/brands/${slug}/${p}`, p === "campaigns" ? "layout" : "page"); };

/** Say yes to one plan, at the budget and length chosen. Its ads can be made from then on. */
export async function approvePlanFor(slug: string, key: string, budget: number, days: number): Promise<void> {
  const me = await requireMember();
  await savePlanChoice((await getBrand(slug)).id, key, { budget, days, approve: true, by: me.name });
  fresh(slug);
}
/** Change a plan's budget or length without approving it again. */
export async function setPlanBudget(slug: string, key: string, budget: number, days: number): Promise<void> {
  await requireMember();
  await savePlanChoice((await getBrand(slug)).id, key, { budget, days });
  fresh(slug);
}
/** The brand's monthly sales target: falling short of it is a reason to advertise. */
export async function setSalesTarget(slug: string, target: number | null): Promise<void> {
  await requireMember();
  await saveTarget((await getBrand(slug)).id, target);
  fresh(slug);
}
