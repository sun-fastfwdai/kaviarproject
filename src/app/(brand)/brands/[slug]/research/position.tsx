"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { rerun, savePositioning } from "./actions";
import { Figures, From, Tone } from "./bits";
import { Icon } from "@/components/icon";
import { AgentFace } from "@/components/agent";
import type { DataSource, Positioning } from "@/lib/research/types";

/** Kept for other pages that show where a fact came from. */
export function Source({ s }: { s: DataSource }) { return <From s={s} />; }

/** "For <buyer> who <need>, <product> is the <category> that <benefit>, unlike <alternative>." — the parts in ink, the frame quiet. */
const FRAME = /^For (.+?) who (.+?), (.+?) is (the |a |an )?(.+?) that (.+?)(?:,| —| –| -) unlike (.+?)\.?$/i;
function Statement({ text }: { text: string }) {
  const m = FRAME.exec(text.trim());
  if (!m) return <>{text}</>;
  const [, buyer, need, product, art, category, benefit, alt] = m;
  const k = (s: string) => <span className="i1" style={{ fontWeight: 500 }}>{s}</span>;
  const c = (s: string) => <span className="i3">{s}</span>;
  return <>{c("For ")}{k(buyer)}{c(" who ")}{k(need)}{c(", ")}{k(product)}{c(` is ${art ?? ""}`)}{k(category)}{c(" that ")}{k(benefit)}{c(", unlike ")}{k(alt)}{c(".")}</>;
}

