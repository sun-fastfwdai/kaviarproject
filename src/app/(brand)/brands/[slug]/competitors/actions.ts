"use server";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth";
import { getBrand } from "@/lib/queries/brands";
import { addRival, removeRival, runBench } from "@/lib/seo/bench";

const fresh = (slug: string) => { for (const p of ["competitors", "seo", "today"]) revalidatePath(`/brands/${slug}/${p}`); };

/** Read the brand's public site and each competitor's again, now. */
export async function readRivals(slug: string): Promise<{ error?: string }> {
  await requireMember();
  const brand = await getBrand(slug);
  try { const r = await runBench({ id: brand.id, name: brand.name }); fresh(slug); return { error: r.error }; }
  catch (e) { console.error("bench", (e as Error).message.slice(0, 200)); return { error: "Kaviar couldn’t read the sites just now — try again" }; }
}
export async function addCompetitor(slug: string, name: string, url: string): Promise<{ error?: string }> {
  await requireMember();
  try { const r = await addRival((await getBrand(slug)).id, name, url); fresh(slug); return r; }
  catch (e) { console.error("bench add", (e as Error).message.slice(0, 200)); return { error: "That website couldn’t be read" }; }
}
export async function removeCompetitor(slug: string, url: string): Promise<void> {
  await requireMember();
  await removeRival((await getBrand(slug)).id, url);
  fresh(slug);
}
