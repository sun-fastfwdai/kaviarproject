"use server";
import { redirect } from "next/navigation";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { aiReady } from "@/lib/ai/client";
import { getBrand } from "@/lib/queries/brands";
import { checkShot, shoot, shootVideo, writeShotPrompt, type ShotCheck } from "@/lib/creative/shoots";

type Signal = { data: string; value: string | null; evidence: [string, string][] } | null;

export async function suggestPrompt(slug: string, product: string, angle: string, signal: Signal, lessons: string[]): Promise<{ prompt?: string; error?: string }> {
  await requireMember();
  if (!aiReady()) return { error: "Remy needs the Claude API key." };
  const brand = await getBrand(slug);
  const prompt = await writeShotPrompt(brand.id, { product, angle, signal, lessons });
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

export async function runCheck(slug: string, assetId: string, referenceUrl: string, product: string): Promise<{ check?: ShotCheck; error?: string }> {
  await requireMember();
  const brand = await getBrand(slug);
  const check = await checkShot(brand.id, assetId, referenceUrl, product);
  return check ? { check } : { error: "Otto couldn’t check it." };
}

export async function runVideo(slug: string, input: { fromAssetId: string; prompt: string; seconds: number; aspect: "9:16" | "1:1" | "4:5" }): Promise<{ id?: string; error?: string }> {
  const me = await requireMember();
  const brand = await getBrand(slug);
  return shootVideo(brand.id, me.id, { ...input, seconds: Math.min(10, Math.max(5, input.seconds)) });
}

/** Send photos to a batch (they become its ads' photos, in order) or keep them in brand assets. */
export async function sendShots(slug: string, ids: string[], batchId: string | null): Promise<{ done?: number; error?: string }> {
  await requireMember();
  const brand = await getBrand(slug);
  const own = await db.select({ id: schema.brandAssets.id }).from(schema.brandAssets).where(and(eq(schema.brandAssets.brandId, brand.id), inArray(schema.brandAssets.id, ids.slice(0, 20)), sql`${schema.brandAssets.mime} like 'image/%'`));
  if (!batchId) return { done: own.length };
  const list = await db.select({ id: schema.ads.id }).from(schema.ads).where(and(eq(schema.ads.batchId, batchId), eq(schema.ads.brandId, brand.id), sql`${schema.ads.status} <> 'rejected'`)).orderBy(asc(schema.ads.position));
  let done = 0;
  for (let i = 0; i < Math.min(list.length, own.length); i++) {
    await db.update(schema.ads).set({ imageUrl: `/api/assets/${own[i].id}`, design: null, updatedAt: new Date() }).where(eq(schema.ads.id, list[i].id));
    done++;
  }
  return { done };
}

export async function deleteShot(slug: string, id: string): Promise<void> {
  await requireMember();
  const brand = await getBrand(slug);
  await db.delete(schema.brandAssets).where(and(eq(schema.brandAssets.id, id), eq(schema.brandAssets.brandId, brand.id)));
}

/** "Design an ad" from a Shoots photo: an ad with this photo opens straight in the Editor canvas. */
export async function designFromShot(slug: string, assetId: string): Promise<void> {
  const me = await requireMember();
  const brand = await getBrand(slug);
  const [a] = await db.select({ id: schema.brandAssets.id, meta: schema.brandAssets.meta }).from(schema.brandAssets).where(and(eq(schema.brandAssets.id, assetId), eq(schema.brandAssets.brandId, brand.id)));
  if (!a) return;
  // One standing batch collects ads designed from Shoots, so they're reviewed like any other.
  let [batch] = await db.select({ id: schema.adBatches.id }).from(schema.adBatches).where(and(eq(schema.adBatches.brandId, brand.id), eq(schema.adBatches.title, "Designed from Shoots"))).orderBy(desc(schema.adBatches.createdAt)).limit(1);
  if (!batch) {
    [batch] = await db.insert(schema.adBatches).values({ brandId: brand.id, title: "Designed from Shoots", brief: "Ads designed by hand in the Editor from photos made in Shoots.", audience: "Set when the test is planned", createdBy: me.id }).returning({ id: schema.adBatches.id });
  }
  const [{ max }] = (await db.execute(sql`select coalesce(max(position), -1)::int as max from ads where batch_id = ${batch.id}`)).rows as { max: number }[];
  const product = a.meta.product ?? brand.name;
  const [ad] = await db.insert(schema.ads).values({
    batchId: batch.id, brandId: brand.id, position: max + 1, format: "static", hook: product.split(/[·(]/)[0].trim().slice(0, 60), primaryText: "", headline: product.slice(0, 40),
    cta: "Shop now", offer: "No offer", product, imageUrl: `/api/assets/${a.id}`, why: "Designed by hand from a Shoots photo.",
  }).returning({ id: schema.ads.id });
  redirect(`/brands/${slug}/creative/editor?ad=${ad.id}`);
}
