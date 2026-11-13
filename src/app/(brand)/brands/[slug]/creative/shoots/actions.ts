"use server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { aiReady } from "@/lib/ai/client";
import { getBrand } from "@/lib/queries/brands";
import { shoot, writeShotPrompt } from "@/lib/creative/shoots";

export async function suggestPrompt(slug: string, product: string, angle: string): Promise<{ prompt?: string; error?: string }> {
  await requireMember();
  if (!aiReady()) return { error: "Remy needs the Claude API key." };
  const brand = await getBrand(slug);
  const prompt = await writeShotPrompt(brand.id, { product, angle });
  return prompt ? { prompt } : { error: "Remy couldn’t write a prompt right now." };
}

export async function runShoot(slug: string, input: { product: string; imageUrl: string; prompt: string; aspect: "4:5" | "9:16" | "1:1"; n: number }): Promise<{ ids?: string[]; error?: string }> {
  const me = await requireMember();
  const brand = await getBrand(slug);
  if (input.prompt.trim().length < 10) return { error: "Describe the scene first." };
  if (!/^https:\/\//.test(input.imageUrl)) return { error: "Pick a product photo." };
  const r = await shoot(brand.id, me.id, { ...input, prompt: input.prompt.slice(0, 1200) });
  return r.ids.length ? { ids: r.ids, ...(r.error ? { error: `Some images failed: ${r.error}` } : {}) } : { error: r.error ?? "No image came back." };
}

export async function deleteShot(slug: string, id: string): Promise<void> {
  await requireMember();
  const brand = await getBrand(slug);
  await db.delete(schema.brandAssets).where(and(eq(schema.brandAssets.id, id), eq(schema.brandAssets.brandId, brand.id)));
}
