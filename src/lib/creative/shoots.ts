import "server-only";
import { experimental_generateVideo as generateVideo, generateImage } from "ai";
import { gateway } from "@ai-sdk/gateway";
import { z } from "zod";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { ask } from "../ai/client";
import { fetchPublic } from "../ai/site";
import { DEFAULT_PHOTO, DEFAULT_VIDEO, HF_ADS, HF_PHOTO, PHOTO_MODELS, VIDEO_MODELS, isPhotoModel, type PhotoModel, hfDownload, hfImage, hfPrices, hfReady, hfRun, hfStatus, hfSubmit, hfUpload, imageSize, isVideoModel, nearestRatio, type Rate, type VideoModel } from "./higgsfield";
import { ANGLES, CAMERA, PRO_RULES, SIZES, STYLE, autoShots, fitTimes } from "./director";
import type { AdPlan, ShotPlan } from "../db/schema";
import { adBrief, planAds } from "./adplan";
import { cleanScores, type AdCheck } from "./rubric";
import { marketContext } from "../research/context";
import { readAssets, saveAsset } from "@/lib/assets/storage";
import { adLook } from "./layouts";

/** FLUX Kontext keeps the real product from the reference photo and builds the scene around it. */
export const SHOOT_MODEL = "bfl/flux-kontext-pro";
export const COST_PER_IMAGE = 0.04;
/** Kling animates a still (the best checked photo) — the product stays the real one. */
export const VIDEO_MODEL = "klingai/kling-v2.6-i2v";
export const COST_PER_VIDEO_SECOND = 0.042;

export type ClipModel = { key: string; name: string; note: string; rate: Rate };
/** Which models Shoots uses: Higgsfield when its key is set (Marketing Studio photos; Wan 3.0 Prime or Seedance 2.5 clips with sound), else AI Gateway. */
export async function shootEngines() {
  const flat = { "480p": 1, "720p": 1, "1080p": 1 };
  if (!hfReady()) return { photo: "FLUX Kontext", video: "Kling", via: "AI Gateway", sound: false, perImage: COST_PER_IMAGE, perVideoSecond: COST_PER_VIDEO_SECOND, perSoundSecond: 0, res: flat, model: "kling", models: [] as ClipModel[], photoModel: "", photoModels: [] as { key: string; name: string; note: string; price: number }[] };
  const p = await hfPrices().catch(() => null);
  const fallback: Rate = { second: p?.videoSecond ?? 0.1, sound: p?.soundSecond ?? 0, res: p?.res ?? { "480p": 0.6, "720p": 1, "1080p": 1.8 } };
  const models: ClipModel[] = (Object.keys(VIDEO_MODELS) as VideoModel[]).map((k) => ({ key: k, name: VIDEO_MODELS[k].name, note: VIDEO_MODELS[k].note, rate: p?.video[k] ?? fallback }));
  const photoModels = (Object.keys(PHOTO_MODELS) as PhotoModel[]).map((k) => ({ key: k as string, name: PHOTO_MODELS[k].name, note: PHOTO_MODELS[k].note, price: p?.photos[k] ?? p?.photo ?? 0.084 }));
  return { photo: PHOTO_MODELS[DEFAULT_PHOTO].name, photoModel: DEFAULT_PHOTO as string, photoModels, video: VIDEO_MODELS[DEFAULT_VIDEO].name, via: "Higgsfield", sound: true, perImage: p?.photos[DEFAULT_PHOTO] ?? p?.photo ?? 0.084, perVideoSecond: fallback.second, perSoundSecond: fallback.sound, res: fallback.res, model: DEFAULT_VIDEO as string, models };
}

export type PromptIn = {
  product: string; scene: string; length: "short" | "medium" | "detailed";
  signal?: { data: string; value: string | null; evidence: [string, string][] } | null;
  rules: string[]; brandRules: string[]; strict: boolean; lessons: string[]; reference?: { note: string; close: boolean } | null;
  character?: { name: string; description: string } | null;
};
export type PromptOut = { segments: { text: string; source: "product" | "data" | "brand" | "wins" | "character" | "none" }[]; rules: string[]; voiceLine: string };