function Block({ title, n, children }: { title: string; n: number; children: React.ReactNode }) {
  return (
    <div className="col" style={{ padding: "13px 15px 8px", borderRadius: 16, background: "#fff", boxShadow: "0 0 0 1px var(--line)", minWidth: 0 }}>
      <span className="row between" style={{ paddingBottom: 4 }}><span className="sm w5">{title}</span><span className="xs i3 tnum">{n}</span></span>
      {children}
    </div>
  );
}
function Row({ children, right, tip, icon }: { children: React.ReactNode; right?: React.ReactNode; tip?: string; icon?: "blocked" | "lightning" }) {
  return (
    <div className="row top g8 sm" title={tip} style={{ padding: "8px 0", borderTop: "1px solid var(--line)", lineHeight: "19px" }}>
      {icon && <Icon name={icon} size={13} color={icon === "blocked" ? "#8B8883" : "#B7791F"} style={{ marginTop: 3 }} />}
      <span className="fill" style={{ minWidth: 0, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{children}</span>
      {right}{tip && <Icon name="info" size={12} color="#B5B2AC" style={{ marginTop: 3 }} />}
    </div>
  );
}

const STANCE: Record<string, string> = { value: "Value", "accessible premium": "Accessible premium", premium: "Premium" };

/** The product's positioning — built by Iris from the store, live ads, the research and competitors' ads. Every agent writes from it. */
export function PositionTab({ slug, id, pos, running }: { slug: string; id: string; pos: Positioning | null; running: boolean }) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [statement, setStatement] = useState(pos?.statement ?? "");
  const [pillars, setPillars] = useState(pos?.pillars ?? []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async (p: Parameters<typeof savePositioning>[2]) => { setBusy(true); try { await savePositioning(slug, id, p); router.refresh(); } finally { setBusy(false); } };
  const again = async () => { setBusy(true); setErr(null); try { const r = await rerun(slug, id, ["position"]); if (r.error) setErr(r.error); router.refresh(); } finally { setBusy(false); } };

  if (!pos) return (
    <div className="col g10" style={{ padding: "18px 0" }}>
      <span className="sm i2">No positioning yet.</span>
      <button type="button" className="btn sm dark" style={{ alignSelf: "flex-start" }} disabled={busy || running} onClick={again}><AgentFace kind="analyst" size={14} />Position the product</button>
      {err && <span className="xs c-amber">{err}</span>}
    </div>
  );
  const accepted = pos.status === "accepted";
  const from = [...new Set([...pos.pillars.map((p) => p.source), ...pos.proof.map((p) => p.source)])];
  const fromText = from.map((s) => ({ shopify: "Shopify", meta: "Meta ads", research: "the research", ads: "competitors’ ads", brand: "the brand profile" })[s]).join(", ").replace(/, ([^,]*)$/, " and $1");

  return (
    <div className="col g16">
      {/* The statement: one sentence the whole team and every agent works from. */}
      <div className="col g12" style={{ padding: "18px 20px", borderRadius: 18, background: "#fff", boxShadow: "0 0 0 1px var(--line)" }}>
        <div className="row g8">
          <AgentFace kind="analyst" size={18} />
          <span className="xs i3 fill">{pos.edited ? "Edited by the team" : `Written by Iris from ${fromText}`}</span>
          {accepted ? <Tone c="green">Approved</Tone> : <span className="xs i3">Draft</span>}
          {!edit && <button type="button" className="btn quiet sm" onClick={() => { setStatement(pos.statement); setPillars(pos.pillars); setEdit(true); }}><Icon name="pencil" size={12} />Edit</button>}
        </div>
        {edit
          ? <textarea value={statement} onChange={(e) => setStatement(e.target.value)} rows={3} maxLength={400} aria-label="Positioning statement" className="input" style={{ height: "auto", padding: 12, fontSize: 18, lineHeight: "27px", resize: "vertical" }} />
          : <p style={{ margin: 0, fontSize: 21, lineHeight: "31px", letterSpacing: "-0.015em", maxWidth: 860 }}><Statement text={pos.statement} /></p>}
        <div className="row g8" style={{ flexWrap: "wrap" }}>
          {edit ? (
            <>
              <button type="button" className="btn sm dark" disabled={busy || statement.trim().length < 20} onClick={() => save({ statement, pillars }).then(() => setEdit(false))}>{busy ? <Icon name="spinner" size={12} className="spin" color="#fff" /> : <Icon name="check" size={12} color="#fff" />}Save</button>
              <button type="button" className="btn sm" onClick={() => setEdit(false)}>Cancel</button>
            </>
          ) : accepted
            ? <button type="button" className="btn sm" disabled={busy} onClick={() => save({ status: null })}>Back to draft</button>
            : <button type="button" className="btn sm dark" disabled={busy} title="Marks it as agreed by the team — Remy writes from it either way" onClick={() => save({ status: "accepted" })}><Icon name="check" size={12} color="#fff" />Approve this positioning</button>}
          {!edit && <button type="button" className="btn sm quiet" disabled={busy || running} onClick={again}>{running ? <Icon name="spinner" size={12} className="spin" /> : <Icon name="refresh" size={12} />}Write it again</button>}
          {err && <span className="xs c-amber">{err}</span>}
        </div>
      </div>

      {/* The brief, as blocks: who, at what price, the words to use and the words to leave out. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
        <div className="col g4" style={{ padding: "13px 15px", borderRadius: 16, background: "#121212", color: "#fff" }}>
          <span style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, color: "rgba(255,255,255,.6)" }}>Sell to</span>
          <span style={{ fontSize: 18, lineHeight: "24px", fontWeight: 600, letterSpacing: "-0.01em" }}>{pos.primary}</span>
          {pos.secondary.length > 0 && <div className="row g4" style={{ flexWrap: "wrap", marginTop: "auto", paddingTop: 8 }}>{pos.secondary.map((x) => <span key={x} title="Test after the first group" style={{ height: 22, padding: "0 8px", borderRadius: 99, fontSize: 11, lineHeight: "22px", background: "rgba(255,255,255,.12)" }}>{x}</span>)}</div>}
        </div>
        <div className="col g4" title={pos.price.note} style={{ padding: "13px 15px", borderRadius: 16, background: "var(--tray)" }}>
          <span className="xs i3">Price</span>
          <span style={{ fontSize: 18, lineHeight: "24px", fontWeight: 600, letterSpacing: "-0.01em" }}>{STANCE[pos.price.stance] ?? pos.price.stance}</span>
          <span className="xs i3" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}><Figures text={pos.price.note} /></span>
        </div>
        <div className="col g6" style={{ padding: "13px 15px", borderRadius: 16, background: "var(--green-bg)" }}>
          <span className="xs" style={{ color: "var(--green)", fontWeight: 500 }}>Say</span>
          <div className="row g4" style={{ flexWrap: "wrap" }}>{pos.voice.say.map((x) => <span key={x} className="xs" style={{ padding: "3px 9px", borderRadius: 99, background: "#fff", color: "var(--ink)" }}>{x}</span>)}</div>
        </div>
        <div className="col g6" style={{ padding: "13px 15px", borderRadius: 16, background: "var(--tray)" }}>
          <span className="xs i3" style={{ fontWeight: 500 }}>Don’t say</span>
          <div className="row g4" style={{ flexWrap: "wrap" }}>{pos.voice.avoid.map((x) => <span key={x} className="xs i2" style={{ padding: "3px 9px", borderRadius: 99, background: "#fff", textDecoration: "line-through" }}>{x}</span>)}</div>
        </div>
      </div>

      {/* The pillars: what every ad says, each with the proof behind it. */}
      <div className="col g8">
        <span className="xs i3" style={{ letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>What every ad says</span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
          {(edit ? pillars : pos.pillars).map((p, i) => (
            <div key={p.id} className="col g8" style={{ padding: "14px 16px", borderRadius: 16, background: "#fff", boxShadow: "0 0 0 1px var(--line)" }}>
              <span className="row between g8"><span className="row g8" style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600 }}><span className="tnum i3">{String(i + 1).padStart(2, "0")}</span><span>{p.title}</span></span><From s={p.source} /></span>
              {edit
                ? <textarea value={p.message} rows={3} maxLength={160} aria-label={`Pillar ${i + 1} message`} className="input" onChange={(e) => setPillars((xs) => xs.map((x) => (x.id === p.id ? { ...x, message: e.target.value } : x)))} style={{ width: "100%", height: "auto", padding: 8, lineHeight: "19px", resize: "vertical" }} />
                : <span style={{ fontSize: 16, lineHeight: "23px", fontWeight: 500, letterSpacing: "-0.01em" }}>“{p.message}”</span>}
              <span className="xs i3" title={p.proof} style={{ marginTop: "auto", paddingTop: 8, borderTop: "1px solid var(--line)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}><Figures text={p.proof} /></span>
            </div>))}
        </div>
      </div>

      {/* Proof, placements, what to avoid and what to test next — a block each, a line a fact. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 10 }}>
        <Block title="Proof the ads can use" n={pos.proof.length}>{pos.proof.map((p, i) => <Row key={i} right={<From s={p.source} />}><Figures text={p.fact} /></Row>)}</Block>
        <Block title="Where to lead" n={pos.where.length}>{pos.where.map((w) => <Row key={w.placement} tip={w.why}><span className="w5">{w.placement}</span></Row>)}</Block>
        <Block title="Stay away from" n={pos.avoid.length}>{pos.avoid.map((x) => <Row key={x} icon="blocked"><Figures text={x} /></Row>)}</Block>
        <Block title="Test next" n={pos.next.length}>{pos.next.map((x) => <Row key={x} icon="lightning"><Figures text={x} /></Row>)}</Block>
      </div>
    </div>
  );
}
