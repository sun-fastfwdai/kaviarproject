import "server-only";
import { experimental_generateVideo as generateVideo, generateImage } from "ai";
import { gateway } from "@ai-sdk/gateway";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { ask } from "../ai/client";
import { fetchPublic } from "../ai/site";
import { HF_PHOTO, HF_VIDEO, HF_VIDEO_REF, hfDownload, hfPrices, hfReady, hfRun, hfUpload, imageSize, nearestRatio } from "./higgsfield";

/** FLUX Kontext keeps the real product from the reference photo and builds the scene around it. */
export const SHOOT_MODEL = "bfl/flux-kontext-pro";
export const COST_PER_IMAGE = 0.04;
/** Kling animates a still (the best checked photo) — the product stays the real one. */
export const VIDEO_MODEL = "klingai/kling-v2.6-i2v";
export const COST_PER_VIDEO_SECOND = 0.042;

/** Which models Shoots uses: Higgsfield when its key is set (Marketing Studio photos, Seedance 2.0 clips with sound), else AI Gateway. */
export async function shootEngines() {
  if (!hfReady()) return { photo: "FLUX Kontext", video: "Kling", via: "AI Gateway", sound: false, perImage: COST_PER_IMAGE, perVideoSecond: COST_PER_VIDEO_SECOND, perSoundSecond: 0 };
  const p = await hfPrices().catch(() => null);
  return { photo: "Marketing Studio", video: "Seedance 2.0", via: "Higgsfield", sound: true, perImage: p?.photo ?? 0.06, perVideoSecond: p?.videoSecond ?? 0.1, perSoundSecond: p?.soundSecond ?? 0 };
}

export type PromptIn = {
  product: string; scene: string; length: "short" | "medium" | "detailed";
  signal?: { data: string; value: string | null; evidence: [string, string][] } | null;
  rules: string[]; brandRules: string[]; strict: boolean; lessons: string[]; reference?: { note: string; close: boolean } | null;
};
export type PromptOut = { segments: { text: string; source: "product" | "data" | "brand" | "wins" | "none" }[]; rules: string[] };

/** Remy writes the photo brief from every input, phrase by phrase, and says which input each phrase came from. */
export async function writeShotPrompt(brandId: string, input: PromptIn): Promise<PromptOut | null> {
  const [b] = await db.select({ name: schema.brands.name, category: schema.brands.category, onboarding: schema.brands.onboarding }).from(schema.brands).where(eq(schema.brands.id, brandId));
  const words = { short: 30, medium: 55, detailed: 85 }[input.length];
  const out = await ask("remy", {
    system: `You are Remy, Kaviar's creative agent. Write one prompt for an image model that edits a product photo: it keeps the product exactly as in the reference (shape, label, colour) and places it in a new scene for a Meta ad. Describe setting, light, props, hands if any, camera angle and mood in about ${words} words. No text, no logos, no watermarks in the image. Split the prompt into consecutive phrases and tag each with the input it came from: product (the product itself), data (who will see the ad, from the data signal and its rules), brand (the brand's look and rules), wins (lessons on what already sells), none (glue words). The phrases joined in order must read as one natural prompt. Also return the rules for how the data signal shapes the scene: keep the team's rules if given, otherwise write 3, each under 9 words.`,
    content: JSON.stringify({
      brand: b?.name, category: b?.category, product: input.product, scene: input.scene,
      brandKit: { look: b?.onboarding?.profile?.palette?.value, tone: b?.onboarding?.profile?.tone?.value, rules: input.brandRules, follow: input.strict ? "strictly" : "loosely" },
      whoWillSeeIt: input.signal ? { signal: input.signal.data, data: input.signal.value, evidence: input.signal.evidence } : null,
      teamRules: input.rules, whatWinsForThisBrand: input.lessons,
      reference: input.reference ? { style: input.reference.note, follow: input.reference.close ? "closely" : "loosely" } : null,
    }),
    schema: z.object({
      segments: z.array(z.object({ text: z.string(), source: z.enum(["product", "data", "brand", "wins", "none"]) })),
      rules: z.array(z.string()),
    }),
  });
  if (!out) return null;
  return { segments: out.segments.filter((x) => x.text), rules: (input.rules.length ? input.rules : out.rules).slice(0, 6) };
}

