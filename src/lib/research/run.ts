import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { ask } from "../ai/client";
import { adLibraryToken, competitorAds } from "./adlib";
import { PART_STEPS, STEP_LABEL, marketName, type AdsRead, type MarketReport, type Part, type RivalAds, type Src, type Step, type StepKey, type TestPlan } from "./types";

const R = schema.marketResearch;
type Row = typeof R.$inferSelect;
const save = (id: string, patch: Partial<Row>) => db.update(R).set({ ...patch, updatedAt: new Date() }).where(eq(R.id, id));
const uid = () => Math.random().toString(36).slice(2, 9);

/** Marks each step running → done / error with its time and a short note, so the page shows the work as it happens. */
function tracker(id: string, steps: Step[]) {
  const set = async (key: StepKey, x: Partial<Step>) => { const i = steps.findIndex((s) => s.key === key); if (i >= 0) steps[i] = { ...steps[i], ...x }; await save(id, { steps: [...steps] }); };
  return async <T>(key: StepKey, fn: (note: (s: string) => void) => Promise<T>): Promise<T> => {
    const t = Date.now();
    let n: string | undefined;
    await set(key, { state: "running" });
    try { const out = await fn((s) => { n = s; }); await set(key, { state: "done", ms: Date.now() - t, note: n }); return out; }
    catch (e) { await set(key, { state: "error", ms: Date.now() - t, note: (e as Error).message.slice(0, 220) }); throw e; }
  };
}

// ---------------------------------------------------------------- what Iris knows before searching
export async function productsFor(brandId: string): Promise<{ title: string; price: number | null; image: string | null; type: string | null }[]> {
  const shop = (await db.execute(sql`select title, price_min::float8 as price, image_url as image, product_type as type from shop_products
    where brand_id = ${brandId} and coalesce(status, 'ACTIVE') = 'ACTIVE' order by total_inventory desc nulls last limit 200`)).rows as { title: string; price: number | null; image: string | null; type: string | null }[];
  if (shop.length) return shop;
  const [b] = await db.select({ onboarding: schema.brands.onboarding }).from(schema.brands).where(eq(schema.brands.id, brandId));
  return (b?.onboarding?.catalog?.products ?? []).map((p) => ({ title: p.title, price: p.variants[0]?.price ?? null, image: p.images[0] ?? null, type: p.type || null }));
}

async function contextFor(brandId: string, subject: string) {
  const [b] = await db.select({ name: schema.brands.name, category: schema.brands.category, website: schema.brands.website, currency: schema.brands.currency, onboarding: schema.brands.onboarding })
    .from(schema.brands).where(eq(schema.brands.id, brandId));
  const profile = b.onboarding?.profile ? Object.fromEntries(Object.entries(b.onboarding.profile).map(([k, v]) => [k, v.value])) : null;
  const products = await productsFor(brandId);
  const catalogItem = b.onboarding?.catalog?.products.find((p) => p.title === subject);
  const product = subject ? { ...(products.find((p) => p.title === subject) ?? { title: subject }), description: catalogItem?.body?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 800) ?? null } : null;
  const [o] = (await db.execute(sql`select count(*)::int as orders, coalesce(sum(total), 0)::float8 as revenue from shop_orders where brand_id = ${brandId} and cancelled_at is null and created_at > now() - interval '90 days'`)).rows as { orders: number; revenue: number }[];
  return {
    brand: { name: b.name, category: b.category, website: b.website, currency: b.currency, profile },
    product, catalog: products.slice(0, 15).map((p) => `${p.title}${p.price != null ? ` · ${p.price}` : ""}`),
    shopify: o?.orders ? { ordersLast90Days: o.orders, revenueLast90Days: Math.round(o.revenue) } : "no store sales yet",
  };
}
type Ctx = Awaited<ReturnType<typeof contextFor>>;

// ---------------------------------------------------------------- 1 · Iris searches the web
let client: Anthropic | null = null;
const api = () => (client ??= new Anthropic({ maxRetries: 2, timeout: 10 * 60_000 }));

