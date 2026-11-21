import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { plan, ratesFrom, type Plan } from "./plan";
import { planData, type PlanData } from "./plan-data";

/**
 * Today: the few things that need the brand, worked out from everything Kaviar holds — connections, stock, the spend plan, ads waiting
 * for review or testing, and this week's proposed changes. Each is one decision with one reason and, where the plan can size it,
 * what it should bring. Code decides and counts; nothing here is written by a model.
 */
export type Who = "analyst" | "builder" | "qa" | "catalog";
export type Action = { key: string; group: "Fix" | "Protect" | "Decide" | "Create" | "Review" | "Test" | "Launch" | "Improve" | "Set up"; who: Who; title: string; why: string; effect?: string; cta: string; href?: string; make?: string; urgent?: boolean };
export type Today = { actions: Action[]; later: Action[]; plan: { approved: boolean; budget: number; weeks: number; lo: number; mid: number; hi: number; profit: number } | null; currency: string };

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
  const [d, batches, tested, changes] = await Promise.all([
    planData(brand.id, currency),
    db.select({ id: B.id, title: B.title, signal: B.signal,
      review: sql<number>`(select count(*) from ads a where a.batch_id = "ad_batches"."id" and a.status = 'review')::int`,
      approved: sql<number>`(select count(*) from ads a where a.batch_id = "ad_batches"."id" and a.status = 'approved')::int` }).from(B).where(eq(B.brandId, brand.id)).orderBy(desc(B.createdAt)).limit(30),
    db.execute(sql`select distinct source->>'batchId' as id from audience_tests where brand_id = ${brand.id} and status = 'done' and source->>'type' = 'batch'`).then((r) => new Set((r.rows as { id: string | null }[]).map((x) => x.id).filter(Boolean) as string[])).catch(() => new Set<string>()),
    db.select({ id: schema.optimizeChanges.id, kind: schema.optimizeChanges.kind, title: schema.optimizeChanges.title, why: schema.optimizeChanges.why, before: schema.optimizeChanges.before, after: schema.optimizeChanges.after })
      .from(schema.optimizeChanges).where(and(eq(schema.optimizeChanges.brandId, brand.id), eq(schema.optimizeChanges.status, "proposed"))).orderBy(desc(schema.optimizeChanges.week)).limit(4).catch(() => []),
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
  for (const c of changes) a.push({ key: `change:${c.id}`, group: "Improve", who: "analyst", title: c.title, why: c.why, effect: c.before && c.after ? `${c.before} → ${c.after}` : undefined, cta: "Decide", href: `${base}/optimize`, urgent: c.kind === "pause" });

  // Set up: the inputs that make the numbers real.
  if (d.margin.from === "none") a.push({ key: "margin", group: "Set up", who: "analyst", title: "Tell us your margin", why: "Profit is assuming 60% until you set it.", effect: "Unlocks real profit", cta: "Set it", href: `${base}/plan` });
  if (!d.history) a.push({ key: "history", group: "Set up", who: "catalog", title: "Bring in your past Meta ads", why: "Without them every number is a scenario, not your results.", effect: "Unlocks forecasts", cta: "Connect", href: `${base}/integrations` });
  if (!d.hasResearch) a.push({ key: "research", group: "Set up", who: "analyst", title: "Find your buyer groups", why: "Iris researches who buys and what to say to them.", effect: "Unlocks audiences", cta: "Run research", href: `${base}/research` });

  // Urgent first; then finish what is already in hand (review, test, launch) before deciding and making more.
  const ORDER: Action["group"][] = ["Fix", "Protect", "Review", "Test", "Launch", "Decide", "Create", "Improve", "Set up"];
  const rank = (x: Action) => (x.urgent ? 0 : 100) + ORDER.indexOf(x.group);
  const sorted = [...a].sort((x, y) => rank(x) - rank(y));
  return { actions: sorted.slice(0, 5), later: sorted.slice(5), currency,
    plan: p.rows.length ? { approved, budget, weeks: Math.round(days / 7), lo: lo.revenue, mid: mid.revenue, hi: hi.revenue, profit: mid.profit } : null };
}
