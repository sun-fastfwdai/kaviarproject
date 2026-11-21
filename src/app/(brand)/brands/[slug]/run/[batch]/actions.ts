"use server";
import { requireMember } from "@/lib/auth";
import { getBrand } from "@/lib/queries/brands";
import { createPausedCampaign } from "@/lib/meta/apply";

/** Make the campaign on Meta, paused, with this name and daily budget. Nothing can spend until a person adds the ads and switches it on. */
export async function createOnMeta(slug: string, name: string, daily: number): Promise<{ id?: string; account?: string; error?: string }> {
  await requireMember();
  const brand = await getBrand(slug);
  const r = await createPausedCampaign(brand.id, name.trim() || `${brand.name} test`, daily);
  return r.ok ? { id: r.id, account: r.account } : { error: r.message };
}
