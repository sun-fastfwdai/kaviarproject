"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/icon";
import { AgentFace } from "@/components/agent";
import { MODES, type Mode } from "@/lib/growth/pilot";
import { checkNow, decide, setMode } from "../optimize/actions";

/**
 * Autopilot, on the Results screen: Kaviar checks the ads, orders and stock every morning and works out what to change. Top (dark):
 * that it is running, how much it may decide alone, what it watches and its record. Below: what waits for the brand, what is decided
 * and needs switching in Meta, what was done and whether it worked, and the log of its checks.
 */
export type PilotChange = {
  id: string; kind: string; title: string; why: string; before: string; after: string; status: string; byKaviar: boolean;
  signal: string | null; verdict: "worked" | "didnt" | "too-early" | null; detail: string | null;
};
export type PilotRun = { when: string; line: string; good: boolean };
type Props = {
  slug: string; mode: Mode; canAct: boolean; last: string | null; week: string;
  watched: { campaigns: number; ads: number; products: number };
  record: { applied: number; judged: number; worked: number };
  changes: PilotChange[]; runs: PilotRun[];
};
const KIND: Record<string, [string, IconName, string]> = {
  pause: ["Pause", "pause", "#B4532A"], hold: ["Hold", "blocked", "#B4832A"], shift: ["Move budget", "repeat", "#3F63C8"],
  scale: ["Scale", "trend-up", "#1F7A52"], refresh: ["New ads", "image", "#1AA7C8"], add: ["New test", "plus", "#1AA7C8"],
};
const DIM = "rgba(255,255,255,.55)";

function Head({ t, n, children }: { t: string; n: number; children?: React.ReactNode }) {
  return (
    <div className="row between" style={{ padding: "14px 0 4px" }}><span className="row g8"><span className="sm w5">{t}</span><span className="pill" style={{ height: 20, fontSize: 11 }}>{n}</span></span>{children}</div>
  );
}
function Fact({ k, v, sub, tone }: { k: string; v: string; sub?: string; tone?: string }) {
  return (
    <div className="col g2 fill" style={{ minWidth: 120 }}><span style={{ fontSize: 11.5, color: DIM }}>{k}</span><span className="tnum" style={{ fontSize: 22, lineHeight: "26px", fontWeight: 600, color: tone ?? "#fff" }}>{v}</span>{sub && <span className="ell" style={{ fontSize: 11.5, color: DIM }}>{sub}</span>}</div>
  );
}

