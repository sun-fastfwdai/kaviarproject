import Link from "next/link";
import { getBrand, getConnections } from "@/lib/queries/brands";
import { signalData } from "@/lib/queries/signals";
import { num, pct } from "@/lib/format";
import { Bar } from "@/components/shell/parts";
import { Icon, type IconName } from "@/components/icon";
import { ShopifyLogo, MetaLogo } from "@/components/logos";
import { AgentFace } from "@/components/agent";
import { NeedsSource, SidePanel } from "@/components/ui";

export const metadata = { title: "Ad signals" };

type Signal = { data: string; value: string | null; use: string; where: [string, string]; ready: boolean };

export default async function SignalsPage({ params }: PageProps<"/brands/[slug]/signals">) {
  const { slug } = await params;
  const brand = await getBrand(slug);
  const conns = await getConnections(brand.id);
  const crumbs = [{ label: brand.name, href: `/brands/${slug}` }, { label: "Growth" }, { label: "Ad signals" }];
  if (!conns.shopify) return (<><Bar crumbs={crumbs} /><div className="scroll" style={{ padding: 24 }}><NeedsSource slug={slug} provider="shopify" what="ad signals" /></div></>);

  const d = await signalData(brand.id, brand.timezone);
  const base = `/brands/${slug}`;
  const shop: [string, string] = ["Shopify data", `${base}/shopify`];
  const products: [string, string] = ["Products", `${base}/shopify?tab=products`];
  const perf: [string, string] = ["Performance", `${base}/performance`];
  const metaW: [string, string] = ["Meta Ads", `${base}/meta`];
  const c = d.customers;

  const groups: [string, IconName, Signal[]][] = [
    ["Catalog", "box", [
      { data: "Products · prices · variants", value: `${num(d.catalog.products)} products · ${num(d.catalog.variants)} variants · ${num(d.catalog.withImage)} with images`, use: "The source for every creative and for catalog ads", where: products, ready: d.catalog.products > 0 },
      { data: "Inventory", value: d.stock[0] ? d.stock.slice(0, 2).map((x) => `${x.title}: ${num(x.inventory)} left (~${Math.max(0, Math.round(x.daysOfStock))} days)`).join(" · ") : null, use: "Pause ads before a stock-out; push what’s overstocked", where: products, ready: d.stock.length > 0 },
      { data: "Cost per item", value: d.catalog.withCost ? `Average margin ${pct(d.catalog.avgMargin)} across ${num(d.catalog.withCost)} variants` : null, use: "Judge ads on profit, not just revenue", where: products, ready: d.catalog.withCost > 0 },
    ]],
    ["Orders", "receipt", [
      { data: "Best-sellers", value: d.best[0] ? `${d.best[0].title}: ${num(d.best[0].units)} sold in 30 days` : null, use: "Which products get ads and new creatives", where: products, ready: d.best.length > 0 },
      { data: "Bought together", value: d.pair && d.pair.total ? `${d.pair.a} + ${d.pair.b} in ${pct(d.pair.n / d.pair.total, 1)} of orders` : null, use: "Bundle creatives and bundle offers", where: shop, ready: Boolean(d.pair && d.pair.n >= 5) },
      { data: "UTMs on orders", value: `${num(d.orders.metaOrders)} of ${num(d.orders.orders)} orders came from Meta in 30 days`, use: "True ROAS per campaign and per ad", where: perf, ready: d.orders.metaOrders > 0 },
      { data: "Refunds", value: d.refunds.orders ? `${pct(d.refunds.refunded / d.refunds.orders, 1)} of orders refunded in 30 days` : null, use: "Keep high-refund products out of ads", where: shop, ready: d.refunds.orders > 0 },
      { data: "Discount codes", value: d.code ? `${d.code.code} on ${pct(d.orders.firstOrders ? d.code.n / d.orders.firstOrders : 0)} of first orders` : null, use: "Which offer to feature in the ad", where: shop, ready: Boolean(d.code) },
    ]],
    ["Customers", "users", [
      { data: "Consented to marketing", value: `${num(c.consented)} of ${num(c.total)} customers`, use: "Hashed custom audiences: retarget, exclude recent buyers", where: metaW, ready: c.consented > 0 },
      { data: "Top 10% by value", value: c.top10 ? `${num(c.top10)} customers = ${pct(c.top10Share)} of revenue` : null, use: "Seed for lookalike prospecting", where: metaW, ready: c.top10 > 0 },
      { data: "Reorder timing", value: d.reorder.medianDays ? `Second order comes ~${Math.round(d.reorder.medianDays)} days after the first` : null, use: "Replenishment ads on the right day", where: perf, ready: Boolean(d.reorder.medianDays) },
      { data: "Lapsed buyers", value: `${num(d.lapsed.lapsed)} bought 60–180 days ago, not since`, use: "Win-back ads: “your scent is back” angles", where: metaW, ready: d.lapsed.lapsed > 0 },
      { data: "Repeat buyers", value: `${num(c.repeat)} customers ordered 2+ times`, use: "Retarget with launches and refills", where: metaW, ready: c.repeat > 0 },
    ]],
  ];
  const all = groups.flatMap(([, , s]) => s);
  const ready = all.filter((s) => s.ready).length;

  const aud: [string, number, string?][] = [
    ["All customers", c.total], ["Consented to marketing", c.consented], ["Recent buyers · 30 days", c.recent, "Exclude"],
    ["Top 10% by value", c.top10, "Seed"], ["Repeat buyers", c.repeat, "Retarget"], ["Lapsed · 60–180 days", d.lapsed.lapsed, "Win-back"],
  ];

  return (
    <>
      <Bar crumbs={crumbs}>
        <span className="row g6 xs i3"><ShopifyLogo size={12} />computed from synced Shopify data</span>
        <Link className="btn sm" href={`${base}/shopify`}><Icon name="bag" size={14} />Shopify data</Link>
      </Bar>
      <div className="row fill stretch" style={{ minHeight: 0 }}>
        <section className="scroll col" style={{ padding: "22px 24px", gap: 16 }}>
          <div className="row between" style={{ alignItems: "flex-end" }}>
            <div className="col g4"><h1 className="h1">Ad signals</h1><p className="sm i3">Every piece of Shopify data, turned into something an ad can use.</p></div>
            <div className="row">
              <div className="kpi"><span className="v">{all.length}</span><span className="xs i3">signals</span></div>
              <div className="kpi"><span className="v">{ready}</span><span className="xs i3 row g4"><span className="dot green" />ready</span></div>
              <div className="kpi"><span className="v">{all.length - ready}</span><span className="xs i3 row g4"><span className="dot" />need data</span></div>
            </div>
          </div>
          <div className="card" style={{ overflow: "hidden" }}>
            <div className="tr hd dense" style={{ padding: "0 14px" }}>
              <div className="td" style={{ width: 110 }}>Group</div><div className="td fill">Shopify data · what it says</div>
              <div className="td" style={{ width: 220 }}>How ads use it</div><div className="td" style={{ width: 130 }}>Where in Kaviar</div><div className="td" style={{ width: 90 }}>Status</div>
            </div>
            {groups.map(([g, icon, sigs]) => sigs.map((s, i) => (
              <div key={g + s.data} className="tr" style={{ padding: "8px 14px", minHeight: 52, borderBottom: i === sigs.length - 1 ? "1px solid var(--line-2)" : undefined }}>
                <div className="td" style={{ width: 110 }}>{i === 0 && <span className="row g6 sm w5 i1"><Icon name={icon} size={14} />{g}</span>}</div>
                <div className="td fill"><div className="col" style={{ minWidth: 0 }}><span className="sm w5 i1">{s.data}</span><span className="xs i3" style={{ lineHeight: "16px" }}>{s.value ?? "Not enough data yet"}</span></div></div>
                <div className="td sm" style={{ width: 220, lineHeight: "17px" }}>{s.use}</div>
                <div className="td" style={{ width: 130 }}><Link className="chip" style={{ height: 26, fontSize: 12, fontWeight: 400 }} href={s.where[1]}>{s.where[0]}</Link></div>
                <div className="td" style={{ width: 90 }}>{s.ready ? <span className="pill green">Ready</span> : <span className="pill">Needs data</span>}</div>
              </div>
            )))}
          </div>
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
            <div className="row g8"><AgentFace kind="analyst" size={20} mood="up" /><span className="sm w5">{ready} signals are ready</span></div>
            <span className="xs i2" style={{ lineHeight: "17px" }}>
              Biggest wins: <b className="w5 i1">lapsed buyers ({num(d.lapsed.lapsed)})</b> for win-back ads{d.reorder.medianDays ? <>, and <b className="w5 i1">reorder timing</b> — replenishment ads around day {Math.round(d.reorder.medianDays)}</> : null}.
            </span>
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
