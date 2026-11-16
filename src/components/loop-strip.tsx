import { Suspense } from "react";
import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { Icon } from "./icon";

/** The growth loop, in the sidebar's order: [path, label, what this step is for]. Optimize goes back to Ad signals — research is the groundwork. */
const LOOP = [
  ["research", "Market research", "Know the market and the competition"],
  ["signals", "Ad signals", "Find what the store data says"],
  ["creative", "Creative studio", "Turn a signal into ads"],
  ["audience", "Audience test", "Try ads on a simulated audience first"],
  ["run", "Run ads", "Launch a small, safe test"],
  ["performance", "Performance", "See what really sold"],
  ["optimize", "Optimize & repeat", "Fix what isn’t working, go again"],
] as const;
export type LoopKey = (typeof LOOP)[number][0];
type Progress = Record<LoopKey, { done: boolean; note: string }>;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Where this brand really is on each step, from its own data. */
async function progress(brandId: string): Promise<Progress> {
  const [r] = (await db.execute(sql`select
    (select count(*) from market_research where brand_id = ${brandId} and report is not null)::int as research,
    exists (select 1 from shop_orders where brand_id = ${brandId}) as orders,
    exists (select 1 from meta_ads where brand_id = ${brandId}) as meta,
    (select count(*) from ad_batches where brand_id = ${brandId})::int as batches,
    (select count(*) from ads where brand_id = ${brandId} and status = 'review')::int as review,
    (select count(*) from ads where brand_id = ${brandId} and status = 'approved')::int as approved,
    (select count(*) from audience_tests where brand_id = ${brandId} and purpose = 'test' and status = 'done')::int as tests,
    (select count(distinct ad_id) from meta_insights_daily where brand_id = ${brandId} and date > current_date - 30 and impressions > 0)::int as live,
    (select count(*) from optimize_changes where brand_id = ${brandId} and status = 'proposed')::int as proposed,
    (select count(*) from optimize_changes where brand_id = ${brandId} and status in ('approved', 'applied'))::int as changed`)).rows as {
    research: number; orders: boolean; meta: boolean; batches: number; review: number; approved: number; tests: number; live: number; proposed: number; changed: number;
  }[];
  return {
    research: { done: r.research > 0, note: r.research ? `${plural(r.research, "market")} researched` : "Not researched yet" },
    signals: { done: r.orders || r.meta, note: r.orders && r.meta ? "Store and ad data in" : r.orders ? "Store data in" : r.meta ? "Ad data in" : "Connect Shopify or Meta" },
    creative: { done: r.batches > 0, note: r.batches ? `${plural(r.batches, "batch", "batches")}${r.review ? ` · ${plural(r.review, "ad")} to review` : ""}` : "No ads written yet" },
    audience: { done: r.tests > 0, note: r.tests ? `${plural(r.tests, "test")} run` : "No ads tested yet" },
    run: { done: r.approved > 0, note: r.approved ? `${plural(r.approved, "approved ad")} ready to launch` : "Nothing approved to launch yet" },
    performance: { done: r.live > 0, note: r.live ? `${plural(r.live, "ad")} with results, last 30 days` : "No ad results yet" },
    optimize: { done: r.changed > 0, note: r.proposed ? `${plural(r.proposed, "change")} to review` : r.changed ? `${plural(r.changed, "change")} made` : "No changes yet" },
  };
}

function Strip({ base, step, p }: { base: string; step: LoopKey; p: Progress | null }) {
  const i = LOOP.findIndex(([k]) => k === step);
  const [, label, doing] = LOOP[i];
  const again = step === "optimize";
  const [nextPath, nextLabel] = again ? LOOP[1] : LOOP[i + 1];
  const now = p?.[step];
  return (
    <div className="row g10" style={{ height: 30, padding: "0 6px 0 10px", border: "1px solid var(--line)", borderRadius: 99, background: "var(--tray)", whiteSpace: "nowrap", flexShrink: 0, minWidth: 0 }}>
      <span className="row g4" aria-label="Growth steps">
        {LOOP.map(([k, l], j) => {
          const on = j === i, done = p?.[k].done;
          return (
            <Link key={k} href={`${base}/${k}`} title={`${j + 1}. ${l}${p ? ` — ${p[k].note}` : ""}`} aria-label={`${l}${done ? ", has work" : ""}`} aria-current={on ? "step" : undefined}
              style={{ display: "block", width: on ? 14 : 6, height: 6, borderRadius: 99, background: on ? "#121212" : done ? "#1F8A5B" : "#D9D6D1" }} />
          );
        })}
      </span>
      <span className="xs i3">Step {i + 1} of {LOOP.length}</span>
      <span className="xs w5 i1" title={doing}>{label}</span>
      <span className={`xs ell ${now?.done ? "c-green" : "i3"}`} style={{ maxWidth: 230 }} title={now ? `${doing} · ${now.note}` : doing}>{now ? now.note : doing}</span>
      <Link href={`${base}/${nextPath}`} className="row g4" title={p ? p[nextPath].note : undefined} style={{ height: 22, padding: "0 9px", borderRadius: 99, background: "#fff", border: "1px solid var(--line)", fontSize: 11.5, color: "var(--ink-2)" }}>
        {again ? `Back to ${nextLabel}` : `Next: ${nextLabel}`}<Icon name={again ? "repeat" : "arrow-r"} size={11} color="#55534F" />
      </Link>
    </div>
  );
}

async function Live({ base, brandId, step }: { base: string; brandId: string; step: LoopKey }) {
  const p = await progress(brandId).catch(() => null);
  return <Strip base={base} step={step} p={p} />;
}

/** Board header chip (lib.step_pill): which growth step this screen is, where the brand really is on it, and what comes next. */
export function LoopStrip({ base, brandId, step }: { base: string; brandId: string; step: LoopKey }) {
  return <Suspense fallback={<Strip base={base} step={step} p={null} />}><Live base={base} brandId={brandId} step={step} /></Suspense>;
}
