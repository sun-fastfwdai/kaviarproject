import "server-only";
import { z } from "zod";
import { ask, type Block } from "../ai/client";
import type { AdDesign, Layer } from "../db/schema";
import { toJpeg } from "../audience/media";
import { renderDesign } from "./card";
import { relayout } from "./design";
import { LAYOUTS, isLayout } from "./layouts";

/**
 * The Editor's agent: the team asks for a change in words — to one selected element or to the whole ad — and Remy edits the design's
 * layers. Remy sees the card as it is drawn now. It never renders new photos or clips: that is Shoots' job, and it says so.
 */
const LayerOut = z.object({
  id: z.string().describe("The layer's id; a new short id for a layer you add"),
  kind: z.enum(["text", "button", "badge"]), role: z.string().describe("headline, subline, tagline, note, brand, cta or empty"), text: z.string(),
  x: z.number(), y: z.number(), w: z.number(), size: z.number(), font: z.enum(["display", "serif", "sans", "condensed"]), weight: z.number().describe("300, 500, 600 or 700 (serif is always regular)"),
  color: z.string().describe("#RRGGBB"), bg: z.string().describe("#RRGGBB fill for a button or badge; empty for text"),
  align: z.enum(["left", "center", "right"]), upper: z.boolean(), tracking: z.number().describe("Letter spacing in em, 0–0.3"), shadow: z.boolean(),
  opacity: z.number().describe("1 for normal type; 0.1–0.7 for a see-through giant word"), bullet: z.boolean().describe("True puts a round tick before the line (benefit lists)"),
});
const Out = z.object({
  say: z.string().describe("One or two short sentences to the team: what you changed, or why you didn't"),
  action: z.enum(["edit", "layout", "none"]).describe("edit: change layers / picture / scrims; layout: switch the whole ad to one of the layouts; none: nothing to change"),
  layout: z.enum(["bold", "bigword", "benefits", "statement", "editorial", "luxe", "minimal", "caption", "keep"]),
  layers: z.array(LayerOut).describe("For action edit: every text, button and badge layer after the change, unchanged ones included"),
  image: z.string().describe("'keep', or the url of one of the pictures listed"),
  overlayTop: z.number().describe("Darkening behind type at the top, 0–0.7"), overlay: z.number().describe("Darkening at the bottom, 0–0.7"),
  needsShoots: z.boolean().describe("True when the request needs a new photo or clip rendered — that happens in Shoots"),
});

const SYSTEM = `You are Remy, Kaviar's designer, working in the ad Editor. The team asks for a change to one ad; you edit its design and say what you did.
The artboard is 1080 × 1350 (4:5). Layers sit over a photo: x, y and w are fractions of the artboard (top-left origin), size is px. Keep type inside a 6% margin. The same design is also cropped to 9:16, where the top 14% and bottom 20% get covered by the app's own buttons.
Fonts: display (Poppins bold — punchy headlines), serif (DM Serif Display — editorial, premium), sans (Poppins — weights 300, 500, 600), condensed (Anton — tall poster caps, for one giant word). upper + tracking makes small caps lines; bullet puts a round tick before a line; opacity makes a giant word see-through.
Layouts you can switch to: ${LAYOUTS.map((l) => `${l.key} (${l.hint})`).join("; ")}.
Rules:
- You can see the card as it looks now. Judge it like an art director: hierarchy, contrast against the photo, breathing room, nothing over the product's label or a face.
- If an element is selected, apply the request to that element unless the team clearly means the whole ad.
- Change only what was asked, and what that change forces (e.g. move the subline down when the headline grows). Return every layer, unchanged ones as they are.
- White type needs a dark enough photo behind it: raise overlayTop / overlay a little, or switch to dark type on a light area.
- Copy: keep claims to what the ad already says — never invent numbers, reviews, awards or discounts.
- You cannot make new photos or clips here. If the request needs one, set needsShoots, change nothing else that depends on it, and say it is made in Shoots. You may swap to one of the pictures listed.
- "say" is short and specific ("Headline up to 110 and moved the subline down to clear it.").`;

