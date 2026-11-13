import "server-only";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { sha256 } from "../crypto";
import { AGENTS, aiReady, ask, type Agent } from "./client";
import { campaigns, channels, summary, utmHealth } from "../queries/growth";
import { products } from "../queries/shop";
import { signalData } from "../queries/signals";

/**
 * Notes the agents write from a brand's own numbers. Each note is cached with a hash of the facts it was
 * written from, and is only rewritten when those facts change — after a sync, or the first time a page
 * needs it (in the background, so pages never wait on the model). Pages fall back to fixed text.
 */

export type Link = "performance" | "meta" | "sync" | "shopify" | "signals" | "integrations" | null;
export type Insight = { tone: "good" | "warn" | "info"; title: string; body: string; link: Link };
export type Notes = {
  performance?: { insights: Insight[] };
  overview?: { line: string };
  sync?: { line: string };
  signals?: { title: string; body: string; ranked: { signal: string; why: string }[] };
  insights?: { lessons: { dimension: string; lesson: string; evidence: string; strength: "Strong" | "Early" | "Weak" }[] };
};
export type NoteKey = keyof Notes;

const InsightOut = z.object({
  tone: z.enum(["good", "warn", "info"]),
  title: z.string().describe("Under 8 words, specific, e.g. 'Retargeting returns the most'"),
  body: z.string().describe("One or two sentences with the real numbers. Under 40 words."),
  link: z.enum(["performance", "meta", "sync", "shopify", "signals", "integrations", "none"]),
});
const SPECS: Record<NoteKey, { agent: Agent; system: string; schema: z.ZodType }> = {
  performance: {
    agent: "iris",
    system: "You are Iris, Kaviar's growth analyst. Kaviar compares a brand's Shopify sales with its Meta Ads. 'Verified' means Shopify orders that carry the campaign's UTM; Meta's own numbers also count view-through and cross-channel sales. Write 2–4 insight cards the team should act on, most important first: what returns the most, what is below break-even (verified ROAS < 1), gaps between Meta and Shopify, tagging problems, stock that will run out under ads, revenue trend. Use only the facts given, with exact numbers and the brand's currency. If Meta has no spend, say what to do instead. Never invent campaigns.",
    schema: z.object({ insights: z.array(InsightOut) }),
  },
  overview: {
    agent: "iris",
    system: "You are Iris, Kaviar's growth analyst. Write the one line shown under the brand's 30-day growth numbers: the single most useful thing to know or do, with one real number. Under 22 words, no greeting, no quotes.",
    schema: z.object({ line: z.string() }),
  },
  sync: {
    agent: "cleo",
    system: "You are Cleo, Kaviar's data agent who keeps a brand's Shopify and Meta Ads data in sync. Write one short first-person note (under 30 words) about the state of the sync for the team: what's current, any failure and what you'll do, or what's missing. Plain words, no jargon like 'API'.",
    schema: z.object({ line: z.string() }),
  },
  insights: {
    agent: "iris",
    system: "You are Iris, Kaviar's growth analyst. From this brand's live Meta ads (judged on verified Shopify revenue) and the team's review of Remy's drafts (approved vs rejected, with reasons), write up to 6 lessons about what wins: one per dimension (Hook, Format, Angle, Length, Offer, Audience). Each lesson is a short rule Remy can follow next time, with the evidence in numbers. Mark 'Strong' only with clear evidence, 'Early' when based on little data. If there's too little data, say what to test instead.",
    schema: z.object({ lessons: z.array(z.object({ dimension: z.enum(["Hook", "Format", "Angle", "Length", "Offer", "Audience"]), lesson: z.string().describe("Under 12 words"), evidence: z.string().describe("Under 18 words, with numbers"), strength: z.enum(["Strong", "Early", "Weak"]) })) }),
  },
  signals: {
    agent: "iris",
    system: "You are Iris, Kaviar's growth analyst. Ad signals are facts from the brand's Shopify data that ads can use (lapsed buyers for win-back, reorder timing for replenishment, top customers as lookalike seeds, bundles, low stock to pause). Rank the ready signals by how much revenue they could unlock right now and say which are unused. Title like '9 signals are ready but unused'. Body under 35 words naming the biggest 1–2 wins with numbers.",
    schema: z.object({ title: z.string(), body: z.string(), ranked: z.array(z.object({ signal: z.string(), why: z.string().describe("Under 14 words") })).describe("Top 3") }),
  },
};

