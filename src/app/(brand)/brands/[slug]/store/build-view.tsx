"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { chooseHero, reviseStore, startBuild } from "./actions";
import { StorePreview, type Look } from "./preview";
import { Icon } from "@/components/icon";
import { AgentFace } from "@/components/agent";
import { CopyButton } from "@/components/copy";
import type { BuildTask, StoreContent } from "@/lib/db/schema";
import type { QA, StoreProduct } from "@/lib/store/build";

const AG = { iris: "analyst", cleo: "catalog", remy: "builder", otto: "qa" } as const;
const DEVICES = [["Desktop", 1100], ["Tablet", 760], ["Mobile", 390]] as const;

export function BuildView({ slug, step, brand, currency, tasks, content, products, look, hero, running, approved, qa, dawn, copyText }: {
  slug: string; step: "build" | "review"; brand: string; currency: string; tasks: BuildTask[]; content: StoreContent | null; products: StoreProduct[]; look: Look; hero: string | null;
  running: boolean; approved: string[]; qa: QA[]; dawn: string | null; copyText: string | null;
}) {
  const router = useRouter();
  const [device, setDevice] = useState<number>(step === "review" ? 1100 : 1100);
  const [ask, setAsk] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, start] = useTransition();
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => router.refresh(), 2500);
    return () => clearInterval(t);
  }, [running, router]);
  const done = tasks.filter((t) => t.status === "done").length;
  const download = (name: string, text: string, type = "application/json") => { const u = URL.createObjectURL(new Blob([text], { type })); const a = document.createElement("a"); a.href = u; a.download = name; a.click(); URL.revokeObjectURL(u); };
  const failing = qa.filter((q) => !q.ok);

  return (
    <div className="row fill stretch" style={{ minHeight: 0 }}>
      {step === "build" && (
        <aside className="col g8" style={{ width: 250, flexShrink: 0, borderRight: "1px solid var(--line)", padding: 16, overflowY: "auto" }}>
          <span className="row between"><span className="sm w5">Build plan</span><span className="xs i3">{done} of {tasks.length || 6}</span></span>
          <div className="steps">{(tasks.length ? tasks : Array(6).fill(null)).map((t, i) => <span key={i} className={`s ${t?.status === "done" ? "done" : t?.status === "running" ? "now" : ""}`} />)}</div>
          {tasks.map((t, i) => (
            <div key={t.key} className="row top g8" style={{ padding: "6px 0" }}>
              <span style={{ marginTop: 1 }}>{t.status === "done" ? <Icon name="check-circle" size={15} weight="fill" color="#1F8A5B" /> : t.status === "running" ? <Icon name="spinner" size={15} className="spin" /> : t.status === "error" ? <Icon name="warning-circle" size={15} color="#B7791F" /> : <Icon name="circle" size={15} color="#D9D6D1" />}</span>
              <div className="col" style={{ minWidth: 0 }}><span className={`sm ${t.status === "waiting" ? "i3" : "i1"}`}>{String(i + 1).padStart(2, "0")} · {t.label}</span><span className="row g4 xs i3"><AgentFace kind={AG[t.agent]} size={11} />{t.detail || "waiting"}</span></div>
            </div>
          ))}
          {tasks.length === 0 && <span className="xs i3">Starting…</span>}
          <div className="fill" />
          {!running && <button type="button" className="btn sm" disabled={busy} onClick={() => start(async () => { const r = await startBuild(slug); setMsg(r.error ?? "Rebuilding…"); router.refresh(); })}><Icon name="refresh" size={12} />Rebuild</button>}
        </aside>
      )}
      <div className="fill col" style={{ minWidth: 0, background: "var(--tray)" }}>
        <div className="row g8" style={{ padding: "8px 16px", borderBottom: "1px solid var(--line)", background: "#fff" }}>
          <span className="chip" style={{ height: 28 }}><Icon name="home" size={12} />Homepage</span>
          <div className="seg">{DEVICES.map(([l, w]) => <button key={l} type="button" className={`o${device === w ? " on" : ""}`} onClick={() => setDevice(w)}>{l}</button>)}</div>
          <span className="fill" />
          {running ? <span className="row g6 xs i3"><Icon name="spinner" size={12} className="spin" />Building · {done} of {tasks.length || 6}</span> : content ? <span className="xs i3">Draft · not published</span> : null}
        </div>
        <div className="fill" style={{ overflow: "auto", padding: 24, display: "flex", justifyContent: "center", alignItems: "flex-start" }}>
          {content ? <StorePreview brand={brand} c={content} products={products} look={look} hero={hero} width={device} currency={currency} />
            : <div className="col g10" style={{ width: Math.min(device, 900) }}>{[60, 340, 80, 260].map((h, i) => <div key={i} className="skel" style={{ height: h, borderRadius: 10 }} />)}<span className="xs i3" style={{ textAlign: "center" }}>Remy is writing the store — the preview appears as soon as the copy is ready.</span></div>}
        </div>
      </div>
      <aside className="col g10" style={{ width: 320, flexShrink: 0, borderLeft: "1px solid var(--line)", padding: 16, overflowY: "auto" }}>
        {step === "build" ? <>
          {content && (
            <div className="col g8" style={{ padding: 12, border: `1px solid ${approved.includes("hero") ? "var(--line)" : "#F1E1C4"}`, background: approved.includes("hero") ? "#fff" : "var(--amber-bg)", borderRadius: 12 }}>
              <span className="row between"><span className="sm w5">Hero headline</span><span className="xs i3">{approved.includes("hero") ? "Approved" : "Needs your approval"}</span></span>
              {content.heroOptions.map((h, i) => (
                <button key={h} type="button" disabled={busy} onClick={() => start(async () => { await chooseHero(slug, h); router.refresh(); })} className="row g8" style={{ padding: "8px 10px", background: "#fff", border: `1px solid ${content.hero === h ? "var(--ink)" : "var(--line)"}`, borderRadius: 8, textAlign: "left", cursor: "pointer" }}>
                  <span className={`radio${content.hero === h ? " on" : ""}`} /><span className="sm fill" style={{ fontFamily: "Georgia, serif" }}>“{h}”</span>{i === 0 && <span className="pill" style={{ height: 18, fontSize: 10 }}>Remy’s pick</span>}
                </button>
              ))}
            </div>
          )}
          <div className="col g6" style={{ padding: 12, border: "1px solid var(--line)", borderRadius: 12 }}>
            <span className="row g8"><AgentFace kind="builder" size={16} /><span className="sm w5">Ask Remy to change something</span></span>
            <div className="input" style={{ height: "auto", padding: 6 }}><textarea rows={3} value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="e.g. Make the story warmer and mention it’s made in Korea" style={{ border: 0, outline: 0, resize: "none", width: "100%", font: "inherit", fontSize: 12.5 }} /></div>
            <button type="button" className="btn sm" disabled={busy || ask.trim().length < 6 || !content} onClick={() => start(async () => { const r = await reviseStore(slug, ask); setMsg(r.error ?? "Done — preview updated."); if (!r.error) setAsk(""); router.refresh(); })}>
              {busy ? <Icon name="spinner" size={12} className="spin" /> : <Icon name="sparkle" size={12} />}{busy ? "Remy is editing…" : "Apply"}</button>
            {msg && <span className="xs i2">{msg}</span>}
          </div>
          <button type="button" className="btn dark" disabled={!content || running} onClick={() => router.push(`/brands/${slug}/store?step=review`)}>Review the store<Icon name="arrow-r" size={13} color="#fff" /></button>
        </> : <>
          <div className="col g6" style={{ padding: 12, border: "1px solid var(--line)", borderRadius: 12 }}>
            <span className="row g8"><AgentFace kind="qa" size={16} /><span className="sm w5 fill">Otto’s checks</span><span className={`xs ${failing.length ? "c-amber" : "c-green"}`}>{failing.length ? `${failing.length} to fix` : "all pass"}</span></span>
            {qa.map((q) => (
              <div key={q.label} className="col" style={{ paddingTop: 6, borderTop: "1px solid var(--line)" }}>
                <span className={`row g6 xs ${q.ok ? "i1" : "c-amber"}`}><Icon name={q.ok ? "check-circle" : "warning-circle"} size={13} weight={q.ok ? "fill" : "regular"} color={q.ok ? "#1F8A5B" : "#B7791F"} />{q.label}</span>
                <span className="xs i3" style={{ paddingLeft: 19 }}>{q.detail}{!q.ok && q.fix ? ` · ${q.fix}` : ""}</span>
              </div>
            ))}
          </div>
          <div className="col g8" style={{ padding: 12, border: "1px solid var(--line)", borderRadius: 12 }}>
            <span className="sm w5">Put it on Shopify</span>
            <span className="xs i3" style={{ lineHeight: "16px" }}>Kaviar’s Shopify access is read-only, so it can’t publish a theme yet. Use the files below in a copy of Dawn: Online Store → Themes → ⋯ → Edit code → templates/index.json.</span>
            {dawn && <button type="button" className="btn sm" onClick={() => download("index.json", dawn)}><Icon name="download" size={12} />Homepage for Dawn · index.json</button>}
            {copyText && <button type="button" className="btn sm" onClick={() => download(`${brand.toLowerCase().replace(/\W+/g, "-")}-store-copy.txt`, copyText, "text/plain")}><Icon name="download" size={12} />All store copy · .txt</button>}
            {copyText && <CopyButton text={copyText} label="Copy all copy" />}
            <button type="button" className="btn dark sm" disabled title="Needs Shopify write_themes access on the Kaviar app"><Icon name="globe" size={12} color="#fff" />Publish to Shopify</button>
            <span className="xs i3">Publishing from Kaviar needs the theme permission (write_themes) added to the Shopify app.</span>
          </div>
          <button type="button" className="btn" onClick={() => router.push(`/brands/${slug}/store?step=build`)}><Icon name="arrow-l" size={13} />Back to build</button>
        </>}
      </aside>
    </div>
  );
}
