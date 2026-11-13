import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { rows, SALE } from "../queries/common";
import { signalData } from "../queries/signals";
import type { ChangeKind } from "../db/schema";

type Camp = { id: string; name: string; status: string | null; budget: number | null; spend7: number; rev7: number; orders7: number; spend30: number; rev30: number };
type AdWeek = { id: string; name: string; campaign: string | null; w: number; impr: number; clicks: number; spend: number };

const r1 = (n: number) => Math.round(n * 10) / 10;
const roas = (rev: number, spend: number) => (spend > 0 ? rev / spend : 0);
const fmt = (v: number, cur: string) => new Intl.NumberFormat("en-US", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(v);

/** Monday of this week in the brand's time zone, as YYYY-MM-DD. */
export async function thisWeek(tz: string): Promise<string> {
  const [r] = await rows<{ d: string }>(sql`select to_char(date_trunc('week', (now() at time zone ${tz}))::date, 'YYYY-MM-DD') as d`);
  return r.d;
}

async function campaignsWindow(brandId: string, tz: string) {
  return rows<Camp>(sql`
    with ins as (
      select campaign_id,
        sum(spend) filter (where date >= (now() at time zone ${tz})::date - 7) as s7, sum(spend) as s30
      from meta_insights_daily where brand_id = ${brandId} and date >= (now() at time zone ${tz})::date - 30 group by 1
    ),
    v as (
      select coalesce(o.meta_campaign_id, '') as cid,
        sum(o.total - o.refunded) filter (where o.created_at >= now() - interval '7 days') as r7,
        count(*) filter (where o.created_at >= now() - interval '7 days') as n7,
        sum(o.total - o.refunded) as r30
      from shop_orders o where o.brand_id = ${brandId} and ${SALE} and o.channel = 'meta' and o.created_at >= now() - interval '30 days' group by 1
    )
    select c.id, c.name, c.effective_status as "status", c.daily_budget::float8 as "budget",
      coalesce(ins.s7, 0)::float8 as "spend7", coalesce(v.r7, 0)::float8 as "rev7", coalesce(v.n7, 0)::int as "orders7",
      coalesce(ins.s30, 0)::float8 as "spend30", coalesce(v.r30, 0)::float8 as "rev30"
    from meta_campaigns c left join ins on ins.campaign_id = c.id left join v on v.cid = c.id
    where c.brand_id = ${brandId} and coalesce(ins.s30, 0) > 0 order by ins.s7 desc nulls last`);
}

/** Weekly CTR per ad for the last 4 weeks — "is this creative getting tired?" */
async function adWeeks(brandId: string, tz: string) {
  return rows<AdWeek>(sql`
    select a.id, a.name, c.name as "campaign", floor(((now() at time zone ${tz})::date - i.date) / 7)::int as w,
      sum(i.impressions)::float8 as impr, sum(i.clicks)::float8 as clicks, sum(i.spend)::float8 as spend
    from meta_insights_daily i join meta_ads a on a.brand_id = i.brand_id and a.id = i.ad_id
    left join meta_campaigns c on c.brand_id = a.brand_id and c.id = a.campaign_id
    where i.brand_id = ${brandId} and i.date >= (now() at time zone ${tz})::date - 28 and a.effective_status = 'ACTIVE'
    group by 1, 2, 3, 4`);
}

type Proposal = { key: string; kind: ChangeKind; title: string; why: string; before: string; after: string; target: Record<string, unknown> };

/** Turn this week's numbers into concrete changes, each with a before → after and a reason in numbers. */
export async function propose(brand: { id: string; timezone: string; currency: string }): Promise<Proposal[]> {
  const cur = brand.currency;
  const [camps, weeks, sig] = await Promise.all([campaignsWindow(brand.id, brand.timezone), adWeeks(brand.id, brand.timezone), signalData(brand.id, brand.timezone)]);
  const out: Proposal[] = [];
  const active = camps.filter((c) => c.status === "ACTIVE" && c.spend7 > 0);
  const scored = active.map((c) => ({ ...c, v: roas(c.rev7, c.spend7) })).sort((a, b) => b.v - a.v);

  // Pause what loses money on real orders.
  for (const c of scored.filter((c) => c.v < 0.8 && c.spend7 >= 50)) {
    out.push({ key: `pause:${c.id}`, kind: "pause", title: `Pause ${c.name}`, why: `${r1(c.v)}× verified on ${fmt(c.spend7, cur)} this week — ${c.orders7} Shopify orders. It costs more than it brings in.`,
      before: `running · ${fmt(c.spend7 / 7, cur)}/day`, after: "paused", target: { campaignId: c.id, baseline: c.v } });
  }
  // Shift budget from the weakest to the strongest.
  const best = scored[0], worst = scored[scored.length - 1];
  if (best && worst && best.id !== worst.id && best.v >= 1.5 && worst.v < 1.2 && worst.v >= 0.8) {
    const move = Math.max(5, Math.round(((worst.budget ?? worst.spend7 / 7) * 0.3) / 5) * 5);
    out.push({ key: `shift:${worst.id}:${best.id}`, kind: "shift", title: `Move ${fmt(move, cur)}/day to ${best.name}`,
      why: `${best.name} returns ${r1(best.v)}× vs ${r1(worst.v)}× for ${worst.name}, on real Shopify orders.`,
      before: `${worst.name.split(" ")[0]} ${fmt(worst.budget ?? worst.spend7 / 7, cur)}`, after: `${fmt(Math.max(0, (worst.budget ?? worst.spend7 / 7) - move), cur)} · ${best.name.split(" ")[0]} ${fmt((best.budget ?? best.spend7 / 7) + move, cur)}`,
      target: { campaignId: best.id, baseline: best.v } });
  } else if (best && best.v >= 2 && best.orders7 >= 5) {
    out.push({ key: `scale:${best.id}`, kind: "scale", title: `Scale ${best.name} by 20%`, why: `${r1(best.v)}× verified with ${best.orders7} orders this week — room to spend more.`,
      before: `${fmt(best.budget ?? best.spend7 / 7, cur)}/day`, after: `${fmt((best.budget ?? best.spend7 / 7) * 1.2, cur)}/day`, target: { campaignId: best.id, baseline: best.v } });
  }
  // Refresh creatives whose CTR fell three weeks running.
  const byAd = new Map<string, AdWeek[]>();
  for (const w of weeks) byAd.set(w.id, [...(byAd.get(w.id) ?? []), w]);
  for (const [id, ws] of byAd) {
    const ctr = [3, 2, 1, 0].map((w) => { const x = ws.find((y) => y.w === w); return x && x.impr > 300 ? x.clicks / x.impr : null; });
    if (ctr.some((x) => x == null)) continue;
    const [a, b, c, d] = ctr as number[];
    if (a > b && b > c && c > d && d < a * 0.85) {
      const ad = ws[0];
      out.push({ key: `refresh:${id}`, kind: "refresh", title: `New creatives for ${ad.campaign ?? ad.name}`, why: `CTR fell 3 weeks in a row (${(a * 100).toFixed(2)}% → ${(d * 100).toFixed(2)}%) on “${ad.name}”.`,
        before: `CTR ${(d * 100).toFixed(2)}%`, after: `3 new drafts · aim CTR above ${(a * 100).toFixed(1)}%`, target: { adId: id } });
      if (out.filter((x) => x.kind === "refresh").length >= 2) break;
    }
  }
  // Hold ads for products about to sell out.
  for (const x of sig.stock.filter((s) => s.daysOfStock < 10).slice(0, 2)) {
    const word = x.title.split(/[·\s]/)[0].toLowerCase();
    const camp = active.find((c) => c.name.toLowerCase().includes(word));
    out.push({ key: `hold:${x.title}`, kind: "hold", title: camp ? `Pause ${camp.name} — ${x.title} is selling out` : `Keep ${x.title} out of ads`,
      why: x.inventory <= 0 ? `${x.title} is out of stock — Meta can’t see that.` : `Only ${x.inventory} left, about ${Math.round(x.daysOfStock)} days at this pace.`,
      before: camp ? "running" : "in ad rotation", after: "paused until restocked", target: { campaignId: camp?.id, product: x.title } });
  }
  // Test a ready signal nobody is using yet.
  const used = new Set(((await db.execute(sql`select distinct signal from ad_batches where brand_id = ${brand.id} and signal is not null`)).rows as { signal: string }[]).map((r) => r.signal));
  if (sig.lapsed.lapsed >= 200 && !used.has("lapsed")) {
    out.push({ key: "add:lapsed", kind: "add", title: "Test a win-back ad · lapsed buyers", why: `${sig.lapsed.lapsed.toLocaleString("en-US")} past buyers bought 60–180 days ago and not since.`,
      before: "no ad", after: `${fmt(20, cur)}/day test`, target: { signal: "lapsed" } });
  } else if (sig.reorder.medianDays && !used.has("reorder")) {
    out.push({ key: "add:reorder", kind: "add", title: "Test a reorder reminder", why: `Buyers come back about ${Math.round(sig.reorder.medianDays)} days after their first order.`,
      before: "no ad", after: `${fmt(20, cur)}/day test`, target: { signal: "reorder" } });
  }
  return out.slice(0, 6);
}

/** Make sure this week's proposals exist (idempotent), and judge last weeks' applied changes on Shopify orders. */
export async function ensureWeek(brand: { id: string; timezone: string; currency: string }): Promise<string> {
  const week = await thisWeek(brand.timezone);
  const [have] = (await db.execute(sql`select count(*)::int as n from optimize_changes where brand_id = ${brand.id} and week = ${week}`)).rows as { n: number }[];
  if (!have.n) {
    const list = await propose(brand);
    if (list.length) await db.insert(schema.optimizeChanges).values(list.map((p) => ({ brandId: brand.id, week, ...p }))).onConflictDoNothing();
  }
  await judge(brand);
  return week;
}

async function judge(brand: { id: string; timezone: string; currency: string }) {
  const due = await db.select().from(schema.optimizeChanges).where(and(eq(schema.optimizeChanges.brandId, brand.id), eq(schema.optimizeChanges.status, "applied")));
  const camps = await campaignsWindow(brand.id, brand.timezone);
  for (const c of due) {
    if (!c.appliedAt || (c.result && c.result.verdict !== "too-early")) continue;
    const days = (Date.now() - c.appliedAt.getTime()) / 86_400_000;
    let result: NonNullable<typeof c.result>;
    if (days < 5) result = { verdict: "too-early", detail: "Too early to tell", checkedAt: new Date().toISOString() };
    else if (c.kind === "pause" || c.kind === "hold") {
      const saved = camps.find((x) => x.id === c.target.campaignId)?.spend7 ?? 0;
      result = { verdict: saved < 5 ? "worked" : "didnt", detail: saved < 5 ? "Spend stopped; no stock-outs" : `Still spending ${fmt(saved, brand.currency)} this week`, checkedAt: new Date().toISOString() };
    } else if (c.target.campaignId) {
      const x = camps.find((y) => y.id === c.target.campaignId);
      const now = x ? roas(x.rev7, x.spend7) : 0;
      const base = c.target.baseline ?? 0;
      result = { verdict: now >= base * 0.95 ? "worked" : "didnt", detail: `${r1(base)}× → ${r1(now)}× verified`, checkedAt: new Date().toISOString() };
    } else result = { verdict: "worked", detail: "Done", checkedAt: new Date().toISOString() };
    await db.update(schema.optimizeChanges).set({ result }).where(eq(schema.optimizeChanges.id, c.id));
  }
}
