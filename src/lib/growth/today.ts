import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { levelOf } from "./plan";
import { planFor } from "./plan-for";
export { planFor } from "./plan-for";
import { flowState, type FlowKey, type FlowStep } from "./flow";
import { getPilot, watching } from "./autopilot";
import type { Mode, Run } from "./pilot";
import { ago } from "../format";
import { planData } from "./plan-data";
import { currentAudit, getStore, storeWaiting } from "../seo/run";
import { benchGaps } from "../seo/bench";
import { getPlans } from "./plans";
import { channels } from "../queries/growth";
import { products } from "../queries/shop";
import { CHANNEL_COLOR, CHANNEL_LABEL } from "../sync/attribution";
import { getNotes } from "../ai/notes";
import { rivalAds } from "../seo/bench";
import { REASON_NAME } from "./plans-rules";
import { scores } from "../seo/types";
import { summary, trend } from "../queries/growth";
import { getStock } from "../store/stock";
import { paceText } from "../store/stock-rules";
import { halves, pctDelta, rolling, sumOf, type Delta, type Tile } from "./trend";
export type { Tile } from "./trend";
import { storeAccess } from "../seo/apply";

/**
 * Today: the few things that need the brand, worked out from everything Kaviar holds — connections, stock, the spend plan, ads waiting
 * for review or testing, and this week's proposed changes. Each is one decision with one reason and, where the plan can size it,
 * what it should bring. Code decides and counts; nothing here is written by a model.
 */
export type Who = "analyst" | "builder" | "qa" | "catalog";
/** `label` is a plan's reason, shown in place of the group name. */
export type Action = { thumbs?: string[]; key: string; group: "Fix" | "Protect" | "Plan" | "Decide" | "Create" | "Review" | "Test" | "Launch" | "Improve" | "Store" | "Set up"; label?: string; who: Who; title: string; why: string; effect?: string; cta: string; href?: string; make?: string; run?: "store-fix"; urgent?: boolean; viz?: Viz }; // run: done right here on Today, without leaving the page
/** What a card shows between its headline and its button: the evidence, as a picture rather than a sentence. */
export type Viz =
  | { kind: "bars"; rows: { label: string; value: number; text: string; tone: "warn" | "calm" }[] } // stock cover against restock time
  | { kind: "flow"; from: string; fromLabel: string; to: string; toLabel: string } // money in → money back, or before → after
  | { kind: "pair"; a: { label: string; value: string }; b: { label: string; value: string } } // you against them
  | { kind: "counts"; items: { label: string; n: number }[] };
export type Today = {
  pulse: { sales: string; orders: number; delta: Delta | null } | null; // yesterday, against the same day a week before
  /** The month in the store, from each source Kaviar holds: what sells, through which channel, on which days, and what competitors run. `note` is Iris's one-line reading of the numbers. */
  more: {
    note: string | null;
    sellers: { title: string; image: string | null; units: number; revenue: string; share: number }[];
    channels: { name: string; color: string; share: number }[];
    week: { day: string; orders: number }[]; bestDay: string | null;
    rivals: { ads: number; new30: number; brands: number; top: string | null } | null;
  };
  status: Tile[]; // the board: the last 30 days against the 30 before, then campaigns, customers, stock and the store's score — a block each
  actions: Action[]; later: Action[]; currency: string;
  plan: { approved: boolean; budget: number; weeks: number; lo: number; mid: number; hi: number; profit: number; campaigns: number; level: 0 | 1 | 2; product: string | null; image: string | null } | null;
  flow: FlowStep[]; now: FlowKey; // the six steps and which one the top action belongs to
  pilot: { mode: Mode; last: string | null; watched: Run["watched"]; waiting: number; toSwitch: number };
  store: { open: number; canFix: boolean } | null; // fixes waiting on the Shopify store itself (SEO & AI search)
};
const STEP: Partial<Record<Action["group"], FlowKey>> = { Plan: "plan", Decide: "plan", Create: "create", Review: "create", Test: "test", Launch: "launch", Improve: "learn" };

