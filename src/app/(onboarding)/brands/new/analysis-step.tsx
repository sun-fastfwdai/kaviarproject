"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startAnalysis } from "./actions";
import { BackLink, OnboardingShell } from "./shell";
import { AgentFace } from "@/components/agent";
import { Icon } from "@/components/icon";
import type { Analysis, Job } from "@/lib/onboarding/types";

const AGENT = { iris: "analyst", cleo: "catalog", otto: "qa" } as const;
const NAME = { iris: "Iris", cleo: "Cleo", otto: "Otto" } as const;

function Bars({ level }: { level: "High" | "Med" | "Low" }) {
  const n = level === "High" ? 3 : level === "Med" ? 2 : 1;
  return (
    <span className="row g4 xs i3">
      <svg width="11" height="10" viewBox="0 0 11 10">{[0, 1, 2].map((i) => <rect key={i} x={i * 4} y={7 - i * 3} width="3" height={3 + i * 3} rx="0.6" fill={level === "Low" ? "#B7791F" : "#1F8A5B"} opacity={i < n ? 1 : 0.22} />)}</svg>{level}
    </span>
  );
}

function JobRow({ j, first }: { j: Job; first: boolean }) {
  const icon = j.status === "done" ? <Icon name="check-circle" size={16} weight="fill" color="#1F8A5B" />
    : j.status === "running" ? <Icon name="spinner" size={16} className="spin" color="#55534F" />
    : j.status === "error" ? <Icon name="warning-circle" size={16} color="#B7791F" />
    : j.status === "skipped" ? <Icon name="circle" size={16} color="#D9D6D1" /> : <Icon name="circle" size={16} color="#D9D6D1" />;
  const pctDone = j.total ? Math.min(100, Math.round(((j.done ?? 0) / j.total) * 100)) : null;
  return (
    <div className="col g6" style={{ padding: "11px 14px", borderTop: first ? 0 : "1px solid var(--line)" }}>
      <div className="row top g10">
        <span style={{ marginTop: 1 }}>{icon}</span>
        <div className="col fill" style={{ minWidth: 0 }}>
          <span className={`sm w5 ${j.status === "waiting" ? "i3" : "i1"}`}>{j.label}</span>
          <span className="row g4 xs i3"><AgentFace kind={AGENT[j.agent]} size={12} />{NAME[j.agent]} · {j.what}</span>
        </div>
        <span className={`xs ${j.status === "error" ? "c-amber" : "i3"}`}>{j.status === "running" && j.total ? `${j.done ?? 0} / ${j.total} pages` : j.detail}</span>
      </div>
      {j.status === "running" && pctDone != null && <div style={{ marginLeft: 26, height: 3, borderRadius: 99, background: "var(--tray-2)" }}><div style={{ width: `${pctDone}%`, height: 3, borderRadius: 99, background: "var(--blue)", transition: "width .4s ease" }} /></div>}
    </div>
  );
}

