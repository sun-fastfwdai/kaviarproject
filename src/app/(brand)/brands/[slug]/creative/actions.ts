"use server";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { aiReady } from "@/lib/ai/client";
import { getBrand } from "@/lib/queries/brands";
import { signalData } from "@/lib/queries/signals";
import { getNotes } from "@/lib/ai/notes";
import { buildSignals } from "@/lib/signals/build";
import { createBatch, moreVariations, redoAd } from "@/lib/creative/remy";

export type State = { error?: string; at?: number } | undefined;
const fail = (error: string): State => ({ error, at: Date.now() });

/** "Write the ads" from a signal's page — Remy writes a batch, then it opens in Creative studio. */
export async function writeAdsFromSignal(slug: string, key: string, _: State, form: FormData): Promise<State> {
  const me = await requireMember();
  if (!aiReady()) return fail("Remy needs the Claude API key to write ads.");
  const brand = await getBrand(slug);
  const [d, notes] = await Promise.all([signalData(brand.id, brand.timezone), getNotes(brand.id)]);
  const row = buildSignals(`/brands/${slug}`, brand, d, notes).find((r) => r.key === key);
  if (!row) return fail("That signal doesn’t exist.");
  const count = Number(form.get("count")) || 6;
  const id = await createBatch(brand.id, me.id, { signal: { key: row.key, data: row.data, value: row.value, use: row.use, evidence: row.evidence }, count });
  if (!id) return fail("Remy couldn’t write ads right now. Try again in a minute.");
  redirect(`/brands/${slug}/creative/${id}`);
}

/** "Start your own batch from an idea" on Creative studio. */
export async function writeAdsFromIdea(slug: string, _: State, form: FormData): Promise<State> {
  const me = await requireMember();
  if (!aiReady()) return fail("Remy needs the Claude API key to write ads.");
  const idea = String(form.get("idea") ?? "").trim().slice(0, 600);
  if (idea.length < 8) return fail("Describe the idea in a sentence.");
  const brand = await getBrand(slug);
  const id = await createBatch(brand.id, me.id, { idea, count: Number(form.get("count")) || 6 });
  if (!id) return fail("Remy couldn’t write ads right now. Try again in a minute.");
  redirect(`/brands/${slug}/creative/${id}`);
}

async function ownAd(slug: string, adId: string) {
  await requireMember();
  const brand = await getBrand(slug);
  const [ad] = await db.select({ id: schema.ads.id }).from(schema.ads).where(and(eq(schema.ads.id, adId), eq(schema.ads.brandId, brand.id)));
  if (!ad) throw new Error("Ad not found");
  return brand;
}

export async function setAdStatus(slug: string, adId: string, status: "review" | "approved" | "rejected", note?: string): Promise<void> {
  await ownAd(slug, adId);
  await db.update(schema.ads).set({ status, note: status === "rejected" ? (note?.trim().slice(0, 300) || null) : null, updatedAt: new Date() }).where(eq(schema.ads.id, adId));
}

export async function saveAd(slug: string, adId: string, fields: { hook: string; primaryText: string; headline: string; offer: string; cta: string }): Promise<State> {
  await ownAd(slug, adId);
  const clean = (s: string, n: number) => s.trim().slice(0, n);
  if (!fields.hook.trim() || !fields.headline.trim()) return fail("Hook and headline can’t be empty.");
  await db.update(schema.ads).set({
    hook: clean(fields.hook, 120), primaryText: clean(fields.primaryText, 600), headline: clean(fields.headline, 80), offer: clean(fields.offer, 120), cta: clean(fields.cta, 30),
    edited: true, updatedAt: new Date(),
  }).where(eq(schema.ads.id, adId));
  return undefined;
}

export async function redo(slug: string, adId: string): Promise<State> {
  await ownAd(slug, adId);
  return (await redoAd(adId)) ? undefined : fail("Remy couldn’t rewrite it right now.");
}

export async function variations(slug: string, adId: string): Promise<State> {
  await ownAd(slug, adId);
  return (await moreVariations(adId)) ? undefined : fail("Remy couldn’t write variations right now.");
}

export async function deleteBatch(slug: string, batchId: string): Promise<void> {
  await requireMember();
  const brand = await getBrand(slug);
  await db.delete(schema.adBatches).where(and(eq(schema.adBatches.id, batchId), eq(schema.adBatches.brandId, brand.id)));
  redirect(`/brands/${slug}/creative`);
}