export function AutopilotPanel({ slug, mode: saved, canAct, last, week, watched, record, changes, runs }: Props) {
  const router = useRouter(), base = `/brands/${slug}`;
  const [busy, start] = useTransition();
  const [doing, setDoing] = useState<string | null>(null);
  const [mode, setM] = useState<Mode>(saved);
  const go = (what: string, f: () => Promise<void>) => { setDoing(what); start(async () => { await f(); router.refresh(); setDoing(null); }); };
  const act = (ids: string[], status: "approved" | "skipped" | "applied" | "proposed") => go(ids[0] ?? "", () => decide(slug, ids, status));
  const pick = (m: Mode) => { setM(m); go("mode", () => setMode(slug, m)); };

  const open = changes.filter((c) => c.status === "proposed"), decided = changes.filter((c) => c.status === "approved");
  const done = changes.filter((c) => c.status === "applied"), skipped = changes.filter((c) => c.status === "skipped");
  const easy = open.filter((c) => c.kind !== "add" && c.kind !== "refresh"); // one tap is enough; the rest need ads made first
  const sheet = () => {
    const text = [`Kaviar · changes to switch in Meta · week of ${week}`, "", ...decided.map((c, i) => `${i + 1}. ${c.title}\n   ${c.before} → ${c.after}\n   Why: ${c.why}`)].join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a"); a.href = url; a.download = `kaviar-changes-${week}.txt`; a.click(); URL.revokeObjectURL(url);
  };

  const Row = (c: PilotChange, i: number) => {
    const [label, icon, tone] = KIND[c.kind] ?? [c.kind, "info" as IconName, "#8B8883"];
    return (
      <div key={c.id} className="row g12" style={{ padding: "12px 0", borderTop: i ? "1px solid var(--line)" : 0, opacity: c.status === "skipped" ? 0.55 : 1 }}>
        <span style={{ width: 32, height: 32, borderRadius: 10, background: `${tone}14`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name={icon} size={15} color={tone} /></span>
        <div className="col g2 fill" style={{ minWidth: 0 }}>
          <span className="row g8"><span style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600, color: tone, flexShrink: 0 }}>{label}</span><span className="sm w5 i1 ell">{c.title}</span></span>
          <span className="xs ell" title={c.why}><span className="i3" style={{ textDecoration: "line-through" }}>{c.before}</span> <span className="c-green w5">→ {c.after}</span><span className="i3"> · {c.why}</span></span>
        </div>
        <div className="row g6" style={{ width: 232, justifyContent: "flex-end", flexShrink: 0 }}>
          {c.status === "proposed" && <>
            {c.kind === "add" && c.signal ? <Link className="btn dark sm" href={`${base}/signals/${c.signal}`}>Make the ads</Link>
              : c.kind === "refresh" ? <Link className="btn dark sm" href={`${base}/creative`}>Make new ads</Link>
              : <button type="button" className="btn dark sm" disabled={busy} onClick={() => act([c.id], "approved")}>{doing === c.id ? <Icon name="spinner" size={12} className="spin" color="#fff" /> : <Icon name="check" size={12} color="#fff" />}Approve</button>}
            <button type="button" className="btn quiet sm" disabled={busy} onClick={() => act([c.id], "skipped")}>Skip</button>
          </>}
          {c.status === "approved" && <>
            <span className="pill" style={{ height: 22, fontSize: 11, ...(c.byKaviar ? { background: "#121212", color: "#fff" } : {}) }}>{c.byKaviar ? "Kaviar decided" : "You approved"}</span>
            <button type="button" className="btn sm" disabled={busy} onClick={() => act([c.id], "applied")}>Done in Meta</button>
          </>}
          {c.status === "applied" && <>
            <span className="xs i3 ell" style={{ maxWidth: 130 }} title={c.detail ?? ""}>{c.detail}</span>
            <span className={`pill ${c.verdict === "worked" ? "green" : c.verdict === "didnt" ? "amber" : ""}`} style={{ height: 22, fontSize: 11 }}>{c.verdict === "worked" ? "Worked" : c.verdict === "didnt" ? "Didn’t work" : "Checking"}</span>
          </>}
          {c.status === "skipped" && <button type="button" className="btn quiet sm" disabled={busy} onClick={() => act([c.id], "proposed")}>Undo</button>}
        </div>
      </div>
    );
  };
  return (
    <div id="autopilot" style={{ borderRadius: 20, overflow: "hidden", boxShadow: "0 0 0 1px var(--line), 0 12px 32px rgba(18,18,18,.06)", background: "#fff", scrollMarginTop: 16 }}>
      {/* ---- running, and how much it may decide alone */}
      <div style={{ position: "relative", overflow: "hidden", background: "#121212", color: "#fff", padding: "20px 22px 18px" }}>
        <div aria-hidden style={{ position: "absolute", right: -140, top: -180, width: 480, height: 480, borderRadius: 999, background: "radial-gradient(closest-side, rgba(52,199,123,.26), transparent)" }} />
        <div className="row top between g16" style={{ position: "relative", flexWrap: "wrap" }}>
          <div className="row top g12" style={{ minWidth: 0 }}>
            <AgentFace kind="analyst" size={38} mood="happy" />
            <div className="col g2">
              <span className="row g8"><span style={{ width: 8, height: 8, borderRadius: 99, background: "#34C77B", boxShadow: "0 0 0 4px rgba(52,199,123,.25)", animation: "pulse 2.2s ease-in-out infinite" }} /><span style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, color: "#8BE8B4" }}>Autopilot · on</span></span>
              <span style={{ fontSize: 22, lineHeight: "28px", fontWeight: 600, letterSpacing: "-0.02em" }}>Kaviar checks your ads every morning</span>
              <span style={{ fontSize: 12.5, color: DIM }}>{last ? `Last check ${last}` : "First check runs within the hour"} · reads spend, real orders and stock, then works out what to change</span>
            </div>
          </div>
          <button type="button" disabled={busy} onClick={() => go("check", () => checkNow(slug))} className="row g6" style={{ height: 34, padding: "0 14px", borderRadius: 99, background: "rgba(255,255,255,.12)", color: "#fff", fontSize: 12.5, flexShrink: 0 }}>
            <Icon name={doing === "check" ? "spinner" : "refresh"} size={12} color="#fff" className={doing === "check" ? "spin" : undefined} />{doing === "check" ? "Checking…" : "Check now"}
          </button>
        </div>

        <div className="row g20" style={{ position: "relative", marginTop: 18, flexWrap: "wrap" }}>
          <Fact k="Watching" v={watched.campaigns ? `${watched.campaigns} campaign${watched.campaigns === 1 ? "" : "s"}` : `${watched.products} products`} sub={watched.campaigns ? `${watched.ads} ads · stock on ${watched.products} products` : "No ads live yet — stock and orders"} />
          <Fact k="Waiting for you" v={String(open.length)} sub={open.length ? "Decide below" : "Nothing to decide"} tone={open.length ? "#FFD27A" : undefined} />
          <Fact k="To switch in Meta" v={String(decided.length)} sub={decided.length ? "Decided — one minute each" : "All done"} />
          <Fact k="Changes that worked" v={record.judged ? `${record.worked} of ${record.judged}` : "—"} sub={record.judged ? "Judged on Shopify orders" : record.applied ? `${record.applied} made · too early to tell` : "None made yet"} tone={record.judged && record.worked * 2 >= record.judged ? "#6EE7A8" : undefined} />
        </div>

        <div className="col g8" style={{ position: "relative", marginTop: 18, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,.12)" }}>
          <div className="row between g12" style={{ flexWrap: "wrap" }}>
            <span style={{ fontSize: 12.5, color: DIM }}>How much may Kaviar decide on its own?</span>
            <div className="row" role="radiogroup" aria-label="Autopilot mode" style={{ padding: 3, borderRadius: 99, background: "rgba(255,255,255,.1)" }}>
              {(Object.keys(MODES) as Mode[]).map((m) => (
                <button key={m} type="button" role="radio" aria-checked={mode === m} disabled={busy} onClick={() => pick(m)}
                  style={{ height: 30, padding: "0 14px", borderRadius: 99, fontSize: 12.5, fontWeight: mode === m ? 600 : 400, background: mode === m ? "#fff" : "transparent", color: mode === m ? "#121212" : "rgba(255,255,255,.75)", transition: "background .2s" }}>{MODES[m].name}</button>))}
            </div>
          </div>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,.85)" }}>{MODES[mode].line}</span>
          {!canAct && <span className="row g6" style={{ fontSize: 11.5, color: DIM }}><Icon name="lock" size={11} color="rgba(255,255,255,.55)" />Kaviar can read your Meta ads but not change them yet, so each decided change is switched by you in Ads Manager.</span>}
        </div>
      </div>

      {/* ---- the changes */}
      <div style={{ padding: "4px 22px 16px" }}>
        {open.length > 0 && <>
          <Head t="Waiting for you" n={open.length}>{easy.length > 1 && <button type="button" className="btn dark sm" disabled={busy} onClick={() => act(easy.map((c) => c.id), "approved")}><Icon name="check" size={12} color="#fff" />Approve all {easy.length}</button>}</Head>
          {open.map(Row)}
        </>}
        {decided.length > 0 && <>
          <Head t="Decided · switch these in Meta" n={decided.length}><button type="button" className="btn sm" onClick={sheet}><Icon name="download" size={12} />Checklist</button></Head>
          {decided.map(Row)}
        </>}
        {done.length > 0 && <>
          <Head t="Done · did it work?" n={done.length} />
          {done.map(Row)}
        </>}
        {skipped.length > 0 && <details><summary className="xs i3" style={{ cursor: "pointer", padding: "12px 0 4px" }}>Skipped · {skipped.length}</summary>{skipped.map(Row)}</details>}
        {open.length + decided.length + done.length === 0 && <div className="row g12" style={{ padding: "18px 0 6px" }}>
          <span style={{ width: 32, height: 32, borderRadius: 99, background: "#E7F4EC", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name="check" size={15} color="#1F7A52" /></span>
          <span className="col"><span className="sm w5 i1">Nothing to change right now</span><span className="xs i3">{watched.campaigns ? "No campaign is losing money, none is clearly ready for more, and no advertised product is selling out." : "Autopilot starts on your ads the moment one goes live."}</span></span>
        </div>}

        {/* ---- what it has been doing */}
        <div className="col" style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
          <span className="xs i3" style={{ letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600, paddingBottom: 6 }}>What Kaviar has been doing</span>
          {runs.length === 0 && <span className="xs i3">No checks yet. The first one runs on its own within the hour — or press Check now.</span>}
          {runs.map((r, i) => (
            <div key={i} className="row top g10" style={{ padding: "5px 0" }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, marginTop: 5, flexShrink: 0, background: r.good ? "#34C77B" : "var(--line-2)" }} />
              <span className="xs i3 tnum" style={{ width: 96, flexShrink: 0 }}>{r.when}</span>
              <span className="xs i2 fill" style={{ lineHeight: "17px" }}>{r.line}</span>
            </div>))}
        </div>
      </div>
    </div>
  );
}
