"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireTeam } from "@/lib/auth";
import type { BrandFeatures } from "@/lib/db/schema";

/** Switch a part of Kaviar on or off for one brand. The Kaviar team only — a brand login never reaches this. */
export async function setFeature(slug: string, key: keyof BrandFeatures, on: boolean): Promise<{ error?: string }> {
  await requireTeam();
  if (key !== "storeBuilder") return { error: "Unknown setting" };
  const [b] = await db.select({ id: schema.brands.id, features: schema.brands.features }).from(schema.brands).where(eq(schema.brands.slug, slug)).limit(1);
  if (!b) return { error: "Brand not found" };
  await db.update(schema.brands).set({ features: { ...b.features, [key]: on } }).where(eq(schema.brands.id, b.id));
  revalidatePath("/brands");
  revalidatePath(`/brands/${slug}`, "layout");
  return {};
}