/** Remy writes the photo brief from every input, phrase by phrase, and says which input each phrase came from. */
export async function writeShotPrompt(brandId: string, input: PromptIn): Promise<PromptOut | null> {
  const [[b], market] = await Promise.all([
    db.select({ name: schema.brands.name, category: schema.brands.category, onboarding: schema.brands.onboarding }).from(schema.brands).where(eq(schema.brands.id, brandId)),
    marketContext(brandId, input.product || null),
  ]);
  const look = adLook(input.scene);
  const words = look ? (look.person ? 460 : 420) : { short: 160, medium: 280, detailed: 420 }[input.length];
  const out = await ask("remy", {
    system: `You are Remy, Kaviar's creative agent, writing the shoot brief for an image model — GPT Image, through Higgsfield — that builds a campaign picture round a product photo. It receives the brand's real product photo as reference image 1 and must keep that product exactly (pack shape and proportions, cap, label design, printed words, colours) while building a new photograph around it for a Meta ad. This model follows long, literal, well-organised briefs far better than short ones, so write a complete production brief the way a senior art director briefs a photographer and a set stylist the day before a campaign shoot — every decision made, nothing left to taste, never a caption.
Write these labelled parts in this order, each starting on a new line with its label in capitals and a colon:
SUBJECT: the product by its exact name and pack type, how many pieces, how each stands or lies, which face is to camera, and what must stay identical to reference image 1.
SET: the place, backdrop and surface — materials and colours, each colour named with its hex.
COMPOSITION: the frame's proportions; where the product sits and how much of the frame it fills, in percentages; what is in each third of the frame; which areas stay completely empty and plain.
CAMERA: camera format, lens in mm, aperture, camera height in cm and angle in degrees, distance to the product, depth of field, exactly what is in sharp focus and what falls soft.
LIGHT: key, fill and rim — each one's modifier and size, where it stands by clock position and height, hard or soft, its strength against the key as a ratio, colour temperature in kelvin; the shadow the product casts (direction, length, edge softness, how dark) and the highlight that runs along the pack.
MATERIALS: the small physical truths that make it a photograph — how the pack's own material reads in this light (the sheen on metal, the grain of a paper label, the gloss of a cap), the texture of the surface it stands on, reflections and the contact shadow where it touches down, any drop, smear or swatch of the formula with its real colour and thickness.
COLOUR: the whole palette as three to five named colours with hex, where each one appears and roughly how much of the frame it takes, and the one accent.
STYLING: props, real ingredients, textures; hands or a person (casting, pose, expression, outfit) — only what belongs in this picture.
FINISH: retouching level, surface detail, colour grade and contrast, grain, and the kind of campaign it should sit beside — named by category and tier, never by another brand's name.
AVOID: what must not appear — added text, lettering, logos or watermarks; extra or duplicate products; a changed label; anything that breaks the composition (name it).
About ${words} words in all. Concrete nouns, numbers and positions instead of adjectives — never "beautiful", "stunning" or "high quality".
If a character is given, the scene features that exact person (from their character sheet) holding or using the product with the label facing the camera: describe their action, expression, outfit and framing. UGC scenes ("Selfie talking to camera", "Unboxing at home", "Get ready with me"…) must look like real phone footage from a customer: vertical, handheld, natural light at home, authentic and unpolished, not a studio ad.
When there is a person (a character, or a UGC scene), also write voiceLine: what they say to camera in a short clip — first person, casual, under 16 words, about why they reach for this product; no medical or guaranteed claims, no prices or discounts. Otherwise voiceLine is "".
When adLook is given, the photo is the background of a designed static ad, shot like a studio campaign: follow its art direction exactly — surface, props, camera angle, light — and its room-for-type rule, stating plainly which part of the frame stays empty and plain. Build ONE colour story and name the backdrop colour: from the brand palette if there is one, else from this product's packaging — and when the packaging is neutral (white, silver, grey, black), choose a soft, appetising tint that suits the formula and its hero ingredient rather than grey. Never a grey-on-grey picture. The product is the hero: sharp, correctly lit, label readable. Portrait 4:5. Show only ingredients, textures and claims the product truly has.
adLook.camera is the photographer's brief — lens, camera position and light: state it in the prompt in plain photographic terms, because it is what makes this look (a wide lens close to the product, a view from directly above, a low angle against the sky). When adLook.withPerson is true and no character is given, cast the model yourself: a woman or man the primary buyer would see as themselves on a good day (age and style from who will see the ad), and describe their look, hair, outfit in the colour story, pose, expression and exactly where the product is in relation to the lens and their face. Real skin, natural hands with five fingers, one person only. Even in a person's hand or at an angle, the product keeps its true proportions and its label faces the camera, readable.
Split the prompt into consecutive phrases and tag each with the input it came from: product (the product itself), character (the person), data (who will see the ad, from the data signal and its rules), brand (the brand's look and rules), wins (lessons on what already sells), none (glue words). The phrases joined in order must read as the whole brief; a phrase that opens a part begins with a line break and that part's label. Also return the rules for how the data signal shapes the scene: keep the team's rules if given, otherwise write 3, each under 9 words.`,
    content: JSON.stringify({
      brand: b?.name, category: b?.category, product: input.product, scene: input.scene,
      adLook: look ? { artDirection: look.direction, camera: look.camera, roomForType: look.room, withPerson: Boolean(look.person) } : null, brandColours: (b?.onboarding?.analysis?.palette ?? []).map((c) => `${c.role}: ${c.hex}`),
      brandKit: { look: b?.onboarding?.profile?.palette?.value, tone: b?.onboarding?.profile?.tone?.value, rules: input.brandRules, follow: input.strict ? "strictly" : "loosely" },
      whoWillSeeIt: input.signal ? { signal: input.signal.data, data: input.signal.value, evidence: input.signal.evidence } : null,
      teamRules: input.rules, whatWinsForThisBrand: input.lessons,
      reference: input.reference ? { style: input.reference.note, follow: input.reference.close ? "closely" : "loosely" } : null,
      character: input.character ?? null,
      // From market research: the scene should feel like the primary buyer's world when no data signal says otherwise (tag those phrases "data").
      market: market ? { positioning: market.positioning?.statement ?? null, primaryBuyer: market.positioning?.primaryBuyer ?? market.buyers[0]?.who ?? null, voice: market.positioning?.voice ?? null, avoid: market.positioning?.stayAwayFrom ?? [] } : null,
    }),
    schema: z.object({
      segments: z.array(z.object({ text: z.string(), source: z.enum(["product", "data", "brand", "wins", "character", "none"]) })),
      rules: z.array(z.string()),
      voiceLine: z.string(),
    }),
    maxTokens: 4000,
  });
  if (!out) return null;
  return { segments: out.segments.filter((x) => x.text), rules: (input.rules.length ? input.rules : out.rules).slice(0, 6), voiceLine: out.voiceLine.trim().slice(0, 140) };
}

/** Remy looks at a reference photo and writes down what to borrow from it: style, pose, composition. */
export async function describeReference(brandId: string, assetId: string): Promise<string | null> {
  const [a] = await readAssets(and(eq(schema.brandAssets.id, assetId), eq(schema.brandAssets.brandId, brandId)));
  if (!a || !/^image\/(png|jpeg|webp|gif)$/.test(a.mime)) return null;
  const out = await ask("remy", {
    system: "You are Remy, Kaviar's creative agent. Describe what a product photographer should borrow from this reference photo: style, light, pose and composition. Under 25 words. Don't describe the product in it.",
    content: [{ type: "image", source: { type: "base64", media_type: a.mime as "image/png" | "image/jpeg" | "image/webp" | "image/gif", data: Buffer.from(a.data).toString("base64") } }],
    schema: z.object({ note: z.string() }),
  });
  return out?.note ?? null;
}

