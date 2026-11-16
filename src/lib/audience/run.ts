import "server-only";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import { ask, type Block } from "../ai/client";
import { audienceFacts, liveAds } from "./facts";
import { loadImage, videoFrames, type Img } from "./media";
import {
  BELIEVE, NEXT, PANEL_SIZE, PASSES, RELATIONS, SCROLL, scoreOf,
  type Calibration, type ItemScore, type PanelBody, type PanelKind, type Persona, type Reaction, type TestItem, type TestRead, type TestResult,
} from "./types";

const P = schema.audiencePanels, T = schema.audienceTests;
const savePanel = (id: string, x: Partial<typeof P.$inferInsert>) => db.update(P).set({ ...x, updatedAt: new Date() }).where(eq(P.id, id));
const saveTest = (id: string, x: Partial<typeof T.$inferInsert>) => db.update(T).set({ ...x, updatedAt: new Date() }).where(eq(T.id, id));

// ---------------------------------------------------------------- the panel: Iris builds people from the data

const SOURCES = ["shopify", "meta", "research", "brand", "general"] as const;
const PersonaOut = z.object({
  name: z.string().describe("First name only"),
  age: z.number(),
  gender: z.enum(["Woman", "Man", "Non-binary"]),
  place: z.string().describe("Where they live, e.g. 'Suburb of Dallas, TX'"),
  life: z.string().describe("Job, household and a normal day, in one sentence"),
  group: z.string().describe("The audience group this person stands for, 2–4 words, the same for similar people"),
  relation: z.enum(RELATIONS),
  wants: z.string().describe("What they want from this kind of product, in their words"),
  worries: z.array(z.string()).describe("1–3 doubts or objections, in their words"),
  budget: z.string().describe("What they spend on this kind of product and how price-sensitive they are"),
  shops: z.string().describe("How they decide: impulse or research, reviews, discount codes, where they buy"),
  feed: z.string().describe("When and how they scroll, which apps, what they follow"),
  trusts: z.string().describe("What would convince them"),
  weight: z.number().describe("Share of the people the ads will reach, in %; all weights add up to 100"),
  basis: z.string().describe("Why this person is on the panel, citing the data given. Under 25 words."),
  sources: z.array(z.enum(SOURCES)),
});
const PanelOut = z.object({
  summary: z.string().describe("Who the panel is, in 1–2 sentences"),
  facts: z.array(z.object({ text: z.string().describe("A fact the panel is built on, with its number"), source: z.enum(SOURCES) })).describe("4–8 facts"),
  personas: z.array(PersonaOut),
});

const IRIS_PANEL = (n: number, kind: PanelKind, focus?: string) => `You are Iris, Kaviar's analyst. You build a test panel: ${n} people who together behave like ${focus ? "one specific audience of this brand's Meta ads" : "the audience this brand's Meta ads will actually reach"}, so the team can show ads to them before spending.
Rules:
- ${kind === "yours"
    ? "Build from the brand's own data. Weights follow who the ads reach: use Meta's age and gender split of impressions, clicks and purchases when given, and its regions and placements. The mix of first-time and returning people follows the store (most people a prospecting ad reaches have never bought; repeat buyers are a small share unless the data says otherwise)."
    : "This is a general panel: build the people who typically see and buy this kind of product on Instagram and Facebook in the US, from what is known about the category and any market research given. Don't use or invent store numbers. Sources are 'general' or 'research'."}${focus ? `
- FOCUS: every person on this panel belongs to this audience: "${focus}". Nobody outside it. Within it, spread people the way the data does (e.g. for past buyers: how many bought once vs several times, what they bought, how long ago).` : ""}
- Include the people who are hard to win in their real share: skeptics, the price-sensitive, people loyal to a competitor, people who scroll past almost everything. A panel of fans is useless.
- Every person is specific and different: a real-sounding life, budget and habits, worries in their own words. People, not marketing segments. Group similar people under the same group name (3–5 groups).
- Never invent numbers. Every basis cites the data given (or says it's typical for the category). Facts quote the data with its numbers.`;

