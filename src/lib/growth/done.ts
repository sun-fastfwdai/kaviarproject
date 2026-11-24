import "server-only";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { ago } from "../format";
import type { PlanCard } from "./plans-rules";

/**
 * What the agents finished for a brand in the last few days — only things recorded as done: fixes saved to the store, changes Kaviar
 * made on Meta itself, ads written, campaigns placed on Meta, competitors read. Each says where to see it. Nothing is listed that was
 * only proposed.
 */
export type Done = { who: "analyst" | "builder" | "qa" | "catalog"; text: string; sub: string | null; at: string; when: string; href: string };

const rows = <T,>(r: { rows: unknown[] }) => r.rows as T[];
const iso = (d: unknown) => new Date(d as string | Date).toISOString();
const s = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

export async function doneFor(brandId: string, base: string, plans: PlanCard[] | null, days = 7): Promise<Done[]> {
  const since = new Date(Date.now() - days * 864e5), none = { rows: [] as unknown[] };
  const [fixes, changes, batches, research] = await Promise.all([
    db.execute(sql`select coalesce("by", 'team') as by, count(*)::int as n, max(applied_at) as at from store_fixes where brand_id = ${brandId} and status = 'applied' and applied_at >= ${since} group by 1`).catch(() => none),
    // Only changes Kaviar made on Meta itself: one the brand switched by hand has no record of what Meta answered.
    db.execute(sql`select title, target->'applied'->>'note' as note, applied_at as at, result->>'verdict' as verdict from optimize_changes
      where brand_id = ${brandId} and status = 'applied' and applied_at >= ${since} and target ? 'applied' order by applied_at desc limit 4`).catch(() => none),
    db.execute(sql`select b.id, b.title, b.signal, b.created_at as at, (select count(*) from ads a where a.batch_id = b.id)::int as n from ad_batches b
      where b.brand_id = ${brandId} and b.created_at >= ${since} order by b.created_at desc limit 3`).catch(() => none),
    db.execute(sql`select market, finished_at as at, (ads_read->>'count')::int as ads, jsonb_array_length(rivals)::int as rivals from market_research
      where brand_id = ${brandId} and status = 'done' and finished_at >= ${since} order by finished_at desc limit 1`).catch(() => none),
  ]);
  const out: Omit<Done, "when">[] = [];
  for (const f of rows<{ by: string; n: number; at: Date }>(fixes)) if (f.n > 0) out.push({ who: "catalog", at: iso(f.at), href: `${base}/seo#fixed`,
    text: f.by === "autopilot" ? `Cleo fixed ${s(f.n, "store listing")}` : `${s(f.n, "fix", "fixes")} by Cleo saved to your store`, sub: "Search titles, descriptions and picture descriptions" });
  for (const c of rows<{ title: string; note: string | null; at: Date; verdict: string | null }>(changes)) out.push({ who: "qa", at: iso(c.at), href: `${base}/performance#autopilot`,
    text: c.title, sub: [c.note ?? "Done on Meta", c.verdict === "worked" ? "it worked" : c.verdict === "didnt" ? "it did not help" : null].filter(Boolean).join(" · ") });
  for (const b of rows<{ id: string; title: string; signal: string | null; at: Date; n: number }>(batches)) if (b.n > 0) {
    const plan = b.signal ? plans?.find((p) => p.key === b.signal || p.c.signal === b.signal) : undefined;
    out.push({ who: "builder", at: iso(b.at), text: `Remy wrote ${s(b.n, "ad")}`, sub: plan?.title ?? b.title, href: plan ? `${base}/campaigns/${encodeURIComponent(plan.key)}` : `${base}/creative/${b.id}` });
  }
  for (const p of plans ?? []) if (p.meta?.at && new Date(p.meta.at) >= since) out.push({ who: "qa", at: iso(p.meta.at), href: `${base}/campaigns/${encodeURIComponent(p.key)}`,
    text: p.meta.onAt ? "Otto has a campaign running on Meta" : "Otto put a campaign on Meta, paused", sub: p.title });
  for (const r of rows<{ market: string; at: Date; ads: number | null; rivals: number }>(research)) out.push({ who: "analyst", at: iso(r.at), href: `${base}/research?tab=ads`,
    text: r.ads ? `Iris read ${s(r.ads, "competitor ad")}` : "Iris researched your market", sub: r.rivals ? `${s(r.rivals, "competitor")} · ${r.market}` : r.market });
  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5).map((x) => ({ ...x, when: ago(new Date(x.at)) }));
}