/** Generate images and save them as brand imagery (they show up in the Editor's Media panel). */
/** What a shoot is asked for. `ads` = the creative plan and which of its concepts to render (with what Otto sent each back for). */
export type ShootIn = { product: string; imageUrl: string; prompt: string; aspect: "4:5" | "9:16" | "1:1"; n: number; referenceId?: string | null; characterId?: string | null; model?: string | null; forBatch?: string | null;
  ads?: { plan: AdPlan; items: { i: number; revise?: string[] }[] } | null };
/** `made` says which concept of the plan each finished ad is. */
export type ShootOut = { ids: string[]; error?: string; made?: { id: string; i: number }[] };
export async function shoot(brandId: string, memberId: string | null, input: ShootIn): Promise<ShootOut> {
  if (hfReady()) return shootHiggsfield(brandId, memberId, input);
  const ref = await fetchPublic(input.imageUrl, 15_000, "image/*");
  if (!ref?.ok) return { ids: [], error: "Couldn’t load the product photo." };
  const photo = new Uint8Array(await ref.arrayBuffer());
  const text = `${input.prompt}\nKeep the product exactly as in the reference photo — same shape, label, colours and text. Photorealistic, no added text or watermarks.`;
  const runs = await Promise.allSettled(Array.from({ length: Math.min(4, Math.max(1, input.n)) }, (_, i) =>
    generateImage({ model: gateway.imageModel(SHOOT_MODEL), prompt: { images: [photo], text }, aspectRatio: input.aspect, seed: Date.now() % 100000 + i, maxRetries: 1 })));
  const ids: string[] = [];
  let error: string | undefined;
  for (const r of runs) {
    if (r.status === "rejected") { error = (r.reason as Error)?.message ?? "Image model failed"; continue; }
    const img = r.value.image;
    const [row] = await saveAsset({
      brandId, kind: "imagery", name: `${input.product.slice(0, 40)} · shoot`, mime: img.mediaType || "image/png", size: img.uint8Array.byteLength,
      data: Buffer.from(img.uint8Array), meta: { ai: true, prompt: input.prompt.slice(0, 500), product: input.product }, createdBy: memberId,
    });
    ids.push(row.id);
  }
  if (!ids.length && error) {
    if (/credit|billing|payment|insufficient/i.test(error)) error = "AI Gateway has no credits on this Vercel team. Add credits in Vercel → AI Gateway, then try again.";
    else if (/auth|token|unauthor|api key/i.test(error)) error = "AI Gateway isn’t reachable from here — it works on the deployed app (Vercel signs the requests).";
  }
  return { ids, error };
}