/** Remy looks at a reference photo and writes down what to borrow from it: style, pose, composition. */
export async function describeReference(brandId: string, assetId: string): Promise<string | null> {
  const [a] = await db.select({ data: schema.brandAssets.data, mime: schema.brandAssets.mime }).from(schema.brandAssets).where(and(eq(schema.brandAssets.id, assetId), eq(schema.brandAssets.brandId, brandId)));
  if (!a || !/^image\/(png|jpeg|webp|gif)$/.test(a.mime)) return null;
  const out = await ask("remy", {
    system: "You are Remy, Kaviar's creative agent. Describe what a product photographer should borrow from this reference photo: style, light, pose and composition. Under 25 words. Don't describe the product in it.",
    content: [{ type: "image", source: { type: "base64", media_type: a.mime as "image/png" | "image/jpeg" | "image/webp" | "image/gif", data: Buffer.from(a.data).toString("base64") } }],
    schema: z.object({ note: z.string() }),
  });
  return out?.note ?? null;
}

/** Generate images and save them as brand imagery (they show up in the Editor's Media panel). */
export async function shoot(brandId: string, memberId: string, input: { product: string; imageUrl: string; prompt: string; aspect: "4:5" | "9:16" | "1:1"; n: number; referenceId?: string | null }): Promise<{ ids: string[]; error?: string }> {
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
    const [row] = await db.insert(schema.brandAssets).values({
      brandId, kind: "imagery", name: `${input.product.slice(0, 40)} · shoot`, mime: img.mediaType || "image/png", size: img.uint8Array.byteLength,
      data: Buffer.from(img.uint8Array), meta: { ai: true, prompt: input.prompt.slice(0, 500), product: input.product }, createdBy: memberId,
    }).returning({ id: schema.brandAssets.id });
    ids.push(row.id);
  }
  if (!ids.length && error) {
    if (/credit|billing|payment|insufficient/i.test(error)) error = "AI Gateway has no credits on this Vercel team. Add credits in Vercel → AI Gateway, then try again.";
    else if (/auth|token|unauthor|api key/i.test(error)) error = "AI Gateway isn’t reachable from here — it works on the deployed app (Vercel signs the requests).";
  }
  return { ids, error };
}

/** Higgsfield Marketing Studio: the Shopify photo goes in first (so the product stays exact), a brand reference photo second. */
async function shootHiggsfield(brandId: string, memberId: string, input: { product: string; imageUrl: string; prompt: string; aspect: "4:5" | "9:16" | "1:1"; n: number; referenceId?: string | null }): Promise<{ ids: string[]; error?: string }> {
  const urls = [input.imageUrl];
  if (input.referenceId) {
    const [r] = await db.select({ data: schema.brandAssets.data, mime: schema.brandAssets.mime }).from(schema.brandAssets).where(and(eq(schema.brandAssets.id, input.referenceId), eq(schema.brandAssets.brandId, brandId)));
    if (r?.mime.startsWith("image/")) urls.push(await hfUpload(r.data, r.mime).catch(() => "")); 
  }
  const text = `${input.prompt}\nThe first reference image is the real product: keep it exactly — same shape, label, colours and printed text.${urls.length > 1 ? " The second image is a style reference for light, mood and composition only." : ""} Photorealistic, no added text, logos or watermarks.`;
  const body = { prompt: text.slice(0, 5000), image_urls: urls.filter(Boolean), aspect_ratio: input.aspect === "4:5" ? "3:4" : input.aspect, resolution: "2k", quality: "high", enhance_prompt: false };
  const price = (await hfPrices().catch(() => null))?.photo ?? null;
  const runs = await Promise.all(Array.from({ length: Math.min(4, Math.max(1, input.n)) }, () => hfRun(HF_PHOTO, body, 150_000)));
  const ids: string[] = [];
  let error: string | undefined;
  for (const r of runs) {
    const url = r.out?.images?.[0]?.url;
    if (!url) { error = r.error ?? "No image came back."; continue; }
    try {
      const img = await hfDownload(url);
      const [row] = await db.insert(schema.brandAssets).values({
        brandId, kind: "imagery", name: `${input.product.slice(0, 40)} · shoot`, mime: img.mime.startsWith("image/") ? img.mime : "image/png", size: img.data.byteLength, data: img.data,
        meta: { ai: true, prompt: input.prompt.slice(0, 500), product: input.product, engine: "Higgsfield · Marketing Studio", ...(price != null ? { cost: price } : {}) }, createdBy: memberId,
      }).returning({ id: schema.brandAssets.id });
      ids.push(row.id);
    } catch (e) { error = (e as Error).message; }
  }
  return { ids, error };
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
  const [a] = await db.select({ data: schema.brandAssets.data, meta: schema.brandAssets.meta, mime: schema.brandAssets.mime }).from(schema.brandAssets).where(and(eq(schema.brandAssets.id, assetId), eq(schema.brandAssets.brandId, brandId)));
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
      const img = await hfDownload(out);
      const price = (await hfPrices().catch(() => null))?.photo;
      const [row] = await db.insert(schema.brandAssets).values({
        brandId, kind: "imagery", name: `${(a.meta.product ?? "Product").slice(0, 40)} · ${e.label.toLowerCase()}`, mime: img.mime.startsWith("image/") ? img.mime : "image/png", size: img.data.byteLength, data: img.data,
        meta: { ai: true, prompt: e.text, product: a.meta.product, edit: kind, engine: "Higgsfield · Marketing Studio", ...(price != null ? { cost: price } : {}) }, createdBy: memberId,
      }).returning({ id: schema.brandAssets.id });
      return { id: row.id };
    } catch (err) { return { error: (err as Error).message.slice(0, 160) }; }
  }
  try {
    const r = await generateImage({ model: gateway.imageModel(SHOOT_MODEL), prompt: { images: [new Uint8Array(a.data)], text: `${e.text}\nKeep the product exactly as it is — same shape, label, colours and text. Photorealistic, no added text or watermarks.` },
      ...(kind === "extend" ? { aspectRatio: "9:16" as const } : {}), maxRetries: 1 });
    const img = r.image;
    const [row] = await db.insert(schema.brandAssets).values({
      brandId, kind: "imagery", name: `${(a.meta.product ?? "Product").slice(0, 40)} · ${e.label.toLowerCase()}`, mime: img.mediaType || "image/png", size: img.uint8Array.byteLength,
      data: Buffer.from(img.uint8Array), meta: { ai: true, prompt: e.text, product: a.meta.product, edit: kind }, createdBy: memberId,
    }).returning({ id: schema.brandAssets.id });
    return { id: row.id };
  } catch (err) {
    const m = (err as Error).message ?? "";
    return { error: /credit|billing|payment|insufficient/i.test(m) ? "AI Gateway has no credits on this Vercel team." : /auth|token|unauthor/i.test(m) ? "AI Gateway works on the deployed app (Vercel signs the requests)." : `The image model failed: ${m.slice(0, 120)}` };
  }
}

