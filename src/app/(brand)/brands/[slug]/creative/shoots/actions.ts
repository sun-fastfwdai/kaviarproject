"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { aiReady } from "@/lib/ai/client";
import { getBrand } from "@/lib/queries/brands";
import { checkShot, describeReference, editShot, EDITS, finishVideoJob, makeCharacter, presetShoot, shoot, shootVideo, startVideoJob, suggestCharacter, wavSeconds, writeShotList, writeShotPrompt, type VideoJob, type EditKind, type PromptIn, type PromptOut, type ShotCheck } from "@/lib/creative/shoots";
import type { AdPlan, ShootFlow, ShotPlan, Story } from "@/lib/db/schema";
import { cleanPlan, planAds } from "@/lib/creative/adplan";
import { STYLE } from "@/lib/creative/director";
import { writeStoryboard } from "@/lib/creative/storyboard";
import { cutAd } from "@/lib/creative/cut";
import { keyframePrompt, LENGTHS } from "@/lib/creative/story";
import { hfPresets, hfReady, imageSize, type HfPreset } from "@/lib/creative/higgsfield";
import { storeImages } from "@/lib/shopify/media";
import { deleteAssets, saveAsset } from "@/lib/assets/storage";
import { layoutBatch } from "@/lib/creative/design";
import { adLook } from "@/lib/creative/layouts";