/** Iris turns the data into people. `focus` narrows the panel to one audience (e.g. a retargeting batch's past buyers). */
async function makePanel(brandId: string, kind: PanelKind, focus?: string): Promise<PanelBody> {
  const facts = await audienceFacts(brandId, kind);
  const out = await ask("iris", { system: IRIS_PANEL(PANEL_SIZE, kind, focus), content: JSON.stringify({ build: `${PANEL_SIZE} people`, ...(focus ? { onlyThisAudience: focus } : {}), ...facts }), schema: PanelOut, maxTokens: 14000, effort: "medium" });
  if (!out?.personas.length) throw new Error("Iris couldn’t build the panel — try again.");
  const people = out.personas.slice(0, PANEL_SIZE);
  const sum = people.reduce((a, p) => a + Math.max(0, p.weight), 0) || people.length;
  const personas: Persona[] = people.map((p, i) => ({
    id: `p${i + 1}`, name: p.name.slice(0, 30), age: Math.round(p.age), gender: p.gender, place: p.place.slice(0, 80), life: p.life.slice(0, 240), group: p.group.slice(0, 40),
    relation: p.relation, wants: p.wants.slice(0, 200), worries: p.worries.slice(0, 3).map((w) => w.slice(0, 140)), budget: p.budget.slice(0, 160), shops: p.shops.slice(0, 200),
    feed: p.feed.slice(0, 160), trusts: p.trusts.slice(0, 160), weight: Math.round((Math.max(0, p.weight || sum / people.length) / sum) * 1000) / 10, basis: p.basis.slice(0, 200),
    sources: [...new Set(p.sources)].filter((s) => kind === "yours" || s === "general" || s === "research"),
  }));
  return { summary: out.summary.slice(0, 500), facts: out.facts.slice(0, 8).map((f) => ({ text: f.text.slice(0, 320), source: f.source })), personas, at: new Date().toISOString() };
}

export async function buildPanel(id: string): Promise<void> {
  const [row] = await db.select().from(P).where(eq(P.id, id));
  if (!row) return;
  try {
    const panel = await makePanel(row.brandId, row.kind);
    // A new panel is a different set of people: the old match with real results no longer applies.
    await savePanel(id, { status: "done", panel, calibration: null, error: null, finishedAt: new Date() });
  } catch (e) {
    console.error("audience panel", id, (e as Error).message);
    await savePanel(id, { status: "error", error: (e as Error).message.slice(0, 300), finishedAt: new Date() });
  }
}

// ---------------------------------------------------------------- the test: every person looks at the feed and reacts

const SHOPPER = `You play one real person scrolling Instagram or Facebook on their phone. You'll be told who you are after the ads.
How real people react to ads in a feed:
- They see hundreds of posts a day. Most ads get a glance at most; some make them stop for a moment; they tap fewer than 1 in 50, and buy from far fewer.
- They don't owe the brand anything, aren't polite to ads, and don't judge ads the way a marketer or designer would.
- What stops them: something about their own life, a face or moment they recognise, a surprising picture, a price or offer they care about, a brand they already know.
- What loses them: not getting what it is in a second, claims that sound too good, a price outside their budget, anything that feels like it isn't for them.
React to each ad on its own, the way this person would at that moment — not by comparing the ads with each other. Scrolling past is common: don't stop, tap or buy just to be nice, and don't hold back when something really is for you.
Thoughts are first person, in this person's own words, the way they'd actually think them.`;

