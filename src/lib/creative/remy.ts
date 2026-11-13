import "server-only";
import { z } from "zod";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { ask } from "../ai/client";

export type AdRow = typeof schema.ads.$inferSelect;
export type BatchRow = typeof schema.adBatches.$inferSelect;

const AdOut = z.object({
  format: z.enum(["static", "video", "ugc", "carousel"]),
  hook: z.string().describe("Text on the creative / first 3 seconds. Under 8 words."),
  primaryText: z.string().describe("Meta primary text. The first 125 characters must stand alone."),
  headline: z.string().describe("Under 40 characters"),
  cta: z.enum(["Shop now", "Learn more", "Get offer", "Order now", "See more"]),
  offer: z.string().describe("'No offer' unless the brand's data shows a discount code it already uses"),
  product: z.string().describe("Exact product title from the catalog list, or empty"),
  why: z.string().describe("Why this ad, under 14 words, citing the data"),
});
const BatchOut = z.object({
  title: z.string().describe("e.g. 'Win-back · lapsed buyers'"),
  brief: z.string().describe("The plan in 1–2 sentences: who, what to open with, length, what to test"),
  audience: z.string().describe("Who sees it, in Meta terms"),
  ads: z.array(AdOut).describe("Distinct hooks and formats"),
});

const REMY = `You are Remy, Kaviar's creative agent. You write Meta ads for a brand from one signal in its own Shopify data.
Rules: use the real numbers and product names given; write in the brand's voice when a profile is given; no medical, cure or guaranteed-result claims; no "best-selling" unless the data shows it;
never invent a discount — only use a code the data shows the brand already uses; every ad needs a different hook; pick products only from the catalog list (exact titles).`;

async function brandContext(brandId: string) {
  const [b] = await db.select({ name: schema.brands.name, category: schema.brands.category, website: schema.brands.website, currency: schema.brands.currency, onboarding: schema.brands.onboarding })
    .from(schema.brands).where(eq(schema.brands.id, brandId));
  const products = (await db.execute(sql`
    select p.title, p.image_url as "imageUrl", (select min(v.price) from shop_variants v where v.brand_id = p.brand_id and v.product_id = p.id)::float8 as "price"
    from shop_products p where p.brand_id = ${brandId} and coalesce(p.status, 'ACTIVE') = 'ACTIVE' and p.image_url is not null
    order by p.total_inventory desc nulls last limit 40`)).rows as { title: string; imageUrl: string; price: number | null }[];
  const rejected = (await db.execute(sql`select hook, note from ads where brand_id = ${brandId} and status = 'rejected' and note is not null order by updated_at desc limit 8`)).rows as { hook: string; note: string }[];
  // What Iris learned from live ads and past reviews — Remy follows it in every new batch.
  const [n] = (await db.execute(sql`select body from agent_notes where brand_id = ${brandId} and key = 'insights'`)).rows as { body: { lessons?: { dimension: string; lesson: string; strength: string }[] } }[];
  const lessons = (n?.body.lessons ?? []).filter((l) => l.strength !== "Weak").map((l) => `${l.dimension}: ${l.lesson}`);
  const profile = b.onboarding?.profile ? Object.fromEntries(Object.entries(b.onboarding.profile).map(([k, v]) => [k, v.value])) : null;
  return { brand: { name: b.name, category: b.category, website: b.website, currency: b.currency, profile }, products, rejected, lessons };
}

const imageFor = (products: { title: string; imageUrl: string }[], title: string, i: number) =>
  products.find((p) => p.title.toLowerCase() === title.toLowerCase())?.imageUrl ?? products.find((p) => title && p.title.toLowerCase().includes(title.toLowerCase().slice(0, 12)))?.imageUrl ?? products[i % Math.max(1, products.length)]?.imageUrl ?? null;