export async function today(brand: { id: string; currency: string | null; timezone?: string | null }, slug: string, conns: { shopify?: { status: string } | null; meta?: { status: string } | null }): Promise<Today> {
  const base = `/brands/${slug}`, currency = brand.currency ?? "USD";
  const usd = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(Math.round(v));
  const tz = brand.timezone ?? "UTC";
  const [sum, byDay, stock, audit, bench] = await Promise.all([
    summary(brand.id, tz, 30).catch(() => null), trend(brand.id, tz, 30).catch(() => []), conns.shopify ? getStock(brand.id, tz).catch(() => null) : Promise.resolve(null),
    getStore(brand.id).then((x) => currentAudit(brand.id, x.audit)).catch(() => null), benchGaps(brand.id).catch(() => null),
  ]);
  const [flow, pilot, watched, shop, shopAccess, toSwitch, d, changes] = await Promise.all([
    flowState(brand.id), getPilot(brand.id), watching(brand.id), storeWaiting(brand.id).catch(() => null), storeAccess(brand.id).catch(() => null),
    db.execute(sql`select count(*)::int as n from optimize_changes where brand_id = ${brand.id} and status = 'approved'`).then((r) => (r.rows as { n: number }[])[0]?.n ?? 0).catch(() => 0),
    planData(brand.id, currency),
    db.select({ id: schema.optimizeChanges.id, kind: schema.optimizeChanges.kind, title: schema.optimizeChanges.title, why: schema.optimizeChanges.why, before: schema.optimizeChanges.before, after: schema.optimizeChanges.after })
      .from(schema.optimizeChanges).where(and(eq(schema.optimizeChanges.brandId, brand.id), eq(schema.optimizeChanges.status, "proposed"), sql`${schema.optimizeChanges.week} > current_date - 7`)).orderBy(desc(schema.optimizeChanges.createdAt)).limit(20).catch(() => []),
  ]);
  const { p, budget, days } = planFor(d), [lo, mid, hi] = p.total, approved = Boolean(d.saved?.approvedAt);
  const a: Action[] = [];

  // Fix: nothing else works without the data.
  if (conns.shopify?.status === "needs_reauth") a.push({ key: "fix-shopify", group: "Fix", who: "catalog", title: "Reconnect Shopify", why: "The store stopped accepting Kaviar’s access.", cta: "Reconnect", href: `${base}/integrations`, urgent: true });
  if (conns.meta?.status === "needs_reauth") a.push({ key: "fix-meta", group: "Fix", who: "catalog", title: "Reconnect Meta Ads", why: "The Facebook login expired.", cta: "Reconnect", href: `${base}/integrations`, urgent: true });
  if (conns.meta?.status === "choose_account") a.push({ key: "fix-account", group: "Fix", who: "catalog", title: "Pick your Meta ad account", why: "Login is done — choose which account is yours.", cta: "Choose", href: `${base}/integrations`, urgent: true });

  // Protect: stock decides what ads may sell. From the forecast — what runs out before a restock could arrive, soonest first.
  const nice = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "");
  for (const r of (stock?.rows ?? []).filter((x) => x.pace > 0 && !x.ordered && (x.state === "out" || x.state === "risk" || x.state === "low")).slice(0, 2)) {
    const left = Math.floor(r.runway ?? 0);
    a.push({ key: `stock:${r.id}`, group: "Protect", who: "qa", title: r.state === "out" ? `${r.title} is sold out` : `${r.title} runs out in ${left} day${left === 1 ? "" : "s"}`,
      why: `${r.inventory.toLocaleString("en-US")} left · sells ${paceText(r.pace)} a day`, effect: r.gap > 0 ? `${r.gap} day${r.gap === 1 ? "" : "s"} with nothing to sell` : `Order by ${nice(r.reorderBy)}`,
      cta: "Restock", href: `${base}/inventory?restock=${r.id}`, urgent: r.state !== "low",
      viz: { kind: "bars", rows: [{ label: "Stock lasts", value: left, text: `${left} day${left === 1 ? "" : "s"}`, tone: "warn" }, { label: "A restock takes", value: stock!.leadDays, text: `${stock!.leadDays} days`, tone: "calm" }] } });
  }

  // Plans: each a reason to advertise with its own budget and steps. The card opens the plan; nothing about ads is asked for outside one.
  const plans = await getPlans({ id: brand.id, currency: brand.currency, timezone: tz }, { byDay, stock }).catch(() => null);
  for (const pl of (plans?.list ?? []).filter((x) => x.stage !== "live")) {
    const ad = pl.ads, m = pl.out[1], n = (k: number) => `${k} ad${k === 1 ? "" : "s"}`;
    a.push({ key: `plan:${pl.key}`, group: "Plan", label: REASON_NAME[pl.reason], who: pl.reason === "overstock" ? "qa" : pl.stage === "review" || pl.stage === "approved" ? "builder" : "analyst", title: pl.title, why: pl.why, urgent: pl.urgent,
      effect: pl.stage === "review" ? `${n(ad!.review)} to review` : pl.stage === "ready" ? "Ready to launch" : pl.stage === "approved" ? "Approved" : pl.when ? pl.when[0].toUpperCase() + pl.when.slice(1) : undefined,
      cta: pl.stage === "suggested" ? "Review plan" : "Open plan", href: `${base}/campaigns/${encodeURIComponent(pl.key)}`,
      ...(ad?.thumbs.length ? { thumbs: ad.thumbs } : {}),
      viz: { kind: "flow", from: usd(pl.budget), fromLabel: "you spend", to: usd(m.revenue), toLabel: m.profit >= 0 ? `likely back · ${usd(m.profit)} profit` : "likely back" } });
  }

  // Improve: this week's proposed changes to what is running.
  // One line, however many Autopilot found — the list stays short and the detail is on Results.
  const lead = changes.find((c) => c.kind === "pause") ?? changes[0];
  if (changes.length === 1) a.push({ key: "improve", group: "Improve", who: "analyst", title: lead.title, why: lead.why, cta: "Decide", href: `${base}/performance#autopilot`, urgent: lead.kind === "pause",
    ...(lead.before && lead.after ? { viz: { kind: "flow" as const, from: lead.before, fromLabel: "now", to: lead.after, toLabel: "proposed" } } : {}) });
  else if (changes.length > 1) a.push({ key: "improve", group: "Improve", who: "analyst", title: `Decide ${changes.length} changes Autopilot found`, why: `${lead.title} — and ${changes.length - 1} more.`, effect: lead.kind === "pause" ? "Stops a loss" : undefined, cta: "Decide", href: `${base}/performance#autopilot`, urgent: lead.kind === "pause" });
  if (toSwitch > 0) a.push({ key: "switch", group: "Improve", who: "analyst", title: `Switch ${toSwitch} decided change${toSwitch === 1 ? "" : "s"} in Meta`, why: "Decided already. Kaviar can’t change your Meta ads itself yet — about a minute each.", cta: "See them", href: `${base}/performance#autopilot` });

  // Store: what stops Google and AI assistants describing the store properly — counted by code, each with its fix written.
  if (shop?.open) {
    const n = (k: number, one: string) => (k ? `${k} ${one}${k === 1 ? "" : "s"}` : null);
    a.push({ key: "store", group: "Store", who: "catalog", title: `Fix ${shop.open} thing${shop.open === 1 ? "" : "s"} on your store`,
      why: `${[n(shop.title, "search title"), n(shop.description, "search description"), n(shop.alt, "picture") && `${n(shop.alt, "picture")} with no description`].filter(Boolean).join(", ")} — Cleo has written each one.`,
      effect: "No ad spend", cta: shopAccess?.canFix ? `Fix all ${shop.open}` : "See the fixes", href: `${base}/seo`, ...(shopAccess?.canFix ? { run: "store-fix" as const } : {}),
      viz: { kind: "counts", items: [{ label: "Search titles", n: shop.title }, { label: "Descriptions", n: shop.description }, { label: "Pictures", n: shop.alt }].filter((x) => x.n > 0) } });
  }
  // Store, against competitors: what the sites Kaviar read do that this one doesn't. (Titles, descriptions and pictures are the fixes above.)
  const gap = (k: string) => bench?.gaps.find((g) => g.key === k), n = bench?.sites ?? 0, them = `competitor${n === 1 ? "" : "s"}`;
  const versus = (g: { you: string; they: string }): Viz => ({ kind: "pair", a: { label: "You", value: g.you }, b: { label: `${n} ${them}`, value: g.they.replace(/^they /, "") } });
  if (gap("reviews")) a.push({ key: "gap-reviews", group: "Store", who: "analyst", title: "Show review stars in Google", why: `${gap("reviews")!.they.replace(" have it", "")} ${them} publish their ratings. Your store doesn’t.`, cta: "See how", href: `${base}/seo`, viz: versus(gap("reviews")!) });
  if (gap("aiOpen")) a.push({ key: "gap-ai", group: "Store", who: "analyst", title: "Let AI assistants read your store", why: `Your store shuts AI crawlers out. ${gap("aiOpen")!.they.replace(" have it", "")} ${them} let them in.`, cta: "See how", href: `${base}/seo`, viz: versus(gap("aiOpen")!) });
  if (gap("facts")) a.push({ key: "gap-facts", group: "Store", who: "analyst", title: "Publish price and stock for Google", why: `${gap("facts")!.they.replace(" have it", "")} ${them} do. Yours can’t be read by machines.`, cta: "See how", href: `${base}/seo`, viz: versus(gap("facts")!) });
  const slow = ["speed", "answer", "code", "apps"].map(gap).find(Boolean);
  if (slow) a.push({ key: "gap-speed", group: "Store", who: "analyst", title: "Your store is slower than competitors", why: `${slow.name}: you ${slow.you}, ${slow.they}.`, cta: "See what slows it", href: `${base}/seo#speed`, viz: versus(slow) });

  // Set up: the inputs that make the numbers real.
  if (d.margin.from === "none") a.push({ key: "margin", group: "Set up", who: "analyst", title: "Tell us your margin", why: "Profit is assuming 60% until you set it.", effect: "Unlocks real profit", cta: "Set it", href: `${base}/plan` });
  const emptyAccount = conns.meta?.status === "connected" && d.metaCampaigns === 0;
  if (!d.history) a.push({ key: "history", group: "Set up", who: "catalog", title: emptyAccount ? "Connect the ad account your ads ran on" : "Bring in your past Meta ads", why: emptyAccount ? "The Meta account connected here has no campaigns in it." : "Without them every number is a scenario, not your results.", effect: "Unlocks forecasts", cta: emptyAccount ? "Change account" : "Connect", href: `${base}/integrations` });
  if (!d.hasResearch) a.push({ key: "research", group: "Set up", who: "analyst", title: "Find your buyer groups", why: "Iris researches who buys and what to say to them.", effect: "Unlocks audiences", cta: "Run research", href: `${base}/research` });

  // Urgent first; then finish what is already in hand (review, test, launch) before deciding and making more.
  const ORDER: Action["group"][] = ["Fix", "Protect", "Plan", "Review", "Test", "Launch", "Decide", "Create", "Improve", "Store", "Set up"];
  const rank = (x: Action) => (x.urgent ? 0 : 100) + ORDER.indexOf(x.group);
  const sorted = a.map((x, i) => ({ x, i })).sort((p, q) => rank(p.x) - rank(q.x) || p.i - q.i).map((p) => p.x); // plans keep the order they were ranked in
  const now = sorted.map((x) => STEP[x.group]).find(Boolean) ?? flow.find((x) => !x.done)?.key ?? "learn";
  const sells = p.rows[0]?.c.product ?? null;
  // The board: the last 30 days against the 30 before, then campaigns, customers and stock, and the store's score.
  const status: Tile[] = [], { prev, cur } = halves(byDay), N = cur.length, t = (k: Parameters<typeof sumOf>[1]) => [sumOf(cur, k), sumOf(prev, k)] as const;
  const [rev, rev0] = t("revenue"), [ord, ord0] = t("orders"), [sp, sp0] = t("spend"), [meta, meta0] = t("meta"), [fresh, fresh0] = t("fresh");
  if (ord || ord0) {
    status.push(
      { kind: "hero", label: "Sales · last 30 days", value: usd(rev), delta: pctDelta(rev, rev0), href: `${base}/shopify`, spark: cur.map((x) => x.revenue),
        points: cur.map((x) => ({ label: new Date(`${x.day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }), text: `${usd(x.revenue)} · ${x.orders} order${x.orders === 1 ? "" : "s"}` })),
        hint: "From Shopify orders, after refunds — against the 30 days before" },
      { label: "Orders", icon: "bag", value: ord.toLocaleString("en-US"), delta: pctDelta(ord, ord0), href: `${base}/shopify`, spark: cur.map((x) => x.orders), chart: "bars", hint: "Paid orders, last 30 days" },
      { label: "Average order", icon: "receipt", value: ord ? usd(rev / ord) : "–", delta: ord && ord0 ? pctDelta(rev / ord, rev0 / ord0) : undefined, href: `${base}/shopify`, spark: rolling(byDay, "revenue", "orders", N), hint: "Sales ÷ orders. The line is each week’s average." });
    if (sp > 0) {
      const margin = d.margin.from === "none" ? null : d.margin.value;
      status.push(
        { label: "Ad spend", icon: "megaphone", value: usd(sp), delta: pctDelta(sp, sp0, null), href: `${base}/performance`, spark: cur.map((x) => x.spend), chart: "bars", hint: "What Meta charged, last 30 days" },
        { label: "Back per $1", icon: "trend-up", value: `${(meta / sp).toFixed(2)}×`, delta: sp0 > 0 && meta0 > 0 ? pctDelta(meta / sp, meta0 / sp0) : undefined, href: `${base}/performance`, spark: rolling(byDay, "meta", "spend", N), hint: "Shopify sales that came from Meta ads ÷ Meta spend" });
      if (margin != null) status.push({ label: "Profit after ads", icon: "chart-bar", value: usd(rev * margin - sp), delta: rev0 * margin - sp0 > 0 ? pctDelta(rev * margin - sp, rev0 * margin - sp0) : undefined, href: `${base}/plan`, spark: cur.map((x) => x.revenue * margin - x.spend), hint: `Sales × your ${Math.round(margin * 100)}% margin − ad spend` });
    } else status.push({ label: "New customers", icon: "user", value: fresh.toLocaleString("en-US"), delta: pctDelta(fresh, fresh0), href: `${base}/shopify?tab=customers`, spark: cur.map((x) => x.fresh), chart: "bars", hint: "People whose first order was in the last 30 days" });
  }
  // The month in the store, each from its own source. A source that fails leaves its block out.
  const [top3, chans, dows, rivals, notes, said] = await Promise.all([
    conns.shopify ? products(brand.id, tz, 30, 3).catch(() => []) : Promise.resolve([]),
    conns.shopify ? channels(brand.id, tz, 30).catch(() => []) : Promise.resolve([]),
    conns.shopify ? db.execute(sql`select extract(isodow from o.created_at at time zone ${tz})::int as d, count(*)::int as n from shop_orders o where o.brand_id = ${brand.id} and not o.test and o.cancelled_at is null and o.created_at >= now() - interval '90 days' group by 1`)
      .then((r) => r.rows as { d: number; n: number }[]).catch(() => []) : Promise.resolve([] as { d: number; n: number }[]),
    rivalAds(brand.id).catch(() => null), getNotes(brand.id).catch(() => null),
    db.execute(sql`select ads_read->'angles'->0->>'name' as name from market_research where brand_id = ${brand.id} and ads_read is not null order by updated_at desc limit 1`).then((r) => (r.rows as { name: string | null }[])[0]?.name ?? null).catch(() => null),
  ]);
  const sold = top3.filter((x) => x.units > 0), soldAll = sum?.revenue ?? 0, chanAll = chans.reduce((k, x) => k + x.revenue, 0), DAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], LONG = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"];
  const week = DAY.map((day, i) => ({ day, orders: dows.find((x) => x.d === i + 1)?.n ?? 0 })), most = Math.max(...week.map((x) => x.orders)), weekAll = week.reduce((k, x) => k + x.orders, 0);
  const more: Today["more"] = {
    note: notes?.overview?.line?.trim() || null,
    sellers: sold.map((x) => ({ title: x.title, image: x.imageUrl, units: x.units, revenue: usd(x.revenue), share: soldAll > 0 ? Math.round((x.revenue / soldAll) * 100) : 0 })),
    channels: chanAll > 0 ? chans.filter((x) => x.revenue > 0).map((x) => ({ name: CHANNEL_LABEL[x.channel] ?? x.channel, color: CHANNEL_COLOR[x.channel] ?? "#8B8883", share: Math.round((x.revenue / chanAll) * 100) })).slice(0, 5) : [],
    week: most > 0 ? week : [], // A day is named only when it clearly stands out: at least a fifth more orders than the average day, on enough orders to mean something.
    bestDay: weekAll >= 10 && most >= (weekAll / 7) * 1.2 ? LONG[week.findIndex((x) => x.orders === most)] : weekAll >= 10 ? "Evenly through the week" : null,
    rivals: rivals?.rows.length ? { ads: rivals.rows.reduce((k, x) => k + x.ads, 0), new30: rivals.rows.reduce((k, x) => k + x.new30, 0), brands: rivals.rows.length, top: said } : null,
  };
  // Yesterday is the last full day: today's row is still filling up.
  const yd = byDay.at(-2), wk = byDay.at(-9);
  const pulse = yd && (yd.orders || wk?.orders) ? { sales: usd(yd.revenue), orders: yd.orders, delta: wk ? pctDelta(yd.revenue, wk.revenue) ?? null : null } : null;
  const waitingPlans = (plans?.list ?? []).filter((x) => x.stage !== "suggested" && x.stage !== "live").length, newPlans = (plans?.list ?? []).filter((x) => x.stage === "suggested").length;
  if (conns.meta || plans?.list.length) status.push({ label: "Campaigns", icon: "megaphone", href: `${base}/campaigns`, hint: "Each plan has a reason, a budget and its own steps",
    value: String(plans?.list.length ?? 0), unit: (plans?.list.length ?? 0) === 1 ? "plan" : "plans",
    sub: [watched.campaigns ? `${watched.campaigns} live` : null, waitingPlans ? `${waitingPlans} under way` : null, newPlans ? `${newPlans} suggested` : null, changes.length ? `${changes.length} to decide` : null].filter(Boolean).join(" · ") || "No reason to advertise today" });
  if (sum && sum.customerOrders > 0) status.push({ label: "Customers", icon: "users", value: `${Math.round((sum.returningOrders / sum.customerOrders) * 100)}%`, unit: "returning", sub: `${sum.newCustomers.toLocaleString("en-US")} new`, href: `${base}/shopify?tab=customers`, hint: "Share of orders from people who had bought before" });
  if (stock?.rows.length) { const need = stock.totals.soon + stock.totals.reorder; status.push({ label: "Inventory", icon: "box", value: String(need), unit: "to reorder", href: `${base}/inventory`, ...(stock.totals.soon ? { tone: "warn" as const } : {}),
    sub: stock.totals.soon ? `${stock.totals.soon} run${stock.totals.soon === 1 ? "s" : ""} out first` : `${stock.totals.over} overstocked`, hint: `Forecast from the last 30 days of orders, against a ${stock.leadDays}-day restock` }); }
  if (audit) {
    // One word on where it stands, naming the score: behind comes first, because that is the one to act on.
    const NAME = { seo: "SEO", ai: "AI search", speed: "speed" } as const, st = Object.entries(bench?.stands ?? {}) as [keyof typeof NAME, { verdict: string }][], sc = scores(audit);
    const at = (v: string) => st.find(([, x]) => x.verdict === v)?.[0];
    status.push({ kind: "score", label: "Store score", value: String(sc.overall), meter: sc.overall, href: `${base}/seo`, hint: "How well Google and AI assistants can find and describe the store, out of 100",
      rivals: bench?.sites ?? 0,
      parts: (() => { const S = bench?.stands ?? {}, vs = (k: "seo" | "ai" | "speed") => (S[k] ? { avg: Math.round(S[k]!.avg), them: (S[k]!.each ?? []).map(Math.round), verdict: S[k]!.verdict } : {});
        const speed = sc.speed != null ? sc.speed : sc.speedChecks.total ? Math.round((sc.speedChecks.ok / sc.speedChecks.total) * 100) : null;
        return [{ label: "SEO", value: String(sc.seo), you: sc.seo, ...vs("seo") }, { label: "AI search", value: String(sc.ai), you: sc.ai, ...vs("ai") },
          { label: "Speed", value: sc.speed != null ? String(sc.speed) : speed != null ? `${speed}%` : "–", you: speed, ...vs("speed") }]; })(),
      ...(st.length ? { tag: at("behind") ? { text: `Behind on ${NAME[at("behind")!]}`, tone: "bad" as const } : at("ahead") ? { text: `Ahead on ${NAME[at("ahead")!]}`, tone: "good" as const } : { text: "Level with competitors", tone: "flat" as const } } : {}) });
  }
  return { status, pulse, more, actions: sorted.slice(0, 4), later: sorted.slice(4), currency, flow, now,
    pilot: { mode: pilot.mode, last: pilot.runs[0] ? ago(new Date(pilot.runs[0].at)) : null, watched, waiting: changes.length, toSwitch },
    store: shop ? { open: shop.open, canFix: Boolean(shopAccess?.canFix) } : null,
    plan: p.rows.length ? { approved, budget, weeks: Math.round(days / 7), lo: lo.revenue, mid: mid.revenue, hi: hi.revenue, profit: mid.profit, campaigns: p.rows.length, level: levelOf(d.history), product: sells, image: d.products.find((x) => x.title === sells)?.image ?? null } : null };
}
