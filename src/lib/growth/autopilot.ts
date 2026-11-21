import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { judge, propose, thisWeek } from "../optimize/propose";
import { MODES, type Mode, type Pilot, type Run } from "./pilot";

const N = schema.agentNotes, C = schema.optimizeChanges;
const SET = "autopilot", LOG = "autopilot-log", KEEP = 40;
type BrandRef = { id: string; timezone: string; currency: string };

async function read<T>(brandId: string, key: string): Promise<T | null> {
  const [r] = await db.select({ body: N.body }).from(N).where(and(eq(N.brandId, brandId), eq(N.key, key))).limit(1);
  return (r?.body as T | undefined) ?? null;
}
/** These notes are the team's settings and Kaviar's own log, not text written by a model. */
async function write(brandId: string, key: string, body: Record<string, unknown>): Promise<void> {
  await db.insert(N).values({ brandId, key, body, factsHash: "kaviar", model: "kaviar" } as unknown as typeof N.$inferInsert)
    .onConflictDoUpdate({ target: [N.brandId, N.key], set: { body, createdAt: new Date() } });
}

/** The brand's autonomy setting, the recent checks, and whether Kaviar is allowed to change ads on Meta (not only read them). */
export async function getPilot(brandId: string): Promise<Pilot> {
  const [set, log, meta] = await Promise.all([
    read<{ mode?: Mode; since?: string }>(brandId, SET), read<{ runs?: Run[] }>(brandId, LOG),
    db.execute(sql`select scopes from connections where brand_id = ${brandId} and provider = 'meta' limit 1`).then((r): string[] => (r.rows as { scopes: string[] | null }[])[0]?.scopes ?? []).catch((): string[] => []),
  ]);
  const mode = set?.mode && set.mode in MODES ? set.mode : "ask";
  return { mode, since: set?.since ?? null, runs: log?.runs ?? [], canAct: meta.includes("ads_management") };
}

/** Decide, for the brand, the open changes its mode covers — only ones aimed at a real campaign. Returns their titles. */
async function decideFor(brandId: string, week: string, mode: Mode): Promise<string[]> {
  const kinds = MODES[mode].kinds;
  if (!kinds.length) return [];
  const done = await db.update(C).set({ status: "approved", decidedAt: new Date(), decidedBy: null })
    .where(and(eq(C.brandId, brandId), eq(C.week, week), eq(C.status, "proposed"), inArray(C.kind, kinds), sql`(${C.target}->>'campaignId') is not null`)).returning({ title: C.title });
  return done.map((x) => x.title);
}

export async function setPilotMode(brand: BrandRef, mode: Mode): Promise<string[]> {
  const [before, seen, day] = await Promise.all([getPilot(brand.id), watching(brand.id), db.execute(sql`select to_char((now() at time zone ${brand.timezone})::date, 'YYYY-MM-DD') as day`).then((r) => (r.rows as { day: string }[])[0].day)]);
  await write(brand.id, SET, { mode, since: new Date().toISOString() });
  const auto = await decideFor(brand.id, await thisWeek(brand.timezone), mode); // what is already waiting falls under the new setting straight away
  if (before.mode !== mode) await write(brand.id, LOG, { runs: [{ at: new Date().toISOString(), day, by: "team", watched: seen, found: [], auto, judged: [], note: `Mode set to “${MODES[mode].name}”` } satisfies Run, ...before.runs].slice(0, KEEP) });
  return auto;
}

/**
 * One check of one brand: read the week's numbers, add any new change worth making, judge the ones applied earlier on real orders,
 * decide what the brand's mode allows, and write down what happened. Nothing here touches Meta.
 */
