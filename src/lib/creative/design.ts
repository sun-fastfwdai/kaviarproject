import "server-only";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "../db";
import { ask } from "../ai/client";
import type { AdDesign, Layer } from "../db/schema";
import { avgColor, loadImage } from "../audience/media";
import { marketContext } from "../research/context";
import { brandContext } from "./remy";
import { checkShot, shoot } from "./shoots";
import { renderDesign } from "./card";

/**
 * Static ad cards that test one message each: a big headline that IS the message, a short line that explains it, a small payoff at the
 * bottom, over a styled product shot that shows the message (texture, ingredients, a moment of use). The shot is made from the real
 * product photo and checked by Otto; the type is laid out in the Editor's layers (still editable there) and rendered to a PNG.
 */
const CardOut = z.object({
  look: z.string().describe("One shared look for the set — surfaces, palette, light — so the cards read as one campaign"),
  cards: z.array(z.object({
    ad: z.number().describe("The ad's number"),
    headline: z.string().describe("2–5 words, the message itself — a promise, a 'Why this …?' question, or a number hook. Under 28 characters"),
    subline: z.string().describe("Under 14 words: what makes the headline true"),
    tagline: z.string().describe("2–5 words: the payoff, e.g. 'One swipe delivers.'"),
    note: z.string().describe("Under 10 words under the tagline; empty if not needed"),
    scene: z.string().describe("The photo brief that SHOWS this message: surface, texture swatch or ingredients, props, light, angle, where the product sits. 30–60 words"),
    layout: z.enum(["top", "left"]).describe("top: centred type over a clean upper third; left: type on the left, product to the right"),
  })),
});

const SYSTEM = `You are Remy, Kaviar's creative director, designing static Meta ad cards for a message test — the modern DTC carousel style: each card tests ONE message for one buyer.
- Headline: the message in 2–5 words, big. A promise ("One Balm. Multiple Fixes."), a question ("Why This Eye Balm?") or a number hook ("50? Build Collagen."). Title Case, no full stop unless it's two short sentences.
- Subline: one plain sentence that makes the headline believable. Tagline: the payoff, 2–5 words. Note: optional small line.
- Photo: a styled product shot that shows the message — a swatch of the product's texture, the ingredients, flowers for a scent, a hand using it. Calm, premium, one product, real.
- Use only claims the brand, its positioning and the ad copy already make. Never invent quotes, reviews, numbers, awards, discounts or medical effects.
- Every card in the set says something different. Write in the brand's voice for the ad's buyer.`;

