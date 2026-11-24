"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { AgentFace } from "@/components/agent";
import type { AnswerRun } from "@/lib/seo/answers-rules";
import { askAssistant } from "./actions";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short", timeZone: "UTC" });

/**
 * AI answers: who an assistant names when a shopper asks about this kind of product. The page checks above say whether a store can
 * be read; this is whether it gets recommended. Counted from the answers themselves, which can be opened and read.
 */
export function AiAnswers({ slug, runs }: { slug: string; runs: AnswerRun[] }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const run = runs[0] ?? null, was = runs[1] ?? null, n = run?.questions.length ?? 0;
  const ask = () => { setErr(null); start(async () => { const r = await askAssistant(slug); if (r.error) setErr(r.error); else router.refresh(); }); };
  const you = run?.brands.find((b) => b.you) ?? null, before = was?.brands.find((b) => b.you) ?? null;
  return (
    <div className="card" style={{ padding: "16px 16px 8px" }}>
      <div className="row between g12" style={{ paddingBottom: 8, flexWrap: "wrap" }}>
        <span className="col g2">
          <span className="h3" title="The page checks say whether a store can be read. This is whether an assistant recommends it.">In AI answers</span>
          <span className="xs i3">{run ? `${run.assistant} · ${n} buyer questions · ${day(run.at)}` : "Who an assistant names when a shopper asks about products like yours"}</span>
        </span>
        <button type="button" className={`btn sm${run ? "" : " dark"}`} disabled={busy} onClick={ask}>{busy ? <Icon name="spinner" size={12} className="spin" color={run ? undefined : "#fff"} /> : <AgentFace kind="analyst" size={14} />}{busy ? "Asking, about a minute…" : run ? "Ask again" : "Ask the assistant"}</button>
      </div>
      {err && <span className="xs c-amber" style={{ paddingBottom: 8 }}>{err}</span>}
      {run && <>
        <div className="col">
          <div style={{ display: "grid", gridTemplateColumns: "minmax(160px, 1.4fr) minmax(160px, 2fr) 90px 90px", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
            <span className="xs i3">Brand</span><span className="xs i3">Named in the answers</span><span className="xs i3" style={{ textAlign: "right" }}>Named</span><span className="xs i3" style={{ textAlign: "right" }} title="The answer linked to the brand’s own site">Site linked</span>
          </div>
          {run.brands.map((b) => (
            <div key={b.name} style={{ display: "grid", gridTemplateColumns: "minmax(160px, 1.4fr) minmax(160px, 2fr) 90px 90px", gap: 12, alignItems: "center", padding: "12px 8px", margin: "0 -8px", borderBottom: "1px solid var(--line)", background: b.you ? "var(--tray)" : undefined, borderRadius: b.you ? 8 : 0 }}>
              <span className="sm w5 ell">{b.you ? `You · ${b.name}` : b.name}</span>
              <span style={{ height: 8, borderRadius: 99, background: "var(--tray-2)", overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: `${n ? (b.named / n) * 100 : 0}%`, borderRadius: 99, background: b.you ? "#121212" : "#8B8883" }} /></span>
              <span className="sm tnum" style={{ textAlign: "right" }}>{b.named} of {n}</span>
              <span className="sm tnum i2" style={{ textAlign: "right" }}>{b.linked} of {n}</span>
            </div>))}
        </div>
        {you && before && was && was.questions.length === n && you.named !== before.named && <span className="xs i3" style={{ paddingTop: 8 }}>You were named in {before.named} of {n} on {day(was.at)}</span>}
        {run.top.length > 0 && <div className="row g8" style={{ flexWrap: "wrap", padding: "12px 0 4px" }}>
          <span className="xs i3">Named most</span>
          {run.top.slice(0, 6).map((t) => <span key={t.name} className="pill">{t.name}<span className="i3 tnum">{t.n} of {n}</span></span>)}
        </div>}
        <div className="col" style={{ paddingTop: 8 }}>
          {run.questions.map((q, i) => (
            <div key={i} className="col" style={{ borderTop: "1px solid var(--line)" }}>
              <button type="button" className="row g12" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)} style={{ padding: "12px 0", textAlign: "left", width: "100%" }}>
                <span className="sm i1 fill" style={{ minWidth: 0 }}>{q.q}</span>
                <span className="xs i3 ell" style={{ maxWidth: 320, flexShrink: 1 }}>{q.named.length ? `Names ${q.named.join(", ")}` : "Names none of you"}</span>
                <Icon name="chev-d" size={12} color="#8B8883" style={{ flexShrink: 0, transform: open === i ? "rotate(180deg)" : undefined }} />
              </button>
              {open === i && <p className="sm i2" style={{ whiteSpace: "pre-wrap", padding: "0 0 16px", maxWidth: 860 }}>{q.answer}</p>}
            </div>))}
        </div>
      </>}
    </div>
  );
}