/** Higgsfield Marketing Studio: the Shopify photo goes in first (so the product stays exact), a brand reference photo second. */
async function shootHiggsfield(brandId: string, memberId: string | null, input: ShootIn): Promise<ShootOut> {
  const urls = [input.imageUrl];
  let person = false;
  if (input.characterId) {
    const [c] = await readAssets(and(eq(schema.brandAssets.id, input.characterId), eq(schema.brandAssets.brandId, brandId), eq(schema.brandAssets.kind, "character")));
    if (c) { const u = await hfUpload(c.data, c.mime).catch(() => ""); if (u) { urls.push(u); person = true; } }
  }
  if (input.referenceId) {
    const [r] = await readAssets(and(eq(schema.brandAssets.id, input.referenceId), eq(schema.brandAssets.brandId, brandId)));
    if (r?.mime.startsWith("image/")) urls.push(await hfUpload(r.data, r.mime).catch(() => "")); 
  }
  const text = `${input.prompt}\nReference image 1 is the real product: keep it exactly — same shape, label, colours and printed text.${person ? " Reference image 2 is a character sheet: the person in the photo must be that exact person — same face, hair, skin tone and build — shown once, naturally." : ""}${urls.length > (person ? 2 : 1) ? ` The last reference image is a style reference for light, mood and composition only.` : ""} Photorealistic, no added text, logos or watermarks.`;
  const body = { prompt: text.slice(0, 5000), image_urls: urls.filter(Boolean), aspect_ratio: input.aspect === "4:5" ? "3:4" : input.aspect, resolution: "2k", quality: "high", enhance_prompt: false };
  let model: PhotoModel = isPhotoModel(input.model) ? input.model : DEFAULT_PHOTO;
  const prices = await hfPrices().catch(() => null);
  const count = Math.min(4, Math.max(1, input.n));
  // Ads Studio (GPT Image) renders a finished ad from a creative director's brief, one request per concept of the plan (see adplan.ts).
  // The canvas sends the plan it shows the team; anything else that shoots with this model gets a plan written here first.
  let ads: { url: string; i: number }[] = [];
  let plan: AdPlan | null = null, adsError: string | undefined;
  if (model === "ads") {
    plan = input.ads?.plan ?? await planAds(brandId, { product: input.product, imageUrl: input.imageUrl, n: count, forBatch: input.forBatch ?? null, person });
    const items: { i: number; revise?: string[] }[] = (input.ads?.items ?? plan.concepts.map((_, i) => ({ i }))).filter((x) => plan!.concepts[x.i]).slice(0, 4);
    const refs = urls.filter(Boolean).slice(0, 9);
    const styleRef = refs.length > (person ? 2 : 1);
    // A concept built on an imported template sends that template as its last reference (and no style reference: the template sets the look).
    const want = [...new Set(items.map((it) => plan!.concepts[it.i].template).filter((v): v is string => Boolean(v)))];
    const tplRows = want.length ? await readAssets(and(eq(schema.brandAssets.brandId, brandId), inArray(schema.brandAssets.id, want))).catch(() => []) : [];
    const tplUrl = new Map<string, string>();
    await Promise.all(tplRows.filter((a) => a.mime.startsWith("image/")).map(async (a) => { const u = await hfUpload(a.data, a.mime).catch(() => ""); if (u) tplUrl.set(a.id, u); }));
    const rs = await Promise.all(items.map((it) => {
      const c = plan!.concepts[it.i], t = c.template ? tplUrl.get(c.template) : undefined;
      return hfRun(HF_ADS, { prompt: adBrief(plan!, c, { product: input.product, aspect: input.aspect, person, styleRef: styleRef && !t, template: Boolean(t), revise: it.revise }),
        image_urls: t ? [...refs.slice(0, person ? 2 : 1), t] : refs, aspect_ratio: input.aspect, batch_size: 1 }, 230_000);
    }));
    const r = rs.find((x) => x.error) ?? rs[0];
    ads = rs.flatMap((x, k) => (x.out?.images ?? []).slice(0, 1).map((y) => ({ url: y.url, i: items[k].i }))).filter((y) => y.url);
    if (ads.length < items.length) adsError = rs.find((x) => x.error)?.error ?? "One of the ads didn’t come back.";
    if (!ads.length) {
      if (/credit|safety|busy/i.test(r?.error ?? "") || input.ads) return { ids: [], error: r?.error ?? "No image came back." };
      // Not open to every account: when it returns nothing at all, shoot a photo with the precise model rather than fail.
      console.error("higgsfield", HF_ADS, "returned nothing — using sunburst:", r?.error);
      model = "sunburst";
    }
  }
  let runs: Awaited<ReturnType<typeof hfRun>>[] = ads.length ? ads.map(({ url }) => ({ out: { status: "completed" as const, request_id: "", images: [{ url }] } })) : await Promise.all(Array.from({ length: count }, () => hfRun(PHOTO_MODELS[model].path, body, 170_000)));
  // The precise model isn't open to every account: when it returns nothing at all, shoot with the fast one rather than fail.
  if (model === "sunburst" && runs.every((r) => !r.out?.images?.[0]?.url) && !runs.some((r) => /credit|safety|busy/i.test(r.error ?? ""))) {
    console.error("higgsfield", PHOTO_MODELS[model].path, "returned nothing — using flare:", runs[0]?.error);
    model = "flare";
    runs = await Promise.all(Array.from({ length: count }, () => hfRun(PHOTO_MODELS.flare.path, body, 150_000)));
  }
  const price = prices?.photos[model] ?? prices?.photo ?? null;
  const ids: string[] = [], made: { id: string; i: number }[] = [];
  let error: string | undefined;
  for (const [k, r] of runs.entries()) {
    const url = r.out?.images?.[0]?.url;
    if (!url) { error = r.error ?? "No image came back."; continue; }
    // A finished ad keeps what it was briefed to say, so Otto can hold the render to it, and the campaign ad it is the picture for.
    const c = ads.length && plan ? plan.concepts[ads[k].i] : null;
    try {
      const img = await hfImage(url);
      const [row] = await saveAsset({
        brandId, kind: "imagery", name: `${input.product.slice(0, 40)} · ${c ? "ad" : "shoot"}`, mime: img.mime.startsWith("image/") ? img.mime : "image/png", size: img.data.byteLength, data: img.data,
        meta: { ai: true, prompt: (c ? `${c.angle}\n${c.scene}` : input.prompt).slice(0, 2400), product: input.product, engine: `Higgsfield · ${PHOTO_MODELS[model].name}`, ...(PHOTO_MODELS[model].finished ? { finished: true } : {}), ...(price != null ? { cost: price } : {}),
          ...(c && plan ? { concept: { angle: c.angle, headline: c.headline, sub: c.sub, callouts: c.callouts, facts: plan.facts.map((f) => f.fact) }, ...(c.adId ? { ad: c.adId } : {}) } : {}) }, createdBy: memberId,
      });
      ids.push(row.id);
      if (c) made.push({ id: row.id, i: ads[k].i });
    } catch (e) { error = (e as Error).message; }
  }
  return { ids, error: error ?? adsError, ...(made.length ? { made } : {}) };
}

/** What Shoots made and spent this month (photos and edits at the per-image price, clips by the second). */
export async function shootsThisMonth(brandId: string): Promise<{ photos: number; clips: number; cost: number }> {
  const [r] = (await db.execute(sql`select count(*) filter (where mime like 'image/%')::int as photos, count(*) filter (where mime like 'video/%')::int as clips,
      coalesce(sum(case when mime like 'video/%' and meta->>'cost' is null then coalesce((meta->>'seconds')::int, 5) else 0 end), 0)::int as seconds,
      count(*) filter (where mime like 'image/%' and meta->>'cost' is null)::int as unpriced,
      coalesce(sum((meta->>'cost')::float8), 0)::float8 as priced
    from brand_assets where brand_id = ${brandId} and (meta->>'ai')::boolean and created_at >= date_trunc('month', now())`)).rows as { photos: number; clips: number; seconds: number; unpriced: number; priced: number }[];
  // Higgsfield jobs record their own price; older AI Gateway ones use the list price.
  return { photos: r.photos, clips: r.clips, cost: r.priced + r.unpriced * COST_PER_IMAGE + r.seconds * COST_PER_VIDEO_SECOND };
}

/** Quick fixes on a photo that already exists — the edit nodes. Each one is a new photo; the original stays. */
export const EDITS = {
  "remove-bg": { label: "Remove bg", text: "Remove the background: put the product on a clean, plain off-white studio background with a soft natural shadow." },
  extend: { label: "Extend", text: "Extend the scene outward to fill a tall 9:16 frame, continuing the same setting and light. Keep everything already in the photo unchanged." },
  relight: { label: "Relight", text: "Relight the scene with soft, warm morning daylight from one side. Keep the composition unchanged." },
} as const;
export type EditKind = keyof typeof EDITS;

