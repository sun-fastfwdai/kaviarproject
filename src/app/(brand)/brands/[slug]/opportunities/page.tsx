import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getBrand, getConnections } from "@/lib/queries/brands";
import { signalData } from "@/lib/queries/signals";
import { getNotes } from "@/lib/ai/notes";
import { buildSignals } from "@/lib/signals/build";
import { planData } from "@/lib/growth/plan-data";
import { planFor } from "@/lib/growth/today";
import { Bar } from "@/components/shell/parts";
import { Icon } from "@/components/icon";
import { AgentFace } from "@/components/agent";
import { LoopStrip } from "@/components/loop-strip";
import { MakeAds } from "./make";

export const metadata = { title: "Opportunities" };
export const maxDuration = 300; // "Make the ads" has Remy write a batch before the studio opens

const KIND = { cold: "New audience", lookalike: "Look-alike", warm: "Past buyers" } as const;
const people = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(Math.round(n)));
const GOOD = "#1F7A52", BAD = "#B4532A";

/**
 * Growth · step 1. Market research and the store's own signals, as one ranked list of who to advertise to: the audience, what to say,
 * what it should bring at the current plan, and one button. The research and the full signal list sit behind it.
 */
export default async function OpportunitiesPage({ params }: PageProps<"/brands/[slug]/opportunities">) {
  const { slug } = await params;
  const brand = await getBrand(slug);
  const base = `/brands/${slug}`, cur = brand.currency ?? "USD";
  const usd = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(Math.round(v));
  const conns = await getConnections(brand.id);
  const R = schema.marketResearch;
  const [d, research, signals] = await Promise.all([
    planData(brand.id, cur),
    db.select({ report: R.report, positioning: R.positioning, rivals: R.rivals, manual: R.manual, evidence: R.evidence }).from(R).where(and(eq(R.brandId, brand.id), eq(R.market, "US"))).orderBy(desc(R.updatedAt)).limit(1).then((r) => r[0] ?? null).catch(() => null),
    conns.shopify ? Promise.all([signalData(brand.id, brand.timezone), getNotes(brand.id)]).then(([s, n]) => buildSignals(base, brand, s, n)).catch(() => []) : Promise.resolve([]),
  ]);
  const { p, budget } = planFor(d);
  const img = (title: string) => d.products.find((x) => x.title === title)?.image ?? null;
  const list = [...p.rows.map((r) => ({ c: r.c, row: r })), ...p.unfunded.map((u) => ({ c: u.c, row: null }))];
  const usable = signals.filter((s) => s.status === "ready" || s.status === "in-use");
  const ads = research ? research.rivals.reduce((n, r) => n + (r.ads?.length ?? 0), 0) + research.manual.length : 0;
  const facts: [number, string, string][] = ([[d.orders.count, "orders read", "orders"], [research?.report?.sources.length ?? 0, "sources", "sources"], [research?.report?.competitors.length ?? 0, "competitors", "competitors"], [ads, "competitor ads", "ads"], [research?.evidence.length ?? 0, "numbers measured", "numbers"]] as [number, string, string][]).filter(([n]) => n > 0);

  return (
    <>
      <Bar crumbs={[{ label: brand.name, href: base }, { label: "Growth" }, { label: "Opportunities" }]}><LoopStrip base={base} brandId={brand.id} step="opportunities" /></Bar>
      <div className="scroll" style={{ padding: "22px 24px 48px" }}>
        <div className="col g16">
          <div className="row between" style={{ alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
            <div className="col g4">
              <h1 className="h1">{list.length} {list.length === 1 ? "audience" : "audiences"} worth advertising to</h1>
              <p className="sm i3">Ranked by what each should bring back. Pick one and Remy writes the ads.</p>
            </div>
            {facts.length > 0 && <div className="row g6" style={{ flexWrap: "wrap" }}><AgentFace kind="analyst" size={18} /><span className="xs i3">Iris read</span>{facts.map(([n, l, k]) => <Link key={l} href={`${base}/opportunities/read?show=${k}`} className="chip hv-card" style={{ height: 24, fontSize: 11.5 }} title={`See the ${l}`}><b className="tnum w5 i1">{n.toLocaleString("en-US")}</b>&nbsp;{l}</Link>)}</div>}
          </div>

          {research?.positioning?.statement && <div className="row top g12" style={{ padding: "14px 16px", borderRadius: 14, background: "var(--blue-bg)" }}>
            <Icon name="target" size={16} color="#3F63C8" />
            <span className="col g2 fill"><span className="xs w5" style={{ color: "#3F63C8", letterSpacing: "0.06em", textTransform: "uppercase" }}>Your position</span><span className="sm i1" style={{ lineHeight: "21px" }}>{research.positioning.statement}</span></span>
          </div>}

          <div className="col g10">
            {list.map(({ c, row }, i) => {
              const o = row?.out[1], pic = img(c.product);
              return (
                <div key={c.key} className="row g16 hv-card" style={{ padding: 16, background: "#fff", borderRadius: 16, boxShadow: i === 0 ? "0 0 0 1.5px var(--ink), 0 10px 28px rgba(18,18,18,.07)" : "0 0 0 1px var(--line)", alignItems: "center" }}>
                  <span className="tnum" style={{ width: 26, height: 26, borderRadius: 99, background: i === 0 ? "var(--ink)" : "var(--tray-2)", color: i === 0 ? "#fff" : "var(--ink-2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, flexShrink: 0 }}>{i + 1}</span>
                  {pic
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={pic} alt="" width={64} height={64} loading="lazy" style={{ borderRadius: 12, objectFit: "cover", flexShrink: 0, background: "var(--tray-2)", boxShadow: "0 0 0 1px var(--line)" }} />
                    : <span style={{ width: 64, height: 64, borderRadius: 12, background: "var(--tray-2)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="bag" size={20} color="#8B8883" /></span>}
                  <div className="col g4 fill" style={{ minWidth: 0 }}>
                    <span className="row g8" style={{ flexWrap: "wrap" }}>
                      <span style={{ fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600, color: c.kind === "cold" ? "#5B6FD6" : "#1F7A52" }}>{c.kind === "cold" ? "From market research" : "From your store"}</span>
                      <span className="pill" style={{ height: 18, fontSize: 10 }}>{KIND[c.kind]}</span>
                      {c.audience ? <span className="xs i3">{people(c.audience)} people{c.kind === "cold" ? " on Meta" : ""}</span> : null}
                    </span>
                    <span className="w5 i1 ell" style={{ fontSize: 17 }}>{c.name}</span>
                    <span className="sm i2 ell" title={c.why}><span className="i3">{c.kind === "cold" ? "Say: " : "Why: "}</span>{c.why}</span>
                    <span className="xs i3 ell">Sells {c.product}</span>
                  </div>
                  <div className="col" style={{ alignItems: "flex-end", flexShrink: 0, minWidth: 150 }}>
                    {o ? <>
                      <span className="xs i3">In your plan</span>
                      <span className="row g6 tnum" style={{ fontSize: 17, fontWeight: 600 }}><span className="i3" style={{ fontWeight: 500 }}>{usd(row!.spend)}</span><span className="i3">→</span>{usd(o.revenue)}</span>
                      <span className="xs w5 tnum" style={{ color: o.profit >= 0 ? GOOD : BAD }}>{o.profit >= 0 ? "+" : "−"}{usd(Math.abs(o.profit))} profit · {Math.round(o.orders)} orders</span>
                    </> : <>
                      <span className="xs i3">Not in the plan yet</span>
                      <span className="xs i2" style={{ textAlign: "right", maxWidth: 170 }}>A bigger budget than {usd(budget)} brings it in</span>
                    </>}
                  </div>
                  <MakeAds slug={slug} k={c.key} primary={i === 0} />
                </div>
              );
            })}
            {!d.hasResearch && <div className="row g12" style={{ padding: 16, borderRadius: 16, background: "#fff", boxShadow: "0 0 0 1px var(--line)" }}>
              <AgentFace kind="analyst" size={28} /><span className="col fill"><span className="sm w5 i1">Find more audiences</span><span className="xs i3">Iris researches the market, your competitors and their ads, and adds buyer groups here.</span></span>
              <Link className="btn" href={`${base}/research`}>Run research</Link>
            </div>}
          </div>

          {usable.length > 0 && <div className="card" style={{ padding: "14px 18px 6px" }}>
            <div className="row between" style={{ marginBottom: 4 }}><span className="sm w5">Also in your store data</span><Link className="lnk xs i3" href={`${base}/signals`}>All {signals.length} signals</Link></div>
            {usable.slice(0, 4).map((s) => (
              <Link key={s.key} href={`${base}/signals/${s.key}`} className="row g12 hv" style={{ padding: "10px 0", borderTop: "1px solid var(--line)" }}>
                <Icon name={s.icon} size={15} />
                <span className="sm i1 ell" style={{ width: 230, flexShrink: 0 }}>{s.data}</span>
                {s.value && <span className="sm w5 tnum" style={{ flexShrink: 0 }}>{s.value}</span>}
                <span className="xs i3 ell fill">{s.use}</span>
                <Icon name="arrow-r" size={11} color="#8B8883" />
              </Link>))}
          </div>}

          <div className="row g12" style={{ flexWrap: "wrap" }}>
            <Link href={`${base}/research?tab=market`} className="row g10 hv-card fill" style={{ padding: 14, borderRadius: 14, background: "#fff", boxShadow: "0 0 0 1px var(--line)", minWidth: 260 }}>
              <Icon name="globe" size={16} /><span className="col fill"><span className="sm w5 i1">The research behind this</span><span className="xs i3">Market, buyer groups, competitors and their ads</span></span><Icon name="arrow-r" size={12} color="#8B8883" />
            </Link>
            <Link href={`${base}/plan`} className="row g10 fill" style={{ padding: 14, borderRadius: 14, background: "var(--ink)", color: "#fff", minWidth: 260 }}>
              <span style={{ width: 22, height: 22, borderRadius: 99, background: "rgba(255,255,255,.16)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11.5, fontWeight: 600 }}>2</span>
              <span className="col fill"><span className="sm w5">Next: put a budget on these</span><span className="xs" style={{ color: "rgba(255,255,255,.6)" }}>See what each campaign should bring back</span></span><Icon name="arrow-r" size={12} color="#fff" />
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
