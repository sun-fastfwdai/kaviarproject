import "server-only";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "../db";
import { ask, type Block } from "../ai/client";
import type { AdDesign } from "../db/schema";
import { avgColor, loadImage, subjectOf, toJpeg } from "../audience/media";
import { canGoBehind, coverage } from "./cutout";
import { deleteAssets, saveAsset } from "../assets/storage";
import { marketContext } from "../research/context";
import { brandContext } from "./remy";
import { renderDesign, renderStory, SIZES } from "./card";
import { REGIONS, copyOf, isLayout, layoutDesign, toneFor, type CardCopy, type LayoutKey, type Tone } from "./layouts";

/**
 * Static ad cards. Shoots makes the photo; here Remy writes the words that go ON the picture (a headline that is the message, a line
 * that makes it true, a payoff), picks a layout that suits the brand, and Kaviar lays the type on the photo and draws the finished card.
 * Every layer stays editable in the Editor.
 */
const CardOut = z.object({
  cards: z.array(z.object({
    ad: z.number().describe("The ad's number"),
    layout: z.enum(["bold", "bigword", "benefits", "statement", "poster", "chips", "stack", "editorial", "luxe", "minimal", "caption"]).describe("The layout whose type areas fall on calm, empty parts of this ad's photo"),
    word: z.string().describe("ONE evocative word of 3–7 letters that names the benefit or feeling (GLOW, CALM, CLEAR, SOFT, SHIELD) — the giant word of the bigword and stack layouts"),
    benefits: z.array(z.string()).describe("3 short proofs, 2–4 words each, true to the product and the ad copy (e.g. 'Centella & allantoin', 'No harsh acids', 'Made for adult skin')"),
    headline: z.string().describe("2–5 words, the message itself — a promise, a 'Why this …?' question, or a number hook. Under 28 characters"),
    subline: z.string().describe("Under 14 words: what makes the headline true"),
    tagline: z.string().describe("2–5 words: the payoff, e.g. 'One swipe delivers.'"),
    note: z.string().describe("Under 10 words under the tagline; empty if not needed"),
  })),
});

const SYSTEM = `You are Remy, Kaviar's creative director, finishing static Meta ad cards for a message test — the modern DTC style: each card tests ONE message for one buyer, over an art-directed product photo from the shoot. You write the words that sit ON the picture and choose where they sit.
- Headline: the message in 2–5 words. A promise ("One Balm. Multiple Fixes."), a question ("Why This Eye Balm?") or a number hook. Title Case; no full stop unless it is two short sentences.
- Subline: one plain sentence that makes the headline believable. Tagline: the payoff, 2–5 words. Note: an optional small line.
- For the statement layout the headline may be a playful provocation that the subline resolves — never a false or negative claim about the product.
- For the benefits layout: tagline continues the headline as its second line; note is three words separated by " · " (e.g. "Calm · Clear · Comfortable").
- For the poster layout: headline is 2–3 punchy words set huge in capitals ("Sunscreen Day", "Calm Skin Club") — 16 characters at most; subline is one short line under it, 8 words at most ("Go ultra-light. Go essence.").
- For the chips layout: headline is 2–3 words in white ("Golden Hour"); tagline sits under it on a colour chip — the product or the promise in 2–4 words ("Glow Sunscreen"); subline is a short human line near the bottom ("Play on till the sun's gone"); note sits under that on a chip — the proof in 3–5 words ("8 hrs UV protection").
- For the stack layout: three tiers of capitals — headline is a 2–3 word lead-in that the word completes ("Your Daily"), word is the one huge word ("SHIELD"), tagline says what it is in 2–3 words ("Gel SPF50+"). The lead-in must not contain the word.
- Every card says something different, each true to its ad's hook and copy.
- Use only claims the brand, its positioning and the ad copy already make. Never invent quotes, reviews, numbers, awards, discounts or medical effects.
- You are shown each photo. For every card pick the layout whose type lands on calm, empty parts of ITS photo — never over the product's label or a face:
  · bold — big centred headline across the top, payoff centred at the bottom. Punchy DTC; needs a clean top third.
  · bigword — ONE giant see-through word across the top, two short labels beside the product, the message at the bottom. Poster-like; needs an empty top 38% and space beside the product.
  · benefits — serif headline (its second line, the tagline, in the accent colour), three caps words (the note), a ticked list of the benefits down the left, a button. Informative; needs a clean left half with the product on the right.
  · statement — a huge stacked statement filling the top (a provocation or bold claim, e.g. "Don't Buy This Serum"), the twist in the subline ("Unless you want calm, clear skin."), three ticked proofs along the bottom. Needs an empty top 45%.
  · poster — ONE giant capital headline across the bottom with a short line under it, brand in the top-left corner. For a person-and-product shot; needs a plain bottom 28% (floor, ground).
  · chips — white headline top-left with a colour chip under it, a short claim and a chip bottom-left. Sunny lifestyle shots; needs open sky or plain colour down the left side.
  · stack — a lead-in, one huge serif word and a third line, centred across the top; a small line and the brand along the bottom. Close portraits; needs a plain top 36%.
  · editorial — large serif headline top-left with small caps under it. Beauty and lifestyle; needs a clean top-left.
  · luxe — brand name at the top, light-and-bold caps headline in the bottom third. Premium, fragrance, portraits; needs a calm lower third.
  · minimal — one quiet serif line at the top, brand at the bottom. A confident single thought; needs a plain top.
  · caption — caps title and a short paragraph top-left, a button bottom-left. Informative, ingredient-led; needs a clean left side.
  Cards that share a photo use the same layout, so the words are the only thing that changes — unless the request asks for a different layout on every card.`;

