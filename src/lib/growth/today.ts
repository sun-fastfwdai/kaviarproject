import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { levelOf, plan, ratesFrom, type Plan } from "./plan";
import { flowState, type FlowKey, type FlowStep } from "./flow";
import { getPilot, watching } from "./autopilot";
import type { Mode, Run } from "./pilot";
import { ago } from "../format";
import { planData, type PlanData } from "./plan-data";

/**
 * Today: the few things that need the brand, worked out from everything Kaviar holds — connections, stock, the spend plan, ads waiting
 * for review or testing, and this week's proposed changes. Each is one decision with one reason and, where the plan can size it,
 * what it should bring. Code decides and counts; nothing here is written by a model.
 */
export type Who = "analyst" | "builder" | "qa" | "catalog";
export type Action = { thumbs?: string[]; key: string; group: "Fix" | "Protect" | "Decide" | "Create" | "Review" | "Test" | "Launch" | "Improve" | "Set up"; who: Who; title: string; why: string; effect?: string; cta: string; href?: string; make?: string; urgent?: boolean };
export type Today = {
  actions: Action[]; later: Action[]; currency: string;
  plan: { approved: boolean; budget: number; weeks: number; lo: number; mid: number; hi: number; profit: number; campaigns: number; level: 0 | 1 | 2; product: string | null; image: string | null } | null;
  flow: FlowStep[]; now: FlowKey; // the six steps and which one the top action belongs to
  pilot: { mode: Mode; last: string | null; watched: Run["watched"]; waiting: number; toSwitch: number };
};
const STEP: Partial<Record<Action["group"], FlowKey>> = { Decide: "plan", Create: "create", Review: "create", Test: "test", Launch: "launch", Improve: "learn" };

/** The plan as the team last set it (or the defaults the Spend plan opens with). */
export function planFor(d: PlanData): { p: Plan; budget: number; days: number; margin: number } {
  const s = d.saved ?? {}, budget = s.budget ?? 1500, days = s.days ?? 28, margin = d.margin.value ?? s.margin ?? 0.6;
  const repeat = d.orders.buyers >= 50 ? Math.min(0.5, d.orders.repeaters / d.orders.buyers) : 0;
  const chosen = d.products.find((x) => x.title === s.product) ?? null;
  const avg = d.orders.count >= 10 && d.orders.aov ? Math.round(d.orders.aov) : null; // their real average order, once there are enough
  const candidates = d.candidates.map((c) => ({ ...c, product: chosen?.title ?? c.product, price: s.order && s.order > 0 ? s.order : avg ?? chosen?.price ?? c.price, stock: chosen ? chosen.stock : c.stock }));
  return { p: plan({ budget, days, goal: s.goal ?? "profit", discount: s.discount ?? 0, margin, repeat, rates: ratesFrom(d.history), candidates }), budget, days, margin };
}

