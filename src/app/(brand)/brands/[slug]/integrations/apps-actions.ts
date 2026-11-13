"use server";
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { getBrand } from "@/lib/queries/brands";
import { STORE_APPS } from "./apps";

export async function setAppStatus(slug: string, key: string, status: "requested" | "connected" | null): Promise<void> {
  const me = await requireMember();
  if (!STORE_APPS.some((a) => a.key === key)) return;
  const brand = await getBrand(slug);
  await db.update(schema.brands).set({
    integrations: status ? sql`${schema.brands.integrations} || ${JSON.stringify({ [key]: { status, at: new Date().toISOString(), by: me.name } })}::jsonb` : sql`${schema.brands.integrations} - ${key}`,
  }).where(eq(schema.brands.id, brand.id));
  revalidatePath(`/brands/${slug}/integrations`);
}
