import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { ask } from "../ai/client";
import { adLibraryToken, competitorAds, libError, pruneAdCopies, samePage } from "./adlib";
import { metaLessons, storeFacts } from "./context";
import { gatherEvidence } from "./evidence";
import { PART_STEPS, STEP_LABEL, evidenceLine, marketName, type Evidence, type Hypothesis, type AdsRead, type DataSource, type LibAd, type ManualAd, type MarketReport, type Part, type Positioning, type RivalAds, type Src, type Step, type StepKey, type TestPlan } from "./types";
import { readAssets } from "@/lib/assets/storage";

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
    const at = new Date().toISOString(), add = added.includes(name) || undefined;
    // A refusal for the login (identity, expired, limit) is the same for every competitor: don't ask Meta again.
    const stop = out.find((r) => r.blocked);
    if (stop) { out.push({ name, ads: [], at, error: stop.error, blocked: stop.blocked, added: add }); continue; }
    try { out.push({ name, ...(await competitorAds(name, token, row.brandId)), at, added: add }); }
    catch (e) { const le = libError(e); out.push({ name, ads: [], at, error: le.message, blocked: le.blocked, added: add }); }
  }
  // Keep what came back (and why not) even when Meta refused, so the page can say what to do.
  await save(row.id, { rivals: out });
  await pruneAdCopies(row.brandId).catch(() => undefined);
  if (out.every((r) => r.error)) throw new Error(out[0].error!);
  const total = out.reduce((a, r) => a + (r.stats?.ads ?? r.ads.length), 0);
  note(`${out.filter((r) => r.ads.length).length} of ${out.length} competitors have ads there · ${total} ads`);
  return out;
}

/** "Ingredient proof — 12 of 40 ads (30%), 7 running 30+ days", or the estimated share for reads made before counting. */
export const angleLine = (read: AdsRead) => (a: AdsRead["angles"][number]) =>
  read.counted && a.n != null ? `${a.name} — ${a.n} of ${read.creatives} ads (${a.share}%), ${a.proven ?? 0} running 30+ days` : `${a.name} (${a.share}%)`;
const daysSince = (iso: string | null) => (iso ? Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 86_400_000)) : null);
const AdsOut = z.object({
  summary: z.string().describe("What competitors are saying, in 1–2 sentences"),
  angles: z.array(z.object({ name: z.string().describe("2–5 words"), meaning: z.string().describe("What ads with this angle claim, in one line") })).describe("3–7 message angles that together cover the ads"),
  tags: z.array(z.object({ ref: z.string(), angle: z.string().describe("Exactly one of the angle names"), offer: z.string().describe("The offer or price hook in this ad, if any (e.g. '20% off', 'free gift'); empty if none") })).describe("One tag per ad, every ad"),
  hooks: z.array(z.string()).describe("Opening lines or patterns that recur, quoted or described"),
  positioning: z.string().describe("How the category positions itself, and who looks different"),
  gaps: z.array(z.object({ text: z.string().describe("A message or buyer nobody speaks to"), why: z.string() })),
});