const lum = (c: { r: number; g: number; b: number } | null) => (c ? (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255 : null);
const hexLum = (h: string) => lum({ r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) })!;

/** Light or dark type for a layout's two type areas, read from the photo — and whether a giant word can go behind the product. */
async function tonesFor(brandId: string, image: string | null, key: LayoutKey, ink: string): Promise<{ top: Tone; bottom: Tone; behind: boolean }> {
  const img = image ? await loadImage(brandId, image).catch(() => null) : null;
  if (!img) return { top: toneFor(0.9, ink), bottom: toneFor(0.9, ink), behind: false }; // no photo: the soft light background
  const buf = Buffer.from(img.data, "base64"), r = REGIONS[key];
  const [t, b, subject] = await Promise.all([avgColor(buf, r.top), avgColor(buf, r.bottom), key === "bigword" ? subjectOf(buf) : null]);
  return { top: toneFor(lum(t), ink), bottom: toneFor(lum(b), ink), behind: subject ? canGoBehind(coverage(subject.mask, 0.1, 0.46)) : false };
}

const A = schema.ads;
const cardId = (url?: string | null) => /^\/api\/assets\/([0-9a-f-]{36})$/i.exec(url ?? "")?.[1] ?? null;
/** The photo behind an ad: its design's picture, or its own picture when that isn't a finished card. */
const photoOf = (a: { imageUrl: string | null; design: AdDesign | null }) => (a.design?.card && a.imageUrl === a.design.card ? a.design.image : a.imageUrl);

/** Draw the card for a design, save it as the ad's picture and drop the card it replaces. */
async function drawCard(brandId: string, memberId: string | null, ad: { id: string; product: string | null; design: AdDesign | null }, design: AdDesign, plan?: string): Promise<string> {
  const png = await renderDesign(brandId, design);
  const [asset] = await saveAsset({ brandId, kind: "imagery", name: `${(ad.product ?? "Ad").slice(0, 40)} · ad card`, mime: "image/png", size: png.length, data: png, meta: { ai: true, product: ad.product ?? undefined, edit: "card", ...(design.look ? { look: design.look } : {}), ...(plan ? { plan } : {}) }, createdBy: memberId }); // `plan`: drawn for a campaign, so it is that campaign's picture
  const card = `/api/assets/${asset.id}`, old = cardId(ad.design?.card);
  await db.update(A).set({ design: { ...design, card, pending: false }, imageUrl: card, updatedAt: new Date() }).where(eq(A.id, ad.id));
  if (old) await deleteAssets(and(eq(schema.brandAssets.id, old), eq(schema.brandAssets.brandId, brandId))).catch(() => undefined);
  return card;
}

/**
 * Lay out the static ads of a batch as cards over their photos (after Shoots sends the photos). One call to Remy for the words and the
 * layout; then each card is drawn. `layout` forces a layout; otherwise Remy picks one for the set.
 */
/** Layouts that sit well on a plain product photo, in the order they are handed out when every card should look different. */
const ON_A_PACKSHOT: LayoutKey[] = ["bold", "benefits", "statement", "bigword", "editorial", "caption", "minimal", "stack", "luxe"];

