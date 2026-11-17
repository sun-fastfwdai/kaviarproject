import type { AdDesign, Layer } from "../db/schema";

/**
 * Professional static-ad layouts, shared by the server (which draws finished cards) and the Editor (which lets the team switch
 * layouts and edit every layer). A layout places the ad's copy — headline, subline, payoff, brand — over the photo from Shoots.
 * Sizes are px on a 1080-wide artboard; positions are fractions of the artboard.
 */
export type CardCopy = { headline: string; subline: string; tagline: string; note: string; brand: string; cta: string };
export type LayoutKey = "bold" | "editorial" | "luxe" | "minimal" | "caption";
export const LAYOUTS: { key: LayoutKey; name: string; hint: string }[] = [
  { key: "bold", name: "Bold", hint: "Big centred headline, payoff at the bottom" },
  { key: "editorial", name: "Editorial", hint: "Large serif headline top-left, small caps under it" },
  { key: "luxe", name: "Luxe", hint: "Brand at the top, light-and-bold caps at the bottom" },
  { key: "minimal", name: "Minimal", hint: "One quiet serif line and the brand, lots of air" },
  { key: "caption", name: "Caption", hint: "Caps title, a short paragraph and a button" },
];
export const isLayout = (k: unknown): k is LayoutKey => LAYOUTS.some((l) => l.key === k);

export type Box = { x: number; y: number; w: number; h: number };
/** Where each layout puts its type — the photo is sampled there to choose light or dark type. */
export const REGIONS: Record<LayoutKey, { top: Box; bottom: Box }> = {
  bold: { top: { x: 0.08, y: 0.03, w: 0.84, h: 0.3 }, bottom: { x: 0.08, y: 0.82, w: 0.84, h: 0.16 } },
  editorial: { top: { x: 0.04, y: 0.03, w: 0.66, h: 0.36 }, bottom: { x: 0.04, y: 0.86, w: 0.6, h: 0.12 } },
  luxe: { top: { x: 0.2, y: 0.03, w: 0.6, h: 0.08 }, bottom: { x: 0.08, y: 0.66, w: 0.84, h: 0.31 } },
  minimal: { top: { x: 0.1, y: 0.04, w: 0.8, h: 0.2 }, bottom: { x: 0.25, y: 0.9, w: 0.5, h: 0.08 } },
  caption: { top: { x: 0.04, y: 0.04, w: 0.62, h: 0.3 }, bottom: { x: 0.04, y: 0.84, w: 0.5, h: 0.13 } },
};

/** Type colour for a patch of photo: white (with a soft scrim when the patch isn't dark enough) or the brand's dark ink. */
export type Tone = { color: string; shadow: boolean; scrim: number };
export const toneFor = (lum: number | null, ink = "#1C1B19"): Tone =>
  lum == null ? { color: "#FFFFFF", shadow: true, scrim: 0.34 } : lum < 0.5 ? { color: "#FFFFFF", shadow: true, scrim: lum > 0.33 ? 0.28 : 0 } : { color: ink, shadow: false, scrim: 0 };

/**
 * Ad looks: art direction for the photo behind a static ad, the way a studio would shoot it — one colour story, a real surface,
 * the product as the hero, and calm space where the type goes. Shown in Shoots as scenes; `layout` is the layout each is composed for.
 */
export const AD_LOOKS: { name: string; direction: string; room: string; layout: LayoutKey }[] = [
  { name: "Ad look · Texture swatch", layout: "bold",
    direction: "Top-down studio flat lay. The product lies at a slight angle on a thick, glossy smear of its own texture (cream, gel, balm or serum) in the formula's real colour, on a seamless matte backdrop in ONE soft colour taken from the packaging. Soft overhead light, one gentle natural shadow, nothing else in frame.",
    room: "Product and swatch fill the lower two-thirds; the top third is empty backdrop for a headline, and a thin calm strip stays free along the bottom." },
  { name: "Ad look · Colour studio", layout: "editorial",
    direction: "A monochrome beauty studio in ONE saturated colour drawn from the product — backdrop, light spill and styling all in that hue. A hand with natural nails presents the product, label square to camera; behind it, softly out of focus, a model turns her face into warm light. Glowing skin, shallow depth of field, premium campaign finish.",
    room: "The product sits just below the centre; the top-left third is clean, soft colour for a large headline." },
  { name: "Ad look · Podium & silk", layout: "caption",
    direction: "A commercial still life: the product stands on a low cylindrical podium with a taller podium behind it, and draped silk flows across the background — podiums, fabric and backdrop all in ONE rich colour matched to the brand, tone on tone. Soft key light from the upper left, crisp reflections, glossy studio finish.",
    room: "The product stands in the lower right; the upper left is smooth fabric with room for a title and a short line." },
  { name: "Ad look · Beauty portrait", layout: "luxe",
    direction: "An editorial beauty portrait: a model with dewy, healthy skin holds the product beside her cheek, label facing camera, eyes soft; a warm neutral seamless backdrop (taupe or sand); soft frontal beauty-dish light with gentle fall-off.",
    room: "Face and product sit in the upper two-thirds; the lower third falls into soft, darker tone — shoulder and backdrop — where the headline goes. A clear strip of backdrop stays at the very top." },
  { name: "Ad look · Ingredients on stone", layout: "minimal",
    direction: "The product stands upright on honed pale stone with a few of its real key ingredients arranged around the base (fresh leaves, citrus, petals — only what the product truly contains), against a plain plaster wall with dappled daylight and soft leaf shadows. Calm, fresh, expensive.",
    room: "The product stands in the lower half, centred; the top third is plain wall for a quiet headline." },
];
export const adLook = (scene: string) => AD_LOOKS.find((l) => l.name === scene) ?? null;

