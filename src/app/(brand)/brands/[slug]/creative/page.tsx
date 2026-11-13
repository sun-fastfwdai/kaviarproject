import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getBrand, getConnections } from "@/lib/queries/brands";
import { signalData } from "@/lib/queries/signals";
import { getNotes } from "@/lib/ai/notes";
import { aiReady } from "@/lib/ai/client";
import { buildSignals, type SignalRow } from "@/lib/signals/build";
import { ago } from "@/lib/format";
import { Bar } from "@/components/shell/parts";
import { Icon } from "@/components/icon";
import { AgentFace } from "@/components/agent";
import { LoopStrip } from "@/components/loop-strip";
import { NeedsSource, SidePanel } from "@/components/ui";
import { CreativeTabs } from "./tabs";
import { BuildPlanButton, IdeaForm } from "./forms";

export const metadata = { title: "Creative studio" };
export const maxDuration = 120;

// Signals that make good ad batches, best first when Iris hasn't ranked them.
const PLAN_ORDER = ["lapsed", "reorder", "top-customers", "best-sellers", "repeat", "bundles", "inventory", "catalog"];

export default async function CreativePage({ params, searchParams }: PageProps<"/brands/[slug]/creative">) {
  const { slug } = await params;
  const sp = await searchParams;
  const tab = sp.tab === "ads" ? "batches" : "plan";
  const brand = await getBrand(slug);
  const conns = await getConnections(brand.id);
  const base = `/brands/${slug}`;
  const crumbs = [{ label: brand.name, href: base }, { label: "Growth" }, { label: "Creative studio" }];
  if (!conns.shopify) return (<><Bar crumbs={crumbs} /><div className="scroll" style={{ padding: 24 }}><NeedsSource slug={slug} provider="shopify" what="ads from the store’s data" /></div></>);

  const [d, notes, batches] = await Promise.all([
    signalData(brand.id, brand.timezone), getNotes(brand.id),
    db.select({ id: schema.adBatches.id, title: schema.adBatches.title, signal: schema.adBatches.signal, createdAt: schema.adBatches.createdAt,
      n: sql<number>`(select count(*) from ads a where a.batch_id = ${schema.adBatches.id})::int`,
      review: sql<number>`(select count(*) from ads a where a.batch_id = ${schema.adBatches.id} and a.status = 'review')::int`,
      approved: sql<number>`(select count(*) from ads a where a.batch_id = ${schema.adBatches.id} and a.status = 'approved')::int`,
      image: sql<string | null>`(select a.image_url from ads a where a.batch_id = ${schema.adBatches.id} and a.image_url is not null order by a.position limit 1)` })
      .from(schema.adBatches).where(eq(schema.adBatches.brandId, brand.id)).orderBy(desc(schema.adBatches.createdAt)).limit(40),
  ]);
  const rows = buildSignals(base, brand, d, notes).filter((r) => r.status === "ready" || r.status === "in-use");
  const ranked = notes.signals?.ranked ?? [];
  const score = (r: SignalRow) => {
    const hit = ranked.findIndex((x) => x.signal.toLowerCase().includes(r.data.toLowerCase().split(" ")[0]));
    return hit >= 0 ? hit : 10 + (PLAN_ORDER.indexOf(r.key) >= 0 ? PLAN_ORDER.indexOf(r.key) : 50);
  };
  const plans = rows.filter((r) => PLAN_ORDER.includes(r.key)).sort((a, b) => score(a) - score(b)).slice(0, 3);
  const toReview = batches.reduce((a, b) => a + b.review, 0);
  const groups: [string, typeof batches][] = [
    ["Needs your review", batches.filter((b) => b.review > 0)],
    ["Ready to test", batches.filter((b) => b.review === 0 && b.approved > 0)],
    ["Done", batches.filter((b) => b.review === 0 && b.approved === 0)],
  ];

  return (
    <>
      <Bar crumbs={crumbs}><LoopStrip base={base} step={2} /></Bar>
      <CreativeTabs base={base} on={tab} toReview={toReview} />
      <div className="row fill stretch" style={{ minHeight: 0 }}>
        <section className="scroll col" style={{ padding: "20px 24px", gap: 16 }}>
          {!aiReady() && <div className="notice amber"><Icon name="warning" size={14} /><span>Remy needs the Claude API key to write ads.</span></div>}
          {tab === "plan" ? (<>
            <div className="col g4"><h1 className="h1">What to make next</h1><p className="sm i3">Iris planned these from {brand.name}’s Shopify orders{conns.meta ? " and Meta results" : ""}. Build one, or brief your own idea.</p></div>
            <div className="row between"><span className="row g6 sm w5"><AgentFace kind="analyst" size={16} />Recommended by Iris</span><span className="xs i3">from today’s store data</span></div>
            <div className="row g12 stretch">
              {plans.map((p, i) => (
                <div key={p.key} className="card col g10 fill" style={{ padding: 14, minWidth: 0, ...(i === 0 ? { borderColor: "var(--ink)", boxShadow: "0 0 0 1px var(--ink)" } : {}) }}>
                  <div className="col g2"><span className="eyebrow">Plan {i + 1}</span><Link href={`${base}/signals/${p.key}`} className="h3">{p.data}</Link></div>
                  <span className="xs i2" style={{ lineHeight: "17px" }}><AgentFace kind="analyst" size={12} /> <b className="w5 i1">Why:</b> {p.why ?? p.value} — {p.use.toLowerCase()}.</span>
                  <span className="row g4" style={{ flexWrap: "wrap" }}>{p.evidence.slice(0, 2).map(([k, v]) => <span key={k} className="pill" style={{ height: 20, fontSize: 10.5 }}>{k}: {v}</span>)}</span>
                  <div className="fill" />
                  <div className="row between xs" style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}><span className="i3">Will make</span><span className="i1">6 ads · static, video & UGC</span></div>
                  <BuildPlanButton slug={slug} signal={p.key} count={6} dark={i === 0} />
                </div>
              ))}
              {plans.length === 0 && <span className="sm i3">No signals are ready yet — Iris plans batches once orders and customers sync.</span>}
            </div>
            <IdeaForm slug={slug} placeholder={`e.g. Holiday gift ads for ${brand.name}'s best-seller — warm and cosy, for people who bought last December`} />
          </>) : (<>
            <div className="col g4"><h1 className="h1">Ads</h1><p className="sm i3">Every batch Remy wrote for {brand.name}. Open one to review, edit, approve and set up a test.</p></div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
              {batches.map((b) => (
                <Link key={b.id} href={`${base}/creative/${b.id}`} className="card link" style={{ overflow: "hidden" }}>
                  <div style={{ height: 120, background: b.image ? `center/cover url("${b.image}")` : "var(--tray-2)" }} />
                  <div className="col g4" style={{ padding: "10px 12px" }}>
                    <span className="sm w5 i1 ell">{b.title}</span>
                    <span className="xs i3">{b.n} ads · {b.approved} approved{b.review ? ` · ${b.review} to review` : ""} · {ago(b.createdAt)}</span>
                  </div>
                </Link>
              ))}
            </div>
            {batches.length === 0 && <span className="sm i3">No ads yet. Build a plan from the Plan tab or from any ad signal.</span>}
          </>)}
        </section>
        <SidePanel>
          <div className="col g10" style={{ padding: "12px 14px", background: "#fff", border: "1px solid var(--line)", borderRadius: 12 }}>
            <span className="row between"><span className="sm w5">Your batches</span><span className="xs i3">{batches.length}</span></span>
            {groups.map(([label, list]) => list.length > 0 && (
              <div key={label} className="col g6">
                <span className="xs i3">{label}</span>
                {list.slice(0, 5).map((b) => (
                  <Link key={b.id} href={`${base}/creative/${b.id}`} className="row g8">
                    <span style={{ width: 30, height: 30, borderRadius: 7, flexShrink: 0, background: b.image ? `center/cover url("${b.image}")` : "var(--tray-2)" }} />
                    <span className="col fill" style={{ minWidth: 0 }}><span className="xs w5 i1 ell">{b.title}</span><span className="xs i3">{b.review ? `${b.n - b.review} of ${b.n} reviewed` : `${b.approved} approved`}</span></span>
                    {b.review > 0 && <span className="btn sm">Review</span>}
                  </Link>
                ))}
              </div>
            ))}
            {batches.length === 0 && <span className="xs i3">Batches you build show up here.</span>}
          </div>
          <div className="col g8" style={{ padding: "12px 14px", background: "#fff", border: "1px solid var(--line)", borderRadius: 12 }}>
            <span className="sm w5">Who makes these</span>
            {([["analyst", "Iris", "plans batches from the signals that can sell most"], ["builder", "Remy", "writes hooks, copy and formats on real product photos"], ["qa", "Otto", "checks every ad before it can run"]] as const).map(([k, n, t]) => (
              <div key={k} className="row top g8"><AgentFace kind={k} size={18} /><span className="xs i2" style={{ lineHeight: "17px" }}><b className="w5 i1">{n}</b> {t}</span></div>
            ))}
          </div>
        </SidePanel>
      </div>
    </>
  );
}
