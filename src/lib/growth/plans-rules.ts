import { outcome, type Candidate, type Outcome, type PlanInput } from "./plan";

/**
 * Plans. Kaviar never proposes ads for their own sake: every plan starts from a reason found in the brand's own numbers or the calendar —
 * a holiday coming, stock sitting unsold, buyers going quiet, sales down or under target. One reason, one plan: its own budget, what it
 * should bring back, its own ads, and its own six steps from "why" to "results". Pure, so the rules can be tested without a store.
 */
/** "own" is a campaign the brand started itself — its reason is the brand's, and it needs no other. */
export type Reason = "holiday" | "overstock" | "lapsed" | "sales" | "own";
export const REASON_NAME: Record<Reason, string> = { holiday: "Holiday", overstock: "Stock sitting", lapsed: "Buyers going quiet", sales: "Sales down", own: "Your campaign" };
/** Where a plan is: waiting for a yes, approved with no ads yet, ads to review, ads approved and ready to go live, on Meta. */
export type Stage = "suggested" | "approved" | "review" | "ready" | "live";
export const STAGE_NAME: Record<Stage, string> = { suggested: "Suggested", approved: "Approved", review: "Ads to review", ready: "Ready to launch", live: "On Meta" };
/** The campaign Kaviar made on Meta for a plan. It is made paused; it spends only once the brand switches it on there. */
export type OnMeta = { campaignId: string; account: string; at: string; daily: number };
/** A campaign the brand set up by hand: what to sell, to whom, and what to call it. */
export type OwnPlan = { key: string; name: string; product: string; who: string; kind: "cold" | "lookalike" | "warm"; audience: number | null; at: string; by?: string };
export type PlanAds = { batchId: string; review: number; approved: number; tested: boolean; thumbs: string[] };
export type PlanCard = {
  key: string; reason: Reason; title: string; why: string; when?: string; // when: for a holiday, how soon ("in 4 days")
  c: Candidate; image: string | null; budget: number; days: number; out: [Outcome, Outcome, Outcome];
  stage: Stage; ads: PlanAds | null; urgent: boolean; approvedAt: string | null; approvedBy?: string | null; meta?: OnMeta | null;
};
export type SavedPlans = { target?: number; plans?: Record<string, { budget?: number; days?: number; approvedAt?: string; by?: string; meta?: OnMeta }>; own?: OwnPlan[] };