export async function today(brand: { id: string; currency: string | null }, slug: string, conns: { shopify?: { status: string } | null; meta?: { status: string } | null }): Promise<Today> {
  const base = `/brands/${slug}`, currency = brand.currency ?? "USD";
  const usd = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(Math.round(v));
  const B = schema.adBatches;
  const [flow, pilot, watched, toSwitch, pics, d, batches, tested, changes] = await Promise.all([
    flowState(brand.id), getPilot(brand.id), watching(brand.id),
    db.execute(sql`select count(*)::int as n from optimize_changes where brand_id = ${brand.id} and status = 'approved'`).then((r) => (r.rows as { n: number }[])[0]?.n ?? 0).catch(() => 0),
    // A few of the ads themselves, so "review" and "test" show what is waiting rather than describe it.
    db.execute(sql`select a.batch_id as batch, a.status, a.image_url as url from ads a join ad_batches b on b.id = a.batch_id where b.brand_id = ${brand.id} and a.status in ('review', 'approved') and a.image_url is not null order by b.created_at desc, a.position limit 60`)
      .then((r) => r.rows as { batch: string; status: string; url: string }[]).catch(() => []),
    planData(brand.id, currency),
    db.select({ id: B.id, title: B.title, signal: B.signal,
      review: sql<number>`(select count(*) from ads a where a.batch_id = "ad_batches"."id" and a.status = 'review')::int`,
      approved: sql<number>`(select count(*) from ads a where a.batch_id = "ad_batches"."id" and a.status = 'approved')::int` }).from(B).where(eq(B.brandId, brand.id)).orderBy(desc(B.createdAt)).limit(30),
    db.execute(sql`select distinct source->>'batchId' as id from audience_tests where brand_id = ${brand.id} and status = 'done' and source->>'type' = 'batch'`).then((r) => new Set((r.rows as { id: string | null }[]).map((x) => x.id).filter(Boolean) as string[])).catch(() => new Set<string>()),
    db.select({ id: schema.optimizeChanges.id, kind: schema.optimizeChanges.kind, title: schema.optimizeChanges.title, why: schema.optimizeChanges.why, before: schema.optimizeChanges.before, after: schema.optimizeChanges.after })
      .from(schema.optimizeChanges).where(and(eq(schema.optimizeChanges.brandId, brand.id), eq(schema.optimizeChanges.status, "proposed"), sql`${schema.optimizeChanges.week} > current_date - 7`)).orderBy(desc(schema.optimizeChanges.createdAt)).limit(20).catch(() => []),
  ]);
  const { p, budget, days } = planFor(d), [lo, mid, hi] = p.total, approved = Boolean(d.saved?.approvedAt);
  const a: Action[] = [];

  // Fix: nothing else works without the data.
  if (conns.shopify?.status === "needs_reauth") a.push({ key: "fix-shopify", group: "Fix", who: "catalog", title: "Reconnect Shopify", why: "The store stopped accepting Kaviar’s access.", cta: "Reconnect", href: `${base}/integrations`, urgent: true });
  if (conns.meta?.status === "needs_reauth") a.push({ key: "fix-meta", group: "Fix", who: "catalog", title: "Reconnect Meta Ads", why: "The Facebook login expired.", cta: "Reconnect", href: `${base}/integrations`, urgent: true });
  if (conns.meta?.status === "choose_account") a.push({ key: "fix-account", group: "Fix", who: "catalog", title: "Pick your Meta ad account", why: "Login is done — choose which account is yours.", cta: "Choose", href: `${base}/integrations`, urgent: true });

  // Protect: stock decides what ads may sell.
  if (d.hero?.coverDays != null && d.hero.coverDays < 30) a.push({ key: "stock", group: "Protect", who: "qa", title: `Reorder ${d.hero.title}`, why: `${d.hero.stock.toLocaleString("en-US")} left — about ${d.hero.coverDays} days at the current pace.`, effect: "Ads would shorten it", cta: "See stock", href: `${base}/shopify?tab=products`, urgent: d.hero.coverDays < 14 });

  // Decide: the plan itself.
  if (!approved && p.rows.length) a.push({ key: "plan", group: "Decide", who: "analyst", title: `Approve your ${usd(budget)} spend plan`, why: `${p.rows.length} campaign${p.rows.length === 1 ? "" : "s"} over ${Math.round(days / 7)} weeks, sized so each gives a result you can read.`, effect: `Likely ${usd(mid.revenue)} back`, cta: "Open plan", href: `${base}/plan` });

  // Create → Review → Test → Launch, campaign by campaign.
  const forSignal = (sig: string | null) => (sig ? batches.find((b) => b.signal === sig) : undefined);
  if (approved) for (const r of p.rows) if (!forSignal(r.c.signal)) a.push({ key: `make:${r.c.key}`, group: "Create", who: "builder", title: `Make the ads for ${r.c.name}`, why: `${usd(r.spend)} of the plan goes here. Remy writes six and shoots them with your product.`, effect: `${Math.round(r.out[1].orders)} orders likely`, cta: "Make the ads", make: r.c.key });
  // One line per kind of work, however many batches are waiting — the list stays short.
  const toReview = batches.filter((x) => x.review > 0), ads = toReview.reduce((n, x) => n + x.review, 0);
  if (toReview.length === 1) a.push({ key: `review:${toReview[0].id}`, group: "Review", who: "builder", title: `Review ${ads} ad${ads === 1 ? "" : "s"}`, why: toReview[0].title, cta: "Review", href: `${base}/creative/${toReview[0].id}` });
  else if (toReview.length > 1) a.push({ key: "review", group: "Review", who: "builder", title: `Review ${ads} ads`, why: `${toReview.length} batches are waiting — newest: ${toReview[0].title}`, cta: "Review", href: `${base}/creative?tab=ads` });
  const toTest = batches.filter((x) => x.approved > 0 && x.review === 0 && !tested.has(x.id));
  if (toTest.length) a.push({ key: `test:${toTest[0].id}`, group: "Test", who: "qa", title: `Test ${toTest[0].approved} approved ad${toTest[0].approved === 1 ? "" : "s"} before spending`, why: `${toTest[0].title} — look-alike shoppers pick the winner.${toTest.length > 1 ? ` ${toTest.length - 1} more after it.` : ""}`, effect: "No ad spend", cta: "Run the test", href: `${base}/audience?batch=${toTest[0].id}` });
  const toLaunch = batches.filter((x) => x.approved > 0 && tested.has(x.id));
  if (toLaunch.length) a.push({ key: `launch:${toLaunch[0].id}`, group: "Launch", who: "analyst", title: "Put the winner live", why: `${toLaunch[0].title} — tested, with a winner chosen.`, cta: "Set it up", href: `${base}/run` });

  // Improve: this week's proposed changes to what is running.
  // One line, however many Autopilot found — the list stays short and the detail is on Results.
  const lead = changes.find((c) => c.kind === "pause") ?? changes[0];
  if (changes.length === 1) a.push({ key: "improve", group: "Improve", who: "analyst", title: lead.title, why: lead.why, effect: lead.before && lead.after ? `${lead.before} → ${lead.after}` : undefined, cta: "Decide", href: `${base}/performance#autopilot`, urgent: lead.kind === "pause" });
  else if (changes.length > 1) a.push({ key: "improve", group: "Improve", who: "analyst", title: `Decide ${changes.length} changes Autopilot found`, why: `${lead.title} — and ${changes.length - 1} more.`, effect: lead.kind === "pause" ? "Stops a loss" : undefined, cta: "Decide", href: `${base}/performance#autopilot`, urgent: lead.kind === "pause" });
  if (toSwitch > 0) a.push({ key: "switch", group: "Improve", who: "analyst", title: `Switch ${toSwitch} decided change${toSwitch === 1 ? "" : "s"} in Meta`, why: "Decided already. Kaviar can’t change your Meta ads itself yet — about a minute each.", cta: "See them", href: `${base}/performance#autopilot` });

  // Set up: the inputs that make the numbers real.
  if (d.margin.from === "none") a.push({ key: "margin", group: "Set up", who: "analyst", title: "Tell us your margin", why: "Profit is assuming 60% until you set it.", effect: "Unlocks real profit", cta: "Set it", href: `${base}/plan` });
  const emptyAccount = conns.meta?.status === "connected" && d.metaCampaigns === 0;
  if (!d.history) a.push({ key: "history", group: "Set up", who: "catalog", title: emptyAccount ? "Connect the ad account your ads ran on" : "Bring in your past Meta ads", why: emptyAccount ? "The Meta account connected here has no campaigns in it." : "Without them every number is a scenario, not your results.", effect: "Unlocks forecasts", cta: emptyAccount ? "Change account" : "Connect", href: `${base}/integrations` });
  if (!d.hasResearch) a.push({ key: "research", group: "Set up", who: "analyst", title: "Find your buyer groups", why: "Iris researches who buys and what to say to them.", effect: "Unlocks audiences", cta: "Run research", href: `${base}/research` });

  // Urgent first; then finish what is already in hand (review, test, launch) before deciding and making more.
  const ORDER: Action["group"][] = ["Fix", "Protect", "Review", "Test", "Launch", "Decide", "Create", "Improve", "Set up"];
  const rank = (x: Action) => (x.urgent ? 0 : 100) + ORDER.indexOf(x.group);
  const pic = (status: string, batch?: string) => pics.filter((x) => x.status === status && (!batch || x.batch === batch)).slice(0, 5).map((x) => x.url);
  for (const x of a) {
    if (x.group === "Review") x.thumbs = pic("review", x.key.startsWith("review:") ? x.key.slice(7) : undefined);
    if (x.group === "Test" || x.group === "Launch") x.thumbs = pic("approved", x.key.split(":")[1]);
  }
  const sorted = [...a].sort((x, y) => rank(x) - rank(y));
  const now = sorted.map((x) => STEP[x.group]).find(Boolean) ?? flow.find((x) => !x.done)?.key ?? "learn";
  const sells = p.rows[0]?.c.product ?? null;
  return { actions: sorted.slice(0, 5), later: sorted.slice(5), currency, flow, now,
    pilot: { mode: pilot.mode, last: pilot.runs[0] ? ago(new Date(pilot.runs[0].at)) : null, watched, waiting: changes.length, toSwitch },
    plan: p.rows.length ? { approved, budget, weeks: Math.round(days / 7), lo: lo.revenue, mid: mid.revenue, hi: hi.revenue, profit: mid.profit, campaigns: p.rows.length, level: levelOf(d.history), product: sells, image: d.products.find((x) => x.title === sells)?.image ?? null } : null };
}