async function searchMarket(ctx: Ctx, market: string, note: (s: string) => void): Promise<{ memo: string; sources: Src[] }> {
  const where = marketName(market);
  const system = `You are Iris, the research analyst at Kaviar, a team that launches Korean and other international brands in new markets with Meta ads. Research the ${where} market for ${ctx.product ? "the product" : "the brand's products"} below with web search, so the team can decide who to target first and which messages to test.
Cover, with numbers and dates wherever you find them:
1. Demand — is there real demand in ${where}? Search interest, marketplace rankings and review counts (Amazon, Sephora, Ulta, Target, TikTok Shop and similar), category growth, seasonality.
2. Customer segments — 3 or 4 groups in ${where} who buy this kind of product: who they are, what they need, why they would choose this product, their objections, and how to reach them on Facebook and Instagram.
3. Competitors — 5 to 8 brands selling close alternatives in ${where}: product, price, positioning, strengths, weaknesses. Write each brand's name exactly as on its Facebook Page.
4. Trends — what is rising or fading in this category.
5. Opportunities — gaps a new brand could own: messages nobody uses, underserved buyers, price points.
Search broadly (around 10–14 searches), prefer sources from the last two years, and never invent numbers — say when evidence is thin. Then write a research memo: short, specific bullet findings under those five headings.`;
  const tools: Anthropic.Beta.BetaToolUnion[] = [{ type: "web_search_20260209", name: "web_search", max_uses: 14, user_location: { type: "approximate", country: market } }];
  let messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: JSON.stringify(ctx) }];
  const pool = new Map<string, string>(), cited: string[] = [], parts: string[] = [];
  let searches = 0;
  for (let turn = 0; turn < 5; turn++) {
    const msg = await api().beta.messages.stream({
      model: "claude-opus-5-5", max_tokens: 32000, system, messages, tools, output_config: { effort: "medium" },
      betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
    }).finalMessage();
    for (const b of msg.content) {
      if (b.type === "web_search_tool_result" && Array.isArray(b.content)) { searches++; for (const r of b.content) if (r.type === "web_search_result" && !pool.has(r.url)) pool.set(r.url, r.title); }
      if (b.type === "text") {
        let marks = "";
        for (const c of b.citations ?? []) if (c.type === "web_search_result_location") {
          if (!cited.includes(c.url)) cited.push(c.url);
          if (!pool.has(c.url)) pool.set(c.url, c.title ?? c.url);
          marks += ` [S${cited.indexOf(c.url) + 1}]`;
        }
        parts.push(b.text + marks);
      }
    }
    if (msg.stop_reason === "refusal") throw new Error("Iris couldn’t research this product — try the whole brand instead.");
    if (msg.stop_reason !== "pause_turn") break;
    messages = [...messages, { role: "assistant", content: msg.content as Anthropic.Beta.BetaContentBlockParam[] }];
  }
  const urls = [...cited, ...[...pool.keys()].filter((u) => !cited.includes(u))].slice(0, 40);
  const memo = parts.join("").trim();
  if (memo.length < 200) throw new Error("The web search came back nearly empty — check that web search is turned on for the Claude API key.");
  note(`${searches} searches · ${urls.length} sources`);
  return { memo, sources: urls.map((u) => ({ url: u, title: (pool.get(u) ?? u).slice(0, 140) })) };
}

// ---------------------------------------------------------------- 2 · findings with sources
const Cite = z.array(z.number()).describe("Source numbers (the N in S#) that support it; [] when it is your own inference");
const MarketOut = z.object({
  summary: z.string().describe("Iris's take in 1–2 sentences: is this worth testing here, and with whom first"),
  demand: z.object({ verdict: z.enum(["Strong", "Growing", "Niche", "Weak"]), line: z.string().describe("One sentence on demand"), signals: z.array(z.object({ text: z.string(), sources: Cite })) }),
  segments: z.array(z.object({
    name: z.string().describe("Short, e.g. 'Acne-prone Gen Z'"), priority: z.enum(["Primary", "Secondary", "Test"]),
    who: z.string(), need: z.string(), why: z.string().describe("Why they'd pick this product"), objections: z.string(), angle: z.string().describe("The message most likely to work"),
    ages: z.string().describe("e.g. '18–24'"), gender: z.enum(["All", "Women", "Men"]), interests: z.array(z.string()).describe("Meta interest targeting, 3–6"), placements: z.array(z.string()).describe("e.g. Instagram Reels, Feed"),
    sources: Cite,
  })),
  competitors: z.array(z.object({ name: z.string().describe("As on its Facebook Page"), product: z.string(), price: z.string(), positioning: z.string(), strength: z.string(), weakness: z.string(), sources: Cite })),
  price: z.object({ low: z.number().nullable(), high: z.number().nullable(), note: z.string().describe("What the price range means for this product") }),
  trends: z.array(z.object({ text: z.string(), direction: z.enum(["rising", "steady", "fading"]), sources: Cite })),
  opportunities: z.array(z.object({ text: z.string(), why: z.string(), sources: Cite })),
});

