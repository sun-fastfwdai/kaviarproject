"use server";
import { redirect } from "next/navigation";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { aiReady } from "@/lib/ai/client";
import { getBrand } from "@/lib/queries/brands";
import { checkShot, describeReference, editShot, EDITS, finishVideoJob, makeCharacter, shoot, shootVideo, startVideoJob, suggestCharacter, wavSeconds, writeShotPrompt, type VideoJob, type EditKind, type PromptIn, type PromptOut, type ShotCheck } from "@/lib/creative/shoots";
import type { ShootFlow } from "@/lib/db/schema";
import { hfReady } from "@/lib/creative/higgsfield";

/** Remy writes the prompt from the flow's inputs, phrase by phrase. */
export async function suggestPrompt(slug: string, input: PromptIn): Promise<{ out?: PromptOut; error?: string }> {
  await requireMember();
  if (!aiReady()) return { error: "Remy needs the Claude API key." };
  const brand = await getBrand(slug);
  const out = await writeShotPrompt(brand.id, input);
  return out ? { out } : { error: "Remy couldn’t write a prompt right now." };
}

/** Save the flow for the whole team (the canvas calls this a moment after each change). */
export async function saveFlow(slug: string, flow: ShootFlow): Promise<{ at: string }> {
  const me = await requireMember();
  const brand = await getBrand(slug);
  const TYPES = ["product", "data", "brand", "wins", "reference", "prompt", "photo", "video", "sound", "check", "send"];
  const nodes = (Array.isArray(flow.nodes) ? flow.nodes : []).filter((n) => n && TYPES.includes(n.type) && typeof n.id === "string").slice(0, 40).map((n) => ({
    id: n.id.slice(0, 40), type: n.type, x: Math.round(Number(n.x) || 0), y: Math.round(Number(n.y) || 0),
    cfg: { ...n.cfg, ...(n.cfg?.prompt ? { prompt: n.cfg.prompt.slice(0, 2000) } : {}), ...(n.cfg?.rules ? { rules: n.cfg.rules.slice(0, 8) } : {}), ...(n.cfg?.brandRules ? { brandRules: n.cfg.brandRules.slice(0, 8) } : {}),
      ...(n.cfg?.n != null ? { n: Math.min(n.type === "video" ? 3 : 4, Math.max(1, Number(n.cfg.n) || 1)) } : {}), ...(n.cfg?.out ? { out: n.cfg.out.slice(0, 12) } : {}) },
  }));
  const ids = new Set(nodes.map((n) => n.id));
  const edges = (Array.isArray(flow.edges) ? flow.edges : []).filter((e) => e && ids.has(e.from) && ids.has(e.to)).slice(0, 80);
  const clean: ShootFlow = { v: 2, nodes, edges, last: flow.last ?? null };
  const at = new Date();
  await db.insert(schema.shootFlows).values({ brandId: brand.id, flow: clean, updatedBy: me.id, updatedAt: at })
    .onConflictDoUpdate({ target: schema.shootFlows.brandId, set: { flow: clean, updatedBy: me.id, updatedAt: at } });
  return { at: at.toISOString() };
}

/** Reference node: Remy reads a brand photo for its style, pose and composition. */
export async function readReference(slug: string, assetId: string): Promise<{ note?: string; error?: string }> {
  await requireMember();
  if (!aiReady()) return { error: "Remy needs the Claude API key." };
  const brand = await getBrand(slug);
  const note = await describeReference(brand.id, assetId);
  return note ? { note } : { error: "Remy couldn’t read that photo." };
}

/** Edit nodes: remove the background, extend to 9:16, relight. */
export async function runEdit(slug: string, assetId: string, kind: EditKind): Promise<{ id?: string; error?: string }> {
  const me = await requireMember();
  const brand = await getBrand(slug);
  if (!(kind in EDITS)) return { error: "Unknown edit." };
  return editShot(brand.id, me.id, assetId, kind);
}