/** A picture's width and height, in the words an asset keeps them in. */
const dims = (b: Buffer) => { const z = imageSize(b); return z ? { width: z.w, height: z.h } : {}; };

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
  const TYPES = ["product", "character", "data", "brand", "wins", "reference", "prompt", "story", "photo", "video", "sound", "cut", "check", "send"];
  const nodes = (Array.isArray(flow.nodes) ? flow.nodes : []).filter((n) => n && TYPES.includes(n.type) && typeof n.id === "string").slice(0, 40).map((n) => ({
    id: n.id.slice(0, 40), type: n.type, x: Math.round(Number(n.x) || 0), y: Math.round(Number(n.y) || 0),
    cfg: { ...n.cfg, ...(n.cfg?.prompt ? { prompt: n.cfg.prompt.slice(0, 2000) } : {}), ...(n.cfg?.rules ? { rules: n.cfg.rules.slice(0, 8) } : {}), ...(n.cfg?.brandRules ? { brandRules: n.cfg.brandRules.slice(0, 8) } : {}),
      ...(n.cfg?.n != null ? { n: Math.min(n.type === "video" ? 3 : 8, Math.max(1, Number(n.cfg.n) || 1)) } : {}), ...(n.cfg?.out ? { out: n.cfg.out.slice(0, 12) } : {}),
      ...(n.cfg?.creative ? { creative: cleanPlan(n.cfg.creative) } : {}), ...(n.cfg?.templates ? { templates: n.cfg.templates.filter((v) => /^[0-9a-f-]{36}$/i.test(String(v))).slice(0, 4) } : {}),
      ...(n.cfg?.hfPreset !== undefined ? { hfPreset: n.cfg.hfPreset && /^[0-9a-f-]{36}$/i.test(String(n.cfg.hfPreset.id)) ? { id: String(n.cfg.hfPreset.id), name: String(n.cfg.hfPreset.name ?? "Preset").slice(0, 80), cover: typeof n.cfg.hfPreset.cover === "string" && /^https:\/\//.test(n.cfg.hfPreset.cover) ? n.cfg.hfPreset.cover.slice(0, 500) : null } : null } : {}),
      ...(n.cfg?.storyboard ? { storyboard: { ...n.cfg.storyboard, scenes: (n.cfg.storyboard.scenes ?? []).slice(0, 10).map((x) => ({ ...x, keyframe: String(x.keyframe ?? "").slice(0, 900), motion: String(x.motion ?? "").slice(0, 400), line: String(x.line ?? "").slice(0, 200), caption: String(x.caption ?? "").slice(0, 60) })) } } : {}),
      ...(n.cfg?.plan ? { plan: { ...n.cfg.plan, why: String(n.cfg.plan.why ?? "").slice(0, 240), shots: (n.cfg.plan.shots ?? []).slice(0, 8).map((x) => ({ ...x, action: String(x.action ?? "").slice(0, 300), line: String(x.line ?? "").slice(0, 140) })) } } : {}) },
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

/** Reference node: a photo of the brand's own, uploaded where it is needed. It joins Brand assets and can be picked from then on. */
export async function uploadReference(slug: string, form: FormData): Promise<{ id?: string; name?: string; error?: string }> {
  const me = await requireMember();
  const brand = await getBrand(slug), file = form.get("file");
  if (!(file instanceof File) || !/^image\/(png|jpe?g|webp)$/.test(file.type) || file.size > 4_000_000) return { error: "Add a JPG, PNG or WebP photo under 4 MB." };
  const data = Buffer.from(await file.arrayBuffer()), name = file.name.slice(0, 120);
  const [row] = await saveAsset({ brandId: brand.id, kind: "imagery", name, mime: file.type, size: data.byteLength, data, meta: { ...dims(data) }, createdBy: me.id });
  return { id: row.id, name };
}
/** Reference node: one of the store's own product photos. It is copied into Brand assets once, so Remy can read it like any other. */
export async function storeReference(slug: string, url: string): Promise<{ id?: string; name?: string; error?: string }> {
  const me = await requireMember();
  const brand = await getBrand(slug), A = schema.brandAssets;
  const pic = (await storeImages(brand.id).catch(() => [])).find((x) => x.url === url);
  if (!pic) return { error: "That photo is no longer on the store." };
  const name = (pic.alt?.trim() || pic.product).slice(0, 120);
  const [had] = await db.select({ id: A.id }).from(A).where(and(eq(A.brandId, brand.id), sql`${A.meta}->>'from' = ${url}`)).limit(1);
  if (had) return { id: had.id, name };
  const r = await fetch(url, { cache: "no-store" }), mime = (r.headers.get("content-type") ?? "").split(";")[0];
  if (!r.ok || !/^image\/(png|jpe?g|webp)$/.test(mime)) return { error: "That photo couldn’t be read from the store." };
  const data = Buffer.from(await r.arrayBuffer());
  if (!data.byteLength || data.byteLength > 12_000_000) return { error: "That photo is too large to use as a reference." };
  const [row] = await saveAsset({ brandId: brand.id, kind: "imagery", name, mime, size: data.byteLength, data, meta: { ...dims(data), product: pic.product, from: url }, createdBy: me.id });
  return { id: row.id, name };
}

/** Edit nodes: remove the background, extend to 9:16, relight. */
export async function runEdit(slug: string, assetId: string, kind: EditKind): Promise<{ id?: string; error?: string }> {
  const me = await requireMember();
  const brand = await getBrand(slug);
  if (!(kind in EDITS)) return { error: "Unknown edit." };
  return editShot(brand.id, me.id, assetId, kind);
}

/** The creative plan for a set of finished ads: Iris reads the pack and the research and picks each ad's idea, Remy art-directs and writes it. */
export async function planCreative(slug: string, input: { product: string; imageUrl: string; n: number; forBatch?: string | null; look?: string | null; person?: boolean; templates?: string[] }): Promise<{ plan?: AdPlan; error?: string }> {
  await requireMember();
  if (!aiReady()) return { error: "Iris and Remy need the Claude API key." };
  const brand = await getBrand(slug);
  if (!/^https:\/\//.test(input.imageUrl)) return { error: "Pick a product photo." };
  const plan = await planAds(brand.id, { product: String(input.product).slice(0, 200), imageUrl: input.imageUrl, n: Math.min(8, Math.max(1, Math.round(Number(input.n) || 1))), forBatch: input.forBatch ?? null, look: input.look ? String(input.look).slice(0, 60) : null, person: Boolean(input.person),
    templates: (Array.isArray(input.templates) ? input.templates : []).filter((v) => typeof v === "string").slice(0, 4) });
  return plan.concepts.length ? { plan } : { error: "The plan didn’t come back — try again." };
}

/**
 * Import ad templates: finished ads (the brand's own best ones, or any it wants its ads to be built like) kept in Brand assets.
 * A template lends its layout and type to an ad — never its words, brand or product.
 */
export async function importTemplates(slug: string, form: FormData): Promise<{ added?: { id: string; name: string }[]; error?: string }> {
  const me = await requireMember();
  const brand = await getBrand(slug);
  const files = form.getAll("file").filter((f): f is File => f instanceof File).slice(0, 8);
  const good = files.filter((f) => /^image\/(png|jpe?g|webp)$/.test(f.type) && f.size > 0 && f.size <= 4_000_000);
  if (!good.length) return { error: "Add JPG, PNG or WebP pictures under 4 MB each." };
  const added: { id: string; name: string }[] = [];
  for (const f of good) {
    const data = Buffer.from(await f.arrayBuffer()), name = f.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 120) || "Template";
    const [row] = await saveAsset({ brandId: brand.id, kind: "imagery", name, mime: f.type === "image/jpg" ? "image/jpeg" : f.type, size: data.byteLength, data, meta: { ...dims(data), template: true }, createdBy: me.id });
    added.push({ id: row.id, name });
  }
  return { added, ...(good.length < files.length ? { error: `${files.length - good.length} skipped — JPG, PNG or WebP under 4 MB only.` } : {}) };
}

/** `ads` = the plan on the canvas and which of its concepts to render (at most four a call; `revise` = what Otto sent one back for). */
export async function runShoot(slug: string, input: { product: string; imageUrl: string; prompt: string; aspect: "4:5" | "9:16" | "1:1"; n: number; referenceId?: string | null; characterId?: string | null; model?: string | null; forBatch?: string | null;
  ads?: { plan: AdPlan; items: { i: number; revise?: string[] }[] } | null }): Promise<{ ids?: string[]; made?: { id: string; i: number }[]; error?: string }> {
  const me = await requireMember();
  const brand = await getBrand(slug);
  const plan = input.ads ? cleanPlan(input.ads.plan) : null;
  if (!plan && input.prompt.trim().length < 10) return { error: "Describe the scene first." };
  if (!/^https:\/\//.test(input.imageUrl)) return { error: "Pick a product photo." };
  const items = plan ? (input.ads?.items ?? []).filter((x) => Number.isInteger(x?.i) && plan.concepts[x.i]).slice(0, 4).map((x) => ({ i: x.i, ...(Array.isArray(x.revise) && x.revise.length ? { revise: x.revise.slice(0, 4).map((v) => String(v).slice(0, 220)) } : {}) })) : [];
  if (plan && !items.length) return { error: "Nothing to render — plan the ads first." };
  const r = await shoot(brand.id, me.id, { ...input, prompt: input.prompt.slice(0, 4400), ads: plan ? { plan, items } : null });
  return r.ids.length ? { ids: r.ids, made: r.made, ...(r.error ? { error: `Some images failed: ${r.error}` } : {}) } : { error: r.error ?? "No image came back." };
}

/** Higgsfield's Marketing Studio presets, for the preset picker (cover, name, group). */
export async function listPresets(slug: string): Promise<{ presets?: HfPreset[]; error?: string }> {
  await requireMember();
  await getBrand(slug);
  if (!hfReady()) return { error: "Presets come from Higgsfield — it’s set up on the deployed app." };
  try {
    const presets = await hfPresets();
    return presets.length ? { presets } : { error: "Higgsfield returned no presets for this account." };
  } catch (e) { return { error: (e as Error).message.slice(0, 160) }; }
}

/** Pictures in one of Higgsfield's presets, from the product photo (and the person, when a Character is wired in). */
export async function runPreset(slug: string, input: { product: string; imageUrl: string; presetId: string; aspect: "4:5" | "9:16" | "1:1"; n: number; characterId?: string | null; model?: string | null }): Promise<{ ids?: string[]; error?: string }> {
  const me = await requireMember();
  const brand = await getBrand(slug);
  if (!/^https:\/\//.test(input.imageUrl)) return { error: "Pick a product photo." };
  if (!/^[0-9a-f-]{36}$/i.test(String(input.presetId))) return { error: "Pick a preset." };
  const aspect = (["4:5", "9:16", "1:1"] as const).find((x) => x === input.aspect) ?? "4:5";
  const r = await presetShoot(brand.id, me.id, { product: String(input.product).slice(0, 200), imageUrl: input.imageUrl, presetId: input.presetId, aspect, n: Math.min(4, Math.max(1, Math.round(Number(input.n) || 1))), characterId: input.characterId ?? null, model: input.model ?? null });
  return r.ids.length ? { ids: r.ids, ...(r.error ? { error: `Some pictures failed: ${r.error}` } : {}) } : { error: r.error ?? "No picture came back." };
}

export async function runCheck(slug: string, assetId: string, referenceUrl: string, product: string): Promise<{ check?: ShotCheck; error?: string }> {
  await requireMember();
  const brand = await getBrand(slug);
  const check = await checkShot(brand.id, assetId, referenceUrl, product);
  return check ? { check } : { error: "Otto couldn’t check it." };
}

/** A clip: on Higgsfield it starts in the background and returns a job the canvas polls; on AI Gateway it waits for the clip. */
export async function runVideo(slug: string, input: { fromAssetId: string; prompt: string; seconds: number; aspect: "9:16" | "1:1" | "4:5"; sound?: string | null; voiceId?: string | null; res?: "480p" | "720p" | "1080p"; characterId?: string | null; scene?: string | null; model?: string | null }): Promise<{ id?: string; job?: VideoJob; error?: string }> {
  const me = await requireMember();
  const brand = await getBrand(slug);
  const clean = { ...input, seconds: Math.min(hfReady() ? 30 : 10, Math.max(4, Math.round(input.seconds))), sound: input.sound?.slice(0, 400) ?? undefined };
  if (hfReady()) return startVideoJob(brand.id, clean);
  return shootVideo(brand.id, me.id, clean);
}

/** Remy plans the clip like a director: one shot list (size, angle, camera move, action, lines) for the Video node. */
export async function planShots(slug: string, input: { style: string; seconds: number; count: number | null; frame: string; product: string; scene: string; character: { name: string; description: string } | null; voice: string }): Promise<{ plan?: ShotPlan; error?: string }> {
  await requireMember();
  if (!aiReady()) return { error: "Remy needs the Claude API key." };
  if (!STYLE[input.style]) return { error: "Pick a shooting style." };
  const brand = await getBrand(slug);
  const plan = await writeShotList(brand.id, {
    style: input.style, seconds: Math.min(30, Math.max(4, Math.round(Number(input.seconds) || 5))), count: input.count ? Math.min(8, Math.max(1, Math.round(input.count))) : null,
    frame: String(input.frame ?? "").slice(0, 900), product: String(input.product ?? "").slice(0, 120), scene: String(input.scene ?? "").slice(0, 60),
    character: input.character ? { name: String(input.character.name).slice(0, 40), description: String(input.character.description).slice(0, 600) } : null, voice: String(input.voice ?? "").slice(0, 140),
  });
  return plan ? { plan } : { error: "Remy couldn’t plan the shots — try again." };
}

/** The canvas asks every few seconds how a clip job is doing; the finished clip is saved here. */
export async function pollVideo(slug: string, job: VideoJob): Promise<{ id?: string; state?: string; error?: string }> {
  const me = await requireMember();
  const brand = await getBrand(slug);
  if (!job?.id || !/^[\w-]{8,64}$/.test(job.id)) return { error: "Unknown job." };
  return finishVideoJob(brand.id, me.id, job);
}

/** Send photos to a batch (they become its ads' photos, in order) or keep them in brand assets. */
export async function sendShots(slug: string, ids: string[], batchId: string | null, clipIds: string[] = [], look: string | null = null): Promise<{ done?: number; firstAd?: string; cards?: number; error?: string }> {
  const me = await requireMember();
  const brand = await getBrand(slug);
  const A = schema.brandAssets;
  const mine = await db.select({ id: A.id, mime: A.mime, finished: sql<boolean>`coalesce((${A.meta}->>'finished')::boolean, false)`, ad: sql<string | null>`${A.meta}->>'ad'` }).from(A).where(and(eq(A.brandId, brand.id), inArray(A.id, [...ids, ...clipIds].slice(0, 40))));
  const photos = ids.filter((id) => mine.some((m) => m.id === id && m.mime.startsWith("image/")));
  const clips = clipIds.filter((id) => mine.some((m) => m.id === id && m.mime.startsWith("video/")));
  if (!batchId) return { done: photos.length + clips.length };
  const list = await db.select({ id: schema.ads.id, format: schema.ads.format }).from(schema.ads).where(and(eq(schema.ads.batchId, batchId), eq(schema.ads.brandId, brand.id), sql`${schema.ads.status} <> 'rejected'`)).orderBy(asc(schema.ads.position));
  if (!list.length) return { error: "That batch has no ads to fill." };
  const videoAds = list.filter((a) => a.format === "video" || a.format === "ugc");
  // Clips go to the video ads; photos to the rest (to every ad when there are no clips). With fewer photos than ads the photos repeat —
  // a message test keeps the picture and changes the words.
  const stills = clips.length ? list.filter((a) => !videoAds.includes(a)) : list;
  let done = 0;
  for (const [i, a] of (clips.length ? videoAds : []).entries()) {
    const clip = clips[i % clips.length];
    await db.update(schema.ads).set({ imageUrl: `/api/assets/${clip}?w=480`, design: { image: null, overlay: 0, layers: [], video: `/api/assets/${clip}` }, updatedAt: new Date() }).where(eq(schema.ads.id, a.id));
    done++;
  }
  // A finished ad (made with its words designed in) is the ad's picture as it is; a photo gets the ad's words set on it.
  // One made for a particular ad of this campaign (it carries that ad's headline) goes to that ad and no other; the rest fill in order.
  const toDesign: string[] = [];
  const own = new Map(photos.flatMap((id) => { const ad = mine.find((m) => m.id === id)?.ad; return ad && stills.some((a) => a.id === ad) ? [[ad, id] as const] : []; }));
  const free = photos.filter((id) => ![...own.values()].includes(id));
  if (photos.length) for (const [i, a] of stills.entries()) {
    const photo = own.get(a.id) ?? (own.size ? free.shift() : photos[i % photos.length]);
    if (!photo) continue;
    await db.update(schema.ads).set({ imageUrl: `/api/assets/${photo}`, design: null, updatedAt: new Date() }).where(eq(schema.ads.id, a.id));
    if (!mine.find((m) => m.id === photo)?.finished) toDesign.push(a.id);
    done++;
  }
  if (!done) return { error: "Nothing to send yet — run the flow first." };
  // Static ads become cards: Remy writes the words for each picture and lays them out, ready to refine in the Editor.
  // Shot for a campaign's ads: the pictures and their cards are that campaign's own, so its page shows them (a picture made by the
  // studio is otherwise kept off a campaign in favour of the store's product photo).
  const [of] = await db.select({ signal: schema.adBatches.signal }).from(schema.adBatches).where(and(eq(schema.adBatches.id, batchId), eq(schema.adBatches.brandId, brand.id)));
  const plan = of?.signal ?? undefined;
  if (plan && photos.length) await db.update(A).set({ meta: sql`${A.meta} || ${JSON.stringify({ plan })}::jsonb` }).where(and(eq(A.brandId, brand.id), inArray(A.id, photos)));
  const cards = toDesign.length && aiReady() ? (await layoutBatch(brand.id, batchId, me.id, toDesign.length < stills.length ? toDesign : undefined, undefined, adLook(look ?? "")?.layout, adLook(look ?? "")?.name, { plan }).catch(() => ({ made: 0 }))).made : 0;
  if (plan) revalidatePath(`/brands/${slug}/campaigns`, "layout");
  return { done, cards, firstAd: list[0].id };
}

/** Keep a picture the brand already has as an ad template (or stop using it as one). The picture itself is untouched. */
export async function keepTemplate(slug: string, id: string, on: boolean): Promise<{ ok?: boolean; name?: string; error?: string }> {
  await requireMember();
  const brand = await getBrand(slug), A = schema.brandAssets;
  const [a] = await db.update(A).set({ meta: sql`${A.meta} || ${JSON.stringify({ template: on })}::jsonb` }).where(and(eq(A.id, id), eq(A.brandId, brand.id), sql`${A.mime} like 'image/%'`)).returning({ name: A.name });
  return a ? { ok: true, name: a.name } : { error: "That picture is no longer in Brand assets." };
}

export async function deleteShot(slug: string, id: string): Promise<void> {
  await requireMember();
  const brand = await getBrand(slug);
  await deleteAssets(and(eq(schema.brandAssets.id, id), eq(schema.brandAssets.brandId, brand.id)));
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
  const [row] = await saveAsset({
    brandId: brand.id, kind: "voice", name: name || "Brand voice", mime: "audio/wav", size: data.byteLength, data,
    meta: { seconds: Math.round(secs * 10) / 10, consent: { by: me.name, at: new Date().toISOString() } }, createdBy: me.id,
  });
  return { id: row.id };
}

export async function deleteVoice(slug: string, id: string): Promise<void> {
  await requireMember();
  const brand = await getBrand(slug);
  await deleteAssets(and(eq(schema.brandAssets.id, id), eq(schema.brandAssets.brandId, brand.id), eq(schema.brandAssets.kind, "voice")));
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

/** Storyboard node: Remy writes a full ad from every input (brand, product, buyer, research, what wins). */
export async function writeStory(slug: string, input: {
  product: { title: string; price: number | null } | null; length: number; framework: string; look: string; hookCount: number; characterId: string | null;
  signal: { data: string; value: string | null; evidence: [string, string][] } | null; brandRules: string[];
}): Promise<{ story?: Story; error?: string }> {
  await requireMember();
  if (!aiReady()) return { error: "Remy needs the Claude API key." };
  const brand = await getBrand(slug);
  const [ch] = input.characterId ? await db.select({ name: schema.brandAssets.name, meta: schema.brandAssets.meta }).from(schema.brandAssets)
    .where(and(eq(schema.brandAssets.id, input.characterId), eq(schema.brandAssets.brandId, brand.id), eq(schema.brandAssets.kind, "character"))) : [];
  const story = await writeStoryboard(brand.id, {
    product: input.product ? { title: input.product.title.slice(0, 200), price: input.product.price } : null,
    length: (LENGTHS as readonly number[]).includes(input.length) ? input.length : 30, framework: String(input.framework).slice(0, 20), look: String(input.look).slice(0, 20),
    hookCount: Math.min(3, Math.max(1, Math.round(input.hookCount) || 1)),
    character: ch ? { name: ch.name, description: ch.meta.character?.description ?? "" } : null, signal: input.signal, brandRules: (input.brandRules ?? []).slice(0, 8).map((r) => String(r).slice(0, 120)),
  });
  return story ? { story } : { error: "Remy couldn’t write the storyboard — try again." };
}

/** One keyframe per scene: the real product (and person) locked into the opening still. */
export async function makeKeyframes(slug: string, input: { story: Story; sceneIds: string[]; product: { title: string; url: string }; characterId: string | null }): Promise<{ frames: Record<string, string>; error?: string }> {
  const me = await requireMember();
  const brand = await getBrand(slug);
  if (!/^https:\/\//.test(input.product.url)) return { frames: {}, error: "Pick a product with a Shopify photo." };
  const scenes = input.story.scenes.filter((x) => input.sceneIds.includes(x.id)).slice(0, 10);
  const res = await Promise.all(scenes.map((x) => shoot(brand.id, me.id, {
    product: input.product.title, imageUrl: input.product.url, prompt: keyframePrompt(input.story, x, Boolean(input.characterId)).slice(0, 2400), aspect: "9:16", n: 1, model: "sunburst",
    characterId: x.person ? input.characterId : null,
  }).catch((e: Error) => ({ ids: [] as string[], error: e.message }))));
  const frames: Record<string, string> = {};
  res.forEach((r, i) => { if (r.ids[0]) frames[scenes[i].id] = r.ids[0]; });
  const failed = res.find((r) => !r.ids.length);
  return { frames, ...(failed ? { error: `${res.filter((r) => !r.ids.length).length} keyframe${res.filter((r) => !r.ids.length).length > 1 ? "s" : ""} failed: ${failed.error ?? "no image came back"}` } : {}) };
}

/** Final cut: the scene clips become one ad with captions and an end card with the real product photo. */
export async function cutFinal(slug: string, input: {
  scenes: { clip: string; seconds: number; text: string }[]; captions: boolean; sound: boolean; endCard: boolean;
  end: { headline: string; sub: string; cta: string; offer: string }; product: { title: string; url: string } | null; title: string;
}): Promise<{ id?: string; seconds?: number; error?: string }> {
  const me = await requireMember();
  const brand = await getBrand(slug);
  const palette = (brand.onboarding?.analysis?.palette ?? []).map((p) => p.hex).filter(Boolean);
  return cutAd(brand.id, me.id, {
    scenes: input.scenes.slice(0, 12).map((x) => ({ clip: x.clip, seconds: Math.min(30, Math.max(1, Math.round(x.seconds))), text: String(x.text ?? "").slice(0, 200) })),
    captions: Boolean(input.captions), sound: Boolean(input.sound), endCard: Boolean(input.endCard),
    end: { headline: String(input.end.headline ?? "").slice(0, 60), sub: String(input.end.sub ?? "").slice(0, 80), cta: String(input.end.cta ?? "Shop now").slice(0, 20), offer: String(input.end.offer ?? "").slice(0, 60) },
    productImage: input.product && /^https:\/\//.test(input.product.url) ? input.product.url : null, palette, title: input.title.slice(0, 80), product: input.product?.title ?? null,
  });
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
  const [row] = await saveAsset({
    brandId: brand.id, kind: "character", name: name || "Creator", mime: file.type, size: data.byteLength, data,
    meta: { character: { description: note || "A real creator (from their photo)", uploaded: true }, consent: { by: me.name, at: new Date().toISOString() } }, createdBy: me.id,
  });
  return { id: row.id };
}

export async function deleteCharacter(slug: string, id: string): Promise<void> {
  await requireMember();
  const brand = await getBrand(slug);
  await deleteAssets(and(eq(schema.brandAssets.id, id), eq(schema.brandAssets.brandId, brand.id), eq(schema.brandAssets.kind, "character")));
}
