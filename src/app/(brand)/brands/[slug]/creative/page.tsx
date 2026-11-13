import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getBrand, getConnections } from "@/lib/queries/brands";
import { signalData } from "@/lib/queries/signals";
import { getNotes } from "@/lib/ai/notes";
import { aiReady } from "@/lib/ai/client";
import { buildSignals, type SignalRow } from "@/lib/signals/build";
import { ago } from "@/lib/format";
import { Icon } from "@/components/icon";
import { AgentFace } from "@/components/agent";
import { LoopStrip } from "@/components/loop-strip";
import { NeedsSource, SidePanel } from "@/components/ui";
import { BatchArt, EmptyState } from "@/components/empty";
import { StudioBar, reviewCount } from "./tabs";
import { PlanChat } from "./plan-chat";

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
  if (!conns.shopify) return (<><StudioBar base={base} brand={brand.name} on="plan" /><div className="scroll" style={{ padding: 24 }}><NeedsSource slug={slug} provider="shopify" what="ads from the store’s data" /></div></>);

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
  const newPlans = plans.filter((p) => !batches.some((b) => b.signal === p.key)).length;
  const groups: [string, typeof batches][] = [
    ["Needs your review", batches.filter((b) => b.review > 0)],
    ["Ready to test", batches.filter((b) => b.review === 0 && b.approved > 0)],
    ["Done", batches.filter((b) => b.review === 0 && b.approved === 0)],
  ];

  return (
    <>
      <StudioBar base={base} brand={brand.name} on={tab === "plan" ? "plan" : "batches"} counts={{ ...reviewCount(toReview), ...(newPlans ? { plan: `${newPlans} new` } : {}) }}><LoopStrip base={base} step={2} /></StudioBar>
      <div className="row fill stretch" style={{ minHeight: 0 }}>
        <section className="scroll col" style={{ padding: tab === "plan" ? 0 : "20px 24px", gap: 16 }}>
          {!aiReady() && tab !== "plan" && <div className="notice amber"><Icon name="warning" size={14} /><span>Remy needs the Claude API key to write ads.</span></div>}
          {tab === "plan" ? (
            <PlanChat slug={slug} base={base} brand={brand.name} hasMeta={Boolean(conns.meta)} aiOk={aiReady()}
              plans={plans.map((p) => ({ key: p.key, title: p.data, why: `${p.why ?? p.value} — ${p.use.toLowerCase()}.`, evidence: p.evidence, href: `${base}/signals/${p.key}` }))} />
          ) : (<>
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
            {batches.length === 0 && (
              <EmptyState eyebrow="Creative studio · Ads" title="No ads written yet"
                body="Every batch Remy writes lands here: 3–9 ads from one idea, on the brand’s real product photos, ready for you to approve, edit, redo or reject."
                steps={[
                  { agent: "analyst", title: "Pick a plan Iris recommends", body: "Built from the signals that can sell most — lapsed buyers, reorder timing, best-sellers." },
                  { agent: "builder", title: "Remy writes the batch", body: "Distinct hooks, copy and formats in about 20–40 seconds." },
                  { agent: "qa", title: "Review with Otto’s checks", body: "Approve the good ones; rejecting asks why, and Remy learns from it." },
                ]}
                art={<BatchArt />}
                actions={<><Link className="btn dark" href={`${base}/creative`}><Icon name="sparkle" size={14} color="#fff" />See Iris’s plans</Link><Link className="btn" href={`${base}/signals`}><Icon name="lightning" size={14} />Browse signals</Link></>} />
            )}
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