export async function autopilotRun(brand: BrandRef, by: Run["by"]): Promise<Run> {
  const [week, list, pilot, seen] = await Promise.all([
    thisWeek(brand.timezone), propose(brand), getPilot(brand.id),
    db.execute(sql`select to_char((now() at time zone ${brand.timezone})::date, 'YYYY-MM-DD') as day,
      (select count(*) from meta_campaigns where brand_id = ${brand.id} and effective_status = 'ACTIVE')::int as campaigns,
      (select count(*) from meta_ads where brand_id = ${brand.id} and effective_status = 'ACTIVE')::int as ads,
      (select count(*) from shop_products where brand_id = ${brand.id})::int as products`).then((r) => (r.rows as { day: string; campaigns: number; ads: number; products: number }[])[0]),
  ]);
  const found = list.length ? await db.insert(C).values(list.map((p) => ({ brandId: brand.id, week, ...p }))).onConflictDoNothing().returning({ kind: C.kind, title: C.title }) : [];
  const judged = await judge(brand);
  const auto = await decideFor(brand.id, week, pilot.mode);
  const run: Run = { at: new Date().toISOString(), day: seen.day, by, watched: { campaigns: seen.campaigns, ads: seen.ads, products: seen.products }, found, auto, judged };
  await write(brand.id, LOG, { runs: [run, ...pilot.runs].slice(0, KEEP) });
  return run;
}

/** The hourly job calls this: every connected brand gets one check a day, from six in the morning its own time. */
export async function runAutopilotAll(minHour = 6, budgetMs = 240_000): Promise<{ brands: number; ran: number; failed: number }> {
  const t0 = Date.now();
  const list = (await db.execute(sql`select b.id, coalesce(b.timezone, 'UTC') as timezone, coalesce(b.currency, 'USD') as currency,
      to_char((now() at time zone coalesce(b.timezone, 'UTC'))::date, 'YYYY-MM-DD') as day, extract(hour from now() at time zone coalesce(b.timezone, 'UTC'))::int as hour
    from brands b where exists (select 1 from connections c where c.brand_id = b.id and c.status in ('connected', 'sample'))`)).rows as (BrandRef & { day: string; hour: number })[];
  let ran = 0, failed = 0;
  for (const b of list) {
    if (Date.now() - t0 > budgetMs) break;
    if (b.hour < minHour) continue;
    try {
      const log = await read<{ runs?: Run[] }>(b.id, LOG);
      if (log?.runs?.some((r) => r.by === "schedule" && r.day === b.day)) continue;
      await autopilotRun(b, "schedule");
      ran++;
    } catch { failed++; }
  }
  return { brands: list.length, ran, failed };
}

/** What Autopilot has its eye on right now. */
export async function watching(brandId: string): Promise<Run["watched"]> {
  const [r] = (await db.execute(sql`select
    (select count(*) from meta_campaigns where brand_id = ${brandId} and effective_status = 'ACTIVE')::int as campaigns,
    (select count(*) from meta_ads where brand_id = ${brandId} and effective_status = 'ACTIVE')::int as ads,
    (select count(*) from shop_products where brand_id = ${brandId})::int as products`)).rows as Run["watched"][];
  return r ?? { campaigns: 0, ads: 0, products: 0 };
}

/** One line for the log: what a check looked at and what came of it. */
export function runLine(r: Run): { line: string; good: boolean } {
  if (r.note) return { line: `${r.note}${r.auto.length ? ` · decided ${r.auto.length} waiting change${r.auto.length === 1 ? "" : "s"} for you` : ""}`, good: true };
  const w = r.watched, n = (k: number, one: string) => `${k} ${one}${k === 1 ? "" : "s"}`;
  const bits = [w.campaigns ? `Checked ${n(w.campaigns, "campaign")}, ${n(w.ads, "ad")} and stock on ${n(w.products, "product")}` : `Checked orders and stock on ${n(w.products, "product")}`];
  bits.push(r.found.length ? `found ${n(r.found.length, "change")}: ${r.found[0].title}${r.found.length > 1 ? ` and ${r.found.length - 1} more` : ""}` : "nothing new to change");
  if (r.auto.length) bits.push(`decided ${r.auto.length} for you`);
  for (const j of r.judged.slice(0, 2)) bits.push(`“${j.title}” ${j.verdict === "worked" ? "worked" : "didn’t work"}`);
  return { line: bits.join(" · "), good: r.found.length + r.auto.length + r.judged.length > 0 };
}
