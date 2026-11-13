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
  const crumbs = [{ label: brand.name, href: base }, { label: "Growth" }, { label: "Optimize & repeat" }];
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
  const decided = changes.filter((c) => c.status !== "proposed").length;
  const steps = [["Mon 09:00", "Kaviar reads the data"], ["Mon", "Agents propose changes"], ["Tue", "Approve or skip"], ["Tue", "Apply on Meta"], ["Next Mon", "Checks if it worked"]];
  const stepNow = changes.some((c) => c.status === "applied") ? 3 : decided ? 2 : 1;
  const line = notes.performance?.insights?.[0];

  return (
    <>
      <Bar crumbs={crumbs}><LoopStrip base={base} step={5} /></Bar>
      <div className="row fill stretch" style={{ minHeight: 0 }}>
        <section className="scroll col" style={{ padding: "20px 24px 0", gap: 14 }}>
          <div className="row between" style={{ alignItems: "flex-end" }}>
            <div className="col g4"><h1 className="h1">Optimize & repeat</h1><p className="sm i3">Once a week: look at what really sold, fix what isn’t working, and check next week if it helped.</p></div>
            <span className="chip"><Icon name="calendar" size={13} />Week of {new Date(`${week}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</span>
          </div>
          <div className="row" style={{ padding: "10px 14px", border: "1px solid var(--line)", borderRadius: 12 }}>
            {steps.map(([d, t], i) => (
              <div key={t} className="row g8 fill">
                <span style={{ width: 14, height: 14, borderRadius: 99, flexShrink: 0, background: i < stepNow ? "var(--green)" : "#fff", border: i < stepNow ? 0 : `1.5px solid ${i === stepNow ? "var(--ink)" : "var(--line-2)"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>{i < stepNow && <Icon name="check" size={9} color="#fff" weight="bold" />}</span>
                <span className="col"><span className="xs i3">{d}</span><span className={`xs ${i === stepNow ? "w5 i1" : "i2"}`}>{t}</span></span>
              </div>
            ))}
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
            <span className="xs i3">Checked against Shopify orders, not Meta’s own count.</span>
            {past.map((c) => (
              <div key={c.id} className="row between g8" style={{ paddingTop: 6, borderTop: "1px solid var(--line)" }}>
                <span className="col" style={{ minWidth: 0 }}><span className="xs w5 i1 ell">{c.title}</span><span className="xs i3">{c.result?.detail ?? "—"}</span></span>
                <span className={`pill ${c.result?.verdict === "worked" ? "green" : c.result?.verdict === "didnt" ? "amber" : ""}`} style={{ height: 20, fontSize: 10.5 }}>{c.result?.verdict === "worked" ? "Worked" : c.result?.verdict === "didnt" ? "Didn’t" : "Too early"}</span>
              </div>
            ))}
            {past.length === 0 && <span className="xs i3">Approve and apply a change — next Monday Kaviar checks whether it helped.</span>}
          </div>
          <div className="col g6" style={{ padding: "12px 14px", background: "#fff", border: "1px solid var(--line)", borderRadius: 12 }}>
            <span className="sm w5">Who decides what</span>
            {[["Budgets, pause / resume", "Kaviar proposes"], ["Creatives, audiences", "Kaviar drafts"], ["Anything goes live", "a person approves"]].map(([k, v]) => (
              <div key={k} className="row between xs" style={{ paddingTop: 4 }}><span className="i2">{k}</span><span className="i3">{v}</span></div>
            ))}
          </div>
          <div className="row top g8" style={{ padding: "12px 14px", background: "#fff", border: "1px solid var(--line)", borderRadius: 12 }}>
            <Icon name="repeat" size={14} /><span className="xs i2" style={{ lineHeight: "17px" }}>Next Monday the results go back into <Link className="lnk w5 i1" href={`${base}/signals`}>Ad signals</Link> and the loop starts again.</span>
          </div>
        </SidePanel>
      </div>
    </>
  );
}
