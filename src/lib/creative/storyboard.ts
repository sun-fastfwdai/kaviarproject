import "server-only";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "../db";
import { ask } from "../ai/client";
import { brandContext } from "./remy";
import { CTAS, END_SECONDS, PURPOSES, SCENE_MAX, SCENE_MIN, frameworkName, lookName, sceneCount, talkingScenes } from "./story";
import type { Story } from "../db/schema";

const SceneOut = z.object({
  purpose: z.enum(PURPOSES),
  seconds: z.number().describe(`Whole seconds, ${SCENE_MIN}–${SCENE_MAX}`),
  person: z.boolean().describe("A person is on screen"),
  keyframe: z.string().describe("The opening still of this scene as an image prompt: who (if a person), exactly what they do, where the product is and which way its label faces, the setting, light, lens and framing. 30–60 words."),
  camera: z.string().describe("Shot size, angle and move, e.g. 'close-up, eye level, slow push in'"),
  motion: z.string().describe("What happens during the scene, in order. Under 30 words."),
  line: z.string().describe("What the person says on camera, word for word — empty when nobody speaks"),
  caption: z.string().describe("On-screen text, at most 7 words — carries the story with the sound off"),
});
const StoryOut = z.object({
  title: z.string().describe("Short internal name, e.g. 'Morning glow · 30s'"),
  logline: z.string().describe("The ad in one sentence: who, the tension, the payoff"),
  framework: z.string(),
  why: z.string().describe("Why this story should work for this buyer, citing the data given. Under 30 words."),
  bible: z.string().describe("Continuity every scene repeats: location(s), time of day, wardrobe, palette, props. Under 45 words."),
  voice: z.string().describe("The speaker's voice: age, gender, accent, tone"),
  scenes: z.array(SceneOut),
  end: z.object({ headline: z.string().describe("At most 6 words"), sub: z.string().describe("At most 9 words"), cta: z.enum(CTAS), offer: z.string().describe("Only an offer the data shows the brand uses; otherwise empty") }),
  hooks: z.array(z.string()).describe("Alternative opening captions to test against scene 1"),
});

const REMY = `You are Remy, Kaviar's creative director. You write complete short-form video ads for Meta (Reels, Stories, Feed) the way the best performance studios do, from the brand's real data.
How a winning ad is built:
- Hook in the first 2 seconds: a pattern interrupt — a bold claim, a relatable moment, a surprising visual or a question about the situation (never "Do you have …?" about the viewer). Never open on a logo.
- Design for sound off: the captions alone tell the story, at most 7 words each, and read as one message across scenes. Spoken lines are short, first person, natural — at most 2.5 words per second of the scene.
- Show the product by scene 2 and in every hero moment; its label faces the camera when it matters.
- One idea per scene, 4–10 seconds each; vary shot size and angle between scenes; end on the product, then the end card.
- Build the arc from the chosen story framework, and speak to the buyer and the angle the data points to. Use proof the data gives (numbers, research, lessons from what already sells); never invent reviews, numbers or awards.
- One continuity bible (place, light, wardrobe, palette) so every scene looks like the same shoot; use the brand's palette and tone.
- Meta ad policy: no cure or treatment claims, no guaranteed results, no before/after comparisons, don't assert the viewer's personal attributes, no fake urgency; prices and offers only if given.`;

/** Remy writes the storyboard for a full ad from everything Kaviar knows about the brand, the product and the buyer. */
export async function writeStoryboard(brandId: string, input: {
  product: { title: string; price: number | null } | null; length: number; framework: string; look: string; hookCount: number;
  character: { name: string; description: string } | null; signal: { data: string; value: string | null; evidence: [string, string][] } | null; brandRules: string[];
}): Promise<Story | null> {
  const ctx = await brandContext(brandId);
  const [b] = await db.select({ onboarding: schema.brands.onboarding }).from(schema.brands).where(eq(schema.brands.id, brandId));
  const item = input.product ? b?.onboarding?.catalog?.products.find((p) => p.title === input.product!.title) : null;
  // Market research for this product (or the brand), if the team ran it: buyers, gaps and competitors' angles.
  const R = schema.marketResearch;
  const rows = await db.select({ subject: R.subject, report: R.report, adsRead: R.adsRead }).from(R).where(and(eq(R.brandId, brandId), eq(R.market, "US"))).orderBy(desc(R.updatedAt)).limit(5);
  const research = rows.find((r) => r.subject === (input.product?.title ?? "")) ?? rows.find((r) => r.subject === "") ?? null;
  const n = sceneCount(input.length), talk = talkingScenes(input.length);
  const out = await ask("remy", {
    system: REMY,
    content: JSON.stringify({
      write: {
        length: `${input.length} seconds in total: ${n} scenes (about ${Math.round((input.length - END_SECONDS) / n)} s each) plus a ${END_SECONDS}-second end card that Kaviar adds`,
        framework: input.framework === "auto" ? "Pick the best for this product and buyer" : frameworkName(input.framework),
        look: lookName(input.look), talkingScenes: `The person speaks on camera in at most ${talk} scene${talk > 1 ? "s" : ""}`,
        alternativeHooks: input.hookCount > 1 ? input.hookCount - 1 : 0,
      },
      brand: ctx.brand, product: input.product ? { ...input.product, description: item?.body?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 700) ?? null } : null,
      catalog: ctx.products.slice(0, 12).map((p) => p.title),
      person: input.character, whoWillSeeIt: input.signal,
      research: research?.report ? {
        summary: research.report.summary, demand: research.report.demand.line,
        buyers: research.report.segments.filter((s) => s.status !== "rejected").map((s) => ({ name: s.name, who: s.who, need: s.need, why: s.why, angle: s.angle, accepted: s.status === "accepted" })),
        opportunities: research.report.opportunities.filter((o) => o.status !== "rejected").map((o) => o.text),
        competitorsSay: research.adsRead?.angles.map((a) => `${a.name} (${a.share}%)`) ?? [], gapsNobodySpeaksTo: research.adsRead?.gaps.filter((g) => g.status !== "rejected").map((g) => g.text) ?? [],
      } : null,
      brandRules: input.brandRules, whatWinsForThisBrand: ctx.lessons, lessonsFromRejectedAds: ctx.rejected,
    }),
    schema: StoryOut, maxTokens: 12000, effort: "medium",
  });
  if (!out?.scenes.length) return null;
  const id = () => Math.random().toString(36).slice(2, 8);
  const scenes = out.scenes.slice(0, 10).map((x) => ({
    id: id(), purpose: x.purpose, seconds: Math.min(SCENE_MAX, Math.max(SCENE_MIN, Math.round(x.seconds))), person: x.person,
    keyframe: x.keyframe.slice(0, 900), camera: x.camera.slice(0, 160), motion: x.motion.slice(0, 400), line: x.line.trim().slice(0, 200), caption: x.caption.trim().slice(0, 60), frame: null,
  }));
  return {
    title: out.title.slice(0, 80), logline: out.logline.slice(0, 300), framework: input.framework === "auto" ? out.framework.slice(0, 40) : frameworkName(input.framework), look: input.look, length: input.length,
    bible: out.bible.slice(0, 500), voice: out.voice.slice(0, 160), scenes, why: out.why.slice(0, 300),
    end: { headline: out.end.headline.slice(0, 60), sub: out.end.sub.slice(0, 80), cta: out.end.cta, offer: out.end.offer.slice(0, 60) },
    hooks: out.hooks.slice(0, Math.max(0, input.hookCount - 1)).map((h) => h.slice(0, 60)), at: new Date().toISOString(),
  };
}
