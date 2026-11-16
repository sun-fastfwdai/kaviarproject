"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buildTestAds, decide, rerun, toggleCell } from "./actions";
import type { ResearchRow } from "./view";
import { Icon, type IconName } from "@/components/icon";
import { AgentFace } from "@/components/agent";
import { type Decision, type MarketReport, type Src } from "@/lib/research/types";

const domain = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u.slice(0, 30); } };
const VERDICT: Record<string, string> = { Strong: "green", Growing: "blue", Niche: "amber", Weak: "red" };

/** Source chips: each finding links to the pages it came from. */
function Sources({ ids, all }: { ids: number[]; all: Src[] }) {
  const list = ids.map((i) => all[i - 1]).filter(Boolean);
  if (!list.length) return <span className="row g4 xs" style={{ color: "#5B6FD6", flexShrink: 0 }}><AgentFace kind="analyst" size={13} />Iris’s read</span>;
  return (
    <span className="row g4" style={{ flexWrap: "wrap", flexShrink: 0, maxWidth: 260, justifyContent: "flex-end" }}>
      {list.slice(0, 2).map((s) => (
        <a key={s.url} href={s.url} target="_blank" rel="noreferrer" title={s.title} className="row g4 xs i2" style={{ height: 20, padding: "0 7px", borderRadius: 6, background: "var(--tray)", border: "1px solid var(--line)", whiteSpace: "nowrap" }}>
          <Icon name="globe" size={11} color="#8B8883" />{domain(s.url).slice(0, 24)}
        </a>
      ))}
      {list.length > 2 && <span className="xs i3" title={list.slice(2).map((s) => domain(s.url)).join(", ")}>+{list.length - 2}</span>}
    </span>
  );
}

/** Board 03's accept / reject on a suggestion. */
function Decide({ status, onSet }: { status?: Decision; onSet: (s: Decision | null) => void }) {
  if (status) return <span className="row g6 xs" style={{ flexShrink: 0 }}><span className={status === "accepted" ? "c-green" : "i3"}>{status === "accepted" ? "Accepted" : "Rejected"}</span><button type="button" className="lnk i3" onClick={() => onSet(null)}>Undo</button></span>;
  return (
    <span className="row g4" style={{ flexShrink: 0 }}>
      <button type="button" aria-label="Accept" title="Accept" onClick={() => onSet("accepted")} style={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6 }}><Icon name="check" size={13} color="#1F8A5B" /></button>
      <button type="button" aria-label="Reject" title="Reject" onClick={() => onSet("rejected")} style={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6 }}><Icon name="x" size={13} color="#8B8883" /></button>
    </span>
  );
}

function Head({ title, right }: { title: string; right?: React.ReactNode }) {
  return <div className="row between" style={{ marginTop: 6 }}><span className="h3">{title}</span>{right && <span className="xs i3">{right}</span>}</div>;
}
const Row = ({ label, children, sub }: { label: string; children: React.ReactNode; sub?: React.ReactNode }) => (
  <div className="row top g12" style={{ padding: "9px 0", borderBottom: "1px solid var(--line)" }}>
    <span className="xs i3" style={{ width: 88, flexShrink: 0, paddingTop: 1 }}>{label}</span><span className="sm i1 fill" style={{ lineHeight: "20px", minWidth: 0 }}>{children}</span>{sub}
  </div>
);

/** Accept/reject with an instant local update, saved in the background. */
function useDecisions(slug: string, id: string) {
  const router = useRouter();
  const [local, setLocal] = useState<Record<string, Decision | null>>({});
  const set = (kind: "segment" | "opportunity" | "gap", itemId: string, s: Decision | null) => {
    setLocal((x) => ({ ...x, [itemId]: s }));
    void decide(slug, id, kind, itemId, s).then(() => router.refresh());
  };
  const of = (itemId: string, saved?: Decision) => (itemId in local ? local[itemId] ?? undefined : saved);
  return { set, of };
}