const r2 = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 100) / 100);

/** The facts each note is written from — rounded so tiny changes don't trigger a rewrite. */
async function factsFor(key: NoteKey, brand: { id: string; name: string; timezone: string; currency: string }) {
  const { id, timezone: tz } = brand;
  const conns = (await db.execute(sql`select provider, status, last_error as "lastError", details->'webhooks' as webhooks from connections where brand_id = ${id}`)).rows as { provider: string; status: string; lastError: string | null; webhooks: unknown }[];
  const base = { brand: brand.name, currency: brand.currency, connections: conns.map((c) => ({ provider: c.provider, status: c.status })) };
  if (key === "performance" || key === "overview") {
    const [s, camps, ch, top, health, sig] = await Promise.all([summary(id, tz, 30), campaigns(id, tz, 30), channels(id, tz, 30), products(id, tz, 30, 5), utmHealth(id, tz, 30), signalData(id, tz)]);
    return {
      ...base,
      last30: { revenue: r2(s.revenue), orders: s.orders, prev30Revenue: r2(s.prevRevenue), metaSpend: r2(s.spend), verifiedMetaRevenue: r2(s.metaRevenue), verifiedMetaOrders: s.metaOrders, metaReportedPurchases: s.metaPurchases, metaReportedValue: r2(s.metaValue), newCustomers: s.newCustomers },
      campaigns: camps.filter((c) => c.spend > 0).slice(0, 8).map((c) => ({ name: c.name, status: c.status, spend: r2(c.spend), verifiedRoas: r2(c.verifiedRevenue / c.spend), metaRoas: r2(c.value / c.spend), verifiedOrders: c.verifiedOrders })),
      channels: ch.map((c) => ({ channel: c.channel, orders: c.orders, revenue: r2(c.revenue) })),
      topProducts: top.filter((p) => p.units > 0).map((p) => ({ title: p.title, units: p.units, revenue: r2(p.revenue), daysOfStock: p.daysOfStock == null ? null : Math.round(p.daysOfStock) })),
      metaOrdersWithAdId: health.metaOrders ? r2(health.withAd / health.metaOrders) : null,
      lowStock: sig.stock.map((x) => ({ title: x.title, left: x.inventory, days: Math.round(x.daysOfStock) })),
    };
  }
  if (key === "insights") {
    const live = (await db.execute(sql`
      with ins as (select ad_id, sum(spend) s, sum(impressions) i, sum(clicks) c from meta_insights_daily where brand_id = ${id} and date >= current_date - 30 group by 1),
      v as (select meta_ad_id, sum(total - refunded) r, count(*) n from shop_orders where brand_id = ${id} and not test and cancelled_at is null and created_at >= now() - interval '30 days' and meta_ad_id is not null group by 1)
      select a.name, c.name as campaign, round(ins.s::numeric, 0)::float8 as spend, round((coalesce(v.r, 0) / nullif(ins.s, 0))::numeric, 2)::float8 as "verifiedRoas",
        round((ins.c::numeric / nullif(ins.i, 0)) * 100, 2)::float8 as "ctrPct", coalesce(v.n, 0)::int as orders
      from ins join meta_ads a on a.brand_id = ${id} and a.id = ins.ad_id left join meta_campaigns c on c.brand_id = a.brand_id and c.id = a.campaign_id
      left join v on v.meta_ad_id = a.id where ins.s > 0 order by ins.s desc limit 25`)).rows;
    const drafts = (await db.execute(sql`select format, hook, status, note from ads where brand_id = ${id} and status <> 'review' order by updated_at desc limit 40`)).rows;
    return { ...base, liveAds: live, reviewedDrafts: drafts };
  }
  if (key === "sync") {
    const runs = (await db.execute(sql`select provider, trigger, status, rows, error, started_at from sync_runs where brand_id = ${id} order by started_at desc limit 6`)).rows as { provider: string; trigger: string; status: string; rows: number | null; error: string | null; started_at: Date }[];
    return {
      ...base,
      connections: conns.map((c) => ({ provider: c.provider, status: c.status, lastError: c.lastError?.slice(0, 160) ?? null, webhooks: c.webhooks })),
      recentRuns: runs.map((r) => ({ provider: r.provider, trigger: r.trigger, status: r.status, rows: r.rows, error: r.error?.slice(0, 160) ?? null, hoursAgo: Math.round((Date.now() - new Date(r.started_at).getTime()) / 3_600_000) })),
    };
  }
  const d = await signalData(id, tz);
  return {
    ...base,
    customers: d.customers, lapsed60to180: d.lapsed.lapsed, reorderMedianDays: d.reorder.medianDays ? Math.round(d.reorder.medianDays) : null,
    bestSellers: d.best.map((b) => ({ title: b.title, units: b.units })), boughtTogether: d.pair, lowStock: d.stock.map((x) => ({ title: x.title, left: x.inventory, days: Math.round(x.daysOfStock) })),
    ordersLast30: d.orders, refundRate: d.refunds.orders ? r2(d.refunds.refunded / d.refunds.orders) : null, topDiscountCode: d.code,
    catalog: { products: d.catalog.products, variantsWithCost: d.catalog.withCost },
  };
}