export function AnalysisStep({ id, reached, name, thumb, subs, analysis, hasProfile, aiReady }: {
  id: string; reached: number; name: string; thumb: string | null; subs: (string | undefined)[]; analysis: Analysis | null; hasProfile: boolean; aiReady: boolean;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [now, setNow] = useState(() => Date.now());
  const kicked = useRef(false);
  const a = analysis;
  const running = !a || !a.finishedAt;

  useEffect(() => {
    if (!a && !kicked.current) { kicked.current = true; start(async () => { await startAnalysis(id); router.refresh(); }); }
  }, [a, id, router]);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => { setNow(Date.now()); router.refresh(); }, 2500);
    return () => clearInterval(t);
  }, [running, router]);

  const jobs = a?.jobs ?? [];
  const done = jobs.filter((j) => ["done", "skipped", "error"].includes(j.status)).length;
  const secs = a ? Math.max(0, Math.round(((a.finishedAt ? Date.parse(a.finishedAt) : now) - Date.parse(a.startedAt)) / 1000)) : 0;
  const elapsed = `${Math.floor(secs / 60)}m ${String(secs % 60).padStart(2, "0")}s`;
  const maxCat = Math.max(1, ...(a?.categories ?? []).map((c) => c.count));

  return (
    <OnboardingShell id={id} step={4} reached={reached} name={name} thumb={thumb} subs={subs}
      footer={<>
        <BackLink href={`/brands/new/${id}/assets`} />
        <span className="fill" />
        {!running && <button type="button" className="btn quiet sm" onClick={() => start(async () => { await startAnalysis(id, true); router.refresh(); })}><Icon name="refresh" size={13} />Run again</button>}
        <span className="xs i3">{running ? "You can review now — results keep filling in" : "Analysis finished"}</span>
        <Link className={`btn dark${hasProfile || !running ? "" : " off"}`} href={`/brands/new/${id}/review`} aria-disabled={!hasProfile && running}>Review profile<Icon name="arrow-r" size={13} color="#fff" /></Link>
      </>}>
      <div className="col g20" style={{ maxWidth: 1120, margin: "0 auto", padding: "32px 40px" }}>
        <div className="row between top">
          <div className="col g8">
            <span className="eyebrow">Step 4 · Analysis</span>
            <h1 className="h1">Iris is studying {name}</h1>
            <p className="lead">Every finding links to where it came from.</p>
          </div>
          <div className="row g10" style={{ padding: "8px 12px", border: "1px solid var(--line)", borderRadius: 12, background: "#fff" }}>
            <AgentFace kind="analyst" size={26} mood={running ? "focus" : "happy"} />
            <div className="col"><span className="sm w5">Iris · {elapsed}</span><span className="xs i3 ell" style={{ maxWidth: 220 }}>{running ? a?.current ?? "Getting started" : "Done — ready for review"}</span></div>
          </div>
        </div>
        {!aiReady && <div className="notice amber"><Icon name="warning" size={14} /><span>The agents can’t reach Claude right now, so Iris only collects what she can read directly. Ask an owner to add the Claude API key, then run the analysis again.</span></div>}

        <div className="row top g16">
          <div className="col g16" style={{ width: 420, flexShrink: 0 }}>
            <div className="card">
              <div className="row between" style={{ padding: "12px 14px", borderBottom: "1px solid var(--line)" }}><span className="sm w5">Jobs</span><span className="xs i3">{done} of {jobs.length || 6} done{running && jobs.length ? ` · ~${Math.max(1, 6 - done)} min left` : ""}</span></div>
              {jobs.length ? jobs.map((j, i) => <JobRow key={j.key} j={j} first={i === 0} />) : <div className="col g8" style={{ padding: 14 }}>{[0, 1, 2, 3].map((i) => <div key={i} className="skel" style={{ height: 30 }} />)}</div>}
            </div>
            {a && a.toAdd.length > 0 && (
              <div className="card">
                <div className="row between" style={{ padding: "12px 14px", borderBottom: "1px solid var(--line)" }}><span className="row g8 sm w5"><Icon name="warning" size={15} color="#EB7A3C" weight="fill" />To add before build</span><span className="xs i3">{a.toAdd.length}</span></div>
                {a.toAdd.map((t, i) => (
                  <div key={t.key} className="row between g10 xs" style={{ padding: "10px 14px", borderTop: i ? "1px solid var(--line)" : 0 }}><span className="i1">{t.title}</span><span className="i3 ell" style={{ textAlign: "right" }}>{t.detail}</span></div>
                ))}
              </div>
            )}
          </div>

          <div className="card fill" style={{ minWidth: 0 }}>
            <div className="row g8" style={{ padding: "12px 14px", borderBottom: "1px solid var(--line)" }}><span className="sm w5">Live results</span><span className="xs i3">Updated as jobs finish</span></div>
            <div className="col g12" style={{ padding: 14, borderBottom: "1px solid var(--line)" }}>
              <span className="row between xs"><span className="i2 w5">Palette &amp; type</span>{a?.paletteSource && <span className="row g4 i3"><Icon name="link" size={11} />{a.paletteSource}</span>}</span>
              {a?.palette.length ? (
                <div className="row g10">
                  {a.palette.map((p) => (
                    <div key={p.hex + p.role} className="col g4 fill" style={{ minWidth: 0 }}>
                      <span style={{ height: 40, borderRadius: 8, background: p.hex, border: "1px solid rgba(0,0,0,.06)" }} />
                      <span className="mono xs i1">{p.hex.toUpperCase()}</span><span className="xs i3">{p.role}</span><Bars level={p.confidence} />
                    </div>
                  ))}
                </div>
              ) : <div className="row g10">{[0, 1, 2, 3].map((i) => <div key={i} className="skel fill" style={{ height: 40, borderRadius: 8 }} />)}</div>}
              {a?.font && <div className="row g10 sm" style={{ paddingTop: 4 }}><span style={{ fontSize: 18, fontWeight: 600 }}>Aa</span><span className="w5">{a.font.name}</span><span className="xs i3 fill">{a.font.note}</span><Bars level={a.font.confidence} /></div>}
            </div>
            <div className="row stretch" style={{ minHeight: 220 }}>
              <div className="col g10 fill" style={{ padding: 14, borderRight: "1px solid var(--line)", minWidth: 0 }}>
                <span className="row between xs"><span className="i2 w5">Products &amp; categories</span>{a?.productCount ? <span className="i3">{a.productCount} products</span> : null}</span>
                {a?.categories.length ? a.categories.map((c) => (
                  <div key={c.name} className="row g10 xs">
                    <span className="i2 ell" style={{ width: 90 }}>{c.name}</span>
                    <span className="fill" style={{ height: 5, borderRadius: 99, background: "var(--tray-2)" }}><span style={{ display: "block", width: `${(c.count / maxCat) * 100}%`, height: 5, borderRadius: 99, background: "var(--green)" }} /></span>
                    <span className="i1 tnum" style={{ width: 22, textAlign: "right" }}>{c.count}</span>
                  </div>
                )) : <span className="xs i3">{jobs.find((j) => j.key === "products")?.status === "skipped" ? "No catalog found on the site." : "Cleo is reading the catalog…"}</span>}
              </div>
              <div className="col g4 fill" style={{ padding: 14, minWidth: 0 }}>
                <span className="row between xs" style={{ paddingBottom: 6 }}><span className="i2 w5">Site structure</span>{a && a.pagesTotal > 0 && <span style={{ color: "var(--blue)" }}>● {a.pagesDone} / {a.pagesTotal}</span>}</span>
                {a?.pages.length ? a.pages.map((p, i) => (
                  <div key={i} className="row g8 xs" style={{ minHeight: 24, paddingLeft: p.depth * 18 }}>
                    <Icon name={i === 0 ? "home" : p.depth ? "chev-r" : "file"} size={12} color="#8B8883" /><span className="i1 fill ell">{p.label}</span><span className="i3">{p.meta}</span>
                  </div>
                )) : <span className="xs i3">Waiting for the crawl…</span>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </OnboardingShell>
  );
}
