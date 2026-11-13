import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getBrand, getConnections } from "@/lib/queries/brands";
import { signalData } from "@/lib/queries/signals";
import { getNotes } from "@/lib/ai/notes";
import { aiReady } from "@/lib/ai/client";
import { buildSignals } from "@/lib/signals/build";
import { ago } from "@/lib/format";
import { Bar } from "@/components/shell/parts";
import { Icon } from "@/components/icon";
import { AgentFace } from "@/components/agent";
import { LoopStrip } from "@/components/loop-strip";
import { NeedsSource, SidePanel } from "@/components/ui";
import { StatusPill } from "../table";
import { WriteAdsForm } from "./write-form";

export const metadata = { title: "Ad signal" };
// Remy writes the batch inside the request; give it room.
export const maxDuration = 120;

export default async function SignalPage({ params }: PageProps<"/brands/[slug]/signals/[key]">) {
  const { slug, key } = await params;
  const brand = await getBrand(slug);
  const conns = await getConnections(brand.id);
  const base = `/brands/${slug}`;
  const crumbs = [{ label: brand.name, href: base }, { label: "Ad signals", href: `${base}/signals` }];
  if (!conns.shopify) return (<><Bar crumbs={crumbs} /><div className="scroll" style={{ padding: 24 }}><NeedsSource slug={slug} provider="shopify" what="ad signals" /></div></>);
  const [d, notes] = await Promise.all([signalData(brand.id, brand.timezone), getNotes(brand.id)]);
  const rows = buildSignals(base, brand, d, notes);
  const i = rows.findIndex((r) => r.key === key);
  if (i < 0) notFound();
  const s = rows[i];
  const usable = s.status === "in-use" || s.status === "ready";
  const batches = await db.select({ id: schema.adBatches.id, title: schema.adBatches.title, createdAt: schema.adBatches.createdAt,
    n: sql<number>`(select count(*) from ads a where a.batch_id = ${schema.adBatches.id})::int`,
    approved: sql<number>`(select count(*) from ads a where a.batch_id = ${schema.adBatches.id} and a.status = 'approved')::int` })
    .from(schema.adBatches).where(and(eq(schema.adBatches.brandId, brand.id), eq(schema.adBatches.signal, key))).orderBy(desc(schema.adBatches.createdAt));
  const prev = rows[i - 1], next = rows[i + 1];

  return (
    <>
      <Bar crumbs={[...crumbs, { label: s.data }]}>
        <LoopStrip base={base} step={1} />
      </Bar>
      <div className="row fill stretch" style={{ minHeight: 0 }}>
        <section className="scroll col" style={{ padding: "22px 28px", gap: 18 }}>
          <div className="row between top">
            <div className="col g6" style={{ maxWidth: 640 }}>
              <span className="row g6 xs i3"><Icon name={s.icon} size={13} />{s.group}</span>
              <h1 className="h1">{s.data}</h1>
              <p className="lead">{s.use}.</p>
            </div>
            <StatusPill s={s.status} />
          </div>

          <div className="card" style={{ padding: "16px 18px", gap: 6 }}>
            <span className="xs i3">What the store data says</span>
            <span className="h3">{s.value ?? "Not enough data yet"}</span>
          </div>

          {s.evidence.length > 0 && (
            <div className="card" style={{ overflow: "hidden" }}>
              <div className="row between" style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)" }}><span className="sm w5">From the store’s data</span><Link className="lnk xs i2 row g4" href={s.where[1]}>{s.where[0]}<Icon name="arrow-r" size={12} /></Link></div>
              {s.evidence.map(([k, v], j) => (
                <div key={k + j} className="row between g12 sm" style={{ padding: "10px 16px", borderTop: j ? "1px solid var(--line)" : 0 }}><span className="i1">{k}</span><span className="i2 tnum">{v}</span></div>
              ))}
            </div>
          )}

          {s.missing && <div className="notice amber"><Icon name="info" size={14} /><span>{s.missing}</span></div>}

          <div className="card" style={{ padding: "16px 18px", gap: 12 }}>
            <div className="row g10"><AgentFace kind="builder" size={26} mood={usable ? "happy" : "focus"} /><div className="col"><span className="h3">Turn this signal into ads</span><span className="xs i3">Remy writes a batch — hooks, copy and formats — on the brand’s real products. You review them in Creative studio.</span></div></div>
            {usable ? <WriteAdsForm slug={slug} signal={key} disabled={!aiReady()} /> : <span className="sm i3">This signal needs data before Remy can use it.</span>}
            {!aiReady() && <span className="xs c-amber">The agents need the Claude API key to write ads.</span>}
          </div>

          {batches.length > 0 && (
            <div className="card" style={{ overflow: "hidden" }}>
              <div className="row between" style={{ padding: "12px 16px" }}><span className="sm w5">Ads already made from this signal</span><span className="xs i3">{batches.length}</span></div>
              {batches.map((b) => (
                <Link key={b.id} href={`${base}/creative/${b.id}`} className="tr compact" style={{ padding: "0 16px" }}>
                  <div className="td fill"><Icon name="sparkle" size={14} color="#8B8883" /><span className="sm w5 i1 ell">{b.title}</span></div>
                  <div className="td sm" style={{ width: 160 }}>{b.approved} of {b.n} approved</div>
                  <div className="td xs i3" style={{ width: 90 }}>{ago(b.createdAt)}</div>
                  <div className="td" style={{ width: 24 }}><Icon name="chev-r" size={13} color="#B5B2AC" /></div>
                </Link>
              ))}
            </div>
          )}

          <div className="row between" style={{ paddingTop: 4 }}>
            {prev ? <Link className="btn sm" href={`${base}/signals/${prev.key}`}><Icon name="arrow-l" size={12} />{prev.data}</Link> : <span />}
            {next && <Link className="btn sm" href={`${base}/signals/${next.key}`}>{next.data}<Icon name="arrow-r" size={12} /></Link>}
          </div>
        </section>
        <SidePanel>
          {s.why && (
            <div className="col g6" style={{ padding: "12px 14px", background: "#fff", border: "1px solid var(--line)", borderRadius: 12 }}>
              <div className="row g8"><AgentFace kind="analyst" size={20} mood="up" /><span className="sm w5">Why Iris picks it</span></div>
              <span className="xs i2" style={{ lineHeight: "17px" }}>{s.why}</span>
            </div>
          )}
          <div className="col g8" style={{ padding: "12px 14px", background: "#fff", border: "1px solid var(--line)", borderRadius: 12 }}>
            <span className="sm w5">What happens next</span>
            {([["builder", "Remy", "writes the ads from this signal"], ["qa", "Otto", "checks each ad before it can run"], ["analyst", "Iris", "judges the test on real Shopify orders"]] as const).map(([k, n, t]) => (
              <div key={k} className="row top g8"><AgentFace kind={k} size={18} /><span className="xs i2" style={{ lineHeight: "17px" }}><b className="w5 i1">{n}</b> {t}</span></div>
            ))}
          </div>
          <Link className="btn" href={`${base}/signals`}><Icon name="arrow-l" size={13} />All signals</Link>
        </SidePanel>
      </div>
    </>
  );
}