/** Iris tags every ad with one angle; the shares are then counted from those tags, so each angle links to the real ads behind it. */
async function readAds(row: Row, rivals: RivalAds[], manual: ManualAd[], report: MarketReport | null, note: (s: string) => void): Promise<AdsRead | null> {
  type C = { ref: string; competitor: string; a: LibAd };
  const pool: C[] = [
    ...rivals.flatMap((r) => r.ads.slice(0, 25).map((a) => ({ competitor: r.name, a }))),
    ...manual.flatMap((m) => (m.ads ?? []).map((a) => { const k = m.competitor || a.partner || a.page; return { competitor: rivals.find((r) => samePage(r.name, k) || samePage(k, r.name))?.name ?? k, a }; })),
  ].filter((c, i, all) => all.findIndex((x) => x.a.id === c.a.id || (x.a.ids ?? []).includes(c.a.id)) === i).slice(0, 160).map((c, i) => ({ ...c, ref: `A${i + 1}` }));
  // Screenshots added before Kaviar read them card by card: Iris still looks at the pictures.
  const legacy = manual.filter((m) => !m.ads?.length).slice(0, 6);
  const imgs = legacy.length ? await readAssets(and(eq(schema.brandAssets.brandId, row.brandId), inArray(schema.brandAssets.id, legacy.map((m) => m.id)))) : [];
  if (!pool.length && !imgs.length) { note("No ads to read yet — none found in the Library and no screenshots added"); return null; }
  const ads = pool.map(({ ref, competitor, a }) => ({
    ref, competitor, runningDays: daysSince(a.start), adsUsingIt: a.copies ?? 1, where: a.from === "shot" ? "US (Ad Library website)" : "EU/UK (Ad Library API)",
    format: a.media?.kind ?? "unknown", text: (a.bodies[0] ?? "").slice(0, 400), headline: a.titles[0] ?? "", reachedInEU: a.reach,
  }));
  // The ads each competitor ran longest in the last six months, live or stopped: the strongest public sign of what worked for them.
  const keptLong = rivals.flatMap((r) => (r.stats?.past?.kept ?? []).slice(0, 4).map((k) => ({ competitor: r.name, ranDays: k.days, stillRunning: k.open, text: k.text.slice(0, 300), headline: k.title ?? "" })));
  const out = await ask("iris", {
    system: `You are Iris, Kaviar's research analyst. Read competitors' live Meta ads (from Meta's Ad Library) and say how the category sells. First name 3–7 message angles that together cover the ads, then tag EVERY ad (by its ref) with exactly one angle and any offer it makes — Kaviar counts your tags to show how often each angle is used, so tag each ad on what it actually says. Then the hooks that recur, the positioning, and the gaps — messages or buyers nobody speaks to — that a new brand could own${report ? `, given these buyers: ${report.segments.map((s) => s.name).join(", ")}` : ""}. Ads running 30+ days, or used by many ads, are likely working; weigh them more. keptLongestInSixMonths lists the ads each competitor ran longest over six months (some have since stopped): they are the strongest evidence of what works — let them shape the angles, hooks and positioning you name, but do not tag them, they have no ref.`,
    content: [
      { type: "text", text: JSON.stringify({ ads, keptLongestInSixMonths: keptLong, screenshotsNotYetTranscribed: legacy.map((m) => ({ competitor: m.competitor, note: m.note })) }) },
      ...imgs.filter((i) => /^image\/(png|jpeg|webp|gif)$/.test(i.mime)).map((i) => ({ type: "image" as const, source: { type: "base64" as const, media_type: i.mime as "image/png", data: Buffer.from(i.data).toString("base64") } })),
    ],
    schema: AdsOut, maxTokens: 16000,
  });
  if (!out) throw new Error("Iris couldn’t read the ads — try again.");
  const byRef = new Map(pool.map((c) => [c.ref, c]));
  const tagged = out.tags.filter((t) => byRef.has(t.ref));
  const counted = tagged.length >= Math.max(3, pool.length * 0.6);
  const angles = out.angles.slice(0, 8).map((g) => {
    const mine = tagged.filter((t) => t.angle.trim().toLowerCase() === g.name.trim().toLowerCase()).map((t) => byRef.get(t.ref)!);
    const best = [...mine].sort((x, y) => (daysSince(y.a.start) ?? 0) - (daysSince(x.a.start) ?? 0))[0];
    return {
      name: g.name, share: tagged.length ? Math.round((100 * mine.length) / tagged.length) : 0, n: mine.length, ids: mine.map((c) => c.a.id),
      proven: mine.filter((c) => (daysSince(c.a.start) ?? 0) >= 30).length, who: [...new Set(mine.map((c) => c.competitor))].slice(0, 6),
      example: (best?.a.bodies[0] ?? g.meaning).replace(/\s+/g, " ").slice(0, 140),
    };
  }).filter((g) => !counted || g.n > 0).sort((a, b) => b.share - a.share);
  const offers = new Map<string, number>();
  for (const t of tagged) if (t.offer.trim()) offers.set(t.offer.trim(), (offers.get(t.offer.trim()) ?? 0) + 1);
  note(`${pool.length} ads${imgs.length ? ` + ${imgs.length} screenshots` : ""} · ${tagged.length} tagged`);
  return {
    summary: out.summary, count: pool.length + imgs.length, creatives: pool.length, counted, at: new Date().toISOString(),
    offers: [...offers].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([o, n]) => `${o}${n > 1 ? ` (${n} ads)` : ""}`), hooks: out.hooks.slice(0, 8), positioning: out.positioning,
    angles, gaps: out.gaps.slice(0, 6).map((g) => ({ id: uid(), ...g })),
  };
}

