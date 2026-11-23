"use client";
/* eslint-disable @next/next/no-img-element -- live ad pictures come from Meta's CDN */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { improveAd, rerunTest } from "./actions";
import { Face, groupTone, groupsOf } from "./panel";
import { AdArt } from "@/components/ad-creative";
import { AgentFace } from "@/components/agent";
import { Icon } from "@/components/icon";
import { NEXT, PANEL_NAME, SCROLL, ctrText, pct, type ItemScore, type Persona, type Reaction, type TestItem, type Verdict } from "@/lib/audience/types";
import type { TestRow } from "./view";

const VERDICT: Record<Verdict, string> = { Lead: "green", Keep: "blue", Fix: "amber", Drop: "red" };
const clock = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`; };

export function Thumb({ it, brand, w = 64 }: { it: TestItem; brand: string; w?: number }) {
  const box = { width: w, aspectRatio: "4 / 5", borderRadius: 8, overflow: "hidden", flexShrink: 0, background: "var(--tray-2)", position: "relative" as const };
  if (it.kind === "video" && it.assetId) return <span style={box}><video src={`/api/assets/${it.assetId}#t=0.5`} muted playsInline preload="metadata" style={{ width: "100%", height: "100%", objectFit: "cover" }} /></span>;
  if (it.kind === "live") return <span style={box}>{it.image ? <img src={it.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Icon name="megaphone" size={16} />}</span>;
  return <span style={box}><AdArt ad={{ id: it.key, format: it.format, hook: it.hook, primaryText: it.primaryText, headline: it.headline, cta: it.cta, offer: it.offer, product: it.product, imageUrl: it.image, why: "", status: "review", note: null, edited: false }} brand={brand} bare /></span>;
}

function Meter({ label, v, c }: { label: string; v: number; c: string }) {
  return (
    <span className="col g2" style={{ width: 92 }}>
      <span className="row between xs"><span className="i3">{label}</span><span className="w5 i1 tnum">{pct(v)}</span></span>
      <span style={{ height: 5, borderRadius: 99, background: "var(--tray-2)" }}><span style={{ display: "block", height: 5, width: `${Math.round(v * 100)}%`, borderRadius: 99, background: c }} /></span>
    </span>
  );
}

const best = (rs: Reaction[]) => rs.reduce<Reaction | null>((a, r) => (!a || NEXT.indexOf(r.next) * 4 + SCROLL.indexOf(r.scroll) > NEXT.indexOf(a.next) * 4 + SCROLL.indexOf(a.scroll) ? r : a), null);
const CELL = (r: Reaction | null) => !r ? ["var(--tray)", "#B5B2AC", "–"] : r.next === "tap and probably buy" ? ["#1F8A5B", "#fff", "Buy"] : r.next === "tap to find out more" ? ["#8FD1AE", "#0F4D31", "Tap"]
  : SCROLL.indexOf(r.scroll) >= 2 ? ["#DCEFE4", "#1F6B47", "Stop"] : r.scroll === "glanced" ? ["#F2F1EE", "#8B8883", "Look"] : ["#fff", "#C9C5BF", "Skip"];

