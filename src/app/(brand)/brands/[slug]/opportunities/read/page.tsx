import Link from "next/link";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getBrand } from "@/lib/queries/brands";
import { evidenceValue, QUALITY_NAME } from "@/lib/research/types";
import { Bar } from "@/components/shell/parts";
import { Icon } from "@/components/icon";
import { LoopStrip } from "@/components/loop-strip";

export const metadata = { title: "What Iris read" };
const TABS = [["orders", "Orders"], ["sources", "Sources"], ["competitors", "Competitors"], ["ads", "Competitor ads"], ["numbers", "Numbers measured"]] as const;
type Tab = (typeof TABS)[number][0];
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

/** What stands behind the Opportunities: each count on that page opens here as a plain list — no essays. */
export default async function ReadPage({ params, searchParams }: PageProps<"/brands/[slug]/opportunities/read">) {
  const { slug } = await params;
  const sp = await searchParams;
  const brand = await getBrand(slug);
  const base = `/brands/${slug}`, cur = brand.currency ?? "USD";
  const usd = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(Math.round(v));
  const tab: Tab = TABS.some(([k]) => k === sp.show) ? (sp.show as Tab) : "sources";
  const R = schema.marketResearch;
  const [r, orders] = await Promise.all([
    db.select({ report: R.report, rivals: R.rivals, manual: R.manual, evidence: R.evidence }).from(R).where(and(eq(R.brandId, brand.id), eq(R.market, "US"))).orderBy(desc(R.updatedAt)).limit(1).then((x) => x[0] ?? null).catch(() => null),
    db.execute(sql`select o.name, o.created_at as at, o.total::float8 as total, coalesce(nullif(o.utm_source, ''), o.channel, 'direct') as source
      from shop_orders o where o.brand_id = ${brand.id} and o.cancelled_at is null and not coalesce(o.test, false) order by o.created_at desc limit 40`).then((x) => x.rows as { name: string | null; at: Date | string; total: number; source: string }[]).catch(() => []),
  ]);
  const sources = r?.report?.sources ?? [], rivals = r?.report?.competitors ?? [], libs = r?.rivals ?? [], evidence = r?.evidence ?? [];
  const n: Record<Tab, number> = { orders: orders.length, sources: sources.length, competitors: rivals.length, ads: libs.reduce((k, x) => k + (x.ads?.length ?? 0), 0) + (r?.manual.length ?? 0), numbers: evidence.length };
  const line = { padding: "10px 0", borderTop: "1px solid var(--line)" } as const;
  const none = (t: string) => <span className="sm i3" style={{ padding: "14px 0" }}>{t}</span>;

  return (
    <>
      <Bar crumbs={[{ label: brand.name, href: base }, { label: "Opportunities", href: `${base}/opportunities` }, { label: "What Iris read" }]}><LoopStrip base={base} brandId={brand.id} step="opportunities" /></Bar>
      <div className="scroll" style={{ padding: "22px 24px 48px" }}>
        <div className="col g14">
          <div className="col g4"><h1 className="h1">What Iris read</h1><p className="sm i3">Everything the opportunities are built on, each with where it came from</p></div>
          <div className="row g6" style={{ flexWrap: "wrap" }}>
            {TABS.map(([k, label]) => <Link key={k} href={`${base}/opportunities/read?show=${k}`} className="chip" style={{ height: 30, ...(k === tab ? { background: "var(--ink)", color: "#fff" } : {}) }}><b className="tnum w5">{n[k]}</b>&nbsp;{label}</Link>)}
          </div>

          <div className="card" style={{ padding: "4px 18px 8px" }}>
            {tab === "orders" && (orders.length ? <>
              {orders.map((o, i) => (
                <div key={i} className="row g12 sm" style={{ ...line, borderTop: i ? line.borderTop : 0 }}>
                  <span className="i1 w5" style={{ width: 90 }}>{o.name ?? "Order"}</span>
                  <span className="i3 fill">{new Date(o.at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                  <span className="pill" style={{ height: 20, fontSize: 11 }}>{o.source}</span>
                  <span className="tnum i1 w5" style={{ width: 80, textAlign: "right" }}>{usd(o.total)}</span>
                </div>))}
              <Link className="lnk xs i3 row g4" href={`${base}/shopify`} style={{ padding: "10px 0" }}>All Shopify data<Icon name="arrow-r" size={11} /></Link>
            </> : none("No orders yet."))}

            {tab === "sources" && (sources.length ? sources.map((s, i) => (
              <a key={i} href={s.url} target="_blank" rel="noreferrer" className="row g12 sm hv" style={{ ...line, borderTop: i ? line.borderTop : 0 }}>
                <span className="tnum i3" style={{ width: 22 }}>{i + 1}</span><span className="i1 fill ell">{s.title || host(s.url)}</span><span className="xs i3">{host(s.url)}</span><Icon name="external" size={11} color="#8B8883" />
              </a>)) : <span className="row g10" style={{ padding: "14px 0" }}><span className="sm i3">No research yet</span><Link className="btn sm" href={`${base}/research`}>Open Market research<Icon name="arrow-r" size={11} /></Link></span>)}

            {tab === "competitors" && (rivals.length ? rivals.map((c, i) => (
              <div key={c.name} className="row top g12" style={{ ...line, borderTop: i ? line.borderTop : 0 }}>
                <span className="col g2" style={{ width: 220, flexShrink: 0 }}><span className="sm w5 i1">{c.name}</span><span className="xs i3 ell">{c.product}</span></span>
                <span className="sm tnum i1" style={{ width: 90, flexShrink: 0 }}>{c.price}</span>
                <span className="col g2 fill" style={{ minWidth: 0 }}><span className="xs i2 ell" title={c.positioning}>{c.positioning}</span>
                  <span className="xs ell"><span style={{ color: "#1F7A52" }}>Strong: {c.strength}</span></span><span className="xs ell"><span style={{ color: "#B4532A" }}>Weak: {c.weakness}</span></span></span>
              </div>)) : none("No competitors read yet."))}

            {tab === "ads" && (libs.length ? <>
              {libs.map((x, i) => (
                <div key={x.name} className="row g12 sm" style={{ ...line, borderTop: i ? line.borderTop : 0 }}>
                  <span className="i1 w5" style={{ width: 220 }}>{x.name}</span>
                  <span className="i3 fill ell">{x.ads?.[0]?.titles?.[0] ?? x.ads?.[0]?.bodies?.[0] ?? (x.error ? "Could not be read" : "")}</span>
                  <span className="tnum i1 w5">{x.ads?.length ?? 0} ads</span>
                </div>))}
              <Link className="lnk xs i3 row g4" href={`${base}/research?tab=ads`} style={{ padding: "10px 0" }}>See the ads themselves<Icon name="arrow-r" size={11} /></Link>
            </> : none("No competitor ads read yet."))}

            {tab === "numbers" && (evidence.length ? <>
              {/* where each kind of number comes from — and what it is not */}
              <div className="row g8 stretch" style={{ padding: "12px 0 14px", flexWrap: "wrap" }}>
                {([
                  ["Measured", "Counted from your own Shopify orders and customers, your Meta ad results, and competitors’ live ads in Meta’s Ad Library."],
                  ["Calculated", "Worked out from measured numbers — an average order, a repeat rate. No estimates in between."],
                  ["Platform estimate", "Meta’s own answer to “how many people match this age, gender and these interests?”. It is the size of an audience — not how they buy. Sales for a group are only known after ads run to it."],
                ] as const).map(([k, v]) => (
                  <div key={k} className="col g4" style={{ flex: "1 1 240px", minWidth: 0, padding: "10px 12px", borderRadius: 12, background: "var(--tray)" }}>
                    <span className="row g6"><span className="pill" style={{ height: 20, fontSize: 11, background: "#fff" }}>{k}</span><span className="xs i3 tnum">{evidence.filter((e) => QUALITY_NAME[e.quality] === k).length}</span></span>
                    <span className="xs i2" style={{ lineHeight: "17px" }}>{v}</span>
                  </div>))}
              </div>
              {evidence.map((e) => (
              <div key={e.id} className="row g12 sm" style={line}>
                <span className="col g2 fill" style={{ minWidth: 0 }}><span className="row g8"><span className="i1 w5 ell">{e.subject}</span><span className="xs i3" style={{ flexShrink: 0 }}>{e.source}</span></span>
                  <span className="xs i3 ell" title={e.note ?? ""}>{e.metric}{e.period ? ` · ${e.period}` : ""}{e.note ? ` · ${e.note}` : ""}</span></span>
                {e.kind === "audience_size" && <span className="pill amber" style={{ height: 20, fontSize: 11, flexShrink: 0 }}>Size only · no sales history yet</span>}
                <span className="pill" style={{ height: 20, fontSize: 11, flexShrink: 0 }}>{QUALITY_NAME[e.quality]}</span>
                {e.link ? <a href={e.link} target="_blank" rel="noreferrer" className="tnum i1 w5 lnk" style={{ width: 170, textAlign: "right" }}>{evidenceValue(e)}</a> : <span className="tnum i1 w5" style={{ width: 170, textAlign: "right" }}>{evidenceValue(e)}</span>}
              </div>))}
            </> : none("No numbers measured yet."))}
          </div>
        </div>
      </div>
    </>
  );
}