const ReactionOut = z.object({
  ad: z.number().describe("The ad's number"),
  thought: z.string().describe("Your honest first thought in that first second, in your own words. Under 20 words."),
  scroll: z.enum(SCROLL),
  next: z.enum(NEXT),
  clear: z.boolean().describe("You know what's being sold and who it's for"),
  believe: z.enum(BELIEVE),
  pulled: z.string().describe("What made you stop or got your interest — empty if nothing"),
  putOff: z.string().describe("What put you off, or what would stop you buying — empty if nothing"),
});
const FeedOut = z.object({ reactions: z.array(ReactionOut) });

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n).trimEnd()}… more` : s);
const handle = (brand: string) => brand.toLowerCase().replace(/[^a-z0-9]+/g, "");
const imgBlock = (i: Img): Block => ({ type: "image", source: { type: "base64", media_type: i.media, data: i.data } });

/** How one item looks in the feed: its picture or frames, and the words around it. */
function itemBlocks(n: number, it: TestItem, brand: string, media: { img?: Img | null; frames?: { at: number; img: Img }[] }): Block[] {
  const who = `Sponsored post from @${handle(brand)}.`;
  const words = [it.primaryText && `The text above it reads: "${clip(it.primaryText, 125)}"`, it.hook && `Big text on the picture: "${it.hook}"`,
    it.headline && `Under it: the headline "${it.headline}" and a "${it.cta}" button`, it.offer && !/^no offer$/i.test(it.offer) ? `Offer: ${it.offer}` : ""].filter(Boolean).join(". ");
  if (media.frames?.length) {
    return [{ type: "text", text: `Ad ${n} — a ${it.seconds ? `${Math.round(it.seconds)}-second ` : ""}video in your feed (Reels), playing with sound. ${who} Frames from it, in order:` },
      ...media.frames.flatMap((f): Block[] => [{ type: "text", text: `at ${f.at} s` }, imgBlock(f.img)]), { type: "text", text: words ? `${words}.` : "" }];
  }
  const kind = it.format === "video" || it.format === "ugc" ? "a video ad — this is its opening frame" : it.format === "carousel" ? "a carousel ad — this is its first card" : "an image ad";
  return [{ type: "text", text: `Ad ${n} — ${kind}. ${who}` }, ...(media.img ? [imgBlock(media.img)] : [{ type: "text" as const, text: "(No picture — this ad is text only for now.)" }]), { type: "text", text: `${words}.` }];
}

const card = (p: Persona) => `Who you are: ${p.name}, ${p.age}, ${p.gender.toLowerCase()}, ${p.place}. ${p.life}
With this brand: ${p.relation}.
What you want: ${p.wants}. What worries you: ${p.worries.join("; ")}.
Budget: ${p.budget}. How you shop: ${p.shops}. Your feed: ${p.feed}. What would convince you: ${p.trusts}.
Now react to every ad above, in order, as ${p.name}.`;

/** Runs a small pool of agents at a time. */
async function pool<T>(xs: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, xs.length) }, async () => { while (i < xs.length) await fn(xs[i++]); }));
}
const shuffle = <T,>(xs: T[], seed: number) => { const a = [...xs]; let s = seed || 1; for (let i = a.length - 1; i > 0; i--) { s = (s * 16807) % 2147483647; const j = s % (i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// ---------------------------------------------------------------- scoring

/** Spearman rank correlation (average ranks for ties). */
export function spearman(x: number[], y: number[]): number | null {
  const n = x.length;
  if (n < 3) return null;
  const rank = (v: number[]) => { const o = v.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]); const r = new Array<number>(n); for (let i = 0; i < n;) { let j = i; while (j + 1 < n && o[j + 1][0] === o[i][0]) j++; for (let k = i; k <= j; k++) r[o[k][1]] = (i + j) / 2; i = j + 1; } return r; };
  const rx = rank(x), ry = rank(y), mx = rx.reduce((a, b) => a + b, 0) / n, my = ry.reduce((a, b) => a + b, 0) / n;
  let c = 0, vx = 0, vy = 0;
  for (let i = 0; i < n; i++) { c += (rx[i] - mx) * (ry[i] - my); vx += (rx[i] - mx) ** 2; vy += (ry[i] - my) ** 2; }
  return vx && vy ? Math.round((c / Math.sqrt(vx * vy)) * 100) / 100 : null;
}

export function scoreTest(items: TestItem[], personas: Persona[], reactions: Reaction[], cal: Calibration | null): Omit<TestResult, "read"> {
  const w = new Map(personas.map((p) => [p.id, p.weight]));
  const fit = cal?.status === "done" && cal.fit && cal.rho != null && cal.rho >= 0.35 ? cal.fit : null;
  const scores: ItemScore[] = items.map((it) => {
    const rs = reactions.filter((r) => r.item === it.key && w.has(r.p));
    const W = rs.reduce((a, r) => a + (w.get(r.p) ?? 0), 0) || 1;
    const share = (f: (r: Reaction) => boolean) => rs.reduce((a, r) => a + (f(r) ? w.get(r.p) ?? 0 : 0), 0) / W;
    const stop = share((r) => SCROLL.indexOf(r.scroll) >= 2), tap = share((r) => NEXT.indexOf(r.next) >= 2), buy = share((r) => r.next === "tap and probably buy");
    const score = scoreOf(stop, tap, buy);
    const groups = [...new Set(personas.map((p) => p.group))].map((g) => {
      const ids = new Set(personas.filter((p) => p.group === g).map((p) => p.id));
      const gr = rs.filter((r) => ids.has(r.p)), gw = gr.reduce((a, r) => a + (w.get(r.p) ?? 0), 0) || 1;
      const gs = (f: (r: Reaction) => boolean) => gr.reduce((a, r) => a + (f(r) ? w.get(r.p) ?? 0 : 0), 0) / gw;
      return { group: g, weight: Math.round(personas.filter((p) => ids.has(p.id)).reduce((a, p) => a + p.weight, 0)), stop: gs((r) => SCROLL.indexOf(r.scroll) >= 2), tap: gs((r) => NEXT.indexOf(r.next) >= 2) };
    });
    const by = (id: string) => rs.filter((r) => r.p === id);
    return {
      key: it.key, score, stop, tap, buy, clear: share((r) => r.clear), trust: share((r) => r.believe === "believe it"), answers: rs.length,
      ctr: fit ? (() => { const m = fit.a + fit.b * score; return [Math.max(0.0005, Math.exp(m - fit.sd)), Math.min(0.1, Math.exp(m + fit.sd))] as [number, number]; })() : null,
      groups, fans: personas.filter((p) => by(p.id).some((r) => NEXT.indexOf(r.next) >= 2)).map((p) => p.id),
      lost: personas.filter((p) => { const x = by(p.id); return x.length > 0 && x.every((r) => r.scroll === "kept scrolling"); }).map((p) => p.id),
    };
  });
  // Same person, same ad, second look: how often the answer held.
  const pairs = new Map<string, Reaction[]>();
  for (const r of reactions) pairs.set(`${r.p}|${r.item}`, [...(pairs.get(`${r.p}|${r.item}`) ?? []), r]);
  const twice = [...pairs.values()].filter((x) => x.length >= 2);
  const stability = twice.length ? Math.round((twice.filter((x) => (NEXT.indexOf(x[0].next) >= 2) === (NEXT.indexOf(x[1].next) >= 2) && (SCROLL.indexOf(x[0].scroll) >= 2) === (SCROLL.indexOf(x[1].scroll) >= 2)).length / twice.length) * 100) / 100 : null;
  const ranked = [...scores].filter((s) => !items.find((i) => i.key === s.key)?.bench).sort((a, b) => b.score - a.score);
  return { scores, winner: ranked[0] && ranked[0].score >= 8 && ranked[0].score > (ranked[1]?.score ?? -1) ? ranked[0].key : null, stability, calibrated: Boolean(fit) };
}

// ---------------------------------------------------------------- Iris reads the answers

const ReadOut = z.object({
  headline: z.string().describe("The result in one line, under 25 words, e.g. 'Ad 3 wins with busy parents; ad 1 confuses almost everyone'"),
  summary: z.string().describe("2–3 sentences, under 80 words: what the panel says and why, and how much to trust it"),
  items: z.array(z.object({
    key: z.string(), verdict: z.enum(["Lead", "Keep", "Fix", "Drop"]),
    why: z.string().describe("Why, citing what the panel said. Under 30 words."),
    fix: z.string().describe("The one change most likely to make it work better — concrete (what to say, show or cut). Empty for live ads."),
    quotes: z.array(z.object({ p: z.string().describe("Person id"), text: z.string().describe("A thought copied exactly from the answers") })).describe("1–3 telling quotes"),
  })),
  groups: z.array(z.object({ group: z.string(), insight: z.string().describe("What works and doesn't for this group. Under 25 words.") })),
  next: z.array(z.string()).describe("2–4 next steps: what to fix, what to test for real on Meta, with which group"),
});

async function readTest(items: TestItem[], personas: Persona[], reactions: Reaction[], scored: Omit<TestResult, "read">, brand: string): Promise<TestRead | null> {
  const name = new Map(personas.map((p) => [p.id, `${p.name} (${p.group})`]));
  const out = await ask("iris", {
    system: `You are Iris, Kaviar's analyst. A panel of small agents, each playing one person from the brand's audience, just looked at ads in a simulated feed (twice, in opposite orders). Read their answers like a researcher reads a focus group:
- Lead with what will change the team's decision. Cite people and what they said; copy quotes exactly from the answers.
- Live ads (if any) are the brand's real ads with real click rates: use them as the bar to beat, and say if the panel ranks them the way their real results do.
- Be honest about limits: this is a simulation that predicts direction (which ad, which message, which group), not exact numbers — the real test on Meta decides.
- Verdicts: Lead = run it first; Keep = worth testing; Fix = promising but one problem holds it back; Drop = the panel didn't care.`,
    content: JSON.stringify({
      brand,
      panel: personas.map((p) => ({ id: p.id, who: `${p.name}, ${p.age}, ${p.place} — ${p.relation}`, group: p.group, weight: `${p.weight}%` })),
      ads: items.map((it) => ({ key: it.key, kind: it.kind === "live" ? "live ad (real results)" : it.kind, label: it.label, hook: it.hook, text: it.primaryText.slice(0, 300), headline: it.headline, offer: it.offer, product: it.product,
        ...(it.real ? { realClickRate: `${(it.real.ctr * 100).toFixed(2)}%`, realPurchases: it.real.purchases } : {}) })),
      scores: scored.scores.map((s) => ({ key: s.key, score: s.score, stopped: `${Math.round(s.stop * 100)}%`, tapped: `${Math.round(s.tap * 100)}%`, wouldBuy: `${Math.round(s.buy * 100)}%`, understood: `${Math.round(s.clear * 100)}%`, believed: `${Math.round(s.trust * 100)}%`,
        byGroup: s.groups.map((g) => `${g.group}: stopped ${Math.round(g.stop * 100)}%, tapped ${Math.round(g.tap * 100)}%`) })),
      sameAnswerOnSecondLook: scored.stability != null ? `${Math.round(scored.stability * 100)}%` : null,
      answers: reactions.map((r) => ({ p: r.p, who: name.get(r.p), ad: r.item, look: r.pass + 1, scroll: r.scroll, next: r.next, believe: r.believe, thought: r.thought, pulled: r.pulled, putOff: r.putOff })),
    }),
    schema: ReadOut, maxTokens: 8000, effort: "low",
  });
  if (!out) return null;
  const keys = new Set(items.map((i) => i.key)), ids = new Set(personas.map((p) => p.id));
  return {
    headline: out.headline.slice(0, 260), summary: out.summary.slice(0, 1000), next: out.next.slice(0, 4).map((x) => x.slice(0, 240)),
    items: out.items.filter((i) => keys.has(i.key)).map((i) => ({ key: i.key, verdict: i.verdict, why: i.why.slice(0, 260), fix: i.fix.slice(0, 260), quotes: i.quotes.filter((q) => ids.has(q.p)).slice(0, 3).map((q) => ({ p: q.p, text: q.text.slice(0, 160) })) })),
    groups: out.groups.slice(0, 6).map((g) => ({ group: g.group.slice(0, 40), insight: g.insight.slice(0, 200) })),
  };
}

