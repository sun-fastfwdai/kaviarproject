import "server-only";
import { avgColor, subjectOf, toJpeg } from "../audience/media";
import { getFile, putFile, storageOn } from "../assets/storage";
import { renderDesign } from "./card";
import { canGoBehind, coverage } from "./cutout";
import { PHOTO_MODELS, hfImage, hfReady, hfRun } from "./higgsfield";
import { AD_LOOKS, REGIONS, layoutDesign, toneFor, type CardCopy } from "./layouts";

/**
 * Kaviar's example ad for each ad style, shown in the style picker: a real photo shot in that style (an unbranded product, so it
 * belongs to no one) with sample words laid out by the same layouts the team's ads use. Made once and kept in storage.
 */
const path = (key: string) => `looks/${key}.jpg`;
const base = { subline: "", tagline: "", note: "", brand: "Your brand", cta: "Shop now" };
const SAMPLE: Record<string, { product: string; copy: CardCopy; chip?: string }> = {
  swatch: { product: "a matte white squeeze tube of gel-cream with a sage-green cap", copy: { ...base, headline: "One Cream. Calm Skin.", subline: "Barrier care that sinks in fast.", tagline: "One swipe delivers.", note: "Your daily fix." } },
  bigword: { product: "a clear glass bottle of vitamin C serum with a matte black cap", copy: { ...base, headline: "Bright Skin, Daily.", subline: "A light serum that wakes up dull skin.", word: "Glow", benefits: ["Vitamin C", "No stickiness"] } },
  benefits: { product: "a white pump bottle of body lotion with a terracotta cap", copy: { ...base, headline: "Calm Skin,", tagline: "No Burn.", note: "Calm · Clear · Kind", benefits: ["Soothes on contact", "No harsh acids", "Made for adults"] } },
  statement: { product: "a small amber glass dropper bottle of face oil with a gold cap", copy: { ...base, headline: "Don’t Buy This Serum", subline: "Unless you want calm, clear skin.", benefits: ["No sting", "Vegan", "Derm tested"] } },
  splash: { product: "a frosted pale-blue bottle of hydrating toner with a navy cap", copy: { ...base, headline: "Hydration, On Tap.", subline: "A daily drink for thirsty skin.", tagline: "Drench. Glow. Go." } },
  giant: { product: "a blue sunscreen tube with a yellow flip cap", copy: { ...base, headline: "Protection, at scale." } },
  podium: { product: "a cream-coloured jar of body butter with a rose-gold lid", copy: { ...base, headline: "Silk-Soft Every Day", subline: "Rich body butter that melts in, never greasy.", tagline: "Soft for 24 hours." } },
  stone: { product: "a clear glass bottle of botanical cleanser with a sage-green cap", copy: { ...base, headline: "Nothing but the good stuff." } },
  dark: { product: "a black glass bottle of night serum with a brushed-gold cap", copy: { ...base, headline: "The Night Ritual", subline: "Repair while you sleep." } },
  reach: { product: "an amber glass dropper bottle with a black cap and a terracotta label", copy: { ...base, headline: "Glow Day", subline: "One drop. All day." } },
  sky: { product: "a white sunscreen tube with an orange band and a green cap", chip: "#F59B1C", copy: { ...base, headline: "Golden Hour", tagline: "Glow Sunscreen", subline: "Play on till the sun’s gone", note: "8 hrs UV protection" } },
  peek: { product: "a small pale-green pump bottle of gel sunscreen", copy: { ...base, headline: "Your Daily", word: "Shield", tagline: "Gel SPF50+", subline: "Light gel, no white cast." } },
  portrait: { product: "a slim white serum bottle with a gold cap", copy: { ...base, headline: "New Year New Skin", subline: "The serum that starts over." } },
  skin: { product: "a small white jar of barrier cream", copy: { ...base, headline: "A subtle glow, yours.", subline: "Barrier cream · 50 ml", tagline: "Soft by morning." } },
  moment: { product: "a sage-green pump bottle of face cleanser", copy: { ...base, headline: "My 30-Second Morning", subline: "One step, then out the door.", tagline: "Clean skin, done." } },
  colour: { product: "a white bottle of tinted serum with a hot-pink cap", copy: { ...base, headline: "Blush, bottled.", subline: "The tinted serum", tagline: "One drop of colour." } },
};
const lum = (c: { r: number; g: number; b: number } | null) => (c ? (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255 : null);

export const lookExample = (key: string): Promise<Buffer | null> => (storageOn() && key in SAMPLE ? getFile(path(key)) : Promise.resolve(null));

/** Shoot and design the example for one style, and keep it. */
export async function makeLookExample(key: string): Promise<{ ok?: true; bytes?: number; model?: string; error?: string }> {
  const look = AD_LOOKS.find((l) => l.key === key), sample = SAMPLE[key];
  if (!look || !sample) return { error: "Unknown style." };
  if (!hfReady() || !storageOn()) return { error: "Needs the photo engine and storage — both are set up on the deployed app." };
  const prompt = [
    `SUBJECT: ${sample.product}. One product only. Its label is plain and minimal, with no readable words.`,
    look.person ? "MODEL: a woman in her late twenties with natural, healthy skin and an easy, confident expression; one person only; natural hands." : "",
    `SET AND STYLING: ${look.direction}`,
    `CAMERA AND LIGHT: ${look.camera}`,
    `COMPOSITION: portrait 3:4. ${look.room}`,
    "FINISH: a photorealistic advertising photograph with true materials and clean retouching, like a premium beauty campaign.",
    "AVOID: any text, lettering, numbers, logos or watermarks anywhere in the image; extra products; a busy background where the composition asks for empty space.",
  ].filter(Boolean).join("\n");
  const body = { prompt: prompt.slice(0, 5000), aspect_ratio: "3:4", resolution: "2k", quality: "high", enhance_prompt: false };
  let model = "sunburst", r = await hfRun(PHOTO_MODELS.sunburst.path, body, 200_000);
  if (!r.out?.images?.[0]?.url) { model = "flare"; r = await hfRun(PHOTO_MODELS.flare.path, body, 170_000); }
  const url = r.out?.images?.[0]?.url;
  if (!url) return { error: r.error ?? "No image came back." };
  const shot = await hfImage(url);
  const jpg = (await toJpeg(shot.data, 1080)) ?? shot.data;
  const region = REGIONS[look.layout];
  const [t, b, subject] = await Promise.all([avgColor(jpg, region.top), avgColor(jpg, region.bottom), look.layout === "bigword" ? subjectOf(jpg) : null]);
  const design = layoutDesign(look.layout, sample.copy, { top: toneFor(lum(t)), bottom: toneFor(lum(b)), chip: sample.chip }, "example", 1080, 1350,
    { behind: subject ? canGoBehind(coverage(subject.mask, 0.1, 0.46)) : false });
  const card = await renderDesign("", design, "4x5", { media: "image/jpeg", data: jpg.toString("base64") });
  const small = (await toJpeg(card, 720)) ?? card;
  await putFile(path(key), "image/jpeg", small);
  return { ok: true, bytes: small.length, model };
}
