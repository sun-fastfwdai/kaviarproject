import "server-only";
import { sql } from "drizzle-orm";
import { db } from "../db";

/**
 * The one path a brand walks, in order. Every Growth screen is one of these six steps; the sidebar, the strip at the top of each page and
 * Today all read from here, so "what comes next" is the same wherever the brand looks.
 */
export const FLOW = [
  ["find", "opportunities", "Opportunities", "Who to sell to, and what to say"],
  ["plan", "plan", "Spend plan", "What to spend and what comes back"],
  ["create", "creative", "Creative studio", "Make the ads"],
  ["test", "audience", "Audience test", "Look-alike shoppers pick the winner"],
  ["launch", "run", "Run ads", "Put the winner live"],
  ["learn", "performance", "Results", "See what sold — Autopilot keeps improving it"],
] as const;
export type FlowKey = (typeof FLOW)[number][0];
export type FlowStep = { key: FlowKey; path: string; label: string; what: string; done: boolean; note: string };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Where this brand really is on each step, from its own data. */
export async function flowState(brandId: string): Promise<FlowStep[]> {
  const [r] = (await db.execute(sql`select
    (select count(*) from market_research where brand_id = ${brandId} and report is not null)::int as research,
    exists (select 1 from shop_orders where brand_id = ${brandId}) as orders,
    (select body from agent_notes where brand_id = ${brandId} and key = 'spend-plan' limit 1) as plan,
    (select count(*) from ad_batches where brand_id = ${brandId})::int as batches,
    (select count(*) from ads where brand_id = ${brandId} and status = 'review')::int as review,
    (select count(*) from ads where brand_id = ${brandId} and status = 'approved')::int as approved,
    (select count(*) from audience_tests where brand_id = ${brandId} and purpose = 'test' and status = 'done')::int as tests,
    (select count(distinct ad_id) from meta_insights_daily where brand_id = ${brandId} and date > current_date - 30 and impressions > 0)::int as live,
    (select count(*) from optimize_changes where brand_id = ${brandId} and status = 'proposed' and week > current_date - 7)::int as proposed`)).rows as {
    research: number; orders: boolean; plan: { approvedAt?: string; budget?: number } | null; batches: number; review: number; approved: number; tests: number; live: number; proposed: number;
  }[];
  const note: Record<FlowKey, [boolean, string]> = {
    find: [r.research > 0 || r.orders, r.research ? "Buyer groups found" : r.orders ? "From your store data" : "Connect your store"],
    plan: [Boolean(r.plan?.approvedAt), r.plan?.approvedAt ? "Approved" : "Draft — yours to approve"],
    create: [r.batches > 0 && r.review === 0, r.review ? `${plural(r.review, "ad")} to review` : r.batches ? plural(r.batches, "batch", "batches") : "No ads yet"],
    test: [r.tests > 0, r.tests ? `${plural(r.tests, "test")} run` : "Nothing tested yet"],
    launch: [r.live > 0, r.live ? "Ads are live" : r.approved ? `${plural(r.approved, "ad")} ready` : "Nothing live yet"],
    learn: [r.live > 0 && r.proposed === 0, r.proposed ? `${plural(r.proposed, "change")} to decide` : r.live ? `${plural(r.live, "ad")} with results` : "No results yet"],
  };
  return FLOW.map(([key, path, label, what]) => ({ key, path, label, what, done: note[key][0], note: note[key][1] }));
}

/** The only numbers the sidebar shows: things waiting for the brand — ads to review, and changes Autopilot found this week. */
export async function waiting(brandId: string): Promise<{ review: number; changes: number }> {
  const [r] = (await db.execute(sql`select
    (select count(*) from ads where brand_id = ${brandId} and status = 'review')::int as review,
    (select count(*) from optimize_changes where brand_id = ${brandId} and status = 'proposed' and week > current_date - 7)::int as changes`)).rows as { review: number; changes: number }[];
  return r ?? { review: 0, changes: 0 };
}