/** A finished (or running) test: Iris's read, the ads ranked, what people said, and who would tap what. */
export function TestView({ slug, brand, t, now }: { slug: string; brand: string; t: TestRow; now: number }) {
  const router = useRouter();
  // Until someone opens a row, the panel's pick (or the top ad) is open — also when results arrive while the page is open.
  const [picked, setOpen] = useState<string | null | undefined>(undefined);
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const running = t.status === "running" && !t.stale;
  const people = new Map(t.personas.map((p) => [p.id, p]));
  const groups = groupsOf(t.personas);
  const scores = [...(t.result?.scores ?? [])].sort((a, b) => b.score - a.score);
  const open = picked === undefined ? t.result?.winner ?? scores[0]?.key ?? null : picked;
  const item = (k: string) => t.items.find((i) => i.key === k)!;
  const readOf = (k: string) => t.result?.read?.items.find((i) => i.key === k);
  const rerun = () => start(async () => { setMsg(null); const r = await rerunTest(slug, t.id); if (r.error) setMsg(r.error); else if (r.id) router.replace(`?panel=${t.kind}&test=${r.id}`, { scroll: false }); router.refresh(); });

  return (
    <div className="col g12">
      <div className="row between" style={{ alignItems: "flex-end" }}>
        <div className="col g2" style={{ minWidth: 0 }}>
          <span className="h3 ell">{t.title}</span>
          <span className="xs i3" suppressHydrationWarning>{t.focus ? `Shown only to: ${t.focus.length > 70 ? `${t.focus.slice(0, 70)}…` : t.focus}` : PANEL_NAME[t.kind]} · {t.personas.length || 12} people × 2 looks · {t.items.length} {t.items.length === 1 ? "item" : "items"} · {new Date(t.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
        </div>
        {!running && <button type="button" className="btn sm" disabled={busy} onClick={rerun}><Icon name="refresh" size={12} />Test again</button>}
      </div>
      {msg && <span className="xs c-amber">{msg}</span>}

      {(running || t.status === "error" || t.stale) && <Running t={t} now={now} running={running} people={people} groups={groups} />}

      {t.status === "done" && t.result && (
        <>
          <div className="col g8" style={{ padding: "14px 16px", borderRadius: 14, background: "#fff", border: "1px solid var(--line)", boxShadow: "0 4px 14px rgba(18,18,18,.04)" }}>
            <span className="row g8"><AgentFace kind="analyst" size={20} /><span className="xs w5 i3 fill">WHAT THE PANEL SAYS</span></span>
            <span style={{ fontSize: 16, lineHeight: "25px", letterSpacing: "-0.01em" }} className="i1">{t.result.read?.headline ?? "The panel has answered."}</span>
            {t.result.read?.summary && <span className="sm i2" style={{ lineHeight: "20px" }}>{t.result.read.summary}</span>}
            <span className="row g6" style={{ flexWrap: "wrap" }}>
              {t.result.stability != null && <span className={`pill ${t.result.stability >= 0.75 ? "green" : "amber"}`} style={{ height: 22, fontSize: 11 }} title="Each person looked twice, in opposite orders">Same answer on a second look · {pct(t.result.stability)}</span>}
              <span className={`pill ${t.result.calibrated ? "green" : ""}`} style={{ height: 22, fontSize: 11 }}>{t.result.calibrated ? "Click rates estimated from your real ads" : "Not matched to real results — compare ads with each other"}</span>
            </span>
          </div>

          <div className="col g8">
            {scores.map((s, i) => <ItemRow key={s.key} rank={i + 1} s={s} it={item(s.key)} read={readOf(s.key)} rs={t.reactions.filter((r) => r.item === s.key)} brand={brand} people={people} groups={groups}
              open={open === s.key} onOpen={() => setOpen(open === s.key ? null : s.key)} winner={t.result!.winner === s.key}
              onImprove={item(s.key).adId ? () => start(async () => { setMsg(null); const r = await improveAd(slug, t.id, s.key); if (r.error) setMsg(r.error); else if (r.batchId) router.push(`/brands/${slug}/creative/${r.batchId}`); }) : undefined} busy={busy} />)}
          </div>

          <Heatmap t={t} order={scores.map((s) => s.key)} groups={groups} />

          {t.result.read && (t.result.read.groups.length > 0 || t.result.read.next.length > 0) && (
            <div className="row top g12" style={{ flexWrap: "wrap" }}>
              {t.result.read.groups.length > 0 && <div className="col g6 fill" style={{ minWidth: 280, padding: "12px 14px", borderRadius: 12, background: "var(--tray)" }}>
                <span className="row g6 sm w5"><Icon name="users-three" size={14} />By group</span>
                {t.result.read.groups.map((g) => <span key={g.group} className="row top g6 xs i2" style={{ lineHeight: "17px" }}><span className="dot" style={{ width: 7, height: 7, marginTop: 4, flexShrink: 0, background: groupTone(groups, g.group)[0] }} /><span><b className="w5 i1">{g.group}:</b> {g.insight}</span></span>)}
              </div>}
              {t.result.read.next.length > 0 && <div className="col g6 fill" style={{ minWidth: 280, padding: "12px 14px", borderRadius: 12, background: "var(--tray)" }}>
                <span className="row g6 sm w5"><Icon name="lightning" size={14} color="#2563EB" />Next</span>
                {t.result.read.next.map((x) => <span key={x} className="xs i2" style={{ lineHeight: "17px" }}>· {x}</span>)}
              </div>}
            </div>
          )}
          <span className="xs i3" style={{ lineHeight: "16px" }}>A simulation: it’s good at telling which ad, message and group is stronger, and why — not at exact numbers. Run the winners on Meta to know for sure.</span>
        </>
      )}
    </div>
  );
}

function Running({ t, now, running, people, groups }: { t: TestRow; now: number; running: boolean; people: Map<string, Persona>; groups: string[] }) {
  const { done, total, failed } = t.progress;
  const latest = [...t.reactions].reverse().filter((r) => r.thought).slice(0, 4);
  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div className="card-h" style={{ background: running ? "var(--blue-bg)" : "var(--amber-bg)" }}>
        <AgentFace kind="analyst" size={22} mood={running ? "focus" : "worried"} />
        <span className="col fill" style={{ minWidth: 0 }}>
          <span className="sm w5">{running ? (total ? `The panel is looking · ${done} of ${total} answers in` : t.focus && !t.personas.length ? "Iris is building the people this batch is for…" : "Getting the ads ready…") : t.stale ? "This test stopped before it finished" : "The test couldn’t finish"}</span>
          <span className="xs i2 ell">{running ? `Usually 1–3 minutes · Iris reads the answers at the end${failed ? ` · ${failed} answer${failed === 1 ? "" : "s"} failed` : ""}` : t.stale ? "Test again — nothing was spent on ads." : t.error}</span>
        </span>
        {running && t.startedAt && <span className="xs tnum" style={{ color: "#1A8FAB" }}>{clock(now - Date.parse(t.startedAt))}</span>}
      </div>
      {total > 0 && <div style={{ height: 4, background: "var(--tray-2)" }}><div style={{ height: 4, width: `${Math.round(((done + failed) / total) * 100)}%`, background: "#1A8FAB", transition: "width .4s" }} /></div>}
      {latest.length > 0 && (
        <div className="col g6" style={{ padding: "10px 16px 12px" }}>
          {latest.map((r, i) => { const p = people.get(r.p); return p ? (
            <span key={`${r.p}${r.item}${r.pass}${i}`} className="row g8 xs"><Face p={p} groups={groups} size={20} /><span className="i3" style={{ width: 64, flexShrink: 0 }}>{p.name}</span><span className="i1 fill ell">“{r.thought}”</span><span className="i3">{r.next === "nothing" ? r.scroll : r.next}</span></span>
          ) : null; })}
        </div>
      )}
    </div>
  );
}

function ItemRow({ rank, s, it, read, rs, brand, people, groups, open, onOpen, winner, onImprove, busy }: {
  rank: number; s: ItemScore; it: TestItem; read?: { verdict: Verdict; why: string; fix: string; quotes: { p: string; text: string }[] }; rs: Reaction[]; brand: string;
  people: Map<string, Persona>; groups: string[]; open: boolean; onOpen: () => void; winner: boolean; onImprove?: () => void; busy: boolean;
}) {
  const uniq = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];
  const pulled = uniq(rs.map((r) => r.pulled)).slice(0, 4), off = uniq(rs.map((r) => r.putOff)).slice(0, 4);
  return (
    <div className="col" style={{ background: "#fff", border: `1px solid ${winner ? "#CBE6D6" : "var(--line)"}`, borderRadius: 12, overflow: "hidden" }}>
      <button type="button" className="row g12" style={{ padding: "10px 14px", textAlign: "left", width: "100%" }} onClick={onOpen} aria-expanded={open}>
        <span className="tnum sm w5 i3" style={{ width: 16 }}>{rank}</span>
        <Thumb it={it} brand={brand} w={52} />
        <span className="col g4 fill" style={{ minWidth: 0 }}>
          <span className="row g6" style={{ minWidth: 0 }}>
            <span className="sm w5 i1 ell">{it.label}</span>
            {winner && <span className="pill green" style={{ height: 20, fontSize: 11 }}><Icon name="star" size={10} color="#1F8A5B" />Panel pick</span>}
            {read && <span className={`pill ${VERDICT[read.verdict]}`} style={{ height: 20, fontSize: 11 }}>{read.verdict}</span>}
            {it.bench && <span className="pill" style={{ height: 20, fontSize: 11 }}>Live · the bar to beat</span>}
          </span>
          <span className="xs i3 ell">{read?.why ?? `${pct(s.clear)} understood it · ${pct(s.trust)} believed it`}</span>
        </span>
        <span className="row g12" style={{ flexShrink: 0 }}>
          <Meter label="Stop" v={s.stop} c="#5B6FD6" /><Meter label="Tap" v={s.tap} c="#1F8A5B" /><Meter label="Buy" v={s.buy} c="#0F4D31" />
          <span className="col" style={{ width: 86, alignItems: "flex-end" }}>
            <span className="tnum" style={{ fontSize: 22, lineHeight: "26px", fontWeight: 600 }}>{s.score}</span>
            <span className="xs i3" style={{ whiteSpace: "nowrap" }}>{it.real ? `real ${(it.real.ctr * 100).toFixed(2)}% clicks` : s.ctr ? `≈ ${ctrText(s.ctr)} clicks` : "panel score"}</span>
          </span>
          <Icon name={open ? "chev-d" : "chev-r"} size={13} />
        </span>
      </button>
      {open && (
        <div className="col g10" style={{ padding: "4px 14px 14px 46px", borderTop: "1px solid var(--line)" }}>
          {read?.fix && <span className="row top g8 sm" style={{ paddingTop: 10, lineHeight: "20px" }}><Icon name="pencil" size={14} color="#B7791F" /><span><b className="w5">Change:</b> {read.fix}</span></span>}
          {read?.quotes.length ? <div className="col g6" style={{ paddingTop: read?.fix ? 0 : 10 }}>
            {read.quotes.map((q, i) => { const p = people.get(q.p); return p ? <span key={i} className="row top g8 xs"><Face p={p} groups={groups} size={22} /><span className="col"><span className="i1" style={{ lineHeight: "17px" }}>“{q.text}”</span><span className="i3">{p.name}, {p.age} · {p.group}</span></span></span> : null; })}
          </div> : null}
          <div className="row top g16" style={{ flexWrap: "wrap" }}>
            {pulled.length > 0 && <div className="col g4 fill" style={{ minWidth: 220 }}><span className="xs w5 c-green">What pulled people in</span>{pulled.map((x) => <span key={x} className="xs i2" style={{ lineHeight: "16px" }}>· {x}</span>)}</div>}
            {off.length > 0 && <div className="col g4 fill" style={{ minWidth: 220 }}><span className="xs w5 c-amber">What put people off</span>{off.map((x) => <span key={x} className="xs i2" style={{ lineHeight: "16px" }}>· {x}</span>)}</div>}
            <div className="col g4" style={{ minWidth: 220 }}>
              <span className="xs w5 i2">Tapped, by group</span>
              {s.groups.map((g) => <span key={g.group} className="row g6 xs"><span className="dot" style={{ width: 7, height: 7, background: groupTone(groups, g.group)[0] }} /><span className="i2 fill ell">{g.group}</span><span className="i1 tnum w5">{pct(g.tap)}</span></span>)}
            </div>
          </div>
          {onImprove && <div className="row g8"><button type="button" className="btn sm dark" disabled={busy} onClick={onImprove}>{busy ? <Icon name="spinner" size={12} className="spin" color="#fff" /> : <AgentFace kind="builder" size={14} />}Improve with Remy</button><span className="xs i3">Remy writes 2 new versions that fix this — they’re added to the batch</span></div>}
        </div>
      )}
    </div>
  );
}

