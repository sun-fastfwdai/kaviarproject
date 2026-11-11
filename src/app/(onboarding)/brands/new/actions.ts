"use server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { env } from "@/lib/env";
import { slugify } from "@/lib/format";
import { normalizeShop } from "@/lib/shopify/oauth";

export type NewBrandState = { error?: string; at?: number } | undefined;
const RESERVED = new Set(["new"]);

const Brand = z.object({
  source: z.enum(["shopify", "later"]),
  shop: z.string().trim().optional(),
  name: z.string().trim().min(1, "Add the brand name").max(60),
  category: z.string().trim().max(60).optional(),
  website: z.string().trim().max(200).optional(),
  currency: z.string().trim().length(3),
  timezone: z.string().trim().min(1).max(60),
});

export async function createBrand(_: NewBrandState, form: FormData): Promise<NewBrandState> {
  const member = await requireMember();
  const p = Brand.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Check the form.", at: Date.now() };
  const shop = p.data.source === "shopify" ? normalizeShop(p.data.shop) : null;
  if (p.data.source === "shopify" && !shop) return { error: "Enter the store’s .myshopify.com address.", at: Date.now() };

  const base = slugify(p.data.name) || "brand";
  let slug = RESERVED.has(base) ? `${base}-brand` : base;
  for (let i = 2; ; i++) {
    const [taken] = await db.select({ id: schema.brands.id }).from(schema.brands).where(eq(schema.brands.slug, slug)).limit(1);
    if (!taken) break;
    slug = `${base}-${i}`;
  }
  let website = p.data.website || null;
  if (website && !/^https?:\/\//.test(website)) website = `https://${website}`;
  await db.insert(schema.brands).values({
    slug, name: p.data.name, category: p.data.category || null, website,
    currency: p.data.currency.toUpperCase(), timezone: p.data.timezone, createdBy: member.id,
  });

  if (shop && env.shopifyConfigured()) redirect(`/api/shopify/install?brand=${slug}&shop=${shop}`);
  redirect(shop ? `/brands/${slug}/integrations` : `/brands/${slug}`);
}
