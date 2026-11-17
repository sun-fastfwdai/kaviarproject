import type { AdDesign, Layer } from "../db/schema";

/**
 * Professional static-ad layouts, shared by the server (which draws finished cards) and the Editor (which lets the team switch
 * layouts and edit every layer). A layout places the ad's copy — headline, subline, payoff, brand — over the photo from Shoots.
 * Sizes are px on a 1080-wide artboard; positions are fractions of the artboard.
 */
export type CardCopy = { headline: string; subline: string; tagline: string; note: string; brand: string; cta: string; word?: string; benefits?: string[] };
export type LayoutKey = "bold" | "bigword" | "benefits" | "statement" | "editorial" | "luxe" | "minimal" | "caption";
export const LAYOUTS: { key: LayoutKey; name: string; hint: string }[] = [
  { key: "bold", name: "Bold", hint: "Big centred headline, payoff at the bottom" },
  { key: "bigword", name: "Big word", hint: "One giant word behind the top, labels beside the product" },
  { key: "benefits", name: "Benefit list", hint: "Serif headline and a ticked list of benefits on the left" },
  { key: "statement", name: "Statement", hint: "A stacked, provocative headline and three ticked proofs" },
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
  bigword: { top: { x: 0.06, y: 0.03, w: 0.88, h: 0.3 }, bottom: { x: 0.1, y: 0.84, w: 0.8, h: 0.14 } },
  benefits: { top: { x: 0.04, y: 0.04, w: 0.58, h: 0.5 }, bottom: { x: 0.04, y: 0.84, w: 0.5, h: 0.13 } },
  statement: { top: { x: 0.06, y: 0.03, w: 0.88, h: 0.42 }, bottom: { x: 0.05, y: 0.88, w: 0.9, h: 0.1 } },
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
    direction: "Top-down studio flat lay. The product lies at a slight angle on a thick, glossy smear of its own texture (cream, gel, balm or serum) in the formula's real colour, on a seamless matte backdrop in ONE soft colour — taken from the packaging, or, when the packaging is white, silver, grey or black, a gentle tint that suits the formula and its hero ingredient (sage, blush, butter, sky, peach). Soft overhead light, one gentle natural shadow, nothing else in frame.",
    room: "Product and swatch sit between 34% and 84% of the frame height; the top third is empty backdrop for a headline, and the bottom 16% stays empty backdrop for the payoff line." },
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
  { name: "Ad look · Big word", layout: "bigword",
    direction: "A poster-style hero shot. The product stands upright and centred on a seamless backdrop in ONE saturated-but-soft colour (from the packaging or the hero ingredient — a fresh green, a warm peach, a rosy pink), with one or two of its real ingredients at the base (a citrus slice, a leaf, a water bead, petals). Glossy studio light, a soft reflection under the product, a gentle glow behind it.",
    room: "The product stands between 38% and 82% of the frame height, narrow and centred, with clear backdrop to its left and right. The top 36% is completely empty backdrop — a giant word is printed there — and the bottom 18% is calm, empty surface for the headline; props stay small, beside the product's base, never in the bottom strip." },
  { name: "Ad look · Benefit list", layout: "benefits",
    direction: "A soft, feminine product still life. The product stands on a small plinth or folded linen with one gentle prop (a flower, a rolled towel), on a warm pastel backdrop with a subtle gradient; soft daylight from the left, calm and premium.",
    room: "The product and props sit in the RIGHT 42% of the frame, from the middle down. The LEFT 58% is clean, plain backdrop from top to bottom — the headline and a list of benefits go there." },
  { name: "Ad look · Bold statement", layout: "statement",
    direction: "A playful, graphic product shot. The product floats at a slight tilt on a plain warm paper-coloured backdrop (cream, blush or butter) with a soft drop shadow, as if dropped onto a poster. Nothing else in frame; crisp, even light.",
    room: "The product sits in the lower-middle of the frame, no higher than 48% from the top. The top 45% is completely empty backdrop for a huge stacked headline, and a calm strip stays free along the very bottom." },
  { name: "Ad look · Dark luxury", layout: "luxe",
    direction: "A moody luxury still life. The product stands on a rough stone plinth with a fold of satin and a sprig of dried flowers, against a deep backdrop (charcoal, espresso or forest) with one soft spotlight from above; fine reflections, rich shadows, expensive.",
    room: "The product stands in the middle of the frame. The lower third falls into calm darkness for the headline, and a clear dark strip stays at the very top for the brand name." },
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
export function layoutDesign(key: LayoutKey, copy: CardCopy, tones: { top: Tone; bottom: Tone; accent?: string }, image: string | null, W = 1080, H = 1350): AdDesign {
  const T = tones.top, B = tones.bottom, L: Layer[] = [];
  const benefits = (copy.benefits ?? []).map((b) => b.trim()).filter(Boolean).slice(0, 4);
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
  } else if (key === "bigword") {
    // One giant word across the top, see-through against the backdrop; short labels beside the product; the message at the bottom.
    const word = (copy.word || copy.headline.split(/\s+/)[0] || copy.brand).replace(/[^\p{L}\p{N}]/gu, "").slice(0, 9).toUpperCase();
    const size = Math.round(Math.min(470, (0.9 * W) / (Math.max(3, word.length) * 0.47)));
    const dark = T.color !== "#FFFFFF";
    L.push({ id: uid(), kind: "text", role: "word", text: word, x: 0.03, y: 0.035, w: 0.94, size, font: "condensed", align: "center", color: dark ? T.color : "#FFFFFF", opacity: dark ? 0.14 : 0.6, shadow: false });
    const pill = (t: string, x: number, y: number) => L.push({ id: uid(), kind: "badge", role: "benefit", text: t, x, y, w: 0.3, size: 28, font: "sans", weight: 600, color: "#1C1B19", bg: "#FFFFFF" });
    if (benefits[0]) pill(benefits[0], 0.05, 0.47);
    if (benefits[1]) pill(benefits[1], 0.67, 0.58);
    const subH = copy.subline ? linesOf(copy.subline, 0.76 * W, 30, 0.54) * 30 * LH + 10 : 0;
    const headSize = len <= 22 ? 60 : 50, headH = linesOf(copy.headline, 0.84 * W, headSize, 0.58) * headSize * LH;
    const y = H - 64 - subH - headH;
    text("headline", copy.headline, { x: 0.08, y: y / H, w: 0.84, size: headSize, font: "display", weight: 700, align: "center", tone: B });
    text("subline", copy.subline, { x: 0.12, y: (y + headH + 10) / H, w: 0.76, size: 30, font: "sans", weight: 500, align: "center", tone: B });
    usedBottom = true;
  } else if (key === "benefits") {
    // Serif headline with its second line in the accent colour, three caps words, a ticked list down the left; the product has the right.
    const size = len <= 18 ? 84 : len <= 28 ? 72 : 62, y0 = 0.06 * H;
    const headH = linesOf(copy.headline, 0.6 * W, size, 0.5) * size * LH;
    text("headline", copy.headline, { x: 0.07, y: y0 / H, w: 0.6, size, font: "serif", align: "left", tone: T });
    const tagH = copy.tagline ? linesOf(copy.tagline, 0.6 * W, size * 0.92, 0.5) * size * 0.92 * LH : 0;
    if (copy.tagline.trim()) L.push({ id: uid(), kind: "text", role: "tagline", text: copy.tagline.trim(), x: 0.07, y: (y0 + headH) / H, w: 0.6, size: Math.round(size * 0.92), font: "serif", align: "left", color: tones.accent ?? T.color, shadow: T.shadow });
    let y = y0 + headH + tagH + 26;
    if (copy.note.trim()) { text("note", copy.note, { x: 0.075, y: y / H, w: 0.56, size: 24, font: "sans", weight: 600, align: "left", upper: true, tracking: 0.14, tone: T }); y += 24 * LH + 34; }
    for (const b of benefits) { L.push({ id: uid(), kind: "text", role: "benefit", text: b, bullet: true, x: 0.075, y: y / H, w: 0.5, size: 32, font: "sans", weight: 500, align: "left", color: T.color, shadow: T.shadow }); y += linesOf(b, 0.44 * W, 32, 0.54) * 32 * LH + 22; }
    const light = B.color === "#FFFFFF";
    if (copy.cta.trim()) L.push({ id: uid(), kind: "button", role: "cta", text: copy.cta.trim(), x: 0.07, y: (H - 132) / H, w: 0.32, size: 30, font: "sans", weight: 600, align: "center", color: light ? "#121212" : "#FFFFFF", bg: light ? "#FFFFFF" : tones.accent ?? B.color });
    usedBottom = light;
  } else if (key === "statement") {
    // A stacked statement that fills the top, the twist under it, and three ticked proofs along the bottom.
    const size = len <= 12 ? 176 : len <= 20 ? 148 : len <= 30 ? 122 : 100, y0 = 0.05 * H;
    const headH = linesOf(copy.headline, 0.88 * W, size, 0.56) * size * 1.02;
    text("headline", copy.headline, { x: 0.06, y: y0 / H, w: 0.88, size, font: "serif", align: "center", upper: true, tone: T });
    text("subline", copy.subline, { x: 0.14, y: (y0 + headH * (LH / 1.02) + 18) / H, w: 0.72, size: 36, font: "sans", weight: 500, align: "center", tone: T });
    // The proofs share the row by their length, so the gaps between them look even.
    const row = benefits.slice(0, 3), total = row.reduce((a, b) => a + b.length + 5, 0);
    let x = 0.05;
    for (const b of row) { const w = (0.9 * (b.length + 5)) / total; L.push({ id: uid(), kind: "text", role: "benefit", text: b, bullet: true, x, y: (H - 108) / H, w: w - 0.012, size: 25, font: "sans", weight: 600, align: "left", color: B.color, shadow: B.shadow }); x += w; }
    usedBottom = row.length > 0;
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
    word: by("word") || c?.word || "",
    benefits: (() => { const now = (d?.layers ?? []).filter((l) => l.role === "benefit").map((l) => l.text.trim()).filter(Boolean); return now.length ? now : c?.benefits ?? []; })(),
  };
}
