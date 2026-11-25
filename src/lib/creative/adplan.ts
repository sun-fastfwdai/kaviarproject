import "server-only";
import { z } from "zod";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { ask, type Block } from "../ai/client";
import { readAssets } from "@/lib/assets/storage";
import { marketContext } from "../research/context";
import type { AdConcept, AdPlan } from "../db/schema";

/**
 * How a finished ad is made, in the order an agency works:
 *   the product and brand inputs → Iris reads the pack and the research for what is true (brand intelligence) and decides who each ad is
 *   for and the one idea it carries (creative strategy) → Remy art-directs each idea and writes its words (art direction, copy) →
 *   the image model renders it → Otto scores it and sends back what falls short (see rubric.ts).
 * The plan is what the first three steps produce. It is kept on the canvas, so the team reads and edits it before any picture is paid for.
 */

/** The angles a set of ads is spread across when nothing better is known — one each, so no two ads are the same idea in another colour. */
export const AD_ANGLES = [
  "Problem and solution — the moment the buyer knows, answered calmly",
  "Ingredient storytelling — what is in it, shown as real material",
  "Sensory experience — the formula's texture and feel, close and tactile",
  "Scientific credibility — precise, lab-clean, measured",
  "Lifestyle and identity — the buyer's own world, the product at home in it",
  "Minimalist product positioning — the pack, one line, a great deal of space",
  "Product education — how and when it is used, in one glance",
  "Luxury and aspiration — material richness, dramatic light and scale",
];
/** Headlines every brand has already run. */
const STOCK = ["Elevate your routine", "Discover the difference", "Unlock your glow", "Your skin deserves", "Say goodbye to", "Game changer", "Glow like never before", "The secret to", "Transform your", "Experience the power"];

/** `templates` = imported ads the brand wants its own to be built like: each concept follows one, in turn. */
export type PlanIn = { product: string; imageUrl: string; n: number; forBatch?: string | null; look?: string | null; person?: boolean; templates?: string[] };
type Line = { id: string; headline: string; hook: string; text: string };