function Heatmap({ t, order, groups }: { t: TestRow; order: string[]; groups: string[] }) {
  const ps = [...t.personas].sort((a, b) => groups.indexOf(a.group) - groups.indexOf(b.group) || b.weight - a.weight);
  const [hover, setHover] = useState<string | null>(null);
  const cellOf = (p: string, k: string) => best(t.reactions.filter((r) => r.p === p && r.item === k));
  const tip = hover ? (() => { const [p, k] = hover.split("|"); const r = cellOf(p, k); const per = t.personas.find((x) => x.id === p); return r && per ? `${per.name}: “${r.thought}”` : null; })() : null;
  return (
    <div className="col g8">
      <div className="row between"><span className="h3">Who would tap what</span><span className="xs i3">each person’s strongest reaction over both looks</span></div>
      <div style={{ overflowX: "auto", background: "#fff", border: "1px solid var(--line)", borderRadius: 12, padding: "10px 12px" }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 3, fontSize: 11 }}>
          <thead><tr><th />{order.map((k, i) => <th key={k} className="xs i3" style={{ fontWeight: 500, padding: "0 2px" }} title={t.items.find((x) => x.key === k)?.label}>#{i + 1}</th>)}</tr></thead>
          <tbody>
            {ps.map((p) => (
              <tr key={p.id}>
                <td style={{ paddingRight: 8, whiteSpace: "nowrap" }}><span className="row g6"><Face p={p} groups={groups} size={18} /><span className="xs i1">{p.name}, {p.age}</span><span className="xs i3">{p.weight}%</span></span></td>
                {order.map((k) => { const [bg, c, l] = CELL(cellOf(p.id, k)); return (
                  <td key={k} onMouseEnter={() => setHover(`${p.id}|${k}`)} onMouseLeave={() => setHover(null)} style={{ width: 52, height: 24, borderRadius: 6, background: bg, color: c, textAlign: "center", border: bg === "#fff" ? "1px solid var(--line)" : undefined, cursor: "default", fontWeight: 500 }}>{l}</td>
                ); })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <span className="xs i2" style={{ minHeight: 16 }}>{tip ?? "Hover a square to read what that person thought."}</span>
    </div>
  );
}
