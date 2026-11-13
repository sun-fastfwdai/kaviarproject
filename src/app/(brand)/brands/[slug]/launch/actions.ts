"use server";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth";
import { aiReady } from "@/lib/ai/client";
import { getBrand } from "@/lib/queries/brands";
import { extractCatalog } from "@/lib/store/catalog";

export async function readCatalog(slug: string): Promise<{ count?: number; error?: string }> {
  await requireMember();
  const brand = await getBrand(slug);
  const r = await extractCatalog(brand.id);
  if (!r.count && !aiReady()) return { error: "Cleo needs the Claude API key to read sites that aren’t on Shopify." };
  revalidatePath(`/brands/${slug}/launch`);
  return r.error && !r.count ? { error: r.error } : { count: r.count };
}