/** Pick up to n past ads spread across their real click rates, so the comparison covers weak and strong ones. */
function spread(xs: TestItem[], n: number): TestItem[] {
  const s = [...xs].sort((a, b) => (a.real?.ctr ?? 0) - (b.real?.ctr ?? 0));
  if (s.length <= n) return s;
  return [...new Set(Array.from({ length: n }, (_, i) => Math.round((i * (s.length - 1)) / (n - 1))))].map((i) => s[i]);
}

export async function runTest(id: string): Promise<void> {
  const [row] = await db.select().from(T).where(eq(T.id, id));
  if (!row) return;
  const [panel] = await db.select().from(P).where(eq(P.id, row.panelId));
  const [b] = await db.select({ name: schema.brands.name }).from(schema.brands).where(eq(schema.brands.id, row.brandId));
  await saveTest(id, { status: "running", error: null, startedAt: new Date(), finishedAt: null, reactions: [], result: null });
  try {
    let items = row.items;
    // Live ads come from Meta at run time: the bar to beat in a test, or the ads a calibration compares with.
    if (row.source.type === "live" || ("bench" in row.source && row.source.bench)) {
      const live = (await liveAds(row.brandId)).filter((x) => x.image || x.primaryText);
      if (row.source.type === "live") {
        items = spread(live.filter((x) => (x.real?.impressions ?? 0) >= 1500), 8);
        if (items.length < 5) throw new Error(live.length ? `Only ${live.length} past ads have enough views and readable copy — the check needs at least 5.` : "Kaviar couldn’t read past ads from Meta — reconnect Meta Ads on Integrations, then try again.");
      } else {
        const best = live.filter((x) => (x.real?.impressions ?? 0) >= 3000).sort((a, b2) => (b2.real?.ctr ?? 0) - (a.real?.ctr ?? 0))[0];
        if (best) items = [...items, { ...best, bench: true, label: `Your best live ad · ${best.label}`.slice(0, 80) }];
      }
      await saveTest(id, { items });
    }
    if (!items.length) throw new Error("Nothing to show the panel.");
    // A focused test gets its own people, built for the batch's audience (e.g. past buyers for a win-back batch).
    let personas = row.personas;
    const focus = "focus" in row.source ? row.source.focus : undefined;
    if (focus && !personas.length) {
      personas = (await makePanel(row.brandId, panel?.kind ?? "yours", focus)).personas;
      await saveTest(id, { personas });
    }

    // Pictures and video frames, loaded once and shown to everyone.
    const media = new Map<string, { img?: Img | null; frames?: { at: number; img: Img }[] }>();
    await pool(items, 4, async (it) => {
      if (it.kind === "video" && it.assetId) media.set(it.key, { frames: await videoFrames(row.brandId, it.assetId) });
      else media.set(it.key, { img: await loadImage(row.brandId, it.image) });
    });

    const orderA = shuffle(items, id.split("").reduce((a, c) => a + c.charCodeAt(0), 7));
    const orders = [orderA, [...orderA].reverse()].slice(0, PASSES);
    const feeds = orders.map((order) => {
      const blocks: Block[] = [{ type: "text", text: "These ads show up in your feed today, one at a time, between your friends' posts and the accounts you follow:" },
        ...order.flatMap((it, i) => itemBlocks(i + 1, it, b?.name ?? "brand", media.get(it.key) ?? {}))];
      // Every person sees the same feed: cache it, only the person changes.
      const last = blocks[blocks.length - 1];
      blocks[blocks.length - 1] = { ...last, cache_control: { type: "ephemeral" } } as Block;
      return { order, blocks };
    });
    const jobs = personas.flatMap((p) => feeds.map((f, pass) => ({ p, pass, f })));
    const reactions: Reaction[] = [];
    let done = 0, failed = 0;
    await saveTest(id, { progress: { done, total: jobs.length, failed } });
    await pool(jobs, 8, async ({ p, pass, f }) => {
      const out = await ask("shopper", { system: SHOPPER, content: [...f.blocks, { type: "text", text: card(p) }], schema: FeedOut, maxTokens: 4000 });
      if (out?.reactions.length) {
        for (const r of out.reactions) {
          const it = f.order[Math.round(r.ad) - 1];
          if (!it || reactions.some((x) => x.p === p.id && x.pass === pass && x.item === it.key)) continue;
          reactions.push({ p: p.id, pass, item: it.key, scroll: r.scroll, next: r.next, believe: r.believe, clear: r.clear, thought: r.thought.slice(0, 160), pulled: r.pulled.slice(0, 160), putOff: r.putOff.slice(0, 160) });
        }
        done++;
      } else failed++;
      await saveTest(id, { progress: { done, total: jobs.length, failed }, reactions: [...reactions] });
    });
    if (done < Math.ceil(jobs.length / 2)) throw new Error("Too many of the panel’s answers failed — try again in a minute.");

    const scored = scoreTest(items, personas, reactions, row.purpose === "test" && !focus ? panel?.calibration ?? null : null);
    if (row.purpose === "calibration") {
      const pts = items.map((it) => ({ it, s: scored.scores.find((x) => x.key === it.key)!.score }));
      const rho = spearman(pts.map((x) => x.s), pts.map((x) => x.it.real!.ctr));
      // ln(click rate) ≈ a + b × score — only used when the panel's order matches the real one well enough.
      const xs = pts.map((x) => x.s), ys = pts.map((x) => Math.log(Math.max(0.0005, x.it.real!.ctr)));
      const mx = xs.reduce((a, v) => a + v, 0) / xs.length, my = ys.reduce((a, v) => a + v, 0) / ys.length;
      const vx = xs.reduce((a, v) => a + (v - mx) ** 2, 0), bb = vx ? xs.reduce((a, v, i) => a + (v - mx) * (ys[i] - my), 0) / vx : 0, aa = my - bb * mx;
      const sd = Math.sqrt(ys.reduce((a, y, i) => a + (y - (aa + bb * xs[i])) ** 2, 0) / Math.max(1, ys.length - 2));
      const cal: Calibration = {
        testId: id, status: "done", n: pts.length, rho, fit: rho != null && rho >= 0.35 && bb > 0 ? { a: aa, b: bb, sd } : null, at: new Date().toISOString(),
        ads: pts.map((x) => ({ key: x.it.key, name: x.it.label, ctr: x.it.real!.ctr, score: x.s })),
      };
      await savePanel(row.panelId, { calibration: cal });
      await saveTest(id, { status: "done", result: { ...scored, read: null }, finishedAt: new Date() });
      return;
    }
    const read = await readTest(items, personas, reactions, scored, b?.name ?? "the brand");
    await saveTest(id, { status: "done", result: { ...scored, read }, finishedAt: new Date() });
  } catch (e) {
    console.error("audience test", id, (e as Error).message);
    await saveTest(id, { status: "error", error: (e as Error).message.slice(0, 300), finishedAt: new Date() });
    if (row.purpose === "calibration" && panel) await savePanel(row.panelId, { calibration: { ...(panel.calibration ?? { n: 0, rho: null, fit: null, ads: [] }), testId: id, status: "error", at: new Date().toISOString(), note: (e as Error).message.slice(0, 200) } });
  }
}