// ---------------------------------------------------------------- Market
export function MarketTab({ slug, id, report, currency, onAds }: { slug: string; id: string; report: MarketReport; currency: string; onAds: () => void }) {
  const d = useDecisions(slug, id);
  const S = report.sources;
  const trendIcon: Record<string, [IconName, string]> = { rising: ["trend-up", "#1F8A5B"], steady: ["minus", "#8B8883"], fading: ["trend-down", "#B7791F"] };
  return (
    <div className="col g12">
      <div className="row top g10" style={{ padding: "12px 14px", background: "var(--blue-bg)", borderRadius: 12 }}>
        <AgentFace kind="analyst" size={20} />
        <span className="sm i1" style={{ lineHeight: "20px" }}><b className="w5">Iris, in one line:</b> {report.summary}</span>
      </div>

      <Head title="Demand" right={<span className={`pill ${VERDICT[report.demand.verdict] ?? ""}`} style={{ height: 22, fontSize: 11.5 }}>{report.demand.verdict}</span>} />
      <div className="col">
        <Row label="In short">{report.demand.line}</Row>
        {report.demand.signals.map((s, i) => <Row key={i} label={i ? "" : "Signals"} sub={<Sources ids={s.sources} all={S} />}>{s.text}</Row>)}
      </div>

      <Head title="Who buys it" right={`${report.segments.length} groups · the test plan uses the ones you don’t reject`} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(330px, 1fr))", gap: 12 }}>
        {report.segments.map((s) => {
          const st = d.of(s.id, s.status);
          return (
            <div key={s.id} className="card" style={{ opacity: st === "rejected" ? 0.55 : 1, borderColor: st === "accepted" ? "#CBE6D6" : undefined }}>
              <div className="row g8" style={{ padding: "12px 14px 8px" }}>
                <span className="sm w5 i1 fill ell" title={s.name}>{s.name}</span>
                <span className={`pill ${s.priority === "Primary" ? "green" : s.priority === "Secondary" ? "blue" : ""}`} style={{ height: 20, fontSize: 10.5 }}>{s.priority}</span>
                <Decide status={st} onSet={(v) => d.set("segment", s.id, v)} />
              </div>
              <div className="col g6" style={{ padding: "0 14px 12px" }}>
                {([["Who", s.who], ["Needs", s.need], ["Why us", s.why], ["Doubts", s.objections], ["Say", s.angle]] as const).map(([a, b]) => (
                  <div key={a} className="row top g8"><span className="xs i3" style={{ width: 46, flexShrink: 0 }}>{a}</span><span className={`xs ${a === "Say" ? "w5 i1" : "i2"}`} style={{ lineHeight: "17px" }}>{b}</span></div>
                ))}
                <div className="row g4" style={{ flexWrap: "wrap", paddingTop: 4 }}>
                  {[s.reach.ages, s.reach.gender === "All" ? "All genders" : s.reach.gender, ...s.reach.interests.slice(0, 4), ...s.reach.placements.slice(0, 2)].filter(Boolean).map((t, i) => (
                    <span key={i} className="xs i2" style={{ height: 20, padding: "0 7px", display: "inline-flex", alignItems: "center", borderRadius: 6, background: "var(--tray)", border: "1px solid var(--line)" }}>{t}</span>
                  ))}
                </div>
                <div className="row" style={{ justifyContent: "flex-end" }}><Sources ids={s.sources} all={S} /></div>
              </div>
            </div>
          );
        })}
      </div>

      <Head title="Competitors" right={<button type="button" className="lnk i2 row g4" onClick={onAds}>See their ads<Icon name="arrow-r" size={11} /></button>} />
      <div className="col" style={{ border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" }}>
        <div className="tr hd" style={{ background: "var(--tray)" }}>{["Brand", "Price", "How they sell", "Strong at", "Weak at", ""].map((h, i) => <span key={i} className="td" style={{ flex: [1.2, 0.6, 1.6, 1.2, 1.2, 0.5][i] }}>{h}</span>)}</div>
        {report.competitors.map((c) => (
          <div key={c.name} className="tr" style={{ alignItems: "flex-start", padding: "10px 12px", minHeight: 0 }}>
            <span className="col" style={{ flex: 1.2, minWidth: 0 }}><span className="sm w5 i1">{c.name}</span><span className="xs i3">{c.product}</span></span>
            <span className="sm i1 tnum" style={{ flex: 0.6 }}>{c.price}</span>
            <span className="xs i2" style={{ flex: 1.6, lineHeight: "17px" }}>{c.positioning}</span>
            <span className="xs i2" style={{ flex: 1.2, lineHeight: "17px" }}>{c.strength}</span>
            <span className="xs i2" style={{ flex: 1.2, lineHeight: "17px" }}>{c.weakness}</span>
            <span style={{ flex: 0.5, display: "flex", justifyContent: "flex-end" }}><Sources ids={c.sources} all={S} /></span>
          </div>
        ))}
      </div>

      <Head title="Trends" />
      <div className="col">
        {report.trends.map((t, i) => (
          <div key={i} className="row g10" style={{ padding: "9px 0", borderBottom: "1px solid var(--line)" }}>
            <Icon name={trendIcon[t.direction]?.[0] ?? "minus"} size={15} color={trendIcon[t.direction]?.[1]} />
            <span className="sm i1 fill" style={{ lineHeight: "20px" }}>{t.text}</span><Sources ids={t.sources} all={S} />
          </div>
        ))}
      </div>

      <Head title="Opportunities" right="Accept the ones worth testing" />
      <div className="col">
        {report.opportunities.map((o) => {
          const st = d.of(o.id, o.status);
          return (
            <div key={o.id} className="row top g10" style={{ padding: "10px 0", borderBottom: "1px solid var(--line)", opacity: st === "rejected" ? 0.5 : 1 }}>
              <Icon name="lightning" size={15} color="#B7791F" />
              <span className="col fill" style={{ minWidth: 0 }}><span className="sm w5 i1" style={{ lineHeight: "20px" }}>{o.text}</span><span className="xs i3" style={{ lineHeight: "17px" }}>{o.why}</span></span>
              <Sources ids={o.sources} all={S} /><Decide status={st} onSet={(v) => d.set("opportunity", o.id, v)} />
            </div>
          );
        })}
      </div>
      {report.price.note && <span className="xs i3">Prices are in {currency} where Iris found them.</span>}
    </div>
  );
}

// ---------------------------------------------------------------- Test plan
export function PlanTab({ slug, id, row, running, onMarket }: { slug: string; id: string; row: ResearchRow; running: boolean; onMarket: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"plan" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [off, setOff] = useState<Record<string, boolean>>({});
  const plan = row.plan;
  const on = (c: { id: string; on: boolean }) => (c.id in off ? !off[c.id] : c.on);
  const replan = async () => { setBusy("plan"); setErr(null); try { const r = await rerun(slug, id, ["plan"]); if (r.error) setErr(r.error); router.refresh(); } finally { setBusy(null); } };
  // Building ends in a redirect to the new batch: run it as a navigation so the router follows it.
  const [building, startBuild] = useTransition();
  const build = () => { setErr(null); startBuild(async () => { const r = await buildTestAds(slug, id); if (r?.error) setErr(r.error); }); };

  if (!plan) return (
    <div className="col g8" style={{ padding: 16, border: "1px dashed var(--line-2)", borderRadius: 12 }}>
      <span className="sm i2">{row.report ? "No test plan yet." : "The plan builds on the market research — run it first."}</span>
      {row.report && <button type="button" className="btn sm" style={{ alignSelf: "flex-start" }} disabled={busy != null || running} onClick={replan}><AgentFace kind="analyst" size={14} />Plan the message test</button>}
      {err && <span className="xs c-amber">{err}</span>}
    </div>
  );
  const chosen = plan.cells.filter(on);
  return (
    <div className="col g12">
      <div className="row top g10" style={{ padding: "12px 14px", background: "var(--blue-bg)", borderRadius: 12 }}>
        <AgentFace kind="analyst" size={20} />
        <span className="col g4"><span className="sm i1" style={{ lineHeight: "20px" }}>{plan.summary}</span>
          <span className="xs i2">Static product ads first: cheap to make, so the budget tests the message. When one wins, make UGC clips for it in Shoots.</span></span>
      </div>
      <div className="col" style={{ border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" }}>
        <div className="tr hd" style={{ background: "var(--tray)" }}>{["", "Buyer × message", "Hypothesis", "Audience", "Ad idea", "It works if"].map((h, i) => <span key={i} className="td" style={{ flex: [0.15, 1.1, 1.6, 1.2, 1.4, 0.9][i] }}>{h}</span>)}</div>
        {plan.cells.map((c) => (
          <label key={c.id} className="tr" style={{ alignItems: "flex-start", padding: "10px 12px", minHeight: 0, cursor: "pointer", opacity: on(c) ? 1 : 0.5 }}>
            <span style={{ flex: 0.15, paddingTop: 2 }}><input type="checkbox" checked={on(c)} onChange={() => { setOff((x) => ({ ...x, [c.id]: on(c) })); void toggleCell(slug, id, c.id).then(() => router.refresh()); }} style={{ accentColor: "#121212", margin: 0 }} /></span>
            <span className="col" style={{ flex: 1.1, minWidth: 0 }}><span className="sm w5 i1">{c.segment}</span><span className="xs i2">{c.angle}</span></span>
            <span className="xs i2" style={{ flex: 1.6, lineHeight: "17px" }}>{c.hypothesis}</span>
            <span className="xs i2" style={{ flex: 1.2, lineHeight: "17px" }}>{c.audience}</span>
            <span className="col g2" style={{ flex: 1.4, minWidth: 0 }}><span className="xs w5 i1">“{c.hook}”</span><span className="xs i3" style={{ lineHeight: "16px" }}>{c.visual}</span></span>
            <span className="xs i2" style={{ flex: 0.9, lineHeight: "17px" }}>{c.metric}</span>
          </label>
        ))}
      </div>
      <div className="row g8" style={{ flexWrap: "wrap" }}>
        <button type="button" className="btn dark" disabled={busy != null || building || running || !chosen.length} onClick={build}>
          {building ? <Icon name="spinner" size={13} className="spin" color="#fff" /> : <Icon name="sparkle" size={13} color="#fff" />}{building ? "Remy is writing the ads…" : `Build ${chosen.length} static ad${chosen.length === 1 ? "" : "s"}`}</button>
        <button type="button" className="btn" disabled={busy != null || building || running} onClick={replan}>{busy === "plan" || running ? <Icon name="spinner" size={13} className="spin" /> : <Icon name="refresh" size={13} />}Plan again</button>
        <button type="button" className="btn quiet" onClick={onMarket}>Change the buyers</button>
        {err && <span className="xs c-amber">{err}</span>}
      </div>
      <span className="xs i3">Remy writes one ad per cell into a new batch in Creative studio, with the product photo — then design, review and run them as usual.</span>
    </div>
  );
}

// ---------------------------------------------------------------- right rail
export function Rail({ tab, row, currency }: { tab: "market" | "ads" | "plan"; row: ResearchRow; currency: string }) {
  const r = row.report;
  const money = (v: number | null) => (v == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(v));
  const box = { padding: "12px 14px", background: "#fff", border: "1px solid var(--line)", borderRadius: 12 } as const;
  return (
    <aside className="col" style={{ width: 300, flexShrink: 0, borderLeft: "1px solid var(--line)", background: "var(--tray)", padding: "18px 16px", gap: 12, overflowY: "auto" }}>
      {r && (
        <div className="col g6" style={box}>
          <span className="row between"><span className="sm w5">Demand</span><span className={`pill ${VERDICT[r.demand.verdict] ?? ""}`} style={{ height: 20, fontSize: 10.5 }}>{r.demand.verdict}</span></span>
          <span className="xs i2" style={{ lineHeight: "17px" }}>{r.demand.line}</span>
        </div>
      )}
      {r && (r.price.low != null || r.price.high != null) && (
        <div className="col g6" style={box}>
          <span className="sm w5">Price range</span>
          <span className="h3 tnum">{money(r.price.low)} – {money(r.price.high)}</span>
          <span className="xs i3" style={{ lineHeight: "16px" }}>{r.price.note}</span>
        </div>
      )}
      {tab === "plan" && row.plan && (
        <div className="col g6" style={box}>
          <span className="sm w5">Suggested test budget</span>
          <span className="h3 tnum">{money(row.plan.budget.perDay)}/day · {row.plan.budget.days} days</span>
          <span className="xs i3" style={{ lineHeight: "16px" }}>About {money(row.plan.budget.perDay * row.plan.budget.days)} in total. {row.plan.budget.note}</span>
        </div>
      )}
      {tab !== "plan" && r && r.sources.length > 0 && (
        <div className="col g4" style={box}>
          <span className="row between"><span className="sm w5">Sources</span><span className="xs i3">{r.sources.length}</span></span>
          {r.sources.slice(0, 14).map((s, i) => (
            <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="row top g6" style={{ padding: "5px 0", borderTop: i ? "1px solid var(--line)" : 0 }} title={s.url}>
              <span className="xs i3 tnum" style={{ width: 18, flexShrink: 0 }}>{i + 1}</span>
              <span className="col" style={{ minWidth: 0 }}><span className="xs i1 ell">{s.title}</span><span className="xs i3 ell">{domain(s.url)}</span></span>
            </a>
          ))}
          {r.sources.length > 14 && <span className="xs i3">+{r.sources.length - 14} more</span>}
        </div>
      )}
      <div className="col g6" style={box}>
        <span className="sm w5">What happens next</span>
        {([["Market", "Accept the buyers and gaps worth testing"], ["Competitor ads", "See what they say; add US ads as screenshots"], ["Test plan", "Build static ads — they open in Creative studio"], ["Run ads", "One ad set per buyer; Kaviar reads the results"]] as const).map(([a, b], i) => (
          <div key={a} className="row top g8"><span className="xs tnum" style={{ width: 16, height: 16, borderRadius: 99, background: "var(--tray-2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 10 }}>{i + 1}</span>
            <span className="col"><span className="xs w5 i1">{a}</span><span className="xs i3">{b}</span></span></div>
        ))}
      </div>
    </aside>
  );
}
