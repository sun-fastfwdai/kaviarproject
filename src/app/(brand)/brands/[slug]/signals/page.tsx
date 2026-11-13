import Link from "next/link";
import { after } from "next/server";
import { getNotes, refreshNotes } from "@/lib/ai/notes";
import { getBrand, getConnections } from "@/lib/queries/brands";
import { signalData } from "@/lib/queries/signals";
import { money, num, pct } from "@/lib/format";
import { Bar } from "@/components/shell/parts";
import { Icon, type IconName } from "@/components/icon";
import { ShopifyLogo, MetaLogo } from "@/components/logos";
import { AgentFace } from "@/components/agent";
import { NeedsSource, SidePanel } from "@/components/ui";
import { SignalsTable, type SignalRow, type Status } from "./table";

export const metadata = { title: "Ad signals" };

export default async function SignalsPage({ params }: PageProps<"/brands/[slug]/signals">) {
  const { slug } = await params;
  const brand = await getBrand(slug);
  const conns = await getConnections(brand.id);
  const crumbs = [{ label: brand.name, href: `/brands/${slug}` }, { label: "Growth" }, { label: "Ad signals" }];
  if (!conns.shopify) return (<><Bar crumbs={crumbs} /><div className="scroll" style={{ padding: 24 }}><NeedsSource slug={slug} provider="shopify" what="ad signals" /></div></>);

  const [d, notes] = await Promise.all([signalData(brand.id, brand.timezone), getNotes(brand.id)]);
  after(() => refreshNotes(brand.id, ["signals"]));
  const base = `/brands/${slug}`;
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

  const rows: SignalRow[] = [
    { group: "Catalog", icon: "box", data: "Products · images · prices · variants", value: `${num(d.catalog.products)} products · ${num(d.catalog.variants)} variants · ${num(d.catalog.withImage)} with images`, use: "Catalog ads and the source for every creative", where: W.products, status: st(d.catalog.products > 0, true),
      evidence: [["Active products", num(d.catalog.products)], ["Variants", num(d.catalog.variants)], ["Products with an image", num(d.catalog.withImage)]] },
    { group: "Catalog", icon: "box", data: "Collections", value: d.types.length ? `${d.types.length} product types · ${d.types.slice(0, 3).map((t) => t.name).join(", ")}` : null, use: "Product sets per campaign", where: W.shop, status: st(d.types.length > 1),
      evidence: d.types.slice(0, 6).map((t) => [t.name, `${num(t.n)} products`]), missing: d.types.length > 1 ? undefined : "Give products a type in Shopify (Product → Type) so Kaviar can build product sets." },
    { group: "Catalog", icon: "box", data: "Inventory", value: d.stock[0] ? d.stock.slice(0, 2).map(stockText).join(" · ") : null, use: "Pause ads before a stock-out; push what’s overstocked", where: W.products, status: st(d.stock.length > 0, true),
      evidence: d.stock.map((x) => [x.title, x.inventory <= 0 ? "Out of stock" : `${num(x.inventory)} left · ~${Math.round(x.daysOfStock)} days`]), why: whyFor("stock", "inventory") },
    { group: "Catalog", icon: "box", data: "Cost per item", value: d.catalog.withCost ? `Average margin ${pct(d.catalog.avgMargin)} across ${num(d.catalog.withCost)} variants` : null, use: "Judge ads on profit, not just revenue", where: W.perf, status: st(d.catalog.withCost > 0),
      evidence: d.catalog.withCost ? [["Variants with a cost", num(d.catalog.withCost)], ["Average margin", pct(d.catalog.avgMargin)]] : [], missing: d.catalog.withCost ? undefined : "Add “Cost per item” on the brand’s variants in Shopify to see profit per ad." },
    { group: "Orders", icon: "receipt", data: "Best-sellers", value: d.best[0] ? `${d.best[0].title}: ${num(d.best[0].units)} sold in 30 days` : null, use: "Which products get ads and new creatives", where: W.products, status: st(d.best.length > 0, true),
      evidence: d.best.map((x) => [x.title, `${num(x.units)} sold · ${money(x.revenue, brand.currency)}`]), why: whyFor("best", "seller") },
    { group: "Orders", icon: "receipt", data: "Bought together", value: d.pair && d.pair.total ? `${d.pair.a} + ${d.pair.b} in ${pct(d.pair.n / d.pair.total, 1)} of orders` : null, use: "Bundle creatives and bundle offers", where: W.shop, status: st(Boolean(d.pair && d.pair.n >= 5)),
      evidence: d.pair ? [[`${d.pair.a} + ${d.pair.b}`, `${num(d.pair.n)} of ${num(d.pair.total)} orders · 90 days`]] : [], missing: d.pair && d.pair.n < 5 ? "Only a few orders so far — Kaviar needs at least 5 shared orders before it trusts a bundle." : undefined, why: whyFor("bundle", "together") },
    { group: "Orders", icon: "receipt", data: "UTMs on orders", value: `${num(d.orders.metaOrders)} of ${num(d.orders.orders)} orders came from Meta in 30 days`, use: "True ROAS per campaign and per ad", where: W.perf, status: st(d.orders.metaOrders > 0, true),
      evidence: [["Orders · 30 days", num(d.orders.orders)], ["Tagged as Meta", num(d.orders.metaOrders)]], missing: d.orders.metaOrders ? undefined : "No orders carry Meta UTMs yet. Paste Kaviar’s URL parameters into every Meta ad (Data sync → Tag every Meta ad)." },
    { group: "Orders", icon: "receipt", data: "Purchases → Conversions API", value: `${num(d.orders.orders)} purchases with order value in 30 days`, use: "Stronger optimisation signal for Meta", where: W.sync, status: st(d.orders.orders > 0),
      evidence: [["Purchases · 30 days", num(d.orders.orders)]], missing: "Sending purchases to Meta’s Conversions API comes with Run ads. The data is ready." },
    { group: "Orders", icon: "receipt", data: "Refunds", value: d.refunds.orders ? `${pct(d.refunds.refunded / d.refunds.orders, 1)} of orders refunded in 30 days` : null, use: "Keep high-refund products out of ads", where: W.shop, status: st(d.refunds.orders > 0),
      evidence: [["Refunded orders · 30 days", `${num(d.refunds.refunded)} of ${num(d.refunds.orders)}`]] },
    { group: "Orders", icon: "receipt", data: "Discount codes", value: d.code ? `${d.code.code} on ${pct(d.orders.firstOrders ? d.code.n / d.orders.firstOrders : 0)} of first orders` : null, use: "Which offer to feature in the ad", where: W.shop, status: st(Boolean(d.code)),
      evidence: d.code ? [[d.code.code, `${num(d.code.n)} orders · 30 days`]] : [], missing: d.code ? undefined : "No discount codes used in the last 30 days." },
    { group: "Customers", icon: "users", data: "Consented emails (hashed)", value: `${num(c.consented)} of ${num(c.total)} customers`, use: "Custom audiences: retarget, exclude recent buyers", where: W.meta, status: st(c.consented > 0),
      evidence: [["All customers", num(c.total)], ["Consented to marketing", num(c.consented)], ["Bought in the last 30 days (exclude)", num(c.recent)]] },
    { group: "Customers", icon: "users", data: "Top 10% by value", value: c.top10 ? `${num(c.top10)} customers = ${pct(c.top10Share)} of revenue` : null, use: "Seed for lookalike prospecting", where: W.meta, status: st(c.top10 > 0),
      evidence: [["Customers", num(c.top10)], ["Share of revenue", pct(c.top10Share)]], why: whyFor("lookalike", "top") },
    { group: "Customers", icon: "users", data: "Reorder timing", value: d.reorder.medianDays ? `Second order comes ~${Math.round(d.reorder.medianDays)} days after the first` : null, use: "Replenishment ads on the right day", where: W.perf, status: st(Boolean(d.reorder.medianDays)),
      evidence: d.reorder.medianDays ? [["Median days to 2nd order", `${Math.round(d.reorder.medianDays)} days`], ["Repeat buyers", num(c.repeat)]] : [], why: whyFor("reorder", "replenish") },
    { group: "Customers", icon: "users", data: "Lapsed buyers", value: `${num(d.lapsed.lapsed)} bought 60–180 days ago, not since`, use: "Win-back ads with a “we miss you” angle", where: W.meta, status: st(d.lapsed.lapsed > 0),
      evidence: [["Lapsed · 60–180 days", num(d.lapsed.lapsed)]], why: whyFor("lapsed", "win-back") },
    { group: "Customers", icon: "users", data: "Repeat buyers", value: `${num(c.repeat)} customers ordered 2+ times`, use: "Retarget with launches and refills", where: W.meta, status: st(c.repeat > 0),
      evidence: [["Repeat buyers", num(c.repeat)], ["Share of customers", pct(c.total ? c.repeat / c.total : 0)]], why: whyFor("repeat") },
    { group: "Content", icon: "file", data: "Descriptions & brand story", value: profile?.tagline?.value ? `“${profile.tagline.value}” · tone: ${profile.tone?.value ?? "—"}` : null, use: "Ad copy in the brand’s own words", where: W.shop, status: st(Boolean(profile?.tagline?.value), true),
      evidence: profile ? Object.entries(profile).slice(0, 5).map(([k, v]) => [k, v.value.slice(0, 60)]) : [], missing: profile ? undefined : "Iris builds the brand profile during New brand onboarding. Brands added before it have none yet." },
    { group: "Behaviour", icon: "activity", data: "Views · add to cart (pixel)", value: null, use: "Retarget viewers and cart abandoners", where: W.meta, status: "needs-data",
      evidence: [], missing: "Kaviar doesn’t read the Meta pixel’s events yet. Retargeting audiences can be built in Ads Manager meanwhile." },
    { group: "Apps", icon: "plug", data: "Reviews · Judge.me", value: null, use: "Social-proof lines and customer quotes", where: ["Connect Judge.me", `${base}/integrations`, "plug"], status: "needs-app",
      evidence: [], missing: "Needs the Judge.me app connected to Kaviar — not available yet." },
    { group: "Apps", icon: "plug", data: "Subscriptions · Recharge", value: null, use: "Subscription-offer creatives", where: ["Connect Recharge", `${base}/integrations`, "plug"], status: "needs-app",
      evidence: [], missing: "Needs the Recharge app connected to Kaviar — not available yet." },
  ];
  const count = (x: Status) => rows.filter((r) => r.status === x).length;
  const ready = count("ready");

  const aud: [string, number, string?][] = [
    ["All customers", c.total], ["Consented to marketing", c.consented], ["Recent buyers · 30 days", c.recent, "Exclude"],
    ["Top 10% by value", c.top10, "Seed"], ["Repeat buyers", c.repeat, "Retarget"], ["Lapsed · 60–180 days", d.lapsed.lapsed, "Win-back"],
  ];

  return (
    <>
      <Bar crumbs={crumbs}>
        <span className="row g8 xs" style={{ padding: "4px 10px", border: "1px solid var(--line)", borderRadius: 99 }}>
          <span className="row g2">{[0, 1, 2, 3, 4].map((i) => <i key={i} style={{ width: i ? 6 : 14, height: 6, borderRadius: 99, background: i ? "var(--line-2)" : "var(--ink)" }} />)}</span>
          <span className="i3">Step 1 of 5</span><b className="w5 i1">Find what the store data says</b>
        </span>
        <span className="row g6 xs i3"><ShopifyLogo size={12} />synced Shopify data</span>
        <Link className="btn sm" href={`${base}/shopify`}><Icon name="bag" size={14} />Shopify data</Link>
      </Bar>
      <div className="row fill stretch" style={{ minHeight: 0 }}>
        <section className="scroll col" style={{ padding: "22px 24px", gap: 16 }}>
          <div className="row between" style={{ alignItems: "flex-end" }}>
            <div className="col g4"><h1 className="h1">Ad signals</h1><p className="sm i3">Every piece of Shopify data, turned into something an ad can use.</p></div>
            <div className="row">
              <div className="kpi"><span className="v">{rows.length}</span><span className="xs i3">signals</span></div>
              <div className="kpi"><span className="v">{count("in-use")}</span><span className="xs i3 row g4"><span className="dot green" />in use</span></div>
              <div className="kpi"><span className="v">{ready}</span><span className="xs i3 row g4"><span className="dot blue" />ready</span></div>
              <div className="kpi"><span className="v">{count("needs-data") + count("needs-app")}</span><span className="xs i3 row g4"><span className="dot amber" />need data or app</span></div>
            </div>
          </div>
          <SignalsTable slug={slug} rows={rows} />
          <span className="xs i3">Click a signal to see the data behind it and have Remy write an ad from it.</span>
        </section>
        <SidePanel>
          <div className="col g8" style={{ padding: "14px", background: "#fff", border: "1px solid var(--line)", borderRadius: 12 }}>
            <div className="row g8"><AgentFace kind="catalog" size={22} mood="happy" /><div className="col fill"><span className="sm w5">Audiences from Shopify</span><span className="xs i3">built by Cleo</span></div><MetaLogo size={14} /></div>
            {aud.map(([label, n, tag]) => (
              <div key={label} className="col g4" style={{ paddingTop: 6 }}>
                <div className="row between"><span className="sm i1">{label}</span><span className="row g6">{tag && <span className="pill" style={{ height: 20, fontSize: 11 }}>{tag}</span>}<span className="sm w5 tnum">{num(n)}</span></span></div>
                <div className="prog"><div className="v" style={{ width: `${c.total ? Math.min(100, (n / c.total) * 100) : 0}%` }} /></div>
              </div>
            ))}
            <span className="row g6 xs i3" style={{ paddingTop: 6 }}><Icon name="lock" size={12} />Counts only. Contact details stay in Shopify.</span>
          </div>
          <div className="col g6" style={{ padding: "12px 14px", background: "#fff", border: "1px solid var(--line)", borderRadius: 12 }}>
            <div className="row g8"><AgentFace kind="analyst" size={20} mood="up" /><span className="sm w5">{notes.signals?.title ?? `${ready} signals are ready but unused`}</span></div>
            {notes.signals ? <span className="xs i2" style={{ lineHeight: "17px" }}>{notes.signals.body}</span> : <span className="xs i2" style={{ lineHeight: "17px" }}>
              Biggest wins: <b className="w5 i1">lapsed buyers ({num(d.lapsed.lapsed)})</b> for win-back ads{d.reorder.medianDays ? <>, and <b className="w5 i1">reorder timing</b> — replenishment ads around day {Math.round(d.reorder.medianDays)}</> : null}.
            </span>}
          </div>
          <div className="col g8" style={{ padding: "12px 14px", background: "#fff", border: "1px solid var(--line)", borderRadius: 12 }}>
            <span className="sm w5">Who uses these</span>
            {([["analyst", "Iris", "reads every signal and ranks what to use next"], ["builder", "Remy", "turns signals into angles, offers and creatives"], ["catalog", "Cleo", "keeps catalog, product sets and audiences in sync"]] as const).map(([k, n, t]) => (
              <div key={k} className="row top g8"><AgentFace kind={k} size={18} /><span className="xs i2" style={{ lineHeight: "17px" }}><b className="w5 i1">{n}</b> {t}</span></div>
            ))}
          </div>
        </SidePanel>
      </div>
    </>
  );
}