const CheckOut = z.object({
  labelMatches: z.boolean().describe("The product's label/name matches the reference"),
  shapeExact: z.boolean().describe("Bottle/pack shape matches the reference"),
  coloursOnBrand: z.boolean(),
  noTextOrWatermark: z.boolean().describe("No added text, letters or watermarks besides the product's own label"),
  note: z.string().describe("Under 14 words: what's off, or 'Looks right'"),
});
export type ShotCheck = z.infer<typeof CheckOut>;

/** Otto looks at a generated photo next to the real product and checks it before it can go in an ad. */
export async function checkShot(brandId: string, assetId: string, referenceUrl: string, product: string): Promise<ShotCheck | null> {
  const [a] = await db.select({ data: schema.brandAssets.data, mime: schema.brandAssets.mime, meta: schema.brandAssets.meta }).from(schema.brandAssets).where(eq(schema.brandAssets.id, assetId));
  if (!a || !a.mime.startsWith("image/")) return null;
  const out = await ask("otto", {
    system: "You are Otto, Kaviar's QA agent. Compare a generated ad photo with the brand's real product photo. Be strict: brands get complaints when a product looks different from what arrives.",
    content: [
      { type: "text", text: `Reference: the real product “${product}”.` },
      { type: "image", source: { type: "url", url: referenceUrl } },
      { type: "text", text: "Generated photo to check:" },
      { type: "image", source: { type: "base64", media_type: a.mime as "image/png" | "image/jpeg" | "image/webp", data: Buffer.from(a.data).toString("base64") } },
    ],
    schema: CheckOut,
  });
  if (out) await db.update(schema.brandAssets).set({ meta: { ...a.meta, check: out } }).where(eq(schema.brandAssets.id, assetId));
  return out;
}

