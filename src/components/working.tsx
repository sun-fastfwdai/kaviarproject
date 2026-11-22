"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AgentFace } from "./agent";
import { Icon } from "./icon";

/**
 * What an agent is doing right now, docked at the bottom of the screen so the brand never wonders whether anything is happening.
 * While it works: who, what, and how long it has been (with how long it usually takes). When it finishes: what came of it, for a moment.
 */
export type Work = { who: "analyst" | "builder" | "qa" | "catalog"; what: string; usually: string; since: number } | { done: string; bad?: boolean };

export function Working({ work, onClear }: { work: Work | null; onClear: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const running = work != null && "what" in work;
  useEffect(() => { if (!running) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [running]);
  useEffect(() => { if (work && "done" in work) { const t = setTimeout(onClear, work.bad ? 9000 : 5000); return () => clearTimeout(t); } }, [work, onClear]);
  if (!work || typeof document === "undefined") return null;
  const secs = "what" in work ? Math.max(0, Math.round((now - work.since) / 1000)) : 0;
  return createPortal(
    <div role="status" aria-live="polite" className="rise" style={{ position: "fixed", left: "50%", bottom: 22, transform: "translateX(-50%)", zIndex: 60, width: "min(520px, calc(100vw - 32px))", borderRadius: 18, background: "#121212", color: "#fff", boxShadow: "0 18px 50px rgba(18,18,18,.32)", overflow: "hidden" }}>
      {"what" in work ? <>
        <div className="row g12" style={{ padding: "12px 16px" }}>
          <AgentFace kind={work.who} size={30} mood="up" />
          <span className="col fill" style={{ minWidth: 0 }}><span className="ell" style={{ fontSize: 14, fontWeight: 600 }}>{work.what}</span><span style={{ fontSize: 12, color: "rgba(255,255,255,.6)" }}>{work.usually} · stay on this page</span></span>
          <span className="tnum" style={{ fontSize: 13, color: "rgba(255,255,255,.75)" }}>{Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}</span>
        </div>
        <div style={{ height: 3, background: "rgba(255,255,255,.12)", overflow: "hidden" }}><span style={{ display: "block", width: "38%", height: "100%", borderRadius: 99, background: "#34C77B", animation: "run-bar 1.4s ease-in-out infinite" }} /></div>
      </> : (
        <div className="row g10" style={{ padding: "12px 16px" }}>
          <Icon name={work.bad ? "warning-circle" : "check-circle"} size={18} weight="fill" color={work.bad ? "#FF9B73" : "#6EE7A8"} />
          <span className="fill" style={{ fontSize: 14, fontWeight: 500 }}>{work.done}</span>
          <button type="button" onClick={onClear} aria-label="Dismiss" style={{ color: "rgba(255,255,255,.6)" }}><Icon name="x" size={14} /></button>
        </div>
      )}
    </div>, document.body);
}