// ---------------------------------------------------------------- 4 · positioning, from every source
const SRC = z.enum(["shopify", "meta", "research", "ads", "brand"]);
const PositionOut = z.object({
  statement: z.string().describe("For <primary buyer> who <need>, <product> is the <category> that <key benefit> — unlike <the usual alternative>, which <its weakness>. One sentence."),
  primary: z.string().describe("The primary buyer — one of the research buyer groups, by name"),
  secondary: z.array(z.string()).describe("Other buyer groups worth testing, by name"),
  pillars: z.array(z.object({ title: z.string().describe("2–4 words"), message: z.string().describe("What we say, in the buyer's words. Under 16 words."), proof: z.string().describe("The fact that backs it, or 'to test'"), source: SRC })).describe("Exactly 3 message pillars"),
  proof: z.array(z.object({ fact: z.string(), source: SRC })).describe("Facts the ads may state, each from the data given — numbers from Shopify or Meta, findings from the research"),
  price: z.object({ stance: z.enum(["value", "accessible premium", "premium"]), note: z.string().describe("How to talk about price against the competitors' range") }),
  voice: z.object({ say: z.array(z.string()).describe("3 words or phrases to use"), avoid: z.array(z.string()).describe("3 words, claims or tones to avoid") }),
  avoid: z.array(z.string()).describe("Angles competitors overuse, or claims that would break Meta's ad policy"),
  where: z.array(z.object({ placement: z.string(), why: z.string() })).describe("2–3 placements or formats to lead with"),
  next: z.array(z.string()).describe("2–3 things to test or find out next"),
});