/** Animate a photo into a short vertical clip and save it as a brand asset. */
export async function shootVideo(brandId: string, memberId: string, input: { fromAssetId: string; prompt: string; seconds: number; aspect: "9:16" | "1:1" | "4:5"; sound?: string | null; voiceId?: string | null }): Promise<{ id?: string; error?: string }> {
  const [a] = await db.select({ data: schema.brandAssets.data, meta: schema.brandAssets.meta, mime: schema.brandAssets.mime }).from(schema.brandAssets).where(and(eq(schema.brandAssets.id, input.fromAssetId), eq(schema.brandAssets.brandId, brandId)));
  if (!a) return { error: "Pick a photo to start from." };
  if (hfReady()) {
    // Seedance 2.0: framing follows the start photo; with a Voice + music node wired in it makes the sound too.
    try {
      const url = await hfUpload(a.data, a.mime);
      const withSound = Boolean(input.sound);
      // A brand voice: Seedance's reference mode, with the photo as the image reference and the voice sample as the audio reference.
      const [voice] = input.voiceId && withSound ? await db.select({ data: schema.brandAssets.data, mime: schema.brandAssets.mime }).from(schema.brandAssets)
        .where(and(eq(schema.brandAssets.id, input.voiceId), eq(schema.brandAssets.brandId, brandId), eq(schema.brandAssets.kind, "voice"))) : [];
      const duration = Math.min(15, Math.max(4, input.seconds));
      let r;
      if (voice) {
        const audio = await hfUpload(voice.data, "audio/wav");
        const size = imageSize(a.data);
        const ratio = size ? nearestRatio(size.w / size.h) : "9:16";
        const prompt = `The reference image is the opening frame and the real product — keep the product exactly: same label, shape and colours. ${input.prompt}\nSubtle, natural motion. No added text.\nSound: ${input.sound}. The voice-over must use the speaker’s voice from the reference audio.`;
        r = await hfRun(HF_VIDEO_REF, { image_urls: [url], audio_urls: [audio], prompt: prompt.slice(0, 4000), duration, resolution: "720p", aspect_ratio: ["16:9", "4:3", "1:1", "3:4", "9:16"].includes(ratio) ? ratio : "9:16", generate_audio: true }, 270_000);
      } else {
        const prompt = `${input.prompt}\nSubtle, natural motion. Keep the product exactly as in the first frame — same label and shape. No added text.${withSound ? `\nSound: ${input.sound}` : ""}`;
        r = await hfRun(HF_VIDEO, { image_url: url, prompt: prompt.slice(0, 4000), duration, resolution: "720p", generate_audio: withSound }, 270_000);
      }
      const out = r.out?.video?.url;
      if (!out) return { error: r.error ?? "No clip came back." };
      const v = await hfDownload(out);
      const p = await hfPrices().catch(() => null);
      const cost = p ? input.seconds * (p.videoSecond + (withSound ? p.soundSecond : 0)) : null;
      const [row] = await db.insert(schema.brandAssets).values({
        brandId, kind: "video", name: `${(a.meta.product ?? "Product").slice(0, 40)} · clip`, mime: v.mime.startsWith("video/") ? v.mime : "video/mp4", size: v.data.byteLength, data: v.data,
        meta: { ai: true, prompt: input.prompt.slice(0, 500), product: a.meta.product, seconds: input.seconds, engine: "Higgsfield · Seedance 2.0", sound: withSound, ...(voice ? { voice: input.voiceId! } : {}), ...(cost != null ? { cost } : {}) }, createdBy: memberId,
      }).returning({ id: schema.brandAssets.id });
      return { id: row.id };
    } catch (e) { return { error: (e as Error).message.slice(0, 160) }; }
  }
  try {
    const r = await generateVideo({
      model: gateway.videoModel(VIDEO_MODEL),
      prompt: { image: new Uint8Array(a.data), text: `${input.prompt}\nSubtle, natural motion. Keep the product exactly as in the first frame — same label and shape. No added text.` },
      duration: input.seconds > 7 ? 10 : 5, aspectRatio: input.aspect === "4:5" ? "9:16" : input.aspect, maxRetries: 1,
    });
    const v = r.video;
    const [row] = await db.insert(schema.brandAssets).values({
      brandId, kind: "video", name: `${(a.meta.product ?? "Product").slice(0, 40)} · clip`, mime: v.mediaType || "video/mp4", size: v.uint8Array.byteLength,
      data: Buffer.from(v.uint8Array), meta: { ai: true, prompt: input.prompt.slice(0, 500), product: a.meta.product, seconds: input.seconds }, createdBy: memberId,
    }).returning({ id: schema.brandAssets.id });
    return { id: row.id };
  } catch (e) {
    const m = (e as Error).message ?? "";
    return { error: /credit|billing|payment|insufficient/i.test(m) ? "AI Gateway has no credits on this Vercel team." : /auth|token|unauthor/i.test(m) ? "AI Gateway works on the deployed app (Vercel signs the requests)." : `Video model failed: ${m.slice(0, 120)}` };
  }
}

/** A brand voice sample must be a WAV of 2–15 seconds (what Seedance accepts as a voice reference). Returns its length. */
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