export async function runShoot(slug: string, input: { product: string; imageUrl: string; prompt: string; aspect: "4:5" | "9:16" | "1:1"; n: number; referenceId?: string | null; characterId?: string | null }): Promise<{ ids?: string[]; error?: string }> {
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

/** A clip: on Higgsfield it starts in the background and returns a job the canvas polls; on AI Gateway it waits for the clip. */
export async function runVideo(slug: string, input: { fromAssetId: string; prompt: string; seconds: number; aspect: "9:16" | "1:1" | "4:5"; sound?: string | null; voiceId?: string | null; res?: "480p" | "720p" | "1080p"; characterId?: string | null }): Promise<{ id?: string; job?: VideoJob; error?: string }> {
  const me = await requireMember();
  const brand = await getBrand(slug);
  const clean = { ...input, seconds: Math.min(15, Math.max(4, Math.round(input.seconds))), sound: input.sound?.slice(0, 400) ?? undefined };
  if (hfReady()) return startVideoJob(brand.id, clean);
  return shootVideo(brand.id, me.id, clean);
}

/** The canvas asks every few seconds how a clip job is doing; the finished clip is saved here. */
export async function pollVideo(slug: string, job: VideoJob): Promise<{ id?: string; state?: string; error?: string }> {
  const me = await requireMember();
  const brand = await getBrand(slug);
  if (!job?.id || !/^[\w-]{8,64}$/.test(job.id)) return { error: "Unknown job." };
  return finishVideoJob(brand.id, me.id, job);
}

/** Send photos to a batch (they become its ads' photos, in order) or keep them in brand assets. */
export async function sendShots(slug: string, ids: string[], batchId: string | null): Promise<{ done?: number; firstAd?: string; error?: string }> {
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
  return { done, firstAd: list[0]?.id };
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
  // Opening the same photo again goes back to the ad already designed from it.
  const [had] = await db.select({ id: schema.ads.id }).from(schema.ads).where(and(eq(schema.ads.batchId, batch.id), eq(schema.ads.imageUrl, `/api/assets/${a.id}`))).limit(1);
  if (had) redirect(`/brands/${slug}/creative/editor?ad=${had.id}`);
  const [{ max }] = (await db.execute(sql`select coalesce(max(position), -1)::int as max from ads where batch_id = ${batch.id}`)).rows as { max: number }[];
  const product = a.meta.product ?? brand.name;
  const [ad] = await db.insert(schema.ads).values({
    batchId: batch.id, brandId: brand.id, position: max + 1, format: "static", hook: product.split(/[·(]/)[0].trim().slice(0, 60), primaryText: "", headline: product.slice(0, 40),
    cta: "Shop now", offer: "No offer", product, imageUrl: `/api/assets/${a.id}`, why: "Designed by hand from a Shoots photo.",
  }).returning({ id: schema.ads.id });
  redirect(`/brands/${slug}/creative/editor?ad=${ad.id}`);
}

/** Save a brand voice (a 2–15 s WAV the canvas recorded or converted). Only with the speaker's permission — the team confirms it. */
export async function saveVoice(slug: string, form: FormData): Promise<{ id?: string; error?: string }> {
  const me = await requireMember();
  const brand = await getBrand(slug);
  const file = form.get("file"), name = String(form.get("name") ?? "").trim().slice(0, 40);
  if (form.get("consent") !== "yes") return { error: "Confirm you have the speaker’s permission first." };
  if (!(file instanceof File) || file.size > 4_000_000) return { error: "Add a voice sample under 4 MB." };
  const data = Buffer.from(await file.arrayBuffer());
  const secs = wavSeconds(data);
  if (secs == null) return { error: "That isn’t a WAV recording." };
  if (secs < 2 || secs > 15.5) return { error: "Keep the sample between 2 and 15 seconds." };
  const [row] = await db.insert(schema.brandAssets).values({
    brandId: brand.id, kind: "voice", name: name || "Brand voice", mime: "audio/wav", size: data.byteLength, data,
    meta: { seconds: Math.round(secs * 10) / 10, consent: { by: me.name, at: new Date().toISOString() } }, createdBy: me.id,
  }).returning({ id: schema.brandAssets.id });
  return { id: row.id };
}

export async function deleteVoice(slug: string, id: string): Promise<void> {
  await requireMember();
  const brand = await getBrand(slug);
  await db.delete(schema.brandAssets).where(and(eq(schema.brandAssets.id, id), eq(schema.brandAssets.brandId, brand.id), eq(schema.brandAssets.kind, "voice")));
}

/** Product search for the Product node: any active product with a Shopify photo, by title. */
export async function searchProducts(slug: string, q: string): Promise<{ title: string; url: string; price: number | null; stock: number | null }[]> {
  await requireMember();
  const brand = await getBrand(slug);
  const term = `%${q.trim().slice(0, 80).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return (await db.execute(sql`select p.title, p.image_url as url, p.total_inventory as stock,
      (select min(v.price) from shop_variants v where v.brand_id = p.brand_id and v.product_id = p.id)::float8 as price
    from shop_products p where p.brand_id = ${brand.id} and p.image_url is not null and coalesce(p.status, 'ACTIVE') = 'ACTIVE' and p.title ilike ${term}
    order by p.total_inventory desc nulls last limit 30`)).rows as { title: string; url: string; price: number | null; stock: number | null }[];
}

/** Character node: make a character sheet from a casting note. */
export async function createCharacter(slug: string, input: { name: string; description: string }): Promise<{ id?: string; error?: string }> {
  const me = await requireMember();
  const brand = await getBrand(slug);
  if (input.description.trim().length < 12) return { error: "Describe the person in a sentence — age, look, style." };
  return makeCharacter(brand.id, me.id, { name: input.name.trim(), description: input.description.trim() });
}

export async function suggestCasting(slug: string, input: { signal?: string | null; product?: string | null }): Promise<{ name?: string; description?: string; error?: string }> {
  await requireMember();
  if (!aiReady()) return { error: "Remy needs the Claude API key." };
  const brand = await getBrand(slug);
  const r = await suggestCharacter(brand.id, input);
  return r ?? { error: "Remy couldn’t suggest anyone right now." };
}

/** A real creator or model: their photo becomes the character — only with their permission, which the team confirms. */
export async function uploadCharacter(slug: string, form: FormData): Promise<{ id?: string; error?: string }> {
  const me = await requireMember();
  const brand = await getBrand(slug);
  const file = form.get("file"), name = String(form.get("name") ?? "").trim().slice(0, 40), note = String(form.get("note") ?? "").trim().slice(0, 300);
  if (form.get("consent") !== "yes") return { error: "Confirm you have this person’s permission first." };
  if (!(file instanceof File) || !/^image\/(png|jpe?g|webp)$/.test(file.type) || file.size > 4_000_000) return { error: "Add a JPG, PNG or WebP photo under 4 MB." };
  const data = Buffer.from(await file.arrayBuffer());
  const [row] = await db.insert(schema.brandAssets).values({
    brandId: brand.id, kind: "character", name: name || "Creator", mime: file.type, size: data.byteLength, data,
    meta: { character: { description: note || "A real creator (from their photo)", uploaded: true }, consent: { by: me.name, at: new Date().toISOString() } }, createdBy: me.id,
  }).returning({ id: schema.brandAssets.id });
  return { id: row.id };
}

export async function deleteCharacter(slug: string, id: string): Promise<void> {
  await requireMember();
  const brand = await getBrand(slug);
  await db.delete(schema.brandAssets).where(and(eq(schema.brandAssets.id, id), eq(schema.brandAssets.brandId, brand.id), eq(schema.brandAssets.kind, "character")));
}