// ---------------------------------------------------------------- the calendar
export type Moment = { key: string; name: string; date: string; days: number };
const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d, 12));
/** The nth given weekday of a month (n = -1 for the last). Sunday is 0. */
function nth(y: number, m: number, weekday: number, n: number): Date {
  if (n > 0) { const first = utc(y, m, 1), shift = (weekday - first.getUTCDay() + 7) % 7; return utc(y, m, 1 + shift + (n - 1) * 7); }
  const last = utc(y, m + 1, 0), back = (last.getUTCDay() - weekday + 7) % 7; return utc(y, m, last.getUTCDate() - back);
}
/** The shopping days of a year. The fixed ones are the same everywhere; the others are the United States' dates. */
function calendar(y: number, market: string): [string, string, Date][] {
  const thanks = nth(y, 10, 4, 4), bf = utc(y, 10, thanks.getUTCDate() + 1);
  const all: [string, string, Date][] = [["new-year", "New Year", utc(y, 0, 1)], ["valentines", "Valentine’s Day", utc(y, 1, 14)], ["halloween", "Halloween", utc(y, 9, 31)], ["black-friday", "Black Friday", bf], ["christmas", "Christmas", utc(y, 11, 25)]];
  if (market === "US") all.push(["mothers-day", "Mother’s Day", nth(y, 4, 0, 2)], ["memorial-day", "Memorial Day", nth(y, 4, 1, -1)], ["fathers-day", "Father’s Day", nth(y, 5, 0, 3)], ["july-4", "Fourth of July", utc(y, 6, 4)], ["labor-day", "Labor Day", nth(y, 8, 1, 1)]);
  return all;
}
/** What is coming up within `within` days, soonest first. */
export function moments(today: Date, market = "US", within = 35): Moment[] {
  const t = utc(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()), y = t.getUTCFullYear();
  return [...calendar(y, market), ...calendar(y + 1, market)].map(([key, name, d]) => ({ key: `${key}-${d.getUTCFullYear()}`, name, date: iso(d), days: Math.round((d.getTime() - t.getTime()) / 86_400_000) }))
    .filter((m) => m.days >= 0 && m.days <= within).sort((a, b) => a.days - b.days);
}
export const inDays = (n: number) => (n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`);

// ---------------------------------------------------------------- reasons from the numbers
/** Sales are a reason when they fall short of the target the brand set — or, with no target, when they drop 15% or more on the 30 days before. */
export function salesReason(cur: number, prev: number, target?: number | null): { on: boolean; why: string; pct: number | null } {
  const pct = prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null;
  if (target && target > 0) return { on: cur < target, why: `${Math.round((cur / target) * 100)}% of your monthly target`, pct };
  return { on: pct != null && pct <= -15, why: pct != null ? `Sales down ${Math.abs(pct)}% on the 30 days before` : "", pct };
}

// ---------------------------------------------------------------- one plan
export function stageOf(approved: boolean, ads: PlanAds | null, live = false): Stage {
  if (live) return "live";
  if (ads && ads.review > 0) return "review";
  if (ads && ads.approved > 0) return "ready"; // the shopper test is worth doing, but it never stands between approved ads and a launch
  return approved ? "approved" : "suggested";
}
export const forecast = (c: Candidate, budget: number, days: number, i: Omit<PlanInput, "candidates">): [Outcome, Outcome, Outcome] =>
  [0, 1, 2].map((k) => outcome(c, budget, k as 0 | 1 | 2, { ...i, days, candidates: [] })) as [Outcome, Outcome, Outcome];

export type StepKey = "why" | "budget" | "ads" | "test" | "launch" | "results";
export type Step = { key: StepKey; label: string; note: string; done: boolean; optional?: boolean };
/** A plan's own six steps, with which is done and what each is waiting on. */
export function stepsOf(p: PlanCard): { steps: Step[]; now: StepKey } {
  const a = p.ads, s = p.stage, n = (k: number, one: string) => `${k} ${one}${k === 1 ? "" : "s"}`, made = s === "ready" || s === "live";
  const steps: Step[] = [
    { key: "why", label: "Why now", note: REASON_NAME[p.reason], done: true },
    // Approved means somebody said yes to this plan. Ads written before plans existed don't count as a yes.
    { key: "budget", label: "Budget", note: p.approvedAt ? `Approved${p.approvedBy ? ` by ${p.approvedBy.split(/\s+/)[0]}` : ""} · ${new Date(p.approvedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : s === "suggested" ? "Waiting for your yes" : "Not approved yet", done: Boolean(p.approvedAt) },
    { key: "ads", label: "Ads", note: !a ? "Not made yet" : a.review ? `${n(a.review, "ad")} to review` : `${n(a.approved, "ad")} approved`, done: made },
    { key: "test", label: "Test", note: a?.tested ? "Winner chosen" : "Optional", done: Boolean(a?.tested) && made, optional: true },
    { key: "launch", label: "Launch", note: s === "live" ? "Made on Meta" : s === "ready" ? "Ready to go live" : "On Meta", done: s === "live" },
    { key: "results", label: "Results", note: "Against this plan", done: false },
  ];
  const now: StepKey = s === "suggested" ? "budget" : s === "approved" || s === "review" ? "ads" : s === "ready" ? "launch" : "results";
  return { steps, now };
}
/** What needs the brand first: a holiday close by, then plans stopped mid-way waiting for a yes, then the rest by what they bring. */
export function rankPlans(list: PlanCard[]): PlanCard[] {
  const w = (p: PlanCard) => (p.stage === "live" ? 9 : p.urgent ? 0 : p.stage === "ready" ? 1 : p.stage === "review" ? 2 : p.stage === "approved" ? 3 : p.reason === "own" ? 3.5 : p.reason === "holiday" ? 4 : p.reason === "lapsed" ? 5 : p.reason === "overstock" ? 6 : 7);
  return [...list].sort((a, b) => w(a) - w(b) || b.out[1].profit - a.out[1].profit);
}