export async function editShot(brandId: string, memberId: string, assetId: string, kind: EditKind): Promise<{ id?: string; error?: string }> {
  const [a] = await readAssets(and(eq(schema.brandAssets.id, assetId), eq(schema.brandAssets.brandId, brandId)));
  if (!a || !a.mime.startsWith("image/")) return { error: "Pick a photo first." };
  const e = EDITS[kind];
  if (hfReady()) {
    try {
      const size = imageSize(a.data);
      const url = await hfUpload(a.data, a.mime);
      const r = await hfRun(HF_PHOTO, { prompt: `${e.text}\nKeep the product exactly as it is — same shape, label, colours and text. Photorealistic, no added text or watermarks.`, image_urls: [url],
        aspect_ratio: kind === "extend" ? "9:16" : size ? nearestRatio(size.w / size.h) : "3:4", resolution: "2k", quality: "high", enhance_prompt: false }, 150_000);
      const out = r.out?.images?.[0]?.url;
      if (!out) return { error: r.error ?? "No image came back." };
      const img = await hfImage(out);
      const price = (await hfPrices().catch(() => null))?.photo;
      const [row] = await saveAsset({
        brandId, kind: "imagery", name: `${(a.meta.product ?? "Product").slice(0, 40)} · ${e.label.toLowerCase()}`, mime: img.mime.startsWith("image/") ? img.mime : "image/png", size: img.data.byteLength, data: img.data,
        meta: { ai: true, prompt: e.text, product: a.meta.product, edit: kind, engine: "Higgsfield · Marketing Studio", ...(price != null ? { cost: price } : {}) }, createdBy: memberId,
      });
      return { id: row.id };
    } catch (err) { return { error: (err as Error).message.slice(0, 160) }; }
  }
  try {
    const r = await generateImage({ model: gateway.imageModel(SHOOT_MODEL), prompt: { images: [new Uint8Array(a.data)], text: `${e.text}\nKeep the product exactly as it is — same shape, label, colours and text. Photorealistic, no added text or watermarks.` },
      ...(kind === "extend" ? { aspectRatio: "9:16" as const } : {}), maxRetries: 1 });
    const img = r.image;
    const [row] = await saveAsset({
      brandId, kind: "imagery", name: `${(a.meta.product ?? "Product").slice(0, 40)} · ${e.label.toLowerCase()}`, mime: img.mediaType || "image/png", size: img.uint8Array.byteLength,
      data: Buffer.from(img.uint8Array), meta: { ai: true, prompt: e.text, product: a.meta.product, edit: kind }, createdBy: memberId,
    });
    return { id: row.id };
  } catch (err) {
    const m = (err as Error).message ?? "";
    return { error: /credit|billing|payment|insufficient/i.test(m) ? "AI Gateway has no credits on this Vercel team." : /auth|token|unauthor/i.test(m) ? "AI Gateway works on the deployed app (Vercel signs the requests)." : `The image model failed: ${m.slice(0, 120)}` };
  }
}

const CheckOut = z.object({
  labelMatches: z.boolean().describe("The label's design and the product's name match the reference at the size shown (unreadably small print is fine)"),
  shapeExact: z.boolean().describe("Bottle/pack shape matches the reference"),
  coloursOnBrand: z.boolean(),
  noTextOrWatermark: z.boolean().describe("No added text, letters or watermarks besides the product's own label"),
  note: z.string().describe("Under 14 words: what's off, or 'Looks right'"),
});
/** The critic's sheet for a finished ad: the product checks, then the seven scores of the rubric and what to fix on a re-render. */
const CritiqueOut = CheckOut.extend({
  noTextOrWatermark: z.boolean().describe("No watermark, no other company's logo, no QR code, no drawn button or badge such as 'Shop now'"),
  compliant: z.boolean().describe("Every word on the ad is supported by the brief or the pack: no invented benefit, result, percentage, price, discount, certification, rating or testimonial; no before-and-after; no cure or medical claim"),
  accuracy: z.number().describe("0–25 · product and brand accuracy"),
  stopping: z.number().describe("0–20 · scroll-stopping potential"),
  composition: z.number().describe("0–15 · visual composition"),
  typography: z.number().describe("0–15 · typography and readability"),
  originality: z.number().describe("0–10 · creative originality"),
  conversion: z.number().describe("0–10 · conversion potential"),
  compliance: z.number().describe("0–5 · advertising compliance"),
  fixes: z.array(z.string()).describe("Up to 3 exact instructions for a re-render, each under 24 words; empty when it scores 85 or more"),
});
export type ShotCheck = AdCheck;

const PRODUCT_RULES = "Be strict about the product itself: brands get complaints when a product looks different from what arrives. The pose is free — the product may be tilted, lying down, held in a hand, partly behind a finger, much larger or smaller, or stretched by a wide lens close to it: that is the photographer's choice, not a fault. Judge whether it is the SAME product: same pack type and proportions, same cap or closure, same label design, wording and colours. People, hands and props are not added text. Judge the label at the size it appears in the photo: small print that is too small to read is not a fault as long as the label's layout, colours and the position of the brand or product name match. Mark labelMatches false only for a visibly different label — a wrong or misspelled name in readable letters, a different design, a missing label, or the label on the wrong face.";

/**
 * Otto looks at a generated picture next to the real product and checks it before it can go in an ad. A finished ad is also scored as a
 * creative director would score it (rubric.ts): it goes forward at 85 of 100, and never with the wrong product or an unsupported claim.
 */
