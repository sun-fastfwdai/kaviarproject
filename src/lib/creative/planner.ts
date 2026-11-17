import "server-only";
import { z } from "zod";
import { ask } from "../ai/client";
import { marketContext } from "../research/context";
import { brandContext } from "./remy";
import { AD_LOOKS } from "./layouts";

/**
 * The Plan conversation: Remy asks only what's missing (format, product, buyer, messages, how many), then proposes the pipeline
 * it will set up in Shoots. Stateless — the page sends the whole conversation each turn.
 */
export type PlanFormat = "static" | "video" | "ugc" | "full";
export type PlanBrief = { format: PlanFormat; product: string; signal: string; audience: string; angles: string[]; count: number; look: string; adLook: string; seconds: number; why: string };
export type PlanTurn = { who: "you" | "remy"; text: string };
export type PlanReply = { say: string; questions: { text: string; options: string[] }[]; brief: PlanBrief | null };
export type PlanOption = { key: string; title: string; why: string };

const Out = z.object({
  say: z.string().describe("One or two short sentences to the team, plain words, no lists"),
  questions: z.array(z.object({ text: z.string().describe("A short question"), options: z.array(z.string()).describe("2–4 short answers to tap; your recommendation first") })).describe("0–2 questions; empty when ready"),
  ready: z.boolean().describe("True when the brief is complete and the pipeline can be set up"),
  brief: z.object({
    format: z.enum(["static", "video", "ugc", "full"]),
    product: z.string().describe("Exact product title from the catalogue, or empty for the whole range"),
    signal: z.string().describe("The key of the plan or buyer group this batch is for, from the lists given; empty if none fits"),
    audience: z.string().describe("Who the ads are for, in a line"),
    angles: z.array(z.string()).describe("2–4 messages to test, each under 10 words"),
    count: z.number().describe("3, 6 or 9"),
    look: z.string().describe("The visual direction in one line: setting, light, mood"),
    adLook: z.string().describe(`For static ads, the studio look that suits this product and buyer — exactly one of: ${AD_LOOKS.map((l) => l.name.replace("Ad look · ", "")).join(", ")}. Empty for video.`),
    seconds: z.number().describe("Clip length for video formats (5–30); 0 for static"),
    why: z.string().describe("One line: why this plan, citing a number from the data when there is one"),
  }),
});

const SYSTEM = `You are Remy, Kaviar's creative lead, planning a batch of Meta ads with the team in a short chat before anything is made. Get to a clear brief in as few questions as possible, then propose the pipeline you will set up in Shoots.
You need five things:
1. Format — static (designed image cards over an art-directed product photo: the cheapest way to test messages; you also pick the studio look), video (a product clip, 5–30 s), ugc (a creator talking to camera) or full (a storyboarded 15–30 s ad with a final cut).
2. Product — one from the catalogue, or the whole range.
3. Who it is for — when a plan or buyer group in the data fits, use it and return its key in "signal".
4. The messages to test — 2–4 angles, in the buyer's words.
5. How many ads — 3, 6 or 9.
Rules:
- Ask only what the team hasn't said and the data doesn't answer. At most 2 questions a turn. Each question has 2–4 short options the team can tap — real answers, your recommendation first. Never ask about budgets, dates or anything decided later.
- The format decides the whole pipeline, so never assume it: unless the team has named it (static, image, video, UGC, full ad), your first reply asks for it — with your recommendation first — together with the one other thing you most need.
- As soon as you have enough — at the latest once the team has answered two rounds — set ready, fill the brief and choose sensible defaults for anything still open, saying which you assumed.
- Ground recommendations in the data given: name the number. For a brand with no ad results yet, recommend static first to find the message, then video for the winner.
- Use only products in the catalogue and claims the brand already makes.
- "say" never repeats the questions — they are shown under it as buttons.
- "say" speaks to the team: what you understood, or the plan in a sentence when ready. No lists, no jargon.`;

export async function planWithRemy(brandId: string, turns: PlanTurn[], options: { plans: PlanOption[]; buyers: PlanOption[] }): Promise<PlanReply | null> {
  const [ctx, market] = await Promise.all([brandContext(brandId), marketContext(brandId).catch(() => null)]);
  const out = await ask("remy", {
    system: SYSTEM,
    content: JSON.stringify({
      brand: ctx.brand, catalogue: ctx.products.slice(0, 20).map((p) => ({ title: p.title, price: p.price })),
      plansFromStoreData: options.plans, buyerGroupsFromResearch: options.buyers,
      positioning: market?.positioning ? { statement: market.positioning.statement, primaryBuyer: market.positioning.primaryBuyer, pillars: market.positioning.pillars } : null,
      whatWinsForThisBrand: ctx.lessons, hasAdResults: ctx.lessons.length > 0,
      conversation: turns.slice(-12).map((t) => `${t.who === "you" ? "Team" : "Remy"}: ${t.text}`),
      teamAnsweredRounds: turns.filter((t) => t.who === "you").length,
    }),
    schema: Out, maxTokens: 2500,
  });
  if (!out) return null;
  // The format is the team's call: if nobody has said it yet, ask before proposing a pipeline.
  const said = turns.filter((t) => t.who === "you").map((t) => t.text).join(" ");
  if (out.ready && !/static|image|picture|photo|card|video|clip|reel|ugc|creator|full ad|film/i.test(said)) {
    const rec = out.brief.format;
    const all: [string, string][] = [["static", "Static images"], ["video", "Product video"], ["ugc", "UGC video"], ["full", "Full video ad"]];
    return { say: out.say.slice(0, 500), brief: null, questions: [{ text: "Static images or video?", options: [...all.filter(([k]) => k === rec), ...all.filter(([k]) => k !== rec)].map(([, l]) => l) }] };
  }
  const keys = new Set([...options.plans, ...options.buyers].map((o) => o.key));
  const b = out.brief;
  const brief: PlanBrief | null = out.ready ? {
    format: b.format, product: ctx.products.find((p) => p.title === b.product)?.title ?? "", signal: keys.has(b.signal) ? b.signal : "",
    audience: b.audience.slice(0, 200), angles: b.angles.map((a) => a.slice(0, 90)).slice(0, 4), count: [3, 6, 9].includes(b.count) ? b.count : 6,
    look: b.look.slice(0, 200), adLook: b.format === "static" ? (AD_LOOKS.find((l) => l.name.toLowerCase().endsWith(b.adLook.trim().toLowerCase())) ?? AD_LOOKS[0]).name : "", seconds: b.format === "static" ? 0 : Math.min(30, Math.max(5, Math.round(b.seconds) || 10)), why: b.why.slice(0, 240),
  } : null;
  return { say: out.say.slice(0, 500), questions: brief ? [] : out.questions.slice(0, 2).map((q) => ({ text: q.text.slice(0, 160), options: q.options.slice(0, 4).map((o) => o.slice(0, 60)) })), brief };
}