export async function layoutBatch(brandId: string, batchId: string, memberId: string | null, adIds?: string[], layout?: LayoutKey, shotFor?: LayoutKey, look?: string,
  opts: { plan?: string; vary?: boolean } = {}): Promise<{ made: number; error?: string }> { // plan: the campaign these cards belong to · vary: a different layout on every card
  const [batch] = await db.select().from(schema.adBatches).where(and(eq(schema.adBatches.id, batchId), eq(schema.adBatches.brandId, brandId)));
  const ads = (await db.select().from(A).where(and(eq(A.batchId, batchId), ...(adIds?.length ? [inArray(A.id, adIds)] : []))))
    .filter((a) => a.status !== "rejected" && (a.format === "static" || a.format === "carousel")).sort((x, y) => x.position - y.position);
  if (!batch || !ads.length) return { made: 0 };
  const [ctx, market, [b]] = await Promise.all([brandContext(brandId), marketContext(brandId).catch(() => null), db.select({ onboarding: schema.brands.onboarding }).from(schema.brands).where(eq(schema.brands.id, brandId))]);
  const palette = b?.onboarding?.analysis?.palette ?? [];
  // Remy sees the photos (each once), so the type goes where each picture has room for it.
  const photos = [...new Set(ads.map((a) => photoOf(a)).filter((x): x is string => Boolean(x)))].slice(0, 5);
  const seen: Block[] = [];
  for (const [i, url] of photos.entries()) {
    const img = await loadImage(brandId, url).catch(() => null);
    const small = img ? await toJpeg(Buffer.from(img.data, "base64"), 640).catch(() => null) : null;
    if (small) seen.push({ type: "text", text: `Photo ${i + 1}:` }, { type: "image", source: { type: "base64", media_type: "image/jpeg", data: small.toString("base64") } });
  }
  const out = await ask("remy", {
    system: SYSTEM,
    content: [...seen, { type: "text", text: JSON.stringify({
      brand: ctx.brand, buyers: batch.audience, brief: batch.brief,
      positioning: market?.positioning ? { statement: market.positioning.statement, pillars: market.positioning.pillars, voice: market.positioning.voice, avoid: market.positioning.stayAwayFrom } : null,
      ...(opts.vary ? { layouts: `These ads are one test of different designs as well as different messages: give every card a DIFFERENT layout, each one suited to its photo. On a plain product photo prefer ${ON_A_PACKSHOT.slice(0, 7).join(", ")}.` } : {}),
      ...(shotFor ? { photosWereShotFor: `the "${shotFor}" layout — use it for every card unless a photo clearly has no room for its type` } : {}),
      ads: ads.map((a, i) => ({ ad: i + 1, photo: photos.indexOf(photoOf(a) ?? "") + 1 || null, product: a.product, hook: a.hook, primaryText: a.primaryText, headline: a.headline, offer: a.offer })),
    }) }],
    schema: CardOut, maxTokens: 5000,
  });
  if (!out) return { made: 0, error: "Remy couldn’t write the cards — open an ad in the Editor to lay it out by hand." };
  // One layout per photo: the first card's choice for that photo stands for all cards that share it.
  const byPhoto = new Map<string, LayoutKey>();
  const inkHex = palette.find((p) => /text/i.test(p.role))?.hex;
  const ink = inkHex && /^#[0-9a-f]{6}$/i.test(inkHex) && hexLum(inkHex) < 0.3 ? inkHex : "#1C1B19";
  const accentHex = palette.find((p) => /accent/i.test(p.role))?.hex;
  const accent = accentHex && /^#[0-9a-f]{6}$/i.test(accentHex) && hexLum(accentHex) < 0.62 ? accentHex : undefined;
  const chip = accentHex && /^#[0-9a-f]{6}$/i.test(accentHex) ? accentHex : undefined; // chips carry their own text colour, so any accent works
  let made = 0;
  const used = new Set<LayoutKey>();
  for (const [i, a] of ads.entries()) {
    const c = out.cards.find((x) => x.ad === i + 1) ?? out.cards[i];
    if (!c) continue;
    try {
      const copy: CardCopy = { headline: c.headline, subline: c.subline, tagline: c.tagline, note: c.note, brand: ctx.brand.name, cta: a.cta, word: c.word.replace(/[^\p{L}]/gu, "").slice(0, 9), benefits: c.benefits.map((b) => b.slice(0, 40)).slice(0, 4) };
      const photo = photoOf(a);
      const want: LayoutKey = isLayout(c.layout) ? c.layout : "bold";
      // One layout a card when asked to vary: Remy's choice, or the next one nobody has taken yet.
      const key: LayoutKey = layout ?? (opts.vary ? (!used.has(want) ? want : ON_A_PACKSHOT.find((k) => !used.has(k)) ?? want) : byPhoto.get(photo ?? "") ?? want);
      byPhoto.set(photo ?? "", key); used.add(key);
      const tones = await tonesFor(brandId, photo, key, ink);
      await drawCard(brandId, memberId, a, { ...layoutDesign(key, copy, { ...tones, accent, chip }, photo, 1080, 1350, { behind: tones.behind }), ...(look ? { look } : {}) }, opts.plan);
      made++;
    } catch (e) { console.error("layout card", a.id, (e as Error).message); }
  }
  return { made };
}