const hex = (c: string, fb: string) => (/^#[0-9a-f]{6}$/i.test(c.trim()) ? c.trim() : fb);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));

export async function editWithRemy(brandId: string, brand: string, ad: { hook: string; primaryText: string; headline: string; cta: string; offer: string; product: string | null }, design: AdDesign,
  ask_: { instruction: string; selected: string | null; recent: string[]; pictures: { url: string; name: string }[]; palette: string[] }): Promise<{ design?: AdDesign; say: string; shoots?: boolean }> {
  const editable = design.layers.filter((l) => l.kind !== "logo"), logos = design.layers.filter((l) => l.kind === "logo");
  const content: Block[] = [];
  try {
    const png = await renderDesign(brandId, design);
    const small = await toJpeg(png, 720);
    if (small) content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: small.toString("base64") } });
  } catch { /* Remy works from the layer list alone */ }
  content.push({ type: "text", text: JSON.stringify({
    request: ask_.instruction.slice(0, 600), selectedLayer: ask_.selected && editable.some((l) => l.id === ask_.selected) ? ask_.selected : null,
    earlierInThisChat: ask_.recent.slice(-6),
    ad: { brand, ...ad }, currentLayout: design.layout ?? null, overlayTop: design.overlayTop ?? 0, overlay: design.overlay, picture: design.image,
    layers: editable.map((l) => ({ id: l.id, kind: l.kind, role: l.role ?? "", text: l.text, x: l.x, y: l.y, w: l.w, size: l.size, font: l.font, weight: l.weight ?? (l.font === "display" ? 700 : 500), color: l.color, bg: l.bg ?? "", align: l.align ?? "left", upper: Boolean(l.upper), tracking: l.tracking ?? 0, shadow: l.shadow !== false, opacity: l.opacity ?? 1, bullet: Boolean(l.bullet) })),
    otherPictures: ask_.pictures.slice(0, 14), brandColours: ask_.palette,
  }) });
  const out = await ask("remy", { system: SYSTEM, content, schema: Out, maxTokens: 6000 });
  if (!out) return { say: "I couldn’t make that change just now — try again." };
  const say = out.say.slice(0, 400);
  if (out.action === "none") return { say, shoots: out.needsShoots };
  if (out.action === "layout" && isLayout(out.layout)) {
    const next = await relayout(brandId, out.layout, design, ad, brand);
    return { design: { ...next, layers: [...next.layers, ...logos] }, say, shoots: out.needsShoots };
  }
  const allowed = new Set([design.image, ...ask_.pictures.map((p) => p.url)].filter(Boolean) as string[]);
  const seen = new Set<string>();
  const layers: Layer[] = out.layers.slice(0, 12).filter((l) => l.text.trim()).map((l) => {
    const old = editable.find((x) => x.id === l.id && !seen.has(l.id));
    const id = old ? l.id : Math.random().toString(36).slice(2, 9);
    seen.add(id);
    const box = l.kind !== "text";
    return {
      id, kind: l.kind, role: l.role || old?.role || undefined, text: l.text.slice(0, 300), x: clamp(l.x, 0, 0.95), y: clamp(l.y, 0, 0.97), w: clamp(l.w, 0.08, 1 - clamp(l.x, 0, 0.95)),
      size: Math.round(clamp(l.size, 18, 480)), font: l.font, opacity: l.opacity < 0.98 ? clamp(l.opacity, 0.08, 1) : undefined, bullet: l.bullet && !box ? true : undefined, weight: l.font === "serif" || l.font === "condensed" ? undefined : clamp(Math.round(l.weight / 100) * 100, 300, 700), color: hex(l.color, old?.color ?? "#FFFFFF"),
      ...(box ? { bg: hex(l.bg, old?.bg ?? "#FFFFFF") } : {}), align: l.align, upper: l.upper || undefined, tracking: l.tracking ? clamp(l.tracking, 0, 0.3) : undefined, shadow: l.shadow,
    };
  });
  if (!layers.length) return { say: "That would leave the ad with no words — tell me what to keep.", shoots: out.needsShoots };
  return {
    design: { ...design, image: out.image !== "keep" && allowed.has(out.image) ? out.image : design.image, overlay: clamp(out.overlay, 0, 0.7), overlayTop: clamp(out.overlayTop, 0, 0.7), layers: [...layers, ...logos], card: design.card, pending: false },
    say, shoots: out.needsShoots,
  };
}
