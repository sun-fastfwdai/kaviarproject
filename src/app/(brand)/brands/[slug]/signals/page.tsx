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
import { SignalsTable } from "./table";
import { LoopStrip } from "@/components/loop-strip";
import { buildSignals, type Status } from "@/lib/signals/build";

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
  const rows = buildSignals(base, brand, d, notes);
  const count = (x: Status) => rows.filter((r) => r.status === x).length;
  const ready = count("ready");

  const aud: [string, number, string?][] = [
    ["All customers", c.total], ["Consented to marketing", c.consented], ["Recent buyers · 30 days", c.recent, "Exclude"],
    ["Top 10% by value", c.top10, "Seed"], ["Repeat buyers", c.repeat, "Retarget"], ["Lapsed · 60–180 days", d.lapsed.lapsed, "Win-back"],
  ];

  return (
    <>
      <Bar crumbs={crumbs}>
        <LoopStrip base={base} step={1} />
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
          <span className="xs i3">Open a signal to see the data behind it and have Remy write ads from it.</span>
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
