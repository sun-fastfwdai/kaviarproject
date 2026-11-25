"use client";
import { AgentFace } from "@/components/agent";
import { Icon } from "@/components/icon";
import { PASS_SCORE, RUBRIC, passes, totalOf, type AdCheck } from "@/lib/creative/rubric";
import type { AdConcept, AdPlan } from "@/lib/db/schema";

const SOURCE = { pack: "Pack", store: "Store", research: "Research" } as const;
const hexes = (v: string) => [...new Set(v.match(/#[0-9a-fA-F]{6}\b/g) ?? [])].slice(0, 5);
const box = { border: "1px solid var(--line-2)", borderRadius: 8, padding: "6px 8px", font: "inherit", fontSize: 12, lineHeight: "16px", width: "100%" } as const;

/** Otto's seven scores for one finished ad, as bars, with the total against the 85 it has to reach. */
export function ScoreBars({ check, compact = false }: { check: AdCheck; compact?: boolean }) {
  if (!check.scores) return null;
  const total = totalOf(check.scores), ok = passes(check);
  return (
    <div className="col" style={{ gap: compact ? 4 : 6 }}>
      <div className="row between"><span className="xs i3">Needs {PASS_SCORE}, the real product and no unsupported claim</span><span className={`sm w5 ${ok ? "c-green" : "c-amber"}`}>{total} of 100</span></div>
      {RUBRIC.map((r) => { const v = check.scores![r.key] ?? 0; return (
        <div key={r.key} className="col g2">
          <div className="row between"><span className="xs i2">{r.name}</span><span className="xs i3">{v} of {r.max}</span></div>
          <span style={{ height: 4, borderRadius: 99, background: "var(--line)", overflow: "hidden", display: "block" }}><span style={{ display: "block", height: "100%", width: `${(v / r.max) * 100}%`, background: v / r.max >= 0.8 ? "#1F8A5B" : v / r.max >= 0.6 ? "#B7791F" : "#C2452D" }} /></span>
        </div>); })}
    </div>
  );
}

/**
 * The creative plan a set of finished ads is made from, in the order it was worked out: what Iris found true of the brand and the pack,
 * who the ads are for, then one concept per ad — its idea (Iris), its words and its picture (Remy). The words can be edited before
 * anything is rendered; a headline that belongs to a campaign ad is that ad's and is changed there.
 */
export function PlanPanel({ plan, stale, busy, running, n, onPlan, onEdit }: {
  plan: AdPlan | null; stale: boolean; busy: boolean; running: boolean; n: number; onPlan: () => void; onEdit: (p: AdPlan) => void;
}) {
  const set = (i: number, x: Partial<AdConcept>) => plan && onEdit({ ...plan, concepts: plan.concepts.map((c, j) => (j === i ? { ...c, ...x } : c)) });
  if (!plan) return (
    <div className="col g8" style={{ padding: 12, borderRadius: 10, border: "1px dashed var(--line-2)", flexShrink: 0 }}>
      <span className="row g6 xs w5 i1"><AgentFace kind="analyst" size={16} /><AgentFace kind="builder" size={16} />How each ad is made</span>
      {["Iris reads the pack and the research for what is true", "Iris picks the buyer and one idea per ad", "Remy art-directs each idea and writes its words", "The image model renders it", "Otto scores it out of 100 and sends back anything under 85"].map((t, i) => (
        <span key={t} className="row top g8 xs i2" style={{ lineHeight: "16px" }}><span className="i3" style={{ width: 10, flexShrink: 0 }}>{i + 1}</span>{t}</span>))}
      <button type="button" className="btn dark sm" style={{ alignSelf: "flex-start" }} disabled={busy} onClick={onPlan}>
        {running ? <Icon name="spinner" size={12} className="spin" color="#fff" /> : null}{running ? "Planning…" : `Plan ${n} ad${n === 1 ? "" : "s"}`}</button>
      <span className="xs i3">No picture is paid for until you run the Photo node</span>
    </div>
  );
  return (
    <div className="col g12" style={{ flexShrink: 0 }}>
      {stale && <span className="xs c-amber" style={{ lineHeight: "16px" }}>The product, the count or the campaign changed — the plan is written again on the next run</span>}
      <div className="col g6" style={{ padding: 12, borderRadius: 10, background: "var(--tray)" }}>
        <span className="row g6 xs w5 i1"><AgentFace kind="analyst" size={16} />What is true · {plan.brand}</span>
        {plan.pack && <span className="xs i2" title={plan.pack} style={{ lineHeight: "16px", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{plan.pack}</span>}
        {plan.facts.map((f) => (
          <span key={f.fact} className="row top g6 xs" style={{ lineHeight: "16px" }}><Icon name="check-circle" size={12} weight="fill" color="#1F8A5B" /><span className="i1 fill">{f.fact}</span><span className="i3" style={{ flexShrink: 0 }}>{SOURCE[f.source]}</span></span>))}
        {!plan.facts.length && <span className="xs i3">No fact beyond what is printed on the pack</span>}
        {plan.never.length > 0 && <span className="xs i3" style={{ lineHeight: "16px" }}>Never said: {plan.never.join(" · ")}</span>}
      </div>
      {plan.audience && <div className="col g2"><span className="xs w5 i3">For</span><span className="xs i1" style={{ lineHeight: "16px" }}>{plan.audience}</span></div>}
      {plan.concepts.map((c, i) => (
        <div key={i} className="col g6" style={{ padding: 12, borderRadius: 10, border: "1px solid var(--line)" }}>
          <span className="row between g8"><span className="xs w5 i1">Ad {i + 1}</span>{c.adId && <span className="xs i3">Headline from the campaign ad</span>}</span>
          <span className="xs i2" style={{ lineHeight: "16px" }}>{c.angle}</span>
          {c.adId
            ? <span className="sm w5 i1" style={{ lineHeight: "18px" }}>{c.headline}</span>
            : <input aria-label={`Headline of ad ${i + 1}`} value={c.headline} maxLength={80} onChange={(e) => set(i, { headline: e.target.value })} style={{ ...box, fontWeight: 600, fontSize: 13 }} />}
          <input aria-label={`Supporting line of ad ${i + 1}`} value={c.sub} maxLength={140} placeholder="No supporting line" onChange={(e) => set(i, { sub: e.target.value })} style={box} />
          {c.callouts.length > 0 && <div className="row g4" style={{ flexWrap: "wrap" }}>{c.callouts.map((v) => (
            <button key={v} type="button" title="Remove this callout" onClick={() => set(i, { callouts: c.callouts.filter((x) => x !== v) })} className="row g4 xs i1" style={{ height: 22, padding: "0 7px", borderRadius: 6, background: "var(--tray)" }}>{v}<Icon name="x" size={9} color="#8A8782" /></button>))}</div>}
          {c.scene && <span className="xs i3" title={[c.scene, c.light, c.layout, c.type].filter(Boolean).join("\n\n")} style={{ lineHeight: "16px", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{c.scene}</span>}
          {hexes(c.palette).length > 0 && <div className="row g4">{hexes(c.palette).map((h) => <span key={h} title={h} style={{ width: 16, height: 16, borderRadius: 4, background: h, boxShadow: "inset 0 0 0 1px rgba(0,0,0,.08)" }} />)}<span className="xs i3" style={{ marginLeft: 4 }}>Meta button: {c.cta || "Shop now"}</span></div>}
        </div>))}
      <button type="button" className="btn sm" style={{ alignSelf: "flex-start" }} disabled={busy} onClick={onPlan}>
        {running ? <Icon name="spinner" size={12} className="spin" /> : <Icon name="refresh" size={12} />}{running ? "Planning…" : "Plan again"}</button>
    </div>
  );
}