async function writeReport(ctx: Ctx, market: string, found: { memo: string; sources: Src[] }): Promise<MarketReport> {
  const out = await ask("iris", {
    system: `You are Iris, Kaviar's research analyst. Turn your research memo into findings for the ${marketName(market)} market: 3–5 demand signals, 3–4 customer segments, 5–8 competitors, 3–6 trends, 3–5 opportunities. Keep each line short and concrete. Cite sources by their number from the list (S3 → 3), only sources that support the line; use [] for your own inference. Prices in ${ctx.brand.currency ?? "USD"}.`,
    content: `PRODUCT\n${JSON.stringify(ctx.product ?? { brand: ctx.brand.name, catalog: ctx.catalog })}\n\nMEMO\n${found.memo.slice(0, 60_000)}\n\nSOURCES\n${found.sources.map((s, i) => `S${i + 1}: ${s.title} — ${s.url}`).join("\n")}`,
    schema: MarketOut, maxTokens: 16000,
  });
  if (!out) throw new Error("Iris couldn’t write up the findings — try again.");
  const n = found.sources.length, ok = (xs: number[]) => [...new Set(xs.filter((x) => Number.isInteger(x) && x >= 1 && x <= n))];
  return {
    summary: out.summary, demand: { ...out.demand, signals: out.demand.signals.map((s) => ({ ...s, sources: ok(s.sources) })) },
    segments: out.segments.slice(0, 5).map((s) => ({ id: uid(), name: s.name, priority: s.priority, who: s.who, need: s.need, why: s.why, objections: s.objections, angle: s.angle,
      reach: { ages: s.ages, gender: s.gender, interests: s.interests.slice(0, 8), placements: s.placements.slice(0, 5) }, sources: ok(s.sources) })),
    competitors: out.competitors.slice(0, 10).map((c) => ({ ...c, sources: ok(c.sources) })),
    price: out.price, trends: out.trends.slice(0, 8).map((t) => ({ ...t, sources: ok(t.sources) })),
    opportunities: out.opportunities.slice(0, 6).map((o) => ({ id: uid(), ...o, sources: ok(o.sources) })),
    sources: found.sources,
  };
}

// ---------------------------------------------------------------- 3 · competitors' ads
async function pullAds(row: Row, report: MarketReport | null, note: (s: string) => void): Promise<RivalAds[]> {
  const added = row.rivals.filter((r) => r.added).map((r) => r.name);
  const names = [...new Set([...added, ...(report?.competitors ?? []).map((c) => c.name)])].slice(0, 8);
  if (!names.length) { note("No competitors yet — add one by name"); return row.rivals; }
  const token = await adLibraryToken(row.brandId);
  if (!token) throw new Error("Connect Meta Ads on any brand — the Ad Library is read with that login.");
  const out: RivalAds[] = [];
  for (const name of names) {
    try { out.push({ name, ads: await competitorAds(name, token), at: new Date().toISOString(), added: added.includes(name) || undefined }); }
    catch (e) { out.push({ name, ads: [], at: new Date().toISOString(), error: (e as Error).message, added: added.includes(name) || undefined }); }
  }
  if (out.every((r) => r.error)) throw new Error(out[0].error!);
  const total = out.reduce((a, r) => a + r.ads.length, 0);
  note(`${out.filter((r) => r.ads.length).length} of ${out.length} competitors have ads there · ${total} ads`);
  return out;
}

