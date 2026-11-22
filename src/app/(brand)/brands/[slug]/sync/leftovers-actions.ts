"use server";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth";
import { getBrand } from "@/lib/queries/brands";
import { removeLeftovers } from "@/lib/assets/storage";

/** Remove this brand's stored files that no longer have a record. Team only; permanent. */
export async function clearLeftovers(slug: string): Promise<{ removed: number; error?: string }> {
  const me = await requireMember();
  if (me.brands) return { removed: 0, error: "Only the Kaviar team can do this." };
  try { const removed = await removeLeftovers((await getBrand(slug)).id); revalidatePath(`/brands/${slug}/sync`); return { removed }; }
  catch (e) { console.error("leftovers", (e as Error).message.slice(0, 160)); return { removed: 0, error: "Storage didn’t answer — try again." }; }
}