const lum = (c: { r: number; g: number; b: number }) => (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
const isHex = (s?: string) => Boolean(s && /^#[0-9a-f]{6}$/i.test(s));
const hexLum = (h: string) => lum({ r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) });

/** Greedy word wrap by an average glyph width — enough to stack the layers without overlap. */
const lines = (text: string, widthPx: number, size: number, k: number) => {
  const per = Math.max(4, Math.floor(widthPx / (size * k)));
  let n = 1, cur = 0;
  for (const w of text.split(/\s+/)) { if (cur && cur + 1 + w.length > per) { n++; cur = w.length; } else cur += (cur ? 1 : 0) + w.length; }
  return n;
};
const uid = () => Math.random().toString(36).slice(2, 9);

/** The type for one card, placed for its layout and coloured for the photo under it. */
export function cardLayers(c: { headline: string; subline: string; tagline: string; note: string; layout: "top" | "left" }, o: { serif: boolean; top: string; bottom: string; topShadow: boolean; bottomShadow: boolean }, W = 1080, H = 1350): Layer[] {
  const left = c.layout === "left";
  const x = left ? 0.07 : 0.08, w = left ? 0.62 : 0.84, align = left ? "left" as const : "center" as const;
  const font = o.serif ? "serif" as const : "display" as const, k = o.serif ? 0.5 : 0.56;
  const len = c.headline.length;
  const size = Math.round((len <= 14 ? 108 : len <= 22 ? 96 : len <= 32 ? 84 : 72) * (o.serif ? 1.08 : 1));
  const y0 = 0.055;
  const headH = lines(c.headline, w * W, size, k) * size * 1.15;
  const subX = left ? x : 0.14, subW = left ? w : 0.72;
  const out: Layer[] = [
    { id: uid(), kind: "text", text: c.headline, x, y: y0, w, size, font, color: o.top, weight: 700, align, shadow: o.topShadow },
    { id: uid(), kind: "text", text: c.subline, x: subX, y: (y0 * H + headH + 30) / H, w: subW, size: 34, font: "sans", color: o.top, weight: 500, align, shadow: o.topShadow },
  ];
  const noteH = c.note ? lines(c.note, 0.76 * W, 30, 0.52) * 30 * 1.15 + 8 : 0;
  const tagY = H - 64 - noteH - 48 * 1.15;
  out.push({ id: uid(), kind: "text", text: c.tagline, x: left ? x : 0.08, y: tagY / H, w: left ? w : 0.84, size: 48, font: "display", color: o.bottom, weight: 700, align, shadow: o.bottomShadow });
  if (c.note) out.push({ id: uid(), kind: "text", text: c.note, x: left ? x : 0.12, y: (tagY + 48 * 1.15 + 8) / H, w: left ? w : 0.76, size: 30, font: "sans", color: o.bottom, weight: 500, align, shadow: o.bottomShadow });
  return out;
}

const A = schema.ads;
/** Mark ads as being designed, so the batch shows it and polls. */
export async function markDesigning(batchId: string, adIds?: string[]) {
  const ads = await db.select({ id: A.id, design: A.design, imageUrl: A.imageUrl }).from(A).where(and(eq(A.batchId, batchId), ...(adIds?.length ? [inArray(A.id, adIds)] : [])));
  await Promise.all(ads.map((a) => db.update(A).set({ design: { ...(a.design ?? { image: a.imageUrl, overlay: 0, layers: [] }), pending: true } }).where(eq(A.id, a.id))));
  return ads.length;
}

/** Remy designs a card for each ad in the batch (or the ads given); each finished card replaces the ad's picture. */
export async function designBatch(brandId: string, batchId: string, memberId: string | null, adIds?: string[]): Promise<{ made: number; error?: string }> {
  const [batch] = await db.select().from(schema.adBatches).where(and(eq(schema.adBatches.id, batchId), eq(schema.adBatches.brandId, brandId)));
  const ads = (await db.select().from(A).where(and(eq(A.batchId, batchId), ...(adIds?.length ? [inArray(A.id, adIds)] : [])))).filter((a) => a.status !== "rejected");
  const clear = async (ids: string[]) => {
    for (const a of ads.filter((x) => ids.includes(x.id))) await db.update(A).set({ design: a.design ? { ...a.design, pending: false } : null }).where(eq(A.id, a.id));
  };
  if (!batch || !ads.length) { await clear(ads.map((a) => a.id)); return { made: 0, error: "No ads to design." }; }
  try {
    const ctx = await brandContext(brandId);
    const market = await marketContext(brandId).catch(() => null);
    const [b] = await db.select({ onboarding: schema.brands.onboarding }).from(schema.brands).where(eq(schema.brands.id, brandId));
    const palette = b?.onboarding?.analysis?.palette ?? [];
    const fontName = b?.onboarding?.analysis?.font?.name ?? "";
    const serif = /serif|didot|garamond|bodoni|playfair|caslon|times|baskerville|cormorant|canela|freight/i.test(fontName) && !/sans/i.test(fontName);
    const out = await ask("remy", {
      system: SYSTEM,
      content: JSON.stringify({
        brand: ctx.brand, buyers: batch.audience, brief: batch.brief,
        positioning: market?.positioning ? { statement: market.positioning.statement, pillars: market.positioning.pillars, voice: market.positioning.voice, avoid: market.positioning.stayAwayFrom } : null,
        colours: palette.map((p) => `${p.role}: ${p.hex}`),
        ads: ads.map((a, i) => ({ ad: i + 1, product: a.product, hook: a.hook, primaryText: a.primaryText, headline: a.headline, offer: a.offer, why: a.why })),
      }),
      schema: CardOut, maxTokens: 6000,
    });
    if (!out) throw new Error("Remy couldn’t design the cards — try again.");
    const ink = palette.find((p) => /text/i.test(p.role))?.hex;
    const dark = isHex(ink) && hexLum(ink!) < 0.3 ? ink! : "#1C1B19";
    let made = 0;
    await Promise.all(ads.map(async (a, i) => {
      const card = out.cards.find((c) => c.ad === i + 1) ?? out.cards[i];
      const product = ctx.products.find((p) => p.title === a.product) ?? ctx.products.find((p) => p.imageUrl === a.imageUrl) ?? null;
      const photo = product?.imageUrl ?? (a.imageUrl && !a.imageUrl.startsWith("/api/assets/") ? a.imageUrl : null);
      try {
        if (!card) throw new Error("no card");
        // The scene, shot from the real product photo with room for the type; Otto checks it and it's shot again once if the product changed.
        let scene: string | null = null;
        if (photo) {
          const room = card.layout === "top"
            ? "Compose for a 4:5 ad: keep the top third of the frame clean, soft and plain (no objects) for a headline, and the bottom sixth calm; the product sits in the middle."
            : "Compose for a 4:5 ad: keep the left half of the upper 40% plain for a headline; the product sits right of centre, lower in the frame.";
          for (let t = 0; t < 2 && !scene; t++) {
            const r = await shoot(brandId, memberId, { product: a.product ?? product?.title ?? "the product", imageUrl: photo, prompt: `${card.scene}\n${room}\nThe whole set: ${out.look}`, aspect: "4:5", n: 1 });
            const id = r.ids[0];
            if (!id) break;
            const ok = await checkShot(brandId, id, photo, a.product ?? product?.title ?? "the product");
            if (!ok || (ok.labelMatches && ok.shapeExact && ok.noTextOrWatermark)) scene = `/api/assets/${id}`;
            else await db.delete(schema.brandAssets).where(and(eq(schema.brandAssets.id, id), eq(schema.brandAssets.brandId, brandId)));
          }
        }
        const bg = scene ?? photo ?? null;
        // Dark or light type, from the photo under it.
        const img = bg ? await loadImage(brandId, bg) : null;
        const buf = img ? Buffer.from(img.data, "base64") : null;
        const topBox = card.layout === "top" ? { x: 0.08, y: 0.03, w: 0.84, h: 0.3 } : { x: 0.05, y: 0.03, w: 0.55, h: 0.38 };
        const [tc, bc] = buf ? await Promise.all([avgColor(buf, topBox), avgColor(buf, { x: 0.08, y: 0.8, w: 0.84, h: 0.17 })]) : [null, null];
        const pick = (c: { r: number; g: number; b: number } | null) => (c && lum(c) < 0.55 ? { color: "#FFFFFF", shadow: true } : { color: dark, shadow: false });
        const t = pick(tc), btm = pick(bc);
        const design: AdDesign = { image: bg, overlay: 0, layers: cardLayers(card, { serif, top: t.color, bottom: btm.color, topShadow: t.shadow, bottomShadow: btm.shadow }), layout: card.layout };
        const png = await renderDesign(brandId, design);
        const [asset] = await db.insert(schema.brandAssets).values({
          brandId, kind: "imagery", name: `${(a.product ?? "Ad").slice(0, 40)} · ad card`, mime: "image/png", size: png.length, data: png,
          meta: { ai: true, prompt: card.scene.slice(0, 500), product: a.product ?? undefined, edit: "card" }, createdBy: memberId,
        }).returning({ id: schema.brandAssets.id });
        await db.update(A).set({ design: { ...design, card: `/api/assets/${asset.id}`, pending: false }, imageUrl: `/api/assets/${asset.id}`, updatedAt: new Date() }).where(eq(A.id, a.id));
        made++;
      } catch (e) {
        console.error("design card", a.id, (e as Error).message);
        await db.update(A).set({ design: a.design ? { ...a.design, pending: false } : null }).where(eq(A.id, a.id));
      }
    }));
    return { made };
  } catch (e) {
    await clear(ads.map((a) => a.id));
    return { made: 0, error: (e as Error).message.slice(0, 160) };
  }
}

/** Re-render a card after the team edits its layers in the Editor. */
export async function rerenderCard(brandId: string, adId: string, design: AdDesign): Promise<string | null> {
  try {
    const png = await renderDesign(brandId, design);
    const [asset] = await db.insert(schema.brandAssets).values({ brandId, kind: "imagery", name: "Ad card · edited", mime: "image/png", size: png.length, data: png, meta: { ai: true, edit: "card" } }).returning({ id: schema.brandAssets.id });
    return `/api/assets/${asset.id}`;
  } catch (e) { console.error("rerender card", adId, (e as Error).message); return null; }
}
