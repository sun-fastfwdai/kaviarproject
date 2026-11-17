import type { AdDesign, Layer } from "../db/schema";

/**
 * Professional static-ad layouts, shared by the server (which draws finished cards) and the Editor (which lets the team switch
 * layouts and edit every layer). A layout places the ad's copy — headline, subline, payoff, brand — over the photo from Shoots.
 * Sizes are px on a 1080-wide artboard; positions are fractions of the artboard.
 */
export type CardCopy = { headline: string; subline: string; tagline: string; note: string; brand: string; cta: string; word?: string; benefits?: string[] };
export type LayoutKey = "bold" | "bigword" | "benefits" | "statement" | "poster" | "chips" | "stack" | "editorial" | "luxe" | "minimal" | "caption";
export const LAYOUTS: { key: LayoutKey; name: string; hint: string }[] = [
  { key: "bold", name: "Bold", hint: "Big centred headline, payoff at the bottom" },
  { key: "bigword", name: "Big word", hint: "One giant word behind the top, labels beside the product" },
  { key: "benefits", name: "Benefit list", hint: "Serif headline and a ticked list of benefits on the left" },
  { key: "statement", name: "Statement", hint: "A stacked, provocative headline and three ticked proofs" },
  { key: "poster", name: "Poster", hint: "One giant headline across the bottom, a short line under it" },
  { key: "chips", name: "Colour chips", hint: "White headline with its key words on colour chips" },
  { key: "stack", name: "Serif stack", hint: "A lead-in, ONE huge serif word, then what it is" },
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
  poster: { top: { x: 0.04, y: 0.03, w: 0.6, h: 0.07 }, bottom: { x: 0.04, y: 0.7, w: 0.92, h: 0.28 } },
  chips: { top: { x: 0.05, y: 0.04, w: 0.62, h: 0.3 }, bottom: { x: 0.05, y: 0.8, w: 0.62, h: 0.17 } },
  stack: { top: { x: 0.06, y: 0.03, w: 0.88, h: 0.36 }, bottom: { x: 0.05, y: 0.9, w: 0.9, h: 0.08 } },
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
 * Ad looks: how the photo behind a static ad is shot — written the way an art director briefs a photographer. `direction` is the
 * set, styling and subject; `camera` is lens, angle and light; `room` is where the frame stays calm for type; `layout` is the layout
 * the shot is composed for. Shown in Plan and Shoots as a gallery, in two groups: the product alone, and the product with a person.
 */
export type LookGroup = "Product only" | "With a person";
export type AdLook = { key: string; name: string; group: LookGroup; blurb: string; direction: string; camera: string; room: string; layout: LayoutKey; person?: boolean };
export const LOOK_GROUPS: LookGroup[] = ["Product only", "With a person"];
export const AD_LOOKS: AdLook[] = [
  { key: "swatch", name: "Ad look · Texture swatch", group: "Product only", layout: "bold", blurb: "The product on a smear of its own texture",
    direction: "Studio flat lay. The product lies at a slight angle on a thick, glossy smear of its own texture (cream, gel, balm or serum) in the formula's real colour, on a seamless matte backdrop in ONE soft colour — taken from the packaging, or, when the packaging is white, silver, grey or black, a gentle tint that suits the formula and its hero ingredient (sage, blush, butter, sky, peach). Nothing else in frame.",
    camera: "Shot straight down from above, 50 mm, f/8 so everything is sharp. One large soft overhead light, one gentle natural shadow falling to the lower right.",
    room: "Product and swatch sit between 34% and 84% of the frame height; the top third is empty backdrop for a headline, and the bottom 16% stays empty backdrop for the payoff line." },
  { key: "bigword", name: "Ad look · Big word", group: "Product only", layout: "bigword", blurb: "One giant word behind the product",
    direction: "A poster-style hero shot. The product stands upright and centred on a seamless backdrop in ONE saturated-but-soft colour (from the packaging or the hero ingredient — a fresh green, a warm peach, a rosy pink), with one or two of its real ingredients at the base (a citrus slice, a leaf, a water bead, petals). A soft reflection under the product, a gentle glow behind it.",
    camera: "Eye level with the product, 85 mm, f/8. Glossy studio light: a large soft key from the front-left and a rim light that draws a bright edge down the product's side.",
    room: "The product stands between 38% and 82% of the frame height, narrow and centred, with clear backdrop to its left and right. The top 36% is completely empty backdrop — a giant word is printed there — and the bottom 18% is calm, empty surface for the headline; props stay small, beside the product's base, never in the bottom strip." },
  { key: "benefits", name: "Ad look · Benefit list", group: "Product only", layout: "benefits", blurb: "Serif headline and a ticked list beside the product",
    direction: "A soft, feminine product still life. The product stands on a small plinth or folded linen with one gentle prop (a flower, a rolled towel), on a warm pastel backdrop with a subtle gradient. Calm and premium.",
    camera: "Slightly above eye level, 70 mm, f/5.6. Soft daylight from the left through a diffuser, a white card filling the shadows on the right.",
    room: "The product and props sit in the RIGHT 42% of the frame, from the middle down. The LEFT 58% is clean, plain backdrop from top to bottom — the headline and a list of benefits go there." },
  { key: "statement", name: "Ad look · Bold statement", group: "Product only", layout: "statement", blurb: "A huge stacked line with a twist under it",
    direction: "A playful, graphic product shot. The product floats at a slight tilt on a plain warm paper-coloured backdrop (cream, blush or butter) with a soft drop shadow, as if dropped onto a poster. Nothing else in frame.",
    camera: "Straight on, 85 mm, f/8. Crisp, even light from a large source above the camera; one soft shadow directly under the product.",
    room: "The product sits in the lower-middle of the frame, no higher than 48% from the top. The top 45% is completely empty backdrop for a huge stacked headline, and a calm strip stays free along the very bottom." },
  { key: "splash", name: "Ad look · Splash", group: "Product only", layout: "bold", blurb: "The product frozen in a burst of water",
    direction: "A high-speed splash shot. The product hangs in mid-air at a slight tilt, bursting up through a crown of clear water (or milk, for a creamy formula) with droplets frozen around it and one or two pieces of its real hero ingredient flying with the water. Seamless backdrop in ONE fresh colour that suits the formula (aqua, sky, mint, coral).",
    camera: "Eye level, 100 mm, f/11, flash at 1/8000 s so every droplet is frozen and sharp. Two strip lights from behind the water to make it glow, a soft key on the label so it stays readable and dry-looking.",
    room: "The product and the splash stay between 34% and 86% of the frame height. The top third is clean, even backdrop with no droplets — the headline goes there — and a calm strip stays at the very bottom." },
  { key: "giant", name: "Ad look · Giant product", group: "Product only", layout: "minimal", blurb: "The product as a landmark in a tiny world",
    direction: "A surreal scale shot: the product is enormous — the size of a building — lying or standing in a real landscape that belongs to what it does (a sunny beach for sun care, a spa pool for body care, a meadow for botanicals, a city roof garden for daily skincare), with dozens of tiny people, towels, parasols or boats around it going about their day, treating it as a landmark. Believable light and shadows: the product casts one long shadow across the ground.",
    camera: "Aerial drone view from high above, looking down at about 60°, deep focus (f/11) so the product and the tiny world are both sharp. Bright natural daylight, rich true colour, like a travel magazine cover.",
    room: "The product crosses the middle of the frame on a diagonal, label up and readable. The top 22% is calm — open sand, water or sky with nothing in it — for one quiet line, and the bottom 10% is calm too." },
  { key: "podium", name: "Ad look · Podium & silk", group: "Product only", layout: "caption", blurb: "Tone-on-tone podiums and draped silk",
    direction: "A commercial still life: the product stands on a low cylindrical podium with a taller podium behind it, and draped silk flows across the background — podiums, fabric and backdrop all in ONE rich colour matched to the brand, tone on tone. Crisp reflections, glossy studio finish.",
    camera: "Just below the product's eye level so it looks tall, 85 mm, f/8. Soft key light from the upper left, a thin rim light from the right.",
    room: "The product stands in the lower right; the upper left is smooth fabric with room for a title and a short line." },
  { key: "stone", name: "Ad look · Ingredients on stone", group: "Product only", layout: "minimal", blurb: "Real ingredients, pale stone, leaf shadows",
    direction: "The product stands upright on honed pale stone with a few of its real key ingredients arranged around the base (fresh leaves, citrus, petals — only what the product truly contains), against a plain plaster wall. Calm, fresh, expensive.",
    camera: "Eye level, 70 mm, f/5.6. Low morning sun from the left through leaves, so dappled light and soft leaf shadows fall across the wall.",
    room: "The product stands in the lower half, centred; the top third is plain wall for a quiet headline." },
  { key: "dark", name: "Ad look · Dark luxury", group: "Product only", layout: "luxe", blurb: "One spotlight, stone and satin, deep shadow",
    direction: "A moody luxury still life. The product stands on a rough stone plinth with a fold of satin and a sprig of dried flowers, against a deep backdrop (charcoal, espresso or forest). Fine reflections, rich shadows, expensive.",
    camera: "Eye level, 100 mm, f/8. One narrow soft spotlight from directly above, falling off quickly into darkness; a faint rim light to separate the product from the backdrop.",
    room: "The product stands in the middle of the frame. The lower third falls into calm darkness for the headline, and a clear dark strip stays at the very top for the brand name." },
  { key: "reach", name: "Ad look · Reach to camera", group: "With a person", layout: "poster", person: true, blurb: "She pushes the product right up to the lens",
    direction: "A fashion-campaign shot with forced perspective. A model lunges or crouches toward the camera with one arm fully extended, pushing the product right up to the lens so it looms huge in the foreground — about a third of the frame — while her face and body recede behind it; confident, playful look, groomed hand and nails. A monochrome set: walls, floor and her outfit all in ONE colour family taken from the packaging (or a sunlit outdoor court or rooftop with a deep blue sky).",
    camera: "Ultra-wide lens (16–20 mm) held very close to the product, slightly low angle, so the product is exaggerated and pin-sharp with its label square to the camera, and she is a touch softer behind it. Hard sunlight-style key from high on one side, crisp shadows, glossy editorial colour.",
    room: "The product is in the upper or middle part of the frame and her body stays in the upper 70%. The bottom 28% is plain floor or ground in the set's colour, with nothing on it — a giant headline is printed across it. A small clear corner stays at the top-left." },
  { key: "sky", name: "Ad look · Sky hold", group: "With a person", layout: "chips", person: true, blurb: "Low angle, blue sky, product held out to you",
    direction: "A sunny outdoor shot looking up at a model against a clean blue sky with a few soft clouds. She holds the product out toward the camera in one hand, label facing the lens, her other hand near her face; sun-kissed glowing skin, hair moving in the breeze, relaxed and happy. A simple ribbed top in one colour that complements the packaging.",
    camera: "Low angle looking up, 24–28 mm, close enough that the product in her hand is large and sharp in the foreground with her face just behind it. Bright midday sun as the key, a reflector filling the shadows, saturated but natural colour.",
    room: "She and the product fill the RIGHT 58% of the frame. The LEFT 42% is open blue sky from the top down to her shoulder line — the headline goes top-left — and the lower-left stays simple (sky or the plain colour of her top) for a short claim." },
  { key: "peek", name: "Ad look · Peek-a-boo", group: "With a person", layout: "stack", person: true, blurb: "Close portrait, the product over one eye",
    direction: "A playful close beauty portrait. A model lies back (on a pool float, a towel, fresh sheets or grass — whatever suits the product) and holds the product over one eye like a monocle, label toward the camera, the other eye looking straight into the lens with a small smile; dewy, real skin. One bold complementary colour behind her (the orange of a float against turquoise water, a butter towel against blue tiles).",
    camera: "Shot from directly above her, 50 mm, f/4, focus on the product and her open eye. Bright, soft sunlight with gentle sparkle on the skin.",
    room: "Her face and the product sit in the lower 60% of the frame. The top 36% is the plain colour behind her (water, towel, sheet) with nothing in it — three lines of headline go there." },
  { key: "portrait", name: "Ad look · Beauty portrait", group: "With a person", layout: "luxe", person: true, blurb: "Dewy skin, the product beside her cheek",
    direction: "An editorial beauty portrait: a model with dewy, healthy skin holds the product beside her cheek, label facing camera, eyes soft; a warm neutral seamless backdrop (taupe or sand).",
    camera: "Eye level, 85 mm, f/4. Soft frontal beauty-dish light with gentle fall-off, a touch of fill from below so the skin glows.",
    room: "Face and product sit in the upper two-thirds; the lower third falls into soft, darker tone — shoulder and backdrop — where the headline goes. A clear strip of backdrop stays at the very top." },
  { key: "skin", name: "Ad look · Skin close-up", group: "With a person", layout: "editorial", person: true, blurb: "Macro skin with a swipe of the formula",
    direction: "An extreme close-up of skin: cheek, jaw and lips (no eyes), with a fresh swipe or bead of the product's real texture on the cheekbone; real skin with visible pores, never plastic. The product itself is held at the lower-right edge of the frame, label readable. Warm, tonal colour — skin, lips and backdrop in one family.",
    camera: "100 mm macro, f/5.6, focus on the texture on the skin. Soft wrap-around light from a large source at the front-left, a gentle highlight along the cheekbone.",
    room: "The top-left 60% of the frame is smooth, softly out-of-focus skin or backdrop with no features — a large serif headline goes there. The product stays in the lower right." },
  { key: "moment", name: "Ad look · Everyday moment", group: "With a person", layout: "caption", person: true, blurb: "Candid at home, mid-routine, window light",
    direction: "A candid lifestyle frame in the buyer's real routine — at the bathroom mirror, on the edge of the bed or by a sunny window — product in her hand mid-use, label toward the camera; a natural half-smile, not looking at the lens. Lived-in but tidy; walls, towel and clothes in muted tones so the product is the one clear colour.",
    camera: "Eye level, 35 mm, f/2.8, as if a friend took it. Soft window light from the left, no flash, gentle grain.",
    room: "She and the product are in the RIGHT half of the frame. The upper-left is plain wall for a title and a short line, and the bottom-left stays calm for a button." },
  { key: "colour", name: "Ad look · Colour studio", group: "With a person", layout: "editorial", person: true, blurb: "One saturated colour, a hand presents it",
    direction: "A monochrome beauty studio in ONE saturated colour drawn from the product — backdrop, light spill and styling all in that hue. A hand with natural nails presents the product, label square to camera; behind it, softly out of focus, a model turns her face into warm light. Glowing skin, premium campaign finish.",
    camera: "Eye level, 85 mm, f/2.8 — the product and hand sharp, the model behind dissolved into soft colour. A hard key through a coloured gel, a soft white fill on the label.",
    room: "The product sits just below the centre; the top-left third is clean, soft colour for a large headline." },
];
export const adLook = (scene: string) => AD_LOOKS.find((l) => l.name === scene) ?? null;
/** A look from what someone typed or tapped: its full name, its short name, or a phrase that contains it. */
export const lookNamed = (text: string) => { const t = text.trim().toLowerCase(); return AD_LOOKS.find((l) => l.name.toLowerCase() === t || shortLook(l.name).toLowerCase() === t) ?? AD_LOOKS.find((l) => t.includes(shortLook(l.name).toLowerCase())) ?? null; };
export const shortLook = (name: string) => name.replace("Ad look · ", "");
const lumHex = (h: string) => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h.trim()); return m ? (0.2126 * parseInt(m[1], 16) + 0.7152 * parseInt(m[2], 16) + 0.0722 * parseInt(m[3], 16)) / 255 : 1; };

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
export function layoutDesign(key: LayoutKey, copy: CardCopy, tones: { top: Tone; bottom: Tone; accent?: string; chip?: string }, image: string | null, W = 1080, H = 1350): AdDesign {
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
  } else if (key === "poster") {
    // A person-and-product photo with ONE giant headline across the bottom, a short line under it, and the brand in the corner.
    text("brand", copy.brand, { x: 0.06, y: 0.045, w: 0.6, size: 26, font: "sans", weight: 600, align: "left", upper: true, tracking: 0.2, tone: T });
    const words = copy.headline.replace(/[.!]+$/, "").split(/\s+/).filter(Boolean);
    let rows = [words.join(" ")];
    if (rows[0].length > 13 && words.length > 1) { // two rows, split where they come out most even
      let best = 1, gap = Infinity;
      for (let i = 1; i < words.length; i++) { const g = Math.abs(words.slice(0, i).join(" ").length - words.slice(i).join(" ").length); if (g < gap) { gap = g; best = i; } }
      rows = [words.slice(0, best).join(" "), words.slice(best).join(" ")];
    }
    const longest = Math.max(...rows.map((r) => r.length));
    const size = Math.round(Math.min(rows.length > 1 ? 200 : 300, (0.9 * W) / (Math.max(4, longest) * 0.47)));
    const subH = copy.subline ? linesOf(copy.subline, 0.84 * W, 30, 0.62, 0.08) * 30 * LH + 14 : 0;
    let y = H - 58 - subH - rows.length * size * 1.02;
    for (const r of rows) { L.push({ id: uid(), kind: "text", role: "headline", text: r, x: 0.04, y: y / H, w: 0.92, size, font: "condensed", align: "center", upper: true, color: B.color, shadow: false }); y += size * 1.02; }
    text("subline", copy.subline, { x: 0.08, y: (y + 14) / H, w: 0.84, size: 30, font: "sans", weight: 600, align: "center", upper: true, tracking: 0.08, tone: B });
    usedBottom = true;
  } else if (key === "chips") {
    // A lifestyle photo with the message in white and its key words on colour chips: headline + chip top-left, claim + chip bottom-left.
    const chipBg = tones.chip ?? tones.accent ?? "#FFFFFF", chipInk = lumHex(chipBg) > 0.6 ? "#1C1B19" : "#FFFFFF";
    const chip = (role: string, t: string, y: number, size: number) => L.push({ id: uid(), kind: "badge", role, text: t.trim(), x: 0.07, y: y / H, w: 0.74, size, font: "sans", weight: 600, color: chipInk, bg: chipBg });
    text("brand", copy.brand, { x: 0.07, y: 0.045, w: 0.6, size: 26, font: "sans", weight: 600, align: "left", upper: true, tracking: 0.2, tone: T });
    const size = len <= 12 ? 92 : len <= 20 ? 78 : 64, y0 = 0.1 * H;
    const headH = linesOf(copy.headline, 0.62 * W, size, 0.58) * size * LH;
    text("headline", copy.headline, { x: 0.07, y: y0 / H, w: 0.62, size, font: "display", weight: 700, align: "left", tone: T });
    if (copy.tagline.trim()) chip("tagline", copy.tagline, y0 + headH + 16, 44);
    const noteH = copy.note.trim() ? 36 * LH + 36 * 0.7 : 0, noteY = H - 64 - noteH;
    const subH = copy.subline ? linesOf(copy.subline, 0.6 * W, 36, 0.56) * 36 * LH : 0;
    text("subline", copy.subline, { x: 0.07, y: (noteY - subH - 14) / H, w: 0.6, size: 36, font: "sans", weight: 600, align: "left", tone: B });
    if (copy.note.trim()) chip("note", copy.note, noteY, 36);
    usedBottom = Boolean(copy.subline || copy.note);
  } else if (key === "stack") {
    // Three tiers of serif caps at the top — a lead-in, ONE huge word, what it is — over a close portrait; a line and the brand along the bottom.
    const word = (copy.word || copy.headline.split(/\s+/).pop() || copy.brand).replace(/[^\p{L}\p{N}]/gu, "").slice(0, 10).toUpperCase();
    const ls = len <= 12 ? 76 : len <= 20 ? 62 : 50, y0 = 0.05 * H;
    const leadH = linesOf(copy.headline, 0.86 * W, ls, 0.68, 0.02) * ls * LH;
    text("headline", copy.headline, { x: 0.07, y: y0 / H, w: 0.86, size: ls, font: "serif", align: "center", upper: true, tracking: 0.02, tone: T });
    const ws = Math.round(Math.min(250, (0.86 * W) / (Math.max(3, word.length) * 0.72)));
    L.push({ id: uid(), kind: "text", role: "word", text: word, x: 0.04, y: (y0 + leadH - ws * 0.04) / H, w: 0.92, size: ws, font: "serif", align: "center", upper: true, color: T.color, shadow: T.shadow });
    text("tagline", copy.tagline, { x: 0.07, y: (y0 + leadH + ws * 1.08) / H, w: 0.86, size: 56, font: "serif", align: "center", upper: true, tracking: 0.02, tone: T });
    const subH = copy.subline ? linesOf(copy.subline, 0.54 * W, 28, 0.54) * 28 * LH : 0;
    text("subline", copy.subline, { x: 0.07, y: (H - 62 - subH) / H, w: 0.54, size: 28, font: "sans", weight: 500, align: "left", tone: B });
    text("brand", copy.brand, { x: 0.62, y: (H - 96) / H, w: 0.31, size: 26, font: "sans", weight: 600, align: "right", upper: true, tracking: 0.2, tone: B });
    usedBottom = Boolean(copy.subline || copy.brand);
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