/** Remy writes a batch of ads. Returns the new batch id, or null if the model couldn't. */
export async function createBatch(brandId: string, memberId: string, input: { signal?: { key: string; data: string; value: string | null; use: string; evidence: [string, string][] }; idea?: string; count?: number }): Promise<string | null> {
  const ctx = await brandContext(brandId);
  const count = Math.min(9, Math.max(3, input.count ?? 6));
  const out = await ask("remy", {
    system: REMY,
    content: JSON.stringify({
      brand: ctx.brand,
      catalog: ctx.products.map((p) => ({ title: p.title, price: p.price })),
      ...(input.signal ? { signal: input.signal } : { idea: input.idea }),
      write: `${count} ads`,
      lessonsFromRejectedAds: ctx.rejected,
      whatWinsForThisBrand: ctx.lessons,
    }),
    schema: BatchOut,
    maxTokens: 8000,
  });
  if (!out?.ads.length) return null;
  const [batch] = await db.insert(schema.adBatches).values({
    brandId, signal: input.signal?.key ?? null, title: out.title, brief: out.brief, audience: out.audience,
    evidence: input.signal?.evidence ?? [], createdBy: memberId,
  }).returning({ id: schema.adBatches.id });
  await db.insert(schema.ads).values(out.ads.slice(0, count).map((a, i) => ({
    batchId: batch.id, brandId, position: i, format: a.format, hook: a.hook, primaryText: a.primaryText, headline: a.headline,
    cta: a.cta, offer: a.offer, product: a.product || null, imageUrl: imageFor(ctx.products, a.product, i), why: a.why,
  })));
  return batch.id;
}

/** Rewrite one ad (Redo), learning from the rejection note if there is one. */
export async function redoAd(adId: string): Promise<boolean> {
  const [ad] = await db.select().from(schema.ads).where(eq(schema.ads.id, adId));
  if (!ad) return false;
  const [batch] = await db.select().from(schema.adBatches).where(eq(schema.adBatches.id, ad.batchId));
  const ctx = await brandContext(ad.brandId);
  const out = await ask("remy", {
    system: REMY,
    content: JSON.stringify({ brand: ctx.brand, catalog: ctx.products.map((p) => p.title), batch: { title: batch.title, brief: batch.brief, audience: batch.audience, evidence: batch.evidence },
      rewriteThisAd: { hook: ad.hook, primaryText: ad.primaryText, headline: ad.headline, format: ad.format }, feedback: ad.note ?? "Make it stronger and different." }),
    schema: AdOut,
  });
  if (!out) return false;
  await db.update(schema.ads).set({ ...out, product: out.product || null, imageUrl: imageFor(ctx.products, out.product, ad.position) ?? ad.imageUrl, status: "review", edited: false, note: null, updatedAt: new Date() }).where(eq(schema.ads.id, adId));
  return true;
}

/** Three more ads in the spirit of one that works. */
export async function moreVariations(adId: string): Promise<number> {
  const [ad] = await db.select().from(schema.ads).where(eq(schema.ads.id, adId));
  if (!ad) return 0;
  const [batch] = await db.select().from(schema.adBatches).where(eq(schema.adBatches.id, ad.batchId));
  const ctx = await brandContext(ad.brandId);
  const out = await ask("remy", {
    system: REMY,
    content: JSON.stringify({ brand: ctx.brand, catalog: ctx.products.map((p) => p.title), batch: { brief: batch.brief, audience: batch.audience, evidence: batch.evidence },
      variationsOf: { hook: ad.hook, primaryText: ad.primaryText, headline: ad.headline, format: ad.format }, write: "3 variations with new hooks" }),
    schema: z.object({ ads: z.array(AdOut) }),
  });
  if (!out?.ads.length) return 0;
  const [{ max }] = (await db.execute(sql`select coalesce(max(position), 0)::int as max from ads where batch_id = ${ad.batchId}`)).rows as { max: number }[];
  await db.insert(schema.ads).values(out.ads.slice(0, 3).map((a, i) => ({
    batchId: ad.batchId, brandId: ad.brandId, position: max + 1 + i, format: a.format, hook: a.hook, primaryText: a.primaryText, headline: a.headline,
    cta: a.cta, offer: a.offer, product: a.product || null, imageUrl: imageFor(ctx.products, a.product, i) ?? ad.imageUrl, why: a.why,
  })));
  return out.ads.length;
}

export async function batchWithAds(batchId: string, brandId: string) {
  const [batch] = await db.select().from(schema.adBatches).where(and(eq(schema.adBatches.id, batchId), eq(schema.adBatches.brandId, brandId)));
  if (!batch) return null;
  const list = await db.select().from(schema.ads).where(eq(schema.ads.batchId, batchId)).orderBy(asc(schema.ads.position));
  return { batch, ads: list };
}

export async function brandCodes(brandId: string): Promise<string[]> {
  const r = (await db.execute(sql`select distinct upper(c) as c from shop_orders o, unnest(o.discount_codes) c where o.brand_id = ${brandId} and o.created_at > now() - interval '180 days' limit 20`)).rows as { c: string }[];
  return r.map((x) => x.c);
}