export async function checkShot(brandId: string, assetId: string, referenceUrl: string, product: string): Promise<ShotCheck | null> {
  const [a] = await readAssets(and(eq(schema.brandAssets.id, assetId), eq(schema.brandAssets.brandId, brandId)));
  if (!a || !a.mime.startsWith("image/")) return null;
  const picture = { type: "image" as const, source: { type: "base64" as const, media_type: a.mime as "image/png" | "image/jpeg" | "image/webp", data: Buffer.from(a.data).toString("base64") } };
  let out: AdCheck | null = null;
  if (a.meta.finished) {
    const c = a.meta.concept ?? null;
    const r = await ask("otto", {
      system: `You are Otto, Kaviar's QA agent, acting as the creative critic on a finished static ad before a brand pays to run it. You are given the real product photo, what the ad was briefed to say, and the rendered ad.
FIRST, the product. ${PRODUCT_RULES}
The designed headline, supporting line, callouts and the brand's wordmark are intended. Answer noTextOrWatermark false only for a watermark, another company's logo, a QR code, or a drawn button or badge such as "Shop now".
THEN score it as a demanding agency creative director would. Be honest, not kind: 85 or more in total means it could run for a premium direct-to-consumer brand tomorrow. A clean but ordinary product-on-a-backdrop with stacked text earns 60–72.
- accuracy (0–25): the pack is the real one; the brand name and every briefed word are present and spelled exactly; nothing renamed or relabelled.
- stopping (0–20): would it stop a thumb in a feed — one clear idea, strong scale, contrast or tension, read in under a second.
- composition (0–15): hierarchy, balance, intentional negative space, depth, the product as hero, nothing crowded or floating.
- typography (0–15): type choice, hierarchy, spacing, legibility at phone size. Any misspelled, garbled, repeated or cut-off word caps this at 5.
- originality (0–10): a specific idea for this product, not a category template or a stock headline.
- conversion (0–10): the benefit is clear, the product and brand are identifiable, a buyer knows what it is and why to tap.
- compliance (0–5): only supported claims; no before-and-after, no medical or guaranteed result, no invented offer.
fixes: when the total is under 85 or a check fails, the up to three changes that would lift it most, each an exact instruction a designer can act on (what, where, how) — never "make it better". note: the single most important thing, under 14 words.`,
      content: [
        { type: "text", text: `Reference: the real product “${product}”.` },
        { type: "image", source: { type: "url", url: referenceUrl } },
        { type: "text", text: `The brief: ${JSON.stringify(c ? { angle: c.angle, headline: c.headline, supportingLine: c.sub, callouts: c.callouts, factsItMayUse: c.facts } : { note: "No brief was kept for this ad: judge the claims against what is printed on the pack." })}\nThe rendered ad:` },
        picture,
      ],
      schema: CritiqueOut,
      effort: "medium",
    });
    if (r) {
      const exact = r.labelMatches && r.shapeExact && r.coloursOnBrand;
      out = { labelMatches: r.labelMatches, shapeExact: r.shapeExact, coloursOnBrand: r.coloursOnBrand, noTextOrWatermark: r.noTextOrWatermark, compliant: r.compliant, note: r.note.slice(0, 160),
        scores: cleanScores(r, exact, r.compliant), fixes: r.fixes.map((f) => f.trim().slice(0, 220)).filter(Boolean).slice(0, 3) };
    }
  } else {
    out = await ask("otto", {
      system: `You are Otto, Kaviar's QA agent. Compare a generated ad photo with the brand's real product photo. ${PRODUCT_RULES}`,
      content: [
        { type: "text", text: `Reference: the real product “${product}”.` },
        { type: "image", source: { type: "url", url: referenceUrl } },
        { type: "text", text: "Generated photo to check:" },
        picture,
      ],
      schema: CheckOut,
    });
  }
  if (out) await db.update(schema.brandAssets).set({ meta: { ...a.meta, check: out } }).where(eq(schema.brandAssets.id, assetId));
  return out;
}

/** Animate a photo into a short vertical clip and save it as a brand asset. */
export async function shootVideo(brandId: string, memberId: string, input: { fromAssetId: string; prompt: string; seconds: number; aspect: "9:16" | "1:1" | "4:5"; sound?: string | null; voiceId?: string | null }): Promise<{ id?: string; error?: string }> {
  const [a] = await readAssets(and(eq(schema.brandAssets.id, input.fromAssetId), eq(schema.brandAssets.brandId, brandId)));
  if (!a) return { error: "Pick a photo to start from." };
  try {
    const r = await generateVideo({
      model: gateway.videoModel(VIDEO_MODEL),
      prompt: { image: new Uint8Array(a.data), text: `${input.prompt.slice(0, 2200)}\nNatural, believable motion. Keep the product exactly as in the first frame — same label and shape. No added text.` },
      duration: input.seconds > 7 ? 10 : 5, aspectRatio: input.aspect === "4:5" ? "9:16" : input.aspect, maxRetries: 1,
    });
    const v = r.video;
    const [row] = await saveAsset({
      brandId, kind: "video", name: `${(a.meta.product ?? "Product").slice(0, 40)} · clip`, mime: v.mediaType || "video/mp4", size: v.uint8Array.byteLength,
      data: Buffer.from(v.uint8Array), meta: { ai: true, prompt: input.prompt.slice(0, 500), product: a.meta.product, seconds: input.seconds }, createdBy: memberId,
    });
    return { id: row.id };
  } catch (e) {
    const m = (e as Error).message ?? "";
    return { error: /credit|billing|payment|insufficient/i.test(m) ? "AI Gateway has no credits on this Vercel team." : /auth|token|unauthor/i.test(m) ? "AI Gateway works on the deployed app (Vercel signs the requests)." : `Video model failed: ${m.slice(0, 120)}` };
  }
}