const uid = () => Math.random().toString(36).slice(2, 9);
/** How many lines a text takes at a width — an estimate from average glyph width, enough to stack blocks without overlap. */
const linesOf = (text: string, widthPx: number, size: number, k: number, tracking = 0) => {
  const per = Math.max(4, Math.floor(widthPx / (size * (k + tracking))));
  let n = 1, cur = 0;
  for (const w of text.split(/\s+/)) { if (cur && cur + 1 + w.length > per) { n++; cur = w.length; } else cur += (cur ? 1 : 0) + w.length; }
  return n;
};
const LH = 1.15;

/** The design for a layout: type layers placed and coloured for the photo, with a scrim where the photo needs one. */
export function layoutDesign(key: LayoutKey, copy: CardCopy, tones: { top: Tone; bottom: Tone }, image: string | null, W = 1080, H = 1350): AdDesign {
  const T = tones.top, B = tones.bottom, L: Layer[] = [];
  const text = (role: string, t: string, o: Omit<Layer, "id" | "kind" | "text" | "color" | "shadow"> & { tone: Tone }) => {
    if (!t.trim()) return;
    const { tone, ...rest } = o;
    L.push({ id: uid(), kind: "text", text: t.trim(), color: tone.color, shadow: tone.shadow, role, ...rest });
  };
  const len = copy.headline.length;
  let usedBottom = false;

  if (key === "bold") {
    const size = len <= 14 ? 108 : len <= 22 ? 96 : len <= 32 ? 84 : 72, y0 = 0.055 * H;
    const headH = linesOf(copy.headline, 0.84 * W, size, 0.58) * size * LH;
    text("headline", copy.headline, { x: 0.08, y: y0 / H, w: 0.84, size, font: "display", weight: 700, align: "center", tone: T });
    text("subline", copy.subline, { x: 0.14, y: (y0 + headH + 28) / H, w: 0.72, size: 34, font: "sans", weight: 500, align: "center", tone: T });
    const noteH = copy.note ? linesOf(copy.note, 0.76 * W, 30, 0.54) * 30 * LH + 8 : 0;
    const tagY = H - 66 - noteH - 48 * LH;
    text("tagline", copy.tagline, { x: 0.08, y: tagY / H, w: 0.84, size: 48, font: "display", weight: 700, align: "center", tone: B });
    text("note", copy.note, { x: 0.12, y: (tagY + 48 * LH + 8) / H, w: 0.76, size: 30, font: "sans", weight: 500, align: "center", tone: B });
    usedBottom = Boolean(copy.tagline || copy.note);
  } else if (key === "editorial") {
    const size = len <= 16 ? 124 : len <= 26 ? 104 : 86, y0 = 0.06 * H;
    const headH = linesOf(copy.headline, 0.66 * W, size, 0.5) * size * LH;
    text("headline", copy.headline, { x: 0.07, y: y0 / H, w: 0.66, size, font: "serif", align: "left", tone: T });
    text("subline", copy.subline, { x: 0.075, y: (y0 + headH + 26) / H, w: 0.56, size: 25, font: "sans", weight: 600, align: "left", upper: true, tracking: 0.12, tone: T });
    const noteH = copy.note ? linesOf(copy.note, 0.6 * W, 26, 0.54) * 26 * LH + 6 : 0;
    const tagY = H - 70 - noteH - 32 * LH;
    text("tagline", copy.tagline, { x: 0.075, y: tagY / H, w: 0.6, size: 32, font: "sans", weight: 600, align: "left", tone: B });
    text("note", copy.note, { x: 0.075, y: (tagY + 32 * LH + 6) / H, w: 0.6, size: 26, font: "sans", weight: 500, align: "left", tone: B });
    usedBottom = Boolean(copy.tagline || copy.note);
  } else if (key === "luxe") {
    text("brand", copy.brand, { x: 0.1, y: 0.055, w: 0.8, size: 28, font: "sans", weight: 500, align: "center", upper: true, tracking: 0.22, tone: T });
    const words = copy.headline.split(/\s+/), cut = Math.ceil(words.length / 2);
    const a = words.slice(0, cut).join(" "), b = words.slice(cut).join(" ");
    const longest = Math.max(a.length, b.length), size = longest <= 9 ? 100 : longest <= 13 ? 84 : longest <= 18 ? 68 : 56;
    const aH = linesOf(a, 0.86 * W, size, 0.66, 0.06) * size * LH, bH = b ? linesOf(b, 0.86 * W, size, 0.7, 0.04) * size * LH : 0;
    const subH = copy.subline ? linesOf(copy.subline, 0.7 * W, 28, 0.54) * 28 * LH : 0;
    const top = H - 84 - subH - (subH ? 22 : 0) - bH - aH;
    text("headline", a, { x: 0.07, y: top / H, w: 0.86, size, font: "sans", weight: 300, align: "center", upper: true, tracking: 0.06, tone: B });
    text("headline", b, { x: 0.07, y: (top + aH) / H, w: 0.86, size, font: "display", weight: 700, align: "center", upper: true, tracking: 0.04, tone: B });
    text("subline", copy.subline, { x: 0.15, y: (top + aH + bH + 22) / H, w: 0.7, size: 28, font: "sans", weight: 500, align: "center", tone: B });
    usedBottom = true;
  } else if (key === "minimal") {
    const size = len <= 18 ? 78 : len <= 30 ? 66 : 56;
    text("headline", copy.headline, { x: 0.1, y: 0.07, w: 0.8, size, font: "serif", align: "center", tone: T });
    text("brand", copy.brand, { x: 0.2, y: (H - 96) / H, w: 0.6, size: 26, font: "sans", weight: 500, align: "center", upper: true, tracking: 0.22, tone: B });
    usedBottom = Boolean(copy.brand);
  } else {
    const size = len <= 14 ? 66 : len <= 24 ? 54 : 46, y0 = 0.065 * H;
    const headH = linesOf(copy.headline, 0.62 * W, size, 0.62, 0.08) * size * LH;
    text("headline", copy.headline, { x: 0.07, y: y0 / H, w: 0.62, size, font: "sans", weight: 600, align: "left", upper: true, tracking: 0.08, tone: T });
    text("subline", copy.subline, { x: 0.07, y: (y0 + headH + 22) / H, w: 0.52, size: 28, font: "sans", weight: 500, align: "left", tone: T });
    const light = B.color === "#FFFFFF";
    text("tagline", copy.tagline, { x: 0.07, y: (H - 196) / H, w: 0.6, size: 34, font: "sans", weight: 600, align: "left", tone: B });
    if (copy.cta.trim()) L.push({ id: uid(), kind: "button", role: "cta", text: copy.cta.trim(), x: 0.07, y: (H - 132) / H, w: 0.3, size: 30, font: "sans", weight: 600, align: "center", color: light ? "#121212" : "#FFFFFF", bg: light ? "#FFFFFF" : B.color });
    usedBottom = true;
  }
  const topUsed = L.some((l) => l.y < 0.5);
  return { image, overlay: usedBottom ? B.scrim : 0, overlayTop: topUsed ? T.scrim : 0, layers: L, layout: key, copy };
}

/** The copy a design carries now: what its layers say (so edits survive a layout switch), else what it was made with, else the ad's own words. */
export function copyOf(d: AdDesign | null, ad: { hook: string; headline: string; cta: string; offer: string }, brand: string): CardCopy {
  const by = (role: string) => (d?.layers ?? []).filter((l) => l.role === role).map((l) => l.text).join(" ").trim();
  const c = d?.copy;
  return {
    headline: by("headline") || c?.headline || ad.hook,
    subline: by("subline") || c?.subline || ad.headline,
    tagline: by("tagline") || c?.tagline || (ad.offer && !/no offer/i.test(ad.offer) ? ad.offer.slice(0, 40) : ""),
    note: by("note") || c?.note || "",
    brand: by("brand") || c?.brand || brand,
    cta: by("cta") || c?.cta || ad.cta,
  };
}
