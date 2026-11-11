"use server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { slugify } from "@/lib/format";

export type BrandFormState = { error?: string } | undefined;
const Brand = z.object({ name: z.string().trim().min(1, "Add the brand name").max(60), category: z.string().trim().max(60).optional() });

export async function createBrand(_: BrandFormState, form: FormData): Promise<BrandFormState> {
  const member = await requireMember();
  const p = Brand.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]?.message };
  const base = slugify(p.data.name) || "brand";
  let slug = base;
  for (let i = 2; ; i++) {
    const [taken] = await db.select({ id: schema.brands.id }).from(schema.brands).where(eq(schema.brands.slug, slug)).limit(1);
    if (!taken) break;
    slug = `${base}-${i}`;
  }
  await db.insert(schema.brands).values({ slug, name: p.data.name, category: p.data.category || null, createdBy: member.id });
  redirect(`/brands/${slug}/integrations`);
}
