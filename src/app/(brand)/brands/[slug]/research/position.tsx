"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { rerun, savePositioning } from "./actions";
import { Icon, type IconName } from "@/components/icon";
import { AgentFace } from "@/components/agent";
import { SOURCE_NAME, type DataSource, type Positioning } from "@/lib/research/types";

const SRC: Record<DataSource, [IconName, string, string]> = {
  shopify: ["bag", "#1F8A5B", "#EAF5EF"], meta: ["megaphone", "#2563EB", "#EDF2FD"], research: ["globe", "#5B6FD6", "#EFF1FB"], ads: ["eye", "#B7791F", "#FBF3E6"], brand: ["palette", "#55534F", "#F2F1EE"],
};
export function Source({ s }: { s: DataSource }) {
  const [icon, c, bg] = SRC[s] ?? SRC.research;
  return <span className="row g4" style={{ height: 20, padding: "0 7px", borderRadius: 6, background: bg, color: c, fontSize: 10.5, fontWeight: 500, whiteSpace: "nowrap", flexShrink: 0 }}><Icon name={icon} size={11} color={c} />{SOURCE_NAME[s]}</span>;
}

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
    <div className="col g8" style={{ padding: 16, border: "1px dashed var(--line-2)", borderRadius: 12 }}>
      <span className="sm i2">No positioning yet. Iris builds it from the research, competitors’ ads, the store’s own numbers and what live ads show.</span>
      <button type="button" className="btn sm dark" style={{ alignSelf: "flex-start" }} disabled={busy || running} onClick={again}><AgentFace kind="analyst" size={14} />Position the product</button>
      {err && <span className="xs c-amber">{err}</span>}
    </div>
  );
  const accepted = pos.status === "accepted";
  return (
    <div className="col g12">
      <div className="col g10" style={{ padding: "16px 18px", borderRadius: 14, background: "#fff", border: `1px solid ${accepted ? "#CBE6D6" : "var(--line)"}`, boxShadow: "0 4px 14px rgba(18,18,18,.04)" }}>
        <div className="row g8">
          <AgentFace kind="analyst" size={20} />
          <span className="xs w5 i3 fill">POSITIONING{pos.edited ? " · edited by the team" : ""}</span>
          {accepted ? <span className="pill green" style={{ height: 22, fontSize: 11 }}><Icon name="check" size={11} color="#1F8A5B" />In use</span> : null}
          <button type="button" className="lnk xs i2" onClick={() => { setStatement(pos.statement); setPillars(pos.pillars); setEdit((x) => !x); }}>{edit ? "Cancel" : "Edit"}</button>
        </div>
        {edit
          ? <textarea value={statement} onChange={(e) => setStatement(e.target.value)} rows={3} maxLength={400} aria-label="Positioning statement" style={{ border: "1px solid var(--line-2)", borderRadius: 8, padding: 10, font: "inherit", fontSize: 16, lineHeight: "24px", resize: "vertical" }} />
          : <span style={{ fontSize: 18, lineHeight: "27px", letterSpacing: "-0.01em" }} className="i1">{pos.statement}</span>}
        <div className="row g6" style={{ flexWrap: "wrap" }}>
          <span className="xs i3">For</span><span className="pill green" style={{ height: 22, fontSize: 11 }}>{pos.primary}</span>
          {pos.secondary.length > 0 && <><span className="xs i3">then test</span>{pos.secondary.map((s) => <span key={s} className="pill" style={{ height: 22, fontSize: 11 }}>{s}</span>)}</>}
          <span className="fill" />
          <span className="pill" style={{ height: 22, fontSize: 11 }}>Price · {pos.price.stance}</span>
        </div>
        <div className="row g8" style={{ flexWrap: "wrap" }}>
          {edit ? <button type="button" className="btn sm dark" disabled={busy || statement.trim().length < 20} onClick={() => save({ statement, pillars }).then(() => setEdit(false))}>{busy ? <Icon name="spinner" size={12} className="spin" color="#fff" /> : <Icon name="check" size={12} color="#fff" />}Save</button>
            : <button type="button" className={`btn sm${accepted ? "" : " dark"}`} disabled={busy} onClick={() => save({ status: accepted ? null : "accepted" })}>
              <Icon name={accepted ? "x" : "check"} size={12} color={accepted ? undefined : "#fff"} />{accepted ? "Stop using it" : "Use this positioning"}</button>}
          <button type="button" className="btn sm quiet" disabled={busy || running} onClick={again}>{running ? <Icon name="spinner" size={12} className="spin" /> : <Icon name="refresh" size={12} />}Position again</button>
          {err && <span className="xs c-amber">{err}</span>}
          <span className="fill" />
          <span className="xs i3">Remy writes every ad, photo prompt, storyboard and casting from this</span>
        </div>
      </div>

      <div className="row between" style={{ marginTop: 4 }}><span className="h3">Message pillars</span><span className="xs i3">what every ad says, and the proof behind it</span></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
        {(edit ? pillars : pos.pillars).map((p, i) => (
          <div key={p.id} className="card" style={{ padding: 14, gap: 8 }}>
            <span className="row g6"><span className="tnum xs w5" style={{ width: 18, height: 18, borderRadius: 5, background: "var(--ink)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</span><span className="sm w5 i1 fill">{p.title}</span><Source s={p.source} /></span>
            {edit ? <textarea value={p.message} rows={3} maxLength={160} aria-label={`Pillar ${i + 1} message`} onChange={(e) => setPillars((xs) => xs.map((x) => (x.id === p.id ? { ...x, message: e.target.value } : x)))}
              style={{ border: "1px solid var(--line-2)", borderRadius: 8, padding: 8, font: "inherit", fontSize: 13, lineHeight: "19px", resize: "vertical" }} />
              : <span className="sm i1" style={{ lineHeight: "20px" }}>“{p.message}”</span>}
            <span className="xs i3" style={{ lineHeight: "16px" }}><b className="w5 i2">Proof:</b> {p.proof}</span>
          </div>
        ))}
      </div>

      <div className="row top g12" style={{ flexWrap: "wrap" }}>
        <div className="col fill" style={{ minWidth: 320 }}>
          <span className="h3" style={{ marginBottom: 4 }}>Proof the ads can use</span>
          {pos.proof.map((p, i) => <div key={i} className="row g10" style={{ padding: "9px 0", borderBottom: "1px solid var(--line)" }}><span className="sm i1 fill" style={{ lineHeight: "20px" }}>{p.fact}</span><Source s={p.source} /></div>)}
        </div>
        <div className="col g10 fill" style={{ minWidth: 280 }}>
          <span className="h3">Voice</span>
          <div className="row g4" style={{ flexWrap: "wrap" }}>{pos.voice.say.map((x) => <span key={x} className="pill green" style={{ height: 22, fontSize: 11 }}>{x}</span>)}</div>
          <div className="row g4" style={{ flexWrap: "wrap" }}>{pos.voice.avoid.map((x) => <span key={x} className="pill amber" style={{ height: 22, fontSize: 11, textDecoration: "line-through" }}>{x}</span>)}</div>
          <span className="xs i2" style={{ lineHeight: "17px" }}><b className="w5">Price:</b> {pos.price.note}</span>
        </div>
      </div>

      <div className="row top g12" style={{ flexWrap: "wrap" }}>
        {([["Stay away from", "blocked", pos.avoid, "#B7791F"], ["Lead with", "target", pos.where.map((w) => `${w.placement} — ${w.why}`), "#1F8A5B"], ["Test next", "lightning", pos.next, "#2563EB"]] as const).map(([t, icon, xs, c]) => (
          <div key={t} className="col g6 fill" style={{ minWidth: 240, padding: "12px 14px", borderRadius: 12, background: "var(--tray)" }}>
            <span className="row g6 sm w5"><Icon name={icon} size={14} color={c} />{t}</span>
            {xs.map((x) => <span key={x} className="xs i2" style={{ lineHeight: "17px" }}>· {x}</span>)}
          </div>
        ))}
      </div>
    </div>
  );
}