/** A brand voice sample must be a WAV of 2–15 seconds (what both clip models accept as a voice reference). Returns its length. */
export function wavSeconds(b: Buffer): number | null {
  if (b.length < 44 || b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WAVE") return null;
  let i = 12, byteRate = 0;
  while (i + 8 <= b.length) {
    const id = b.toString("ascii", i, i + 4), size = b.readUInt32LE(i + 4);
    if (id === "fmt ") byteRate = b.readUInt32LE(i + 16);
    if (id === "data") return byteRate ? Math.min(size, b.length - i - 8) / byteRate : null;
    i += 8 + size + (size % 2);
  }
  return null;
}

export type VideoJob = { id: string; at: string; seconds: number; sound: boolean; res: string; product: string | null; prompt: string; voice: string | null; scene?: string; model?: string };

/** A Higgsfield clip (Wan 3.0 Prime by default, or Seedance 2.5), started in the background: framing follows the start photo; a wired Voice + music node adds sound; a brand voice uses reference mode. */
export async function startVideoJob(brandId: string, input: { fromAssetId: string; prompt: string; seconds: number; sound?: string | null; voiceId?: string | null; res?: "480p" | "720p" | "1080p"; characterId?: string | null; scene?: string | null; model?: string | null }): Promise<{ job?: VideoJob; error?: string }> {
  const [a] = await readAssets(and(eq(schema.brandAssets.id, input.fromAssetId), eq(schema.brandAssets.brandId, brandId)));
  if (!a) return { error: "Pick a photo to start from." };
  try {
    const url = await hfUpload(a.data, a.mime);
    const withSound = Boolean(input.sound);
    const resolution = input.res ?? "720p";
    const duration = Math.min(30, Math.max(4, Math.round(input.seconds)));
    const model: VideoModel = isVideoModel(input.model) ? input.model : DEFAULT_VIDEO, M = VIDEO_MODELS[model];
    // Wan reasons over the shot list before rendering (better at following several shots and lines); its framing follows the start photo.
    const extra = model === "wan" ? { enable_thinking: true } : {};
    const [voice] = input.voiceId && withSound ? await readAssets(and(eq(schema.brandAssets.id, input.voiceId), eq(schema.brandAssets.brandId, brandId), eq(schema.brandAssets.kind, "voice"))) : [];
    let r;
    if (voice) {
      const audio = await hfUpload(voice.data, "audio/wav");
      const [ch] = input.characterId ? await readAssets(and(eq(schema.brandAssets.id, input.characterId), eq(schema.brandAssets.brandId, brandId), eq(schema.brandAssets.kind, "character"))) : [];
      const chUrl = ch ? await hfUpload(ch.data, ch.mime).catch(() => "") : "";
      const size = imageSize(a.data), ratio = size ? nearestRatio(size.w / size.h) : "9:16";
      const prompt = `The first reference image is the opening frame and the real product — keep the product exactly: same label, shape and colours${chUrl ? "; the second is the person's character sheet — keep them identical" : ""}. ${input.prompt}\nNatural, believable motion. No added text.\nSound: ${input.sound}. The speaker’s voice comes from the reference audio.`;
      r = await hfSubmit(M.ref, { image_urls: chUrl ? [url, chUrl] : [url], audio_urls: [audio], prompt: prompt.slice(0, 4000), duration, resolution, aspect_ratio: ["16:9", "4:3", "1:1", "3:4", "9:16"].includes(ratio) ? ratio : "9:16", generate_audio: true, ...extra });
    } else {
      const prompt = `${input.prompt}\nNatural, believable motion. Keep the product exactly as in the first frame — same label and shape — in every shot. No added text.${withSound ? `\nSound: ${input.sound}` : ""}`;
      r = await hfSubmit(M.i2v, { image_url: url, prompt: prompt.slice(0, 4000), duration, resolution, generate_audio: withSound, ...(model === "wan" ? { aspect_ratio: "adaptive" } : {}), ...extra });
    }
    if (!r.requestId) return { error: r.error ?? "Higgsfield didn’t take the job." };
    return { job: { id: r.requestId, at: new Date().toISOString(), seconds: duration, sound: withSound, res: resolution, product: a.meta.product ?? null, prompt: input.prompt.slice(0, 500), voice: voice ? input.voiceId! : null, model, ...(input.scene ? { scene: input.scene.slice(0, 40) } : {}) } };
  } catch (e) { return { error: (e as Error).message.slice(0, 160) }; }
}

/** Check a clip job; once Higgsfield finishes, save the clip (only once, however many tabs are polling). */
export async function finishVideoJob(brandId: string, memberId: string, job: VideoJob): Promise<{ id?: string; state?: string; error?: string }> {
  const A = schema.brandAssets;
  const [had] = await db.select({ id: A.id }).from(A).where(and(eq(A.brandId, brandId), sql`${A.meta}->>'job' = ${job.id}`)).limit(1);
  if (had) return { id: had.id };
  const s = await hfStatus(job.id);
  if (!("status" in s)) return { error: s.error };
  if (s.status === "nsfw") return { error: "Higgsfield’s safety filter blocked this clip (not charged) — reword the scene." };
  if (s.status === "failed" || s.status === "canceled") return { error: `Higgsfield couldn’t make the clip${s.error ? `: ${s.error}` : ""} (not charged).`.slice(0, 180) };
  if (s.status !== "completed" || !s.video?.url) return { state: s.status };
  const v = await hfDownload(s.video.url);
  const p = await hfPrices().catch(() => null);
  const model: VideoModel = isVideoModel(job.model) ? job.model : "seedance"; // jobs started before the model choice were Seedance
  const rate = p?.video[model] ?? (p ? { second: p.videoSecond, sound: p.soundSecond, res: p.res } : null);
  const cost = rate ? job.seconds * (rate.second * (rate.res[job.res as "720p"] ?? 1) + (job.sound ? rate.sound : 0)) : null;
  const [row] = await saveAsset({
    brandId, kind: "video", name: `${(job.product ?? "Product").slice(0, 40)} · clip`, mime: v.mime.startsWith("video/") ? v.mime : "video/mp4", size: v.data.byteLength, data: v.data,
    meta: { ai: true, prompt: job.prompt, product: job.product ?? undefined, seconds: job.seconds, engine: `Higgsfield · ${VIDEO_MODELS[model].name}`, sound: job.sound, job: job.id, ...(job.scene ? { scene: job.scene } : {}), ...(job.voice ? { voice: job.voice } : {}), ...(cost != null ? { cost } : {}) }, createdBy: memberId,
  });
  return { id: row.id };
}

const CHARACTER_SHEET = (d: string) => `Character reference sheet of ONE real-looking person for social ads. ${d}. Show the same person four times side by side on a plain light-grey background: face close-up from the front, three-quarter close-up, profile, and full body standing in their usual outfit. Consistent face, hair, skin texture and outfit in every view. Natural, photorealistic, everyday look. No text, labels or watermarks.`;

/** Make a character sheet (Higgsfield Marketing Studio, or AI Gateway without the key) and save it as a brand character. */
export async function makeCharacter(brandId: string, memberId: string, input: { name: string; description: string }): Promise<{ id?: string; error?: string }> {
  const prompt = CHARACTER_SHEET(input.description.slice(0, 600));
  let img: { data: Buffer; mime: string } | null = null, cost: number | undefined, engine = "";
  try {
    if (hfReady()) {
      const r = await hfRun(HF_PHOTO, { prompt, aspect_ratio: "16:9", resolution: "2k", quality: "high", enhance_prompt: false }, 150_000);
      const url = r.out?.images?.[0]?.url;
      if (!url) return { error: r.error ?? "No sheet came back." };
      img = await hfImage(url); engine = "Higgsfield · Marketing Studio";
      cost = (await hfPrices().catch(() => null))?.photo;
    } else {
      const r = await generateImage({ model: gateway.imageModel(SHOOT_MODEL), prompt, aspectRatio: "16:9", maxRetries: 1 });
      img = { data: Buffer.from(r.image.uint8Array), mime: r.image.mediaType || "image/png" }; engine = "AI Gateway · FLUX"; cost = COST_PER_IMAGE;
    }
  } catch (e) { return { error: (e as Error).message.slice(0, 160) }; }
  const [row] = await saveAsset({
    brandId, kind: "character", name: input.name.slice(0, 40) || "Character", mime: img.mime.startsWith("image/") ? img.mime : "image/png", size: img.data.byteLength, data: img.data,
    meta: { ai: true, prompt, engine, character: { description: input.description.slice(0, 600) }, ...(cost != null ? { cost } : {}) }, createdBy: memberId,
  });
  return { id: row.id };
}

/** Remy suggests who should be in the ad, from who will see it and what the brand sells. */
export async function suggestCharacter(brandId: string, input: { signal?: string | null; product?: string | null }): Promise<{ name: string; description: string } | null> {
  const [[b], market] = await Promise.all([
    db.select({ name: schema.brands.name, category: schema.brands.category, onboarding: schema.brands.onboarding }).from(schema.brands).where(eq(schema.brands.id, brandId)),
    marketContext(brandId, input.product ?? null),
  ]);
  return ask("remy", {
    system: "You are Remy, Kaviar's creative agent. Suggest ONE believable everyday person to appear in a UGC-style ad, matching the people who will see it — the primary buyer from market research when there is one. Describe age range, look, hair, skin, style of clothes and vibe in under 45 words, as a casting note for an image model. No celebrities, no real names, no children.",
    content: JSON.stringify({ brand: b?.name, category: b?.category, tone: b?.onboarding?.profile?.tone?.value, audience: b?.onboarding?.profile?.audience?.value ?? null, whoWillSeeIt: input.signal ?? null, product: input.product ?? null,
      primaryBuyer: market ? market.buyers.find((x) => x.name === market.positioning?.primaryBuyer) ?? market.buyers[0] ?? null : null }),
    schema: z.object({ name: z.string().describe("A short first-name label, e.g. 'Mina'"), description: z.string() }),
  });
}

/** Remy as the director: a shot list for one clip — size, angle and camera move per shot, what happens, who says what, timed to the second. */
export async function writeShotList(brandId: string, input: {
  style: string; seconds: number; count: number | null; frame: string; product: string; scene: string; character: { name: string; description: string } | null; voice: string;
}): Promise<ShotPlan | null> {
  const st = STYLE[input.style];
  if (!st) return null;
  const [b] = await db.select({ name: schema.brands.name, category: schema.brands.category, onboarding: schema.brands.onboarding }).from(schema.brands).where(eq(schema.brands.id, brandId));
  const n = input.count ?? autoShots(st.key, input.seconds);
  const out = await ask("remy", {
    system: `You are Remy, Kaviar's creative agent, working as a professional ${st.group === "UGC" ? "UGC creator and social-video director" : "commercial product director and camera operator"}. Plan the shot list for ONE ${input.seconds}-second vertical 9:16 clip for a Meta ad. An image-to-video model renders the whole clip in one take, with hard cuts between your shots, starting from the start photo.
Style — ${st.name}: ${st.look}. Camera: ${st.camera}. Light: ${st.light}. Edit: ${st.edit}. Typical beats: ${st.beats.join("; ")}.
Rules a professional follows:
${PRO_RULES.map((r) => `- ${r}`).join("\n")}
Write ${input.count ? "exactly" : "about"} ${n} shots. Times are whole seconds, back to back from 0 to ${input.seconds}. For each shot pick the size, angle and camera move from the allowed values, and write the action in under 24 words: what the person does (expression, hands, where they look), where the product is and which way its label faces. Concrete and filmable — no camera jargon in the action, no on-screen text, no logos added.
${input.voice ? `The person says this voice line, word for word: "${input.voice}". Split it across the shots where they talk to the camera, in order, without changing or adding words; shots where they don't speak have an empty line.` : "Nobody speaks: every line is empty."}
${input.character ? `The person is ${input.character.name}: ${input.character.description}. Keep them identical in every shot.` : st.group === "UGC" ? "The person is the one in the start photo; keep them identical in every shot." : "No people, except a hand where the style calls for it."}
Then write "why": one sentence, under 25 words, on how this plan hooks and sells — as a director would brief the team.`,
    content: JSON.stringify({ brand: b?.name, category: b?.category, tone: b?.onboarding?.profile?.tone?.value ?? null, product: input.product, scene: input.scene, startPhoto: input.frame.slice(0, 900) }),
    schema: z.object({
      shots: z.array(z.object({ from: z.number(), to: z.number(), size: z.enum(SIZES), angle: z.enum(ANGLES), move: z.enum(CAMERA), action: z.string(), line: z.string() })),
      why: z.string(),
    }),
  });
  if (!out?.shots.length) return null;
  const shots = fitTimes(out.shots.map((x) => ({ ...x, action: x.action.trim().slice(0, 300), line: input.voice ? x.line.trim().slice(0, 140) : "" })), input.seconds);
  return { style: st.key, seconds: input.seconds, shots, why: out.why.trim().slice(0, 240), at: new Date().toISOString() };
}
