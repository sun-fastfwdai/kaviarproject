import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { audit } from "./audit";
import { writeFixes } from "./write";
import { applyFixes, storeAccess, type StoreAccess } from "./apply";
import type { Audit, StoreRun } from "./types";

/**
 * The store's own Autopilot. Once a day (and whenever someone presses "Check again") Kaviar reads the store, lists what should change,
 * has Cleo write each replacement, and — if the brand switched "Fix automatically" on and the store allows edits — fills in what is
 * empty. It never replaces words a person wrote without a person saying yes.
 */
const N = schema.agentNotes;
const SET = "store-pilot", LOG = "store-log", AUDIT = "store-audit", KEEP = 30;

export async function read<T>(brandId: string, key: string): Promise<T | null> {
  const [r] = await db.select({ body: N.body }).from(N).where(and(eq(N.brandId, brandId), eq(N.key, key))).limit(1);
  return (r?.body as T | undefined) ?? null;
}
export async function write(brandId: string, key: string, body: Record<string, unknown>): Promise<void> {
  await db.insert(N).values({ brandId, key, body, factsHash: "kaviar", model: "kaviar" } as unknown as typeof N.$inferInsert)
    .onConflictDoUpdate({ target: [N.brandId, N.key], set: { body, createdAt: new Date() } });
}

export type Store = { access: StoreAccess; auto: boolean; audit: Audit | null; runs: StoreRun[] };
export async function getStore(brandId: string): Promise<Store> {
  const [access, set, log, a] = await Promise.all([storeAccess(brandId), read<{ auto?: boolean }>(brandId, SET), read<{ runs?: StoreRun[] }>(brandId, LOG), read<Audit>(brandId, AUDIT)]);
  return { access, auto: Boolean(set?.auto), audit: a?.at ? a : null, runs: log?.runs ?? [] };
}

/** The last check's counts, less what has been fixed since — so a fix shows at once, not tomorrow. Used wherever a score is shown. */
export async function currentAudit(brandId: string, a: Audit | null): Promise<Audit | null> {
  if (!a) return null;
  const rows = (await db.execute(sql`select kind, count(*)::int as n from store_fixes where brand_id = ${brandId} and status <> 'applied' group by kind`)).rows as { kind: string; n: number }[];
  const open = (k: string) => rows.find((r) => r.kind === k)?.n ?? 0, left = (k: string, p: { ok: number; total: number }) => ({ total: p.total, ok: Math.max(0, Math.min(p.total, p.total - open(k))) });
  return { ...a, title: left("search_title", a.title), description: left("search_description", a.description), alt: left("alt", a.alt), text: left("thin", a.text) };
}

/** What is waiting on the store, for Today and the sidebar: open fixes with a replacement written, and how many of each kind. */
export async function storeWaiting(brandId: string): Promise<{ open: number; title: number; description: number; alt: number; products: number }> {
  const [r] = (await db.execute(sql`select count(*)::int as open, count(*) filter (where kind = 'search_title')::int as title, count(*) filter (where kind = 'search_description')::int as description,
    count(*) filter (where kind = 'alt')::int as alt, count(distinct product_gid)::int as products from store_fixes where brand_id = ${brandId} and status = 'proposed' and kind <> 'thin'`)).rows as { open: number; title: number; description: number; alt: number; products: number }[];
  return r ?? { open: 0, title: 0, description: 0, alt: 0, products: 0 };
}

const dayOf = (tz: string) => db.execute(sql`select to_char((now() at time zone ${tz})::date, 'YYYY-MM-DD') as day`).then((r) => (r.rows as { day: string }[])[0].day);

export async function setAuto(brand: { id: string; timezone: string }, auto: boolean, memberId: string | null): Promise<void> {
  const before = await getStore(brand.id);
  await write(brand.id, SET, { auto, since: new Date().toISOString() });
  if (before.auto === auto) return;
  // What is already waiting falls under the new setting straight away.
  const did = auto && before.access.canFix ? await applyFixes(brand.id, "empty-only", { by: "autopilot", memberId }) : null;
  const run: StoreRun = { at: new Date().toISOString(), day: await dayOf(brand.timezone), by: "team", products: before.audit?.products ?? 0, found: 0, wrote: 0, fixed: did?.fixed ?? [], note: auto ? "Set to fix automatically" : "Set to ask first" };
  await write(brand.id, LOG, { runs: [run, ...before.runs].slice(0, KEEP) });
}

/** One check of one store. */
export async function storeRun(brand: { id: string; timezone: string }, by: StoreRun["by"], budgetMs = 200_000): Promise<StoreRun | null> {
  const s = await getStore(brand.id);
  if (!s.access.connectionId) return null;
  const { audit: a, added } = await audit(brand.id, s.access.connectionId);
  await write(brand.id, AUDIT, a as unknown as Record<string, unknown>);
  const wrote = await writeFixes(brand.id, budgetMs);
  const did = s.auto && s.access.canFix ? await applyFixes(brand.id, "empty-only", { by: "autopilot" }) : null;
  const run: StoreRun = { at: new Date().toISOString(), day: await dayOf(brand.timezone), by, products: a.products, found: added, wrote, fixed: did?.fixed ?? [] };
  await write(brand.id, LOG, { runs: [run, ...s.runs].slice(0, KEEP) });
  return run;
}

/** The hourly job calls this: every brand with a real store gets one check a day, from six in the morning its own time. */
export async function runStoreAll(minHour = 6, budgetMs = 240_000): Promise<{ brands: number; ran: number; failed: number }> {
  const t0 = Date.now();
  const list = (await db.execute(sql`select b.id, b.name, coalesce(b.timezone, 'UTC') as timezone, to_char((now() at time zone coalesce(b.timezone, 'UTC'))::date, 'YYYY-MM-DD') as day,
      extract(hour from now() at time zone coalesce(b.timezone, 'UTC'))::int as hour
    from brands b where b.deleted_at is null and exists (select 1 from connections c where c.brand_id = b.id and c.provider = 'shopify' and c.status = 'connected')`)).rows as { id: string; name: string; timezone: string; day: string; hour: number }[];
  let ran = 0, failed = 0;
  for (const b of list) {
    const left = budgetMs - (Date.now() - t0);
    if (left < 30_000) break;
    if (b.hour < minHour) continue;
    try {
      const log = await read<{ runs?: StoreRun[] }>(b.id, LOG);
      if (log?.runs?.some((r) => r.by === "schedule" && r.day === b.day)) continue;
      await storeRun(b, "schedule", Math.min(150_000, left - 20_000));
      ran++;
      // Once a week, and only with time to spare: read the competitors again so the baseline stays current.
      if (budgetMs - (Date.now() - t0) > 170_000) await (await import("./bench")).refreshBench(b).catch((e) => console.error("bench refresh", b.id, (e as Error).message.slice(0, 160)));
    } catch (e) { console.error("store check", b.id, (e as Error).message.slice(0, 160)); failed++; }
  }
  return { brands: list.length, ran, failed };
}

/** One line for the log. */
export function storeLine(r: StoreRun): string {
  const n = (k: number, one: string) => `${k} ${one}${k === 1 ? "" : "s"}`;
  const did = r.fixed.length ? ` · fixed ${r.fixed.length === 1 ? r.fixed[0] : `${n(r.fixed.length, "product")} on the store`}` : "";
  if (r.note) return `${r.note}${did}`;
  return `Read ${n(r.products, "product")} · ${r.found ? `found ${n(r.found, "new thing")} to fix` : "nothing new"}${r.wrote ? ` · wrote ${n(r.wrote, "replacement")}` : ""}${did}`;
}
