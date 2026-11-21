import Link from "next/link";
import { and, desc, eq, lt } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getBrand, getConnections } from "@/lib/queries/brands";
import { summary } from "@/lib/queries/growth";
import { ensureWeek } from "@/lib/optimize/propose";
import { getNotes } from "@/lib/ai/notes";
import { money, num, roas } from "@/lib/format";
import { Bar } from "@/components/shell/parts";
import { Icon } from "@/components/icon";
import { AgentFace } from "@/components/agent";
import { LoopStrip } from "@/components/loop-strip";
import { SidePanel, Stat, StatStrip } from "@/components/ui";
import { ChangeList, type Change } from "./changes";
import { EmptyState, WeeklyLoopArt } from "@/components/empty";

export const metadata = { title: "Optimize & repeat" };

export default async function OptimizePage({ params }: PageProps<"/brands/[slug]/optimize">) {
  const { slug } = await params;
  const brand = await getBrand(slug);
  const conns = await getConnections(brand.id);
  const base = `/brands/${slug}`;
  const crumbs = [{ label: brand.name, href: base }, { label: "Results", href: `${base}/performance` }, { label: "This week’s changes" }];
  if (!conns.meta) return (<><Bar crumbs={crumbs} /><div className="scroll" style={{ padding: "20px 24px" }}>
    <EmptyState eyebrow="Step 5 of 5 · Optimize & repeat" title="Connect Meta Ads to start the weekly loop"
      body="Every Monday the agents read the week’s Shopify orders and Meta results and propose a short list of changes — pause what loses money, move budget to what wins, refresh tired creatives. Nothing changes without your approval, and a week later Kaviar checks whether it worked."
      steps={[{ icon: "plug", title: "Connect the ad account", body: "Read-only." }, { agent: "analyst", title: "Iris proposes changes", body: "Each with a before → after and the reason in numbers." }, { agent: "qa", title: "Kaviar checks the result", body: "Judged on Shopify orders, not Meta’s count." }]}
      art={<WeeklyLoopArt />} actions={<Link className="btn dark" href={`${base}/integrations`}><Icon name="plug" size={14} color="#fff" />Connect Meta Ads</Link>} />
  </div></>);

  const week = await ensureWeek(brand);
  const [s, changes, past, notes] = await Promise.all([
    summary(brand.id, brand.timezone, 30),
    db.select().from(schema.optimizeChanges).where(and(eq(schema.optimizeChanges.brandId, brand.id), eq(schema.optimizeChanges.week, week))),
    db.select().from(schema.optimizeChanges).where(and(eq(schema.optimizeChanges.brandId, brand.id), lt(schema.optimizeChanges.week, week), eq(schema.optimizeChanges.status, "applied"))).orderBy(desc(schema.optimizeChanges.appliedAt)).limit(8),
    getNotes(brand.id),
  ]);
  const worked = past.filter((c) => c.result?.verdict === "worked").length;
  const line = notes.performance?.insights?.[0];

  return (
    <>
      <Bar crumbs={crumbs}><LoopStrip base={base} brandId={brand.id} step="optimize" /></Bar>
      <div className="row fill stretch" style={{ minHeight: 0 }}>
        <section className="scroll col" style={{ padding: "20px 24px 0", gap: 14 }}>
          <div className="row between" style={{ alignItems: "flex-end" }}>
            <div className="col g8"><h1 className="h1">Results</h1>
              <div className="seg" style={{ alignSelf: "flex-start" }}><Link className="o" href={`${base}/performance`}>What sold</Link><Link className="o on" href={`${base}/optimize`}>This week’s changes</Link></div></div>
            <span className="chip"><Icon name="calendar" size={13} />Week of {new Date(`${week}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</span>
          </div>
          <div className="row top g10" style={{ padding: "12px 14px", background: "var(--blue-bg)", borderRadius: 12 }}>
            <AgentFace kind="analyst" size={20} />
            <span className="sm i1" style={{ lineHeight: "20px" }}><b className="w5">Iris, in one line:</b> {line ? `${line.title} — ${line.body}` : `ads return ${roas(s.spend ? s.metaRevenue / s.spend : null)} by Shopify’s count${s.metaPurchases > s.metaOrders ? `; Meta claims ${num(s.metaPurchases - s.metaOrders)} more purchases than verified` : ""}.`}</span>
          </div>
          <StatStrip>
            <Stat label="Real return on ads" source="both" value={roas(s.spend ? s.metaRevenue / s.spend : null)} note={s.spend ? `Meta says ${roas(s.metaValue / s.spend)}` : "no spend"} />
            <Stat label="Ad spend" source="meta" value={`${money(s.spend / 30, brand.currency)}/day`} note="last 30 days" />
            <Stat label="Orders from ads" source="shopify" value={num(s.metaOrders)} note="counted in Shopify" />
            <Stat label="Last weeks’ changes" value={past.length ? `${worked} of ${past.length} worked` : "—"} note={past.length ? "judged on Shopify orders" : "none applied yet"} />
          </StatStrip>
          <div className="row between"><span className="row g8"><span className="h3">This week’s changes</span><span className="pill" style={{ height: 20, fontSize: 11 }}>{changes.length}</span></span><span className="xs i3">Nothing changes on Meta until a person approves</span></div>
          <ChangeList slug={slug} week={week} changes={changes.map((c) => ({ id: c.id, kind: c.kind, title: c.title, why: c.why, before: c.before, after: c.after, status: c.status, target: c.target })) as Change[]} />
        </section>
        <SidePanel>
          <div className="col g8" style={{ padding: "12px 14px", background: "#fff", border: "1px solid var(--line)", borderRadius: 12 }}>
            <span className="sm w5">Did last week’s changes work?</span>
                        {past.map((c) => (
              <div key={c.id} className="row between g8" style={{ paddingTop: 6, borderTop: "1px solid var(--line)" }}>
                <span className="col" style={{ minWidth: 0 }}><span className="xs w5 i1 ell">{c.title}</span><span className="xs i3">{c.result?.detail ?? "—"}</span></span>
                <span className={`pill ${c.result?.verdict === "worked" ? "green" : c.result?.verdict === "didnt" ? "amber" : ""}`} style={{ height: 20, fontSize: 10.5 }}>{c.result?.verdict === "worked" ? "Worked" : c.result?.verdict === "didnt" ? "Didn’t" : "Too early"}</span>
              </div>
            ))}
            {past.length === 0 && <span className="xs i3">Approve and apply a change — next Monday Kaviar checks whether it helped.</span>}
          </div>
        </SidePanel>
      </div>
    </>
  );
}