async function positionProduct(row: Row, report: MarketReport | null, read: AdsRead | null, evidence: Evidence[] = []): Promise<Positioning> {
  if (!report) throw new Error("Run the market research first — positioning builds on it.");
  const [b] = await db.select({ name: schema.brands.name, category: schema.brands.category, onboarding: schema.brands.onboarding }).from(schema.brands).where(eq(schema.brands.id, row.brandId));
  const profile = b.onboarding?.profile ? Object.fromEntries(Object.entries(b.onboarding.profile).map(([k, v]) => [k, v.value])) : null;
  const [store, lessons] = await Promise.all([storeFacts(row.brandId, row.subject || null), metaLessons(row.brandId)]);
  const out = await ask("iris", {
    system: `You are Iris, Kaviar's research analyst. Position ${row.subject ? "this product" : "this brand"} for the ${marketName(row.market)} market using every source you're given — the store's own numbers (shopify), what live ads show (meta), the web research (research), competitors' live ads (ads) and the brand profile (brand). Real buyers and real results outrank the research: when the store or the ads disagree with the research, follow the data and say so in "next". Tag every pillar and proof with the source it comes from; never invent numbers. Prefer the buyer groups and gaps the team accepted, never ones they rejected. Write so a copywriter can use it directly.`,
    content: JSON.stringify({
      brand: { name: b.name, category: b.category, profile }, product: row.subject || "the whole range",
      store: store ?? "no store sales yet", whatWinsInLiveAds: lessons.length ? lessons : "no live ads yet",
      research: {
        summary: report.summary, demand: report.demand, price: report.price, trends: report.trends.map((t) => `${t.direction}: ${t.text}`),
        buyers: report.segments.map((s) => ({ name: s.name, decision: s.status ?? "open", who: s.who, need: s.need, why: s.why, objections: s.objections, angle: s.angle })),
        competitors: report.competitors.map((c) => ({ name: c.name, price: c.price, positioning: c.positioning, weakness: c.weakness })),
        opportunities: report.opportunities.map((o) => ({ text: o.text, decision: o.status ?? "open" })),
      },
      measuredEvidence: evidence.map(evidenceLine),
      competitorAds: read ? { angles: read.angles.map(angleLine(read)), hooks: read.hooks, offers: read.offers, positioning: read.positioning, gaps: read.gaps.map((g) => ({ text: g.text, decision: g.status ?? "open" })) } : "not read yet",
    }),
    schema: PositionOut, maxTokens: 8000,
  });
  if (!out) throw new Error("Iris couldn’t write the positioning — try again.");
  const src = (x: string): DataSource => (["shopify", "meta", "research", "ads", "brand"].includes(x) ? x as DataSource : "research");
  return {
    statement: out.statement.slice(0, 400), primary: out.primary.slice(0, 80), secondary: out.secondary.slice(0, 4).map((x) => x.slice(0, 80)),
    pillars: out.pillars.slice(0, 4).map((p) => ({ id: uid(), title: p.title.slice(0, 40), message: p.message.slice(0, 160), proof: p.proof.slice(0, 160), source: src(p.source) })),
    proof: out.proof.slice(0, 8).map((p) => ({ fact: p.fact.slice(0, 200), source: src(p.source) })), price: out.price,
    voice: { say: out.voice.say.slice(0, 5), avoid: out.voice.avoid.slice(0, 5) }, avoid: out.avoid.slice(0, 6), where: out.where.slice(0, 4), next: out.next.slice(0, 4), at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------- 5 · the message test
const PlanOut = z.object({
  summary: z.string().describe("The test in one or two sentences: what we learn and how we'll know"),
  cells: z.array(z.object({
    segment: z.string(), angle: z.string(), hypothesis: z.string().describe("'<segment> responds to <angle> because …'"),
    audience: z.string().describe("Meta targeting: ages, gender, 3–5 interests"), hook: z.string().describe("The headline idea, under 8 words"),
    visual: z.string().describe("A static, product-focused image — no people, not UGC"), metric: z.string().describe("The result that says 'this message works', e.g. CTR ≥ 1.5%"),
  })),
  budget: z.object({ perDay: z.number().describe("Total USD per day across all cells"), days: z.number(), note: z.string() }),
  hypotheses: z.array(z.object({
    claim: z.string().describe("One testable sentence, e.g. 'For <buyer>, <message A> beats <message B> as the lead message'"),
    about: z.enum(["demand", "segment", "angle", "price"]),
    evidence: z.array(z.object({ id: z.string().describe("An evidence id from the list, e.g. E7"), reads: z.string().describe("What that number says about the claim, under 16 words"), stance: z.enum(["for", "against"]) })).describe("Every record that bears on the claim, including ones against it. Empty if nothing measured supports it"),
    cells: z.array(z.number()).describe("The numbers (1-based) of the cells that test it"),
    confirmIf: z.string().describe("The result that confirms it — relative to another cell, with a minimum sample, e.g. 'link CTR at least 1.25× cell 1's, with 50+ link clicks each'"),
    refuteIf: z.string().describe("The result that refutes it"),
  })).describe("2–5 hypotheses that the cells test"),
});

async function planTest(row: Row, report: MarketReport | null, read: AdsRead | null, pos: Positioning | null = null, evidence: Evidence[] = []): Promise<TestPlan> {
  if (!report) throw new Error("Run the market research first — the plan builds on its buyers and gaps.");
  const segments = report.segments.filter((s) => s.status !== "rejected");
  const out = await ask("iris", {
    system: `You are Iris, Kaviar's research analyst. Plan a first message test for a brand new to the ${marketName(row.market)} market. Use static image ads only — product-focused, no people, not UGC — because they are cheap to make and test the message, not the production. 4 to 8 cells: each tests one buyer segment × one message angle; reuse the same angles across segments so results compare. Prefer the accepted buyers and the gaps competitors leave open. Budget: about 10–15 USD a day per cell for 5–7 days unless the evidence says otherwise. Then state the 2–5 hypotheses the cells test. Ground each in measuredEvidence: cite the ids of every record that bears on it, for and against, and say in a few words what each number shows. Never cite a number that isn't in measuredEvidence; a hypothesis with no measured support is still worth testing — leave its evidence empty and it will be marked as an assumption. Fix what result confirms and what refutes each one before the test runs: compare cells with each other (not against a fixed benchmark) and name a minimum sample.`,
    content: JSON.stringify({
      product: row.subject || "the brand's range", summary: report.summary, demand: report.demand.verdict, price: report.price,
      buyers: segments.map((s) => ({ name: s.name, accepted: s.status === "accepted", who: s.who, need: s.need, angle: s.angle, ages: s.reach.ages, gender: s.reach.gender, interests: s.reach.interests })),
      opportunities: report.opportunities.filter((o) => o.status !== "rejected").map((o) => o.text),
      competitorAngles: read ? read.angles.map(angleLine(read)) : [], gaps: read?.gaps.filter((g) => g.status !== "rejected").map((g) => g.text) ?? [],
      positioning: pos ? { statement: pos.statement, primaryBuyer: pos.primary, pillarsToTestAsAngles: pos.pillars.map((p) => `${p.title}: ${p.message}`), avoid: pos.avoid } : null,
      measuredEvidence: evidence.map(evidenceLine),
    }),
    schema: PlanOut, maxTokens: 10000,
  });
  if (!out?.cells.length) throw new Error("Iris couldn’t plan the test — try again.");
  const cells: TestPlan["cells"] = out.cells.slice(0, 9).map((c) => ({ id: uid(), ...c, on: true }));
  // Strength comes from the evidence, not from the model: two or more records from two or more sources is "backed by data".
  const byId = new Map(evidence.map((e) => [e.id, e]));
  const hypotheses: Hypothesis[] = out.hypotheses.slice(0, 5).map((h) => {
    const ev = h.evidence.filter((x) => byId.has(x.id)).slice(0, 6).map((x) => ({ id: x.id, reads: x.reads.slice(0, 160), stance: x.stance }));
    const pro = ev.filter((x) => x.stance === "for"), sources = new Set(pro.map((x) => byId.get(x.id)!.source));
    const id = uid();
    for (const n of h.cells) { const c = cells[n - 1]; if (c && !c.hypothesisId) c.hypothesisId = id; }
    return { id, claim: h.claim.slice(0, 240), about: h.about, evidence: ev, strength: pro.length >= 2 && sources.size >= 2 ? "measured" : pro.length ? "mixed" : "assumed", confirmIf: h.confirmIf.slice(0, 240), refuteIf: h.refuteIf.slice(0, 240) };
  });
  return { summary: out.summary, cells, hypotheses, budget: { perDay: Math.max(0, Math.round(out.budget.perDay)), days: Math.max(1, Math.round(out.budget.days)), note: out.budget.note }, at: new Date().toISOString() };
}

// ---------------------------------------------------------------- the run
/** Runs the chosen parts in order (market → ads → plan), saving each piece as soon as it's ready. */
export async function runResearch(id: string, parts: Part[]): Promise<void> {
  const [row] = await db.select().from(R).where(eq(R.id, id));
  if (!row) return;
  const steps: Step[] = parts.flatMap((p) => PART_STEPS[p]).map((key) => ({ key, label: STEP_LABEL[key], state: "waiting" as const }));
  await save(id, { status: "running", steps, error: null, startedAt: new Date(), finishedAt: null });
  const step = tracker(id, steps);
  let report = row.report, rivals = row.rivals, read = row.adsRead, pos = row.positioning, evidence = row.evidence ?? [];
  try {
    if (parts.includes("market")) {
      const ctx = await step("context", async (note) => { const c = await contextFor(row.brandId, row.subject); note(c.product ? c.product.title : `${c.catalog.length} products`); return c; });
      const found = await step("search", (note) => searchMarket(ctx, row.market, note));
      report = await step("write", async (note) => { const r = await writeReport(ctx, row.market, found); note(`${r.segments.length} buyer groups · ${r.competitors.length} competitors`); return r; });
      await save(id, { report });
    }
    if (parts.includes("ads")) {
      // Ads are a bonus: if Meta refuses, Iris still reads the screenshots, and the plan still runs on the market research.
      try { rivals = await step("adlib", (note) => pullAds(row, report, note)); }
      catch { const [r] = await db.select({ rivals: R.rivals }).from(R).where(eq(R.id, id)); rivals = r?.rivals ?? rivals; }
      try {
        const [m] = await db.select({ manual: R.manual }).from(R).where(eq(R.id, id));
        read = await step("read", (note) => readAds(row, rivals, m?.manual ?? row.manual, report, note));
        await save(id, { adsRead: read });
      } catch { /* the step shows the error */ }
    }
    if (parts.includes("measure") && report) {
      // Real numbers behind the findings: the store's own results, Meta's audience sizes, competitors' ads counted, search volume when connected.
      try {
        const [now] = await db.select({ rivals: R.rivals, adsRead: R.adsRead }).from(R).where(eq(R.id, id));
        evidence = await step("measure", (note) => gatherEvidence(row, report!, now?.rivals ?? rivals, now?.adsRead ?? read, note));
        await save(id, { evidence });
      } catch { /* the step shows the error; the plan runs on what there is */ }
    }
    if (parts.includes("position")) {
      // An edited positioning is the team's: keep it unless they ask Iris for a new one (re-running "position" alone).
      if (!pos?.edited || parts.length === 1) {
        pos = await step("position", async (note) => { const p = await positionProduct(row, report, read, evidence); note(`For ${p.primary} · ${p.pillars.length} pillars`); return p; });
        await save(id, { positioning: pos });
      }
    }
    if (parts.includes("plan")) {
      const plan = await step("plan", async (note) => { const p = await planTest({ ...row, rivals }, report, read, pos, evidence); note(`${p.cells.length} ads to test · ${p.hypotheses?.length ?? 0} hypotheses`); return p; });
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