/** Re-draw one ad's card after its layers change in the Editor. Returns the new card, or null when it couldn't be drawn. */
export async function redrawCard(brandId: string, memberId: string | null, adId: string, design: AdDesign): Promise<string | null> {
  const [ad] = await db.select({ id: A.id, product: A.product, design: A.design }).from(A).where(and(eq(A.id, adId), eq(A.brandId, brandId)));
  if (!ad) return null;
  try { return await drawCard(brandId, memberId, ad, design); }
  catch (e) { console.error("redraw card", adId, (e as Error).message); return null; }
}

/** A layout applied to an ad on the server — used by the Editor's agent, which can't sample the photo itself. */
export async function relayout(brandId: string, key: LayoutKey, current: AdDesign, ad: { hook: string; headline: string; cta: string; offer: string }, brand: string): Promise<AdDesign> {
  const [b] = await db.select({ onboarding: schema.brands.onboarding }).from(schema.brands).where(eq(schema.brands.id, brandId));
  const inkHex = b?.onboarding?.analysis?.palette?.find((p) => /text/i.test(p.role))?.hex;
  const ink = inkHex && /^#[0-9a-f]{6}$/i.test(inkHex) && hexLum(inkHex) < 0.3 ? inkHex : "#1C1B19";
  const tones = await tonesFor(brandId, current.image, key, ink);
  return { ...layoutDesign(key, copyOf(current, ad, brand), tones, current.image, 1080, 1350, { behind: tones.behind }), ...(current.look ? { look: current.look } : {}) };
}

const rgbHex = (c: { r: number; g: number; b: number } | null) => (c ? `#${[c.r, c.g, c.b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}` : "#EDE9E2");
/**
 * A designed ad in one of Meta's three shapes. Feed (4:5) is the card as designed. Square (1:1) is the same layout and words laid out
 * again for the square. Story (9:16) is the feed card set in the middle of a plain field in the photo's own colour.
 */
export async function cardAt(brandId: string, ad: { design: AdDesign | null; hook: string; headline: string; cta: string; offer: string }, size: keyof typeof SIZES): Promise<Buffer | null> {
  const d = ad.design;
  if (!d?.layers?.length) return null;
  if (size === "4x5") return renderDesign(brandId, d);
  if (size === "1x1") {
    const key: LayoutKey = isLayout(d.layout) ? d.layout : "bold";
    const [b] = await db.select({ onboarding: schema.brands.onboarding }).from(schema.brands).where(eq(schema.brands.id, brandId));
    const inkHex = b?.onboarding?.analysis?.palette?.find((p) => /text/i.test(p.role))?.hex;
    const ink = inkHex && /^#[0-9a-f]{6}$/i.test(inkHex) && hexLum(inkHex) < 0.3 ? inkHex : "#1C1B19";
    const tones = await tonesFor(brandId, d.image, key, ink);
    return renderDesign(brandId, layoutDesign(key, copyOf(d, ad, d.copy?.brand ?? ""), tones, d.image, SIZES["1x1"].w, SIZES["1x1"].h, { behind: tones.behind }), "1x1");
  }
  const card = await renderDesign(brandId, d), img = d.image ? await loadImage(brandId, d.image).catch(() => null) : null;
  const edge = img ? await avgColor(Buffer.from(img.data, "base64"), { x: 0, y: 0, w: 1, h: 0.06 }).catch(() => null) : null;
  return renderStory(card, rgbHex(edge));
}