export async function getNotes(brandId: string): Promise<Notes> {
  const list = await db.select({ key: schema.agentNotes.key, body: schema.agentNotes.body }).from(schema.agentNotes).where(eq(schema.agentNotes.brandId, brandId));
  return Object.fromEntries(list.map((n) => [n.key, n.body])) as Notes;
}

const running = new Set<string>();

/** Rewrite the notes whose facts changed. Safe to call often; does nothing without an API key. */
export async function refreshNotes(brandId: string, keys: NoteKey[] = ["performance", "overview", "sync", "signals", "insights"]): Promise<void> {
  if (!aiReady() || running.has(brandId)) return;
  running.add(brandId);
  try {
    const [brand] = await db.select({ id: schema.brands.id, name: schema.brands.name, timezone: schema.brands.timezone, currency: schema.brands.currency }).from(schema.brands).where(eq(schema.brands.id, brandId));
    if (!brand) return;
    for (const key of keys) {
      const facts = await factsFor(key, brand);
      const hash = sha256(JSON.stringify(facts));
      const [prev] = await db.select({ h: schema.agentNotes.factsHash }).from(schema.agentNotes).where(and(eq(schema.agentNotes.brandId, brandId), eq(schema.agentNotes.key, key)));
      if (prev?.h === hash) continue;
      const spec = SPECS[key];
      const out = await ask(spec.agent, { system: spec.system, content: `Facts (JSON):\n${JSON.stringify(facts)}`, schema: spec.schema, effort: "low", maxTokens: 3000 });
      if (!out) continue;
      const body = key === "performance"
        ? { insights: (out as { insights: z.infer<typeof InsightOut>[] }).insights.slice(0, 4).map((i) => ({ ...i, link: i.link === "none" ? null : i.link })) }
        : (out as Record<string, unknown>);
      await db.insert(schema.agentNotes).values({ brandId, key, factsHash: hash, body, model: AGENTS[spec.agent].model })
        .onConflictDoUpdate({ target: [schema.agentNotes.brandId, schema.agentNotes.key], set: { factsHash: hash, body, model: AGENTS[spec.agent].model, createdAt: new Date() } });
    }
  } catch (e) {
    console.warn("agent notes", brandId, (e as Error).message);
  } finally {
    running.delete(brandId);
  }
}
