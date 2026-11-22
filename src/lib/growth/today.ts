import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { levelOf, plan, ratesFrom, type Plan } from "./plan";
import { flowState, type FlowKey, type FlowStep } from "./flow";
import { getPilot, watching } from "./autopilot";
import type { Mode, Run } from "./pilot";
import { ago } from "../format";
import { planData, type PlanData } from "./plan-data";
import { currentAudit, getStore, storeWaiting } from "../seo/run";
import { benchGaps } from "../seo/bench";
import { scores } from "../seo/types";
import { summary, trend } from "../queries/growth";
import { getStock } from "../store/stock";
import { paceText } from "../store/stock-rules";
import { halves, pctDelta, rolling, sumOf, type Tile } from "./trend";
export type { Tile } from "./trend";
import { storeAccess } from "../seo/apply";

/**
 * Today: the few things that need the brand, worked out from everything Kaviar holds — connections, stock, the spend plan, ads waiting
 * for review or testing, and this week's proposed changes. Each is one decision with one reason and, where the plan can size it,
 * what it should bring. Code decides and counts; nothing here is written by a model.
 */
export type Who = "analyst" | "builder" | "qa" | "catalog";
export type Action = { thumbs?: string[]; key: string; group: "Fix" | "Protect" | "Decide" | "Create" | "Review" | "Test" | "Launch" | "Improve" | "Store" | "Set up"; who: Who; title: string; why: string; effect?: string; cta: string; href?: string; make?: string; run?: "store-fix"; urgent?: boolean; viz?: Viz }; // run: done right here on Today, without leaving the page
/** What a card shows between its headline and its button: the evidence, as a picture rather than a sentence. */
export type Viz =
  | { kind: "bars"; rows: { label: string; value: number; text: string; tone: "warn" | "calm" }[] } // stock cover against restock time
  | { kind: "flow"; from: string; fromLabel: string; to: string; toLabel: string } // money in → money back, or before → after
  | { kind: "pair"; a: { label: string; value: string }; b: { label: string; value: string } } // you against them
  | { kind: "counts"; items: { label: string; n: number }[] };