const title = (v: string) => v.trim().toLowerCase().replace(/(^|[\s-])\p{L}/gu, (m) => m.toUpperCase());
/** How the brand talks, as one line (research keeps it either as a sentence or as what to say and what to avoid). */
const voiceOf = (v: unknown) => (typeof v === "string" ? v : v && typeof v === "object" ? [(v as { say?: string[] }).say?.length ? `say: ${(v as { say: string[] }).say.join(", ")}` : "", (v as { avoid?: string[] }).avoid?.length ? `avoid: ${(v as { avoid: string[] }).avoid.join(", ")}` : ""].filter(Boolean).join("; ") : "");
const cut = (v: unknown, n: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/** Everything the plan is written from, read once. */
async function inputs(brandId: string, input: PlanIn) {
  const batch = input.forBatch && /^[0-9a-f-]{36}$/i.test(input.forBatch) ? input.forBatch : null;
  const [[b], [pr], market, lines, [of]] = await Promise.all([
    db.select({ name: schema.brands.name, category: schema.brands.category, website: schema.brands.website, onboarding: schema.brands.onboarding }).from(schema.brands).where(eq(schema.brands.id, brandId)),
    db.select({ vendor: schema.shopProducts.vendor, type: schema.shopProducts.productType }).from(schema.shopProducts).where(and(eq(schema.shopProducts.brandId, brandId), eq(schema.shopProducts.title, input.product))).limit(1),
    marketContext(brandId, input.product || null).catch(() => null),
    batch ? db.select({ id: schema.ads.id, headline: schema.ads.headline, hook: schema.ads.hook, text: schema.ads.primaryText }).from(schema.ads)
      .where(and(eq(schema.ads.batchId, batch), eq(schema.ads.brandId, brandId), sql`${schema.ads.status} <> 'rejected'`)).orderBy(asc(schema.ads.position)).limit(8) : Promise.resolve([] as Line[]),
    batch ? db.select({ brief: schema.adBatches.brief, audience: schema.adBatches.audience }).from(schema.adBatches).where(and(eq(schema.adBatches.id, batch), eq(schema.adBatches.brandId, brandId))) : Promise.resolve([] as { brief: string; audience: string }[]),
  ]);
  // The name on the pack and the store (its vendor) is the brand's full name; the workspace name can be a short form of it.
  const brand = pr?.vendor?.trim() ? title(pr.vendor) : b?.name ?? "";
  return { b, pr, market, lines, of: of ?? null, brand };
}

/** The plan when the agents can't be reached: the campaign's own lines (or none), spread over the stock angles, with only researched facts. */
function plainPlan(x: Awaited<ReturnType<typeof inputs>>, input: PlanIn, n: number): AdPlan {
  const pos = x.market?.positioning ?? null;
  return {
    brand: x.brand, pack: "", formula: "", voice: voiceOf(pos?.voice), audience: pos?.primaryBuyer ?? x.market?.buyers[0]?.who ?? "",
    facts: (pos?.proofWeCanUse ?? []).slice(0, 6).map((fact) => ({ fact: cut(fact, 200), source: "research" as const })), never: pos?.stayAwayFrom?.slice(0, 5) ?? [],
    concepts: Array.from({ length: n }, (_, i) => {
      const line = x.lines[i] ?? null;
      return {
        angle: AD_ANGLES[i % AD_ANGLES.length], insight: "", message: line?.hook ?? "", headline: line?.headline ?? "", sub: line?.hook ?? "", callouts: [], cta: "Shop now",
        scene: "", light: "", palette: "", type: "", layout: "", adId: line?.id ?? null,
      };
    }),
    at: new Date().toISOString(),
  };
}

/**
 * Iris, then Remy, write the plan for `n` ads of one product. Made for a campaign's ads, each concept is the picture for one of them and
 * carries that ad's own headline, so what the picture says and what Meta shows under it are the same words.
 */
export async function planAds(brandId: string, input: PlanIn): Promise<AdPlan> {
  const x = await inputs(brandId, input);
  const n = Math.min(8, Math.max(1, x.lines.length ? Math.min(input.n, x.lines.length) : input.n));
  const lines = x.lines.slice(0, n);
  const pos = x.market?.positioning ?? null;
  const profile = x.b?.onboarding?.profile, palette = (x.b?.onboarding?.analysis?.palette ?? []).map((c) => `${c.role}: ${c.hex}`);

  // ---- Brand intelligence and creative strategy (Iris). She sees the pack itself, so what is printed on it is a fact she can use.
  const pack: Block[] = /^https:\/\//.test(input.imageUrl) ? [{ type: "text", text: "The real pack:" }, { type: "image", source: { type: "url", url: input.imageUrl } }] : [];
  const iris = await ask("iris", {
    system: `You are Iris, Kaviar's analyst, doing the two jobs that come before any advertising is designed.
1. BRAND INTELLIGENCE. From the photo of the real pack and the notes given, write down only what is verifiably true:
- brand: the brand's name exactly as it is printed on the pack (fall back to the name given).
- pack: 40–70 words a designer could rebuild it from — pack type, shape and proportions, material and finish, the cap or closure, the label's layout, the exact colours with hex values, the words printed large.
- formula: the formula's colour and texture, only if the pack or the notes state or show it; otherwise an empty string. Never guess a colour.
- voice: how this brand talks, in under 16 words.
- facts: up to 8 short facts an ad may state, each with where it comes from — "pack" (readable on the pack), "store" (the store's own data given) or "research" (the proof points given). Product claims only; no prices, no sales figures, no customer counts. Nothing that is not in front of you.
- never: up to 5 claims this ad must not make, given the category and what is NOT supported (e.g. cures, clinical percentages, "dermatologist recommended" when nothing supports it).
2. CREATIVE STRATEGY. Name the audience in one sentence — who they are and the moment they are in. Then write exactly ${n} ideas, one per ad, each a DIFFERENT creative angle (problem and solution, ingredient story, sensory, scientific credibility, lifestyle and identity, minimalist positioning, comparison, education, emotional benefit, aspiration). For each: angle (its name and, after a dash, what this ad does with it), insight (the buyer truth it turns on, under 20 words), message (the ONE thing this ad says, under 14 words).
${lines.length ? `These ads already exist in a campaign, in this order. Idea i is the picture for campaign ad i: its message is that ad's message, and its angle is the one that serves that headline best. Still no two the same angle.` : "Prefer the gaps competitors leave open over what they all already say."}
Plain words. No hype.`,
    content: [
      ...pack,
      { type: "text", text: JSON.stringify({
        brandNameGiven: x.brand, alsoWritten: x.b?.name ?? null, category: x.b?.category ?? x.pr?.type ?? null, website: x.b?.website ?? null,
        product: input.product,
        brandKit: { tone: profile?.tone?.value ?? null, look: profile?.palette?.value ?? null, colours: palette },
        research: x.market ? { positioning: pos?.statement ?? null, primaryBuyer: pos?.primaryBuyer ?? null, pillars: pos?.pillars ?? [], proofPoints: pos?.proofWeCanUse ?? [], voice: voiceOf(pos?.voice) || null, stayAwayFrom: pos?.stayAwayFrom ?? [],
          buyers: x.market.buyers.slice(0, 4), competitorsSay: x.market.competitorsSay.slice(0, 8), gapsNobodyOwns: x.market.gapsNobodyOwns } : null,
        campaign: x.of ? { brief: cut(x.of.brief, 600), audience: cut(x.of.audience, 300) } : null,
        campaignAds: lines.map((l, i) => ({ ad: i + 1, headline: l.headline, hook: l.hook, text: cut(l.text, 400) })),
      }) },
    ],
    schema: z.object({
      brand: z.string(), pack: z.string(), formula: z.string(), voice: z.string(),
      facts: z.array(z.object({ fact: z.string(), source: z.enum(["pack", "store", "research"]) })), never: z.array(z.string()),
      audience: z.string(),
      ideas: z.array(z.object({ angle: z.string(), insight: z.string(), message: z.string() })),
    }),
    maxTokens: 5000,
  });
  if (!iris || !iris.ideas.length) return plainPlan(x, input, n);
  const facts = iris.facts.map((f) => ({ fact: cut(f.fact, 200), source: f.source })).filter((f) => f.fact).slice(0, 8);
  const ideas = Array.from({ length: n }, (_, i) => iris.ideas[i] ?? { angle: AD_ANGLES[i % AD_ANGLES.length], insight: "", message: lines[i]?.hook ?? "" });

  // ---- Templates: finished ads the brand imported as layouts to follow. Remy looks at each one, so what he writes fits its structure.
  const ids = (input.templates ?? []).filter((v) => /^[0-9a-f-]{36}$/i.test(v)).slice(0, 4);
  const tpl = ids.length ? (await readAssets(and(eq(schema.brandAssets.brandId, brandId), inArray(schema.brandAssets.id, ids))).catch(() => []))
    .filter((a) => /^image\/(png|jpeg|webp)$/.test(a.mime)).sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)) : [];
  const shown: Block[] = tpl.flatMap((a, k) => [{ type: "text" as const, text: `Template ${k + 1}:` }, { type: "image" as const, source: { type: "base64" as const, media_type: a.mime as "image/png" | "image/jpeg" | "image/webp", data: Buffer.from(a.data).toString("base64") } }]);
  const templateFor = (i: number) => (tpl.length ? tpl[i % tpl.length] : null);

  // ---- Art direction and copy (Remy): each idea gets its own picture and its own words. Two jobs, written together so they fit.
  const remy = await ask("remy", {
    system: `You are Remy, Kaviar's creative agent, working as the ART DIRECTOR and the COPYWRITER on ${n} static ads for the Facebook and Instagram feed. An image model (GPT Image) will render each one from your direction, with the real pack photo as its reference, and it sets the words into the picture. Agency standard: these must look made by experienced people, never like a template with a product pasted on.
For EACH idea, in the order given, write:
COPY
- headline: 3–8 words, specific to this product and this idea. Never a stock line (${STOCK.map((p) => `“${p}”`).join(", ")}) and nothing any other brand in the category could run unchanged.${lines.length ? " When campaignAds gives a headline for this ad, return that headline exactly as written." : ""}
- sub: one supporting sentence under 14 words that completes the headline; empty if the headline stands alone.
- callouts: 0–3 benefit callouts of 1–4 words, each a fact from the list given, said the way a pack says it (“Hypoallergenic”, “With vitamin B12”) — never the fact's own hedging such as “Marketed as…” or “Described as…”. Fewer is better; none for a minimalist or aspirational ad.
- cta: the button Meta shows under the ad — one of "Shop now", "Learn more", "Order now", "Get offer" (only with a real offer). It is NOT drawn in the picture.
ART DIRECTION — every ad a different picture: no two share a set, a palette or a layout.
- scene: 45–80 words. The set and surface with real materials, the props or ingredients (only ones this product truly has), where the pack stands or lies and how large it is in the frame, any hand or person, any drop or swatch of the formula (only in the colour given for the formula — if none is given, show no formula).
- light: 15–30 words — source, direction, hard or soft, time of day, the shadow the pack casts.
- palette: three or four colours with hex and where each sits; built from the pack's own colours plus ONE tone that fits this idea. A different lead colour for every ad.
- type: 12–25 words — the typeface style (e.g. high-contrast serif, grotesque sans), weights, case, and how headline, sub and callouts differ in size.
- layout: 20–40 words — where the pack, the headline, the sub and the callouts sit (thirds, left/right, top/bottom), what stays empty, and one bold decision of scale or crop.
Use only the facts given. Never invent a benefit, result, percentage, price, discount, certification, rating, award or testimonial; nothing from the "never" list; no before-and-after. If teamLook is given, at most one ad may follow it.${tpl.length ? `
TEMPLATES. The brand imported ${tpl.length} finished ad${tpl.length > 1 ? "s" : ""} as templates, shown first. Each idea names the template it must be built on ("template"). For that ad, layout and type DESCRIBE the template's own structure exactly — where its product, headline, supporting line and callouts sit, their relative sizes, its typeface style and hierarchy, how much is left empty — and scene is the kind of picture the template uses (a flat colour field stays a flat colour field; a styled set stays a styled set), rebuilt for this product and this idea. Write only as many callouts as the template has places for. Take the structure only: never its brand, logo, words, product or people. Ads on the same template still differ in colour and scene.` : ""}`,
    content: [...shown, { type: "text" as const, text: JSON.stringify({
      brand: iris.brand || x.brand, pack: iris.pack, formula: iris.formula || null, voice: iris.voice, audience: iris.audience,
      facts: facts.map((f) => f.fact), never: iris.never, brandColours: palette, teamLook: input.look || null, withPerson: Boolean(input.person),
      ideas: ideas.map((d, i) => ({ ad: i + 1, ...d, ...(tpl.length ? { template: (i % tpl.length) + 1 } : {}) })),
      campaignAds: lines.map((l, i) => ({ ad: i + 1, headline: l.headline, hook: l.hook })),
    }) }],
    schema: z.object({ ads: z.array(z.object({
      headline: z.string(), sub: z.string(), callouts: z.array(z.string()), cta: z.string(),
      scene: z.string(), light: z.string(), palette: z.string(), type: z.string(), layout: z.string(),
    })) }),
    maxTokens: 6000,
  });

  const concepts: AdConcept[] = ideas.map((d, i) => {
    const r = remy?.ads[i], line = lines[i] ?? null;
    return {
      angle: cut(d.angle, 160), insight: cut(d.insight, 200), message: cut(d.message, 160),
      // A campaign ad's headline is set in code, never by a model: the picture must say what the ad says.
      headline: cut(line?.headline || r?.headline || "", 80), sub: cut(r?.sub ?? line?.hook ?? "", 140),
      callouts: (r?.callouts ?? []).map((c) => cut(c, 40)).filter(Boolean).slice(0, 3), cta: cut(r?.cta || "Shop now", 20),
      scene: cut(r?.scene, 700), light: cut(r?.light, 300), palette: cut(r?.palette, 300), type: cut(r?.type, 260), layout: cut(r?.layout, 400),
      adId: line?.id ?? null, template: templateFor(i)?.id ?? null,
    };
  });
  return {
    brand: cut(iris.brand || x.brand, 80), pack: cut(iris.pack, 700), formula: cut(iris.formula, 200), voice: cut(iris.voice || voiceOf(pos?.voice), 200), audience: cut(iris.audience, 300),
    facts, never: iris.never.map((v) => cut(v, 160)).filter(Boolean).slice(0, 5), concepts, at: new Date().toISOString(),
  };
}

/** A plan that came back from the canvas (the team may have edited it): the same shape, every field a bounded string. */
export function cleanPlan(p: unknown): AdPlan | null {
  const v = p as Partial<AdPlan> | null;
  if (!v || !Array.isArray(v.concepts) || !v.concepts.length) return null;
  return {
    brand: cut(v.brand, 80), pack: cut(v.pack, 700), formula: cut(v.formula, 200), voice: cut(v.voice, 200), audience: cut(v.audience, 300),
    facts: (Array.isArray(v.facts) ? v.facts : []).slice(0, 8).map((f) => ({ fact: cut(f?.fact, 200), source: f?.source === "pack" || f?.source === "store" ? f.source : "research" as const })).filter((f) => f.fact),
    never: (Array.isArray(v.never) ? v.never : []).slice(0, 5).map((s) => cut(s, 160)).filter(Boolean),
    concepts: v.concepts.slice(0, 8).map((c) => ({
      angle: cut(c?.angle, 160), insight: cut(c?.insight, 200), message: cut(c?.message, 160), headline: cut(c?.headline, 80), sub: cut(c?.sub, 140),
      callouts: (Array.isArray(c?.callouts) ? c.callouts : []).slice(0, 3).map((s) => cut(s, 40)).filter(Boolean), cta: cut(c?.cta, 20),
      scene: cut(c?.scene, 700), light: cut(c?.light, 300), palette: cut(c?.palette, 300), type: cut(c?.type, 260), layout: cut(c?.layout, 400),
      adId: typeof c?.adId === "string" && /^[0-9a-f-]{36}$/i.test(c.adId) ? c.adId : null,
      template: typeof c?.template === "string" && /^[0-9a-f-]{36}$/i.test(c.template) ? c.template : null,
    })),
    at: cut(v.at, 40) || new Date().toISOString(),
  };
}

/**
 * The brief the image model renders one concept from — a creative director's, not a photographer's: who the brand is, what may be said,
 * the one message of this ad, how it looks, and the rules it is held to. `revise` = what Otto sent an earlier render back for.
 */
export function adBrief(plan: AdPlan, c: AdConcept, opts: { product: string; aspect: "4:5" | "9:16" | "1:1"; person?: boolean; styleRef?: boolean; template?: boolean; revise?: string[] }): string {
  const art = [c.scene && `Scene: ${c.scene}`, c.light && `Light: ${c.light}`, c.palette && `Palette: ${c.palette}`, c.type && `Typography: ${c.type}`, c.layout && `Layout: ${c.layout}`].filter(Boolean) as string[];
  return [
    "ROLE",
    "You are a world-class advertising creative director, graphic designer and product photographer, with the creative standards of a leading agency and the conversion sense of a successful direct-to-consumer brand. Turn the product in reference image 1 into ONE exceptional, scroll-stopping, production-ready static ad.",
    "",
    "BRAND",
    `${plan.brand}.${plan.voice ? ` Voice: ${plan.voice}` : ""}`,
    "",
    "PRODUCT",
    `${opts.product}. Reference image 1 is the real pack.${plan.pack ? ` ${plan.pack}` : ""}${opts.person ? " Reference image 2 is the person to show — same face, hair, skin tone and build, shown once." : ""}${opts.styleRef ? " The last reference image is a style reference for light and mood only." : ""}`,
    plan.facts.length ? `Facts you may use — and nothing beyond them or what is printed on the pack:\n${plan.facts.map((f) => `- ${f.fact}`).join("\n")}` : "Use only what is printed on the pack as fact.",
    ...(plan.never.length ? [`Never say or imply: ${plan.never.join("; ")}.`] : []),
    "",
    ...(plan.audience ? ["AUDIENCE", plan.audience, ""] : []),
    "THIS AD",
    `Creative angle: ${c.angle}.${c.insight ? ` The buyer truth it turns on: ${c.insight}` : ""}${c.message ? ` The one message: ${c.message}` : ""}`,
    c.headline ? `Headline, set exactly as written and spelled exactly: “${c.headline}”` : "Headline: write one distinctive, product-specific headline of 3–8 words — never a stock line.",
    c.sub ? `Supporting line, set exactly: “${c.sub}”` : "No supporting line.",
    c.callouts.length ? `Benefit callouts, each with a thin line icon, set exactly: ${c.callouts.map((v) => `“${v}”`).join(" · ")}` : "No benefit callouts — the headline and the picture carry it.",
    "No other words anywhere, apart from the wordmark.",
    "",
    "ART DIRECTION",
    ...(opts.template ? ["The last reference image is a layout TEMPLATE the brand chose. Build this ad on its structure: the same placement and proportions of the product, the headline, the supporting line and the callouts, the same type hierarchy, the same balance of filled and empty space. Put the pack from reference image 1 where its product is and this ad's words where its words are. Copy nothing else from it — not its brand name, logo, wording, product, people or exact colours."] : []),
    ...(art.length ? art : ["A thoughtful asymmetric composition with depth and scale, premium textures that belong to this product, a sophisticated palette built from the pack's own colours plus one warm or fresh tone."]),
    "It must look designed by experienced human creative professionals: editorial typography with a clear hierarchy (the headline dominant), intentional negative space, physically accurate light, a soft contact shadow, true reflections on the pack's material. The product is the hero: large, sharp, its label readable.",
    `The brand wordmark “${plan.brand}” small at the top, plainly typeset — do not invent a logo symbol.`,
    opts.aspect === "9:16" ? "Format: vertical 9:16 for Stories and Reels — keep the top 14% and the bottom 20% free of words and of the pack (the app's own buttons sit there)."
      : opts.aspect === "1:1" ? "Format: square 1:1 for the feed." : "Format: portrait 4:5 for the feed.",
    "",
    "RULES",
    "Preserve the pack exactly as in reference image 1 — shape, proportions, cap and nozzle, label layout, printed words, colours, material. Never redesign, rename or relabel it. One pack only unless the facts name a set.",
    "Never invent benefits, clinical results, percentages, prices, discounts, certifications, awards, ratings, dermatologist endorsements or testimonials. No before-and-after, no cure or medical claims.",
    plan.formula ? `Any drop, smear or swatch of the formula is exactly this: ${plan.formula}.` : "Do not show the formula out of the pack — no drop, smear or swatch.",
    "All lettering in correct English, fully inside the frame with a 6% safe margin, nothing cut off or repeated. No other company's logo, no watermark, no QR code. No button, pill, badge or sticker with words such as “Shop now” — the platform adds its own button.",
    ...(opts.revise?.length ? ["", "REVISION", `An earlier render of this ad was sent back. Fix exactly these and keep everything above:\n${opts.revise.slice(0, 4).map((v) => `- ${cut(v, 220)}`).join("\n")}`] : []),
  ].join("\n").slice(0, 8000);
}
