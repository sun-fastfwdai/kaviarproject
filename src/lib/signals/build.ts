import "server-only";
import type { IconName } from "@/components/icon";
import { money, num, pct } from "../format";
import type { signalData } from "../queries/signals";
import type { Notes } from "../ai/notes";
import type { Profile } from "../onboarding/types";

export type Status = "in-use" | "ready" | "needs-data" | "needs-app";
export type SignalRow = {
  key: string; group: string; icon: IconName; data: string; value: string | null; use: string;
  where: [string, string, IconName]; status: Status; evidence: [string, string][];
  missing?: string; why?: string;
};

/** Every ad signal for a brand, with the store data behind it. Shared by Ad signals, each signal's page and Creative studio. */
export function buildSignals(base: string, brand: { currency: string; onboarding: { profile?: Profile } | null }, d: Awaited<ReturnType<typeof signalData>>, notes: Notes): SignalRow[] {
  const c = d.customers;
  const W = {
    products: ["Products", `${base}/shopify?tab=products`, "box"], shop: ["Shopify data", `${base}/shopify`, "bag"], perf: ["Performance", `${base}/performance`, "chart-bar"],
    meta: ["Meta Ads", `${base}/meta`, "megaphone"], sync: ["Data sync", `${base}/sync`, "database"], signals: ["Integrations", `${base}/integrations`, "plug"],
  } satisfies Record<string, [string, string, IconName]>;
  const stockText = (x: { title: string; inventory: number; daysOfStock: number }) => x.inventory <= 0 ? `${x.title}: out of stock` : `${x.title}: ${num(x.inventory)} left (~${Math.round(x.daysOfStock)} days)`;
  const ranked = notes.signals?.ranked ?? [];
  const whyFor = (...words: string[]) => ranked.find((r) => words.some((w) => r.signal.toLowerCase().includes(w)))?.why;
  const profile = brand.onboarding?.profile;
  const st = (ok: boolean, inUse = false): Status => (ok ? (inUse ? "in-use" : "ready") : "needs-data");

  return [
    { key: "catalog", group: "Catalog", icon: "box", data: "Products · images · prices · variants", value: `${num(d.catalog.products)} products · ${num(d.catalog.variants)} variants · ${num(d.catalog.withImage)} with images`, use: "Catalog ads and the source for every creative", where: W.products, status: st(d.catalog.products > 0, true),
      evidence: [["Active products", num(d.catalog.products)], ["Variants", num(d.catalog.variants)], ["Products with an image", num(d.catalog.withImage)]] },
    { key: "collections", group: "Catalog", icon: "box", data: "Collections", value: d.types.length ? `${d.types.length} product types · ${d.types.slice(0, 3).map((t) => t.name).join(", ")}` : null, use: "Product sets per campaign", where: W.shop, status: st(d.types.length > 1),
      evidence: d.types.slice(0, 6).map((t) => [t.name, `${num(t.n)} products`]), missing: d.types.length > 1 ? undefined : "Give products a type in Shopify (Product → Type) so Kaviar can build product sets." },
    { key: "inventory", group: "Catalog", icon: "box", data: "Inventory", value: d.stock[0] ? d.stock.slice(0, 2).map(stockText).join(" · ") : null, use: "Pause ads before a stock-out; push what’s overstocked", where: W.products, status: st(d.stock.length > 0, true),
      evidence: d.stock.map((x) => [x.title, x.inventory <= 0 ? "Out of stock" : `${num(x.inventory)} left · ~${Math.round(x.daysOfStock)} days`]), why: whyFor("stock", "inventory") },
    { key: "cost", group: "Catalog", icon: "box", data: "Cost per item", value: d.catalog.withCost ? `Average margin ${pct(d.catalog.avgMargin)} across ${num(d.catalog.withCost)} variants` : null, use: "Judge ads on profit, not just revenue", where: W.perf, status: st(d.catalog.withCost > 0),
      evidence: d.catalog.withCost ? [["Variants with a cost", num(d.catalog.withCost)], ["Average margin", pct(d.catalog.avgMargin)]] : [], missing: d.catalog.withCost ? undefined : "Add “Cost per item” on the brand’s variants in Shopify to see profit per ad." },
    { key: "best-sellers", group: "Orders", icon: "receipt", data: "Best-sellers", value: d.best[0] ? `${d.best[0].title}: ${num(d.best[0].units)} sold in 30 days` : null, use: "Which products get ads and new creatives", where: W.products, status: st(d.best.length > 0, true),
      evidence: d.best.map((x) => [x.title, `${num(x.units)} sold · ${money(x.revenue, brand.currency)}`]), why: whyFor("best", "seller") },
    { key: "bundles", group: "Orders", icon: "receipt", data: "Bought together", value: d.pair && d.pair.total ? `${d.pair.a} + ${d.pair.b} in ${pct(d.pair.n / d.pair.total, 1)} of orders` : null, use: "Bundle creatives and bundle offers", where: W.shop, status: st(Boolean(d.pair && d.pair.n >= 5)),
      evidence: d.pair ? [[`${d.pair.a} + ${d.pair.b}`, `${num(d.pair.n)} of ${num(d.pair.total)} orders · 90 days`]] : [], missing: d.pair && d.pair.n < 5 ? "Only a few orders so far — Kaviar needs at least 5 shared orders before it trusts a bundle." : undefined, why: whyFor("bundle", "together") },
    { key: "utms", group: "Orders", icon: "receipt", data: "UTMs on orders", value: `${num(d.orders.metaOrders)} of ${num(d.orders.orders)} orders came from Meta in 30 days`, use: "True ROAS per campaign and per ad", where: W.perf, status: st(d.orders.metaOrders > 0, true),
      evidence: [["Orders · 30 days", num(d.orders.orders)], ["Tagged as Meta", num(d.orders.metaOrders)]], missing: d.orders.metaOrders ? undefined : "No orders carry Meta UTMs yet. Paste Kaviar’s URL parameters into every Meta ad (Data sync → Tag every Meta ad)." },
    { key: "conversions", group: "Orders", icon: "receipt", data: "Purchases → Conversions API", value: `${num(d.orders.orders)} purchases with order value in 30 days`, use: "Stronger optimisation signal for Meta", where: W.sync, status: st(d.orders.orders > 0),
      evidence: [["Purchases · 30 days", num(d.orders.orders)]], missing: "Sending purchases to Meta’s Conversions API comes with Run ads. The data is ready." },
    { key: "refunds", group: "Orders", icon: "receipt", data: "Refunds", value: d.refunds.orders ? `${pct(d.refunds.refunded / d.refunds.orders, 1)} of orders refunded in 30 days` : null, use: "Keep high-refund products out of ads", where: W.shop, status: st(d.refunds.orders > 0),
      evidence: [["Refunded orders · 30 days", `${num(d.refunds.refunded)} of ${num(d.refunds.orders)}`]] },
    { key: "discounts", group: "Orders", icon: "receipt", data: "Discount codes", value: d.code ? `${d.code.code} on ${pct(d.orders.firstOrders ? d.code.n / d.orders.firstOrders : 0)} of first orders` : null, use: "Which offer to feature in the ad", where: W.shop, status: st(Boolean(d.code)),
      evidence: d.code ? [[d.code.code, `${num(d.code.n)} orders · 30 days`]] : [], missing: d.code ? undefined : "No discount codes used in the last 30 days." },
    { key: "consented", group: "Customers", icon: "users", data: "Consented emails (hashed)", value: `${num(c.consented)} of ${num(c.total)} customers`, use: "Custom audiences: retarget, exclude recent buyers", where: W.meta, status: st(c.consented > 0),
      evidence: [["All customers", num(c.total)], ["Consented to marketing", num(c.consented)], ["Bought in the last 30 days (exclude)", num(c.recent)]] },
    { key: "top-customers", group: "Customers", icon: "users", data: "Top 10% by value", value: c.top10 ? `${num(c.top10)} customers = ${pct(c.top10Share)} of revenue` : null, use: "Seed for lookalike prospecting", where: W.meta, status: st(c.top10 > 0),
      evidence: [["Customers", num(c.top10)], ["Share of revenue", pct(c.top10Share)]], why: whyFor("lookalike", "top") },
    { key: "reorder", group: "Customers", icon: "users", data: "Reorder timing", value: d.reorder.medianDays ? `Second order comes ~${Math.round(d.reorder.medianDays)} days after the first` : null, use: "Replenishment ads on the right day", where: W.perf, status: st(Boolean(d.reorder.medianDays)),
      evidence: d.reorder.medianDays ? [["Median days to 2nd order", `${Math.round(d.reorder.medianDays)} days`], ["Repeat buyers", num(c.repeat)]] : [], why: whyFor("reorder", "replenish") },
    { key: "lapsed", group: "Customers", icon: "users", data: "Lapsed buyers", value: `${num(d.lapsed.lapsed)} bought 60–180 days ago, not since`, use: "Win-back ads with a “we miss you” angle", where: W.meta, status: st(d.lapsed.lapsed > 0),
      evidence: [["Lapsed · 60–180 days", num(d.lapsed.lapsed)]], why: whyFor("lapsed", "win-back") },
    { key: "repeat", group: "Customers", icon: "users", data: "Repeat buyers", value: `${num(c.repeat)} customers ordered 2+ times`, use: "Retarget with launches and refills", where: W.meta, status: st(c.repeat > 0),
      evidence: [["Repeat buyers", num(c.repeat)], ["Share of customers", pct(c.total ? c.repeat / c.total : 0)]], why: whyFor("repeat") },
    { key: "brand-story", group: "Content", icon: "file", data: "Descriptions & brand story", value: profile?.tagline?.value ? `“${profile.tagline.value}” · tone: ${profile.tone?.value ?? "—"}` : null, use: "Ad copy in the brand’s own words", where: W.shop, status: st(Boolean(profile?.tagline?.value), true),
      evidence: profile ? Object.entries(profile).slice(0, 5).map(([k, v]) => [k, v.value.slice(0, 60)]) : [], missing: profile ? undefined : "Iris builds the brand profile during New brand onboarding. Brands added before it have none yet." },
    { key: "pixel", group: "Behaviour", icon: "activity", data: "Views · add to cart (pixel)", value: null, use: "Retarget viewers and cart abandoners", where: W.meta, status: "needs-data",
      evidence: [], missing: "Kaviar doesn’t read the Meta pixel’s events yet. Retargeting audiences can be built in Ads Manager meanwhile." },
    { key: "reviews", group: "Apps", icon: "plug", data: "Reviews · Judge.me", value: null, use: "Social-proof lines and customer quotes", where: ["Connect Judge.me", `${base}/integrations`, "plug"], status: "needs-app",
      evidence: [], missing: "Needs the Judge.me app connected to Kaviar — not available yet." },
    { key: "subscriptions", group: "Apps", icon: "plug", data: "Subscriptions · Recharge", value: null, use: "Subscription-offer creatives", where: ["Connect Recharge", `${base}/integrations`, "plug"], status: "needs-app",
      evidence: [], missing: "Needs the Recharge app connected to Kaviar — not available yet." },
  ];
}
