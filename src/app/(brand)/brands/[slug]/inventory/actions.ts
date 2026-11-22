"use server";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth";
import { getBrand } from "@/lib/queries/brands";
import { setLead } from "@/lib/store/stock";

/** How many days a restock takes for this brand — every "reorder by" date is worked out from it. */
export async function saveLead(slug: string, days: number): Promise<void> {
  await requireMember();
  if (!Number.isFinite(days) || days < 1) return;
  await setLead((await getBrand(slug)).id, days);
  revalidatePath(`/brands/${slug}/inventory`);
  revalidatePath(`/brands/${slug}/today`);
}