const daysSince = (iso: string | null) => (iso ? Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 86_400_000)) : null);
const AdsOut = z.object({
  summary: z.string().describe("What competitors are saying, in 1–2 sentences"),
  angles: z.array(z.object({ name: z.string(), share: z.number().describe("Share of the ads using it, 0–100"), example: z.string().describe("A short quote from one ad"), who: z.array(z.string()) })),
  offers: z.array(z.string()), hooks: z.array(z.string()).describe("Opening lines or patterns that recur"),
  positioning: z.string().describe("How the category positions itself, and who looks different"),
  gaps: z.array(z.object({ text: z.string().describe("A message or buyer nobody speaks to"), why: z.string() })),
});

async function readAds(row: Row, rivals: RivalAds[], report: MarketReport | null, note: (s: string) => void): Promise<AdsRead | null> {
  const ads = rivals.flatMap((r) => r.ads.slice(0, 12).map((a) => ({ competitor: r.name, runningDays: daysSince(a.start), text: a.bodies[0] ?? "", title: a.titles[0] ?? "", platforms: a.platforms }))).slice(0, 70);
  const shots = row.manual.slice(0, 8);
  const imgs = shots.length ? await db.select({ id: schema.brandAssets.id, data: schema.brandAssets.data, mime: schema.brandAssets.mime }).from(schema.brandAssets)
    .where(and(eq(schema.brandAssets.brandId, row.brandId), inArray(schema.brandAssets.id, shots.map((m) => m.id)))) : [];
  if (!ads.length && !imgs.length) { note("No ads to read yet — none found in the Library and no screenshots added"); return null; }
  const out = await ask("iris", {
    system: `You are Iris, Kaviar's research analyst. Read competitors' live Meta ads (text from the Ad Library, plus screenshots the team added) and say how the category sells: the message angles and how often each is used, offers, recurring hooks, positioning, and the gaps — messages or buyers nobody speaks to — that a new brand could own${report ? `, given these buyers: ${report.segments.map((s) => s.name).join(", ")}` : ""}. Ads that have run 30+ days are likely working; weigh them more.`,
    content: [
      { type: "text", text: JSON.stringify({ ads, screenshots: shots.map((m) => ({ competitor: m.competitor, note: m.note })) }) },
      ...imgs.filter((i) => /^image\/(png|jpeg|webp|gif)$/.test(i.mime)).map((i) => ({ type: "image" as const, source: { type: "base64" as const, media_type: i.mime as "image/png", data: Buffer.from(i.data).toString("base64") } })),
    ],
    schema: AdsOut, maxTokens: 8000,
  });
  if (!out) throw new Error("Iris couldn’t read the ads — try again.");
  note(`${ads.length} ads${imgs.length ? ` + ${imgs.length} screenshots` : ""}`);
  return {
    summary: out.summary, count: ads.length + imgs.length, at: new Date().toISOString(), offers: out.offers.slice(0, 8), hooks: out.hooks.slice(0, 8), positioning: out.positioning,
    angles: out.angles.slice(0, 8).map((a) => ({ ...a, share: Math.max(0, Math.min(100, Math.round(a.share))) })),
    gaps: out.gaps.slice(0, 6).map((g) => ({ id: uid(), ...g })),
  };
}

// ---------------------------------------------------------------- 4 · the message test
const PlanOut = z.object({
  summary: z.string().describe("The test in one or two sentences: what we learn and how we'll know"),
  cells: z.array(z.object({
    segment: z.string(), angle: z.string(), hypothesis: z.string().describe("'<segment> responds to <angle> because …'"),
    audience: z.string().describe("Meta targeting: ages, gender, 3–5 interests"), hook: z.string().describe("The headline idea, under 8 words"),
    visual: z.string().describe("A static, product-focused image — no people, not UGC"), metric: z.string().describe("The result that says 'this message works', e.g. CTR ≥ 1.5%"),
  })),
  budget: z.object({ perDay: z.number().describe("Total USD per day across all cells"), days: z.number(), note: z.string() }),
});

