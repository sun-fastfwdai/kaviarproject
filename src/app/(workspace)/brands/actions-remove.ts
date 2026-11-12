"use server";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { brandFootprint, purgeBrand, retireBrand, type Footprint } from "@/lib/brands/remove";

async function ownerBrand(slug: string) {
  const me = await requireMember();
  if (me.role !== "owner") throw new Error("Only owners can remove brands.");
  const [b] = await db.select().from(schema.brands).where(eq(schema.brands.slug, slug)).limit(1);
  if (!b || b.deletedAt) throw new Error("Brand not found.");
  return b;
}

export async function getFootprint(slug: string): Promise<Footprint & { name: string }> {
  const b = await ownerBrand(slug);
  return { ...(await brandFootprint(b.id)), name: b.name };
}

export async function removeBrand(slug: string, typed: string): Promise<{ error?: string; ok?: boolean }> {
  const b = await ownerBrand(slug);
  if (typed.trim().toLowerCase() !== b.name.trim().toLowerCase()) return { error: `Type “${b.name}” exactly to confirm.` };
  await retireBrand(b.id, b.slug);
  after(() => purgeBrand(b.id).catch((e) => console.error("purge failed; the hourly job will retry", e)));
  revalidatePath("/brands");
  return { ok: true };
}