export type Today = {
  status: Tile[]; // the board: the last 30 days against the 30 before, then campaigns, customers, stock and the store's score — a block each
  actions: Action[]; later: Action[]; currency: string;
  plan: { approved: boolean; budget: number; weeks: number; lo: number; mid: number; hi: number; profit: number; campaigns: number; level: 0 | 1 | 2; product: string | null; image: string | null } | null;
  flow: FlowStep[]; now: FlowKey; // the six steps and which one the top action belongs to
  pilot: { mode: Mode; last: string | null; watched: Run["watched"]; waiting: number; toSwitch: number };
  store: { open: number; canFix: boolean } | null; // fixes waiting on the Shopify store itself (SEO & AI search)
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

export async function today(brand: { id: string; currency: string | null; timezone?: string | null }, slug: string, conns: { shopify?: { status: string } | null; meta?: { status: string } | null }): Promise<Today> {
  const base = `/brands/${slug}`, currency = brand.currency ?? "USD";
  const usd = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(Math.round(v));
  const B = schema.adBatches;
  const tz = brand.timezone ?? "UTC";
  const [sum, byDay, stock, audit, bench] = await Promise.all([
    summary(brand.id, tz, 30).catch(() => null), trend(brand.id, tz, 30).catch(() => []), conns.shopify ? getStock(brand.id, tz).catch(() => null) : Promise.resolve(null),
    getStore(brand.id).then((x) => currentAudit(brand.id, x.audit)).catch(() => null), benchGaps(brand.id).catch(() => null),
  ]);
  const [flow, pilot, watched, shop, shopAccess, toSwitch, pics, d, batches, tested, changes] = await Promise.all([
    flowState(brand.id), getPilot(brand.id), watching(brand.id), storeWaiting(brand.id).catch(() => null), storeAccess(brand.id).catch(() => null),
    db.execute(sql`select count(*)::int as n from optimize_changes where brand_id = ${brand.id} and status = 'approved'`).then((r) => (r.rows as { n: number }[])[0]?.n ?? 0).catch(() => 0),
    // The pictures behind the ads that are waiting — the brand's own photos only: where an ad's picture was AI-made, its product's Shopify photo stands in.
    db.execute(sql`select * from (select a.batch_id as batch, a.status, coalesce(case when ai.id is null then a.image_url end, (select sp.image_url from shop_products sp where sp.brand_id = a.brand_id and sp.title = a.product and sp.image_url is not null limit 1)) as url, b.created_at, a.position from ads a join ad_batches b on b.id = a.batch_id left join brand_assets ai on a.image_url = '/api/assets/' || ai.id::text and coalesce((ai.meta->>'ai')::boolean, false) where b.brand_id = ${brand.id} and a.status in ('review', 'approved')) x where x.url is not null order by x.created_at desc, x.position limit 120`)
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

  // Protect: stock decides what ads may sell. From the forecast — what runs out before a restock could arrive, soonest first.
  const nice = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "");
  for (const r of (stock?.rows ?? []).filter((x) => x.pace > 0 && !x.ordered && (x.state === "out" || x.state === "risk" || x.state === "low")).slice(0, 2)) {
    const left = Math.floor(r.runway ?? 0);
    a.push({ key: `stock:${r.id}`, group: "Protect", who: "qa", title: r.state === "out" ? `${r.title} is sold out` : `${r.title} runs out in ${left} day${left === 1 ? "" : "s"}`,
      why: `${r.inventory.toLocaleString("en-US")} left · sells ${paceText(r.pace)} a day`, effect: r.gap > 0 ? `${r.gap} day${r.gap === 1 ? "" : "s"} with nothing to sell` : `Order by ${nice(r.reorderBy)}`,
      cta: "Restock", href: `${base}/inventory?restock=${r.id}`, urgent: r.state !== "low",
      viz: { kind: "bars", rows: [{ label: "Stock lasts", value: left, text: `${left} day${left === 1 ? "" : "s"}`, tone: "warn" }, { label: "A restock takes", value: stock!.leadDays, text: `${stock!.leadDays} days`, tone: "calm" }] } });
  }

  // Decide: the plan itself.
  if (!approved && p.rows.length) a.push({ key: "plan", group: "Decide", who: "analyst", title: `Approve your ${usd(budget)} spend plan`, why: `${p.rows.length} campaign${p.rows.length === 1 ? "" : "s"} over ${Math.round(days / 7)} weeks, sized so each gives a result you can read.`, effect: `Likely ${usd(mid.revenue)} back`, cta: "Open plan", href: `${base}/plan`,
    viz: { kind: "flow", from: usd(budget), fromLabel: "you spend", to: usd(mid.revenue), toLabel: `likely back in ${Math.round(days / 7)} weeks` } });

  // Create → Review → Test → Launch, campaign by campaign.
  const forSignal = (sig: string | null) => (sig ? batches.find((b) => b.signal === sig) : undefined);
  if (approved) for (const r of p.rows) if (!forSignal(r.c.signal)) a.push({ key: `make:${r.c.key}`, group: "Create", who: "builder", title: `Make the ads for ${r.c.name}`, why: `${usd(r.spend)} of the plan goes here. Remy writes six and shoots them with your product.`, effect: `${Math.round(r.out[1].orders)} orders likely`, cta: "Make the ads", make: r.c.key,
    viz: { kind: "flow", from: usd(r.spend), fromLabel: "of your budget", to: usd(r.out[1].revenue), toLabel: "likely back" } });
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
  const ORDER: Action["group"][] = ["Fix", "Protect", "Review", "Test", "Launch", "Decide", "Create", "Improve", "Store", "Set up"];
  const rank = (x: Action) => (x.urgent ? 0 : 100) + ORDER.indexOf(x.group);
  const pic = (status: string, batch?: string) => [...new Set(pics.filter((x) => x.status === status && (!batch || x.batch === batch)).map((x) => x.url))].slice(0, 5);
  for (const x of a) {
    if (x.group === "Review") x.thumbs = pic("review", x.key.startsWith("review:") ? x.key.slice(7) : undefined);
    if (x.group === "Test" || x.group === "Launch") x.thumbs = pic("approved", x.key.split(":")[1]);
    // No picture to show: the count, so the card still says what is waiting.
    if (x.group === "Review" && !x.thumbs?.length) x.viz = { kind: "counts", items: [{ label: "Ads to review", n: ads }, { label: toReview.length === 1 ? "Batch" : "Batches", n: toReview.length }] };
    if (x.group === "Test" && !x.thumbs?.length && toTest[0]) x.viz = { kind: "counts", items: [{ label: "Approved ads", n: toTest[0].approved }, { label: "Batches to test", n: toTest.length }] };
    if (x.group === "Launch" && !x.thumbs?.length && toLaunch[0]) x.viz = { kind: "counts", items: [{ label: "Ads ready", n: toLaunch[0].approved }, { label: "Tested batches", n: toLaunch.length }] };
  }
  const sorted = [...a].sort((x, y) => rank(x) - rank(y));
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
  const waitingAds = batches.reduce((k, x) => k + x.review, 0);
  if (conns.meta || batches.length) status.push({ label: "Campaigns", icon: "megaphone", href: `${base}/campaigns`, hint: "Everything about your ads, in one place",
    ...(waitingAds ? { value: String(waitingAds), unit: "to review" } : { value: String(watched.campaigns), unit: "live" }),
    sub: [waitingAds ? `${watched.campaigns} live` : null, changes.length ? `${changes.length} to decide` : null].filter(Boolean).join(" · ") || (watched.campaigns ? `${watched.ads} ads running` : "None running yet") });
  if (sum && sum.customerOrders > 0) status.push({ label: "Customers", icon: "users", value: `${Math.round((sum.returningOrders / sum.customerOrders) * 100)}%`, unit: "returning", sub: `${sum.newCustomers.toLocaleString("en-US")} new`, href: `${base}/shopify?tab=customers`, hint: "Share of orders from people who had bought before" });
  if (stock?.rows.length) { const need = stock.totals.soon + stock.totals.reorder; status.push({ label: "Inventory", icon: "box", value: String(need), unit: "to reorder", href: `${base}/inventory`, ...(stock.totals.soon ? { tone: "warn" as const } : {}),
    sub: stock.totals.soon ? `${stock.totals.soon} run${stock.totals.soon === 1 ? "s" : ""} out first` : `${stock.totals.over} overstocked`, hint: `Forecast from the last 30 days of orders, against a ${stock.leadDays}-day restock` }); }
  if (audit) {
    // One word on where it stands, naming the score: behind comes first, because that is the one to act on.
    const NAME = { seo: "SEO", ai: "AI search", speed: "speed" } as const, st = Object.entries(bench?.stands ?? {}) as [keyof typeof NAME, { verdict: string }][], sc = scores(audit);
    const at = (v: string) => st.find(([, x]) => x.verdict === v)?.[0];
    status.push({ kind: "score", label: "Store score", value: String(sc.overall), meter: sc.overall, href: `${base}/seo`, hint: "How well Google and AI assistants can find and describe the store, out of 100",
      parts: [{ label: "SEO", value: String(sc.seo) }, { label: "AI search", value: String(sc.ai) }, { label: "Speed", value: sc.speed != null ? String(sc.speed) : sc.speedChecks.total ? `${sc.speedChecks.ok}/${sc.speedChecks.total}` : "–" }],
      ...(st.length ? { tag: at("behind") ? { text: `Behind on ${NAME[at("behind")!]}`, tone: "bad" as const } : at("ahead") ? { text: `Ahead on ${NAME[at("ahead")!]}`, tone: "good" as const } : { text: "Level with competitors", tone: "flat" as const } } : {}) });
  }
  return { status, actions: sorted.slice(0, 4), later: sorted.slice(4), currency, flow, now,
    pilot: { mode: pilot.mode, last: pilot.runs[0] ? ago(new Date(pilot.runs[0].at)) : null, watched, waiting: changes.length, toSwitch },
    store: shop ? { open: shop.open, canFix: Boolean(shopAccess?.canFix) } : null,
    plan: p.rows.length ? { approved, budget, weeks: Math.round(days / 7), lo: lo.revenue, mid: mid.revenue, hi: hi.revenue, profit: mid.profit, campaigns: p.rows.length, level: levelOf(d.history), product: sells, image: d.products.find((x) => x.title === sells)?.image ?? null } : null };
}