async function planTest(row: Row, report: MarketReport | null, read: AdsRead | null): Promise<TestPlan> {
  if (!report) throw new Error("Run the market research first — the plan builds on its buyers and gaps.");
  const segments = report.segments.filter((s) => s.status !== "rejected");
  const out = await ask("iris", {
    system: `You are Iris, Kaviar's research analyst. Plan a first message test for a brand new to the ${marketName(row.market)} market. Use static image ads only — product-focused, no people, not UGC — because they are cheap to make and test the message, not the production. 4 to 8 cells: each tests one buyer segment × one message angle; reuse the same angles across segments so results compare. Prefer the accepted buyers and the gaps competitors leave open. Budget: about 10–15 USD a day per cell for 5–7 days unless the evidence says otherwise.`,
    content: JSON.stringify({
      product: row.subject || "the brand's range", summary: report.summary, demand: report.demand.verdict, price: report.price,
      buyers: segments.map((s) => ({ name: s.name, accepted: s.status === "accepted", who: s.who, need: s.need, angle: s.angle, ages: s.reach.ages, gender: s.reach.gender, interests: s.reach.interests })),
      opportunities: report.opportunities.filter((o) => o.status !== "rejected").map((o) => o.text),
      competitorAngles: read?.angles.map((a) => `${a.name} (${a.share}%)`) ?? [], gaps: read?.gaps.filter((g) => g.status !== "rejected").map((g) => g.text) ?? [],
    }),
    schema: PlanOut, maxTokens: 8000,
  });
  if (!out?.cells.length) throw new Error("Iris couldn’t plan the test — try again.");
  return { summary: out.summary, cells: out.cells.slice(0, 9).map((c) => ({ id: uid(), ...c, on: true })), budget: { perDay: Math.max(0, Math.round(out.budget.perDay)), days: Math.max(1, Math.round(out.budget.days)), note: out.budget.note }, at: new Date().toISOString() };
}

// ---------------------------------------------------------------- the run
/** Runs the chosen parts in order (market → ads → plan), saving each piece as soon as it's ready. */
export async function runResearch(id: string, parts: Part[]): Promise<void> {
  const [row] = await db.select().from(R).where(eq(R.id, id));
  if (!row) return;
  const steps: Step[] = parts.flatMap((p) => PART_STEPS[p]).map((key) => ({ key, label: STEP_LABEL[key], state: "waiting" as const }));
  await save(id, { status: "running", steps, error: null, startedAt: new Date(), finishedAt: null });
  const step = tracker(id, steps);
  let report = row.report, rivals = row.rivals, read = row.adsRead;
  try {
    if (parts.includes("market")) {
      const ctx = await step("context", async (note) => { const c = await contextFor(row.brandId, row.subject); note(c.product ? c.product.title : `${c.catalog.length} products`); return c; });
      const found = await step("search", (note) => searchMarket(ctx, row.market, note));
      report = await step("write", async (note) => { const r = await writeReport(ctx, row.market, found); note(`${r.segments.length} buyer groups · ${r.competitors.length} competitors`); return r; });
      await save(id, { report });
    }
    if (parts.includes("ads")) {
      // Ads are a bonus: if Meta refuses, the plan still runs on the market research.
      try {
        rivals = await step("adlib", (note) => pullAds(row, report, note));
        await save(id, { rivals });
        read = await step("read", (note) => readAds(row, rivals, report, note));
        await save(id, { adsRead: read });
      } catch { for (const s of steps) if (s.key === "read" && s.state === "waiting") s.state = "error"; await save(id, { steps: [...steps] }); }
    }
    if (parts.includes("plan")) {
      const plan = await step("plan", async (note) => { const p = await planTest({ ...row, rivals }, report, read); note(`${p.cells.length} ads to test`); return p; });
      await save(id, { plan });
    }
    await save(id, { status: "done", finishedAt: new Date() });
  } catch (e) {
    console.error("research", id, (e as Error).message);
    await save(id, { status: "error", error: (e as Error).message.slice(0, 300), finishedAt: new Date() });
  }
}

/** Researches for this brand, newest first (one per product and market). */
export const researchList = (brandId: string) =>
  db.select({ id: R.id, subject: R.subject, market: R.market, status: R.status, updatedAt: R.updatedAt }).from(R).where(eq(R.brandId, brandId)).orderBy(desc(R.updatedAt));
