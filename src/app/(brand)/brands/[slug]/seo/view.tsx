"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { AgentFace } from "@/components/agent";
import { KIND, score, type Audit, type Fix, type Part, type Scores } from "@/lib/seo/types";
import { band, secs, type SpeedPage } from "@/lib/seo/speed-rules";
import { checkStore, edit, fix, mark, setStoreAuto, undo } from "./actions";

/**
 * SEO & AI search. Top (dark): how many things are wrong, the four counts they come from, and the two buttons that matter — fix them,
 * and let Kaviar keep fixing. Then the store-wide checks, then every fix grouped by product: what the store says now → what it should say.
 */
type Props = {
  slug: string; brand: string; audit: Audit | null; scores: Scores | null; checked: string | null; auto: boolean; canFix: boolean; allow: string; admin: string | null;
  fixes: Fix[]; runs: { when: string; line: string; auto: boolean }[];
};
type Tab = "open" | "you" | "done" | "skipped";
const DIM = "rgba(255,255,255,.55)";
const ORDER: Fix["kind"][] = ["search_title", "search_description", "alt", "thin"];
const num = (gid: string) => gid.slice(gid.lastIndexOf("/") + 1);

function Meter({ k, p }: { k: string; p: Part }) {
  const pct = p.total ? Math.round((p.ok / p.total) * 100) : 0, good = p.total > 0 && p.ok === p.total;
  return (
    <div className="col g6 fill" style={{ minWidth: 130 }}>
      <span style={{ fontSize: 11.5, color: DIM }}>{k}</span>
      <span className="row g6" style={{ alignItems: "baseline" }}><span className="tnum" style={{ fontSize: 22, lineHeight: "26px", fontWeight: 600, color: good ? "#6EE7A8" : "#fff" }}>{p.ok}</span><span className="tnum" style={{ fontSize: 12.5, color: DIM }}>of {p.total} fine</span></span>
      <span style={{ height: 4, borderRadius: 99, background: "rgba(255,255,255,.14)", overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: `${pct}%`, borderRadius: 99, background: good ? "#34C77B" : pct >= 60 ? "#E9B949" : "#FF9B73" }} /></span>
    </div>
  );
}

const TONE = { good: "#34C77B", ok: "#E9B949", poor: "#FF8A5C" } as const;
/** A score out of 100 as a ring, with one word under it. What it means is in the tooltip, not on the screen. */
function Dial({ v, text, label, hint, size = 64, dark = true }: { v: number | null; text?: string; label: string; hint?: string; size?: number; dark?: boolean }) {
  const r = (size - 8) / 2, c = 2 * Math.PI * r, tone = v == null ? "#8B8883" : TONE[band(v)], big = size > 70;
  return (
    <div className="row g10" title={hint}>
      <span style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }} aria-hidden>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={dark ? "rgba(255,255,255,.14)" : "var(--line)"} strokeWidth={big ? 7 : 5} />
          {v != null && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone} strokeWidth={big ? 7 : 5} strokeLinecap="round" strokeDasharray={`${(Math.max(2, v) / 100) * c} ${c}`} />}
        </svg>
        <span className="tnum" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: text ? 14 : big ? 28 : 18, fontWeight: 600, letterSpacing: "-0.02em", color: dark ? "#fff" : "var(--ink)" }}>{text ?? v ?? "–"}</span>
      </span>
      <span style={{ fontSize: big ? 15 : 13, fontWeight: 600, color: dark ? "#fff" : "var(--ink)" }}>{label}</span>
    </div>
  );
}

const TILE: Record<string, string> = { answer: "Answers in", scripts: "Code", apps: "Apps", blocking: "Blocking files", lazy: "Pictures loading early", sized: "Pictures with no size" };
/** One page's speed as six numbers. Only what is wrong gets a sentence. */
function SpeedCard({ p, admin }: { p: SpeedPage; admin: string | null }) {
  const g = p.google, bad = p.checks.filter((c) => !c.ok);
  const path = (() => { try { return new URL(p.url).pathname; } catch { return "/"; } })();
  return (
    <div className="col g12" style={{ flex: "1 1 420px", minWidth: 0, padding: 16, borderRadius: 16, background: "#fff", boxShadow: "0 0 0 1px var(--line)" }}>
      <div className="row between g12">
        <a className="sm w5 i1 lnk row g6" href={p.url} target="_blank" rel="noreferrer">{p.name}<Icon name="external" size={11} color="#8B8883" /></a>
        {g ? <Dial v={g.score} label="Google" hint="Google’s speed score on a phone" size={44} dark={false} />
          : <span className={`pill ${bad.length ? "amber" : "green"}`} style={{ height: 22, fontSize: 11, flexShrink: 0 }}>{bad.length ? `${bad.length} to fix` : "All fine"}</span>}
      </div>
      {g && <div className="row g16" style={{ flexWrap: "wrap" }}>
        {([["Shows in", g.lcp != null ? secs(g.lcp) : "–", g.lcp != null && g.lcp <= 2500, "Main content — 2.5 s or less is good"], ["Frozen for", g.tbt != null ? `${Math.round(g.tbt)} ms` : "–", g.tbt != null && g.tbt <= 200, "200 ms or less is good"], ["Jumps", g.cls != null ? g.cls.toFixed(2) : "–", g.cls != null && g.cls <= 0.1, "0.1 or less is good"]] as const).map(([k, v, ok, hint]) => (
          <span key={k} className="col" title={hint}><span className="xs i3">{k}</span><span className="tnum sm w5" style={{ color: ok ? "#1F7A52" : "#B4532A" }}>{v}</span></span>))}
        {g.real?.verdict && <span className="col" title="What Google recorded from real visitors over the last 28 days"><span className="xs i3">Real shoppers</span><span className="sm w5" style={{ color: g.real.verdict === "FAST" ? "#1F7A52" : g.real.verdict === "SLOW" ? "#B4532A" : "#8A6A14" }}>{g.real.verdict === "FAST" ? "Fast" : g.real.verdict === "SLOW" ? "Slow" : "Average"}</span></span>}
      </div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
        {p.checks.map((c) => (
          <div key={c.key} className="col g2" title={c.detail} style={{ padding: "9px 11px", borderRadius: 12, background: c.ok ? "var(--tray)" : "#FBEDE6" }}>
            <span className="row g4"><Icon name={c.ok ? "check-circle" : "warning-circle"} size={12} weight="fill" color={c.ok ? "#1F8A5B" : "#B4532A"} /><span className="xs i3 ell">{TILE[c.key] ?? c.name}</span></span>
            <span className="tnum w5" style={{ fontSize: 17, lineHeight: "22px", color: c.ok ? "var(--ink)" : "#B4532A" }}>{c.n ?? c.value}</span>
          </div>))}
      </div>
      {bad.map((c) => (
        <div key={c.key} className="col g4">
          <span className="xs i1"><b className="w5">{TILE[c.key] ?? c.name}:</b> {c.how ?? c.detail}</span>
          {c.items && c.items.length > 0 && <div className="row g4" style={{ flexWrap: "wrap" }}>{c.items.slice(0, 4).map((x) => <span key={x} className="pill" style={{ height: 22, fontSize: 11, maxWidth: "100%" }}><span className="ell">{x}</span></span>)}{c.items.length > 4 && <span className="xs i3">+{c.items.length - 4}</span>}</div>}
        </div>))}
      {g && g.slows.length > 0 && <div className="col g4">{g.slows.slice(0, 3).map((x) => <span key={x.name} className="xs i2"><b className="w5 i1">{x.name}</b>{x.saves ? ` · ${secs(x.saves)} faster` : ""}</span>)}</div>}
      {bad.length > 0 && admin && <a className="btn sm" style={{ alignSelf: "flex-start" }} href={`${admin}/themes/current/editor?previewPath=${encodeURIComponent(path)}`} target="_blank" rel="noreferrer">Open in the theme editor<Icon name="external" size={11} /></a>}
    </div>
  );
}

export function StoreView({ slug, brand, audit, scores: sco, checked, auto: saved, canFix, allow, admin, fixes, runs }: Props) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [doing, setDoing] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [tab, setTab] = useState<Tab>("open");
  const [openAt, setOpenAt] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [auto, setAuto] = useState(saved);
  const [copied, setCopied] = useState<string | null>(null);
  const go = (what: string, f: () => Promise<void>) => { setDoing(what); setMsg(null); start(async () => { await f(); router.refresh(); setDoing(null); }); };

  const open = useMemo(() => fixes.filter((f) => f.status === "proposed" && f.kind !== "thin"), [fixes]);
  const ready = open.filter((f) => f.after), unwritten = open.length - ready.length;
  const you = fixes.filter((f) => f.kind === "thin" && f.status === "proposed"), done = fixes.filter((f) => f.status === "applied"), skipped = fixes.filter((f) => f.status === "skipped");
  const list = tab === "open" ? open : tab === "you" ? you : tab === "done" ? done : skipped;
  const groups = useMemo(() => [...Map.groupBy(list, (f) => f.productGid).values()].map((g) => [...g].sort((x, y) => ORDER.indexOf(x.kind) - ORDER.indexOf(y.kind))), [list]);
  const sc = audit ? score(audit) : null;

  const save = (ids: string[] | "all", what: string) => go(what, async () => {
    const r = await fix(slug, ids);
    setMsg(r.fields ? { text: `Saved ${r.fields} fix${r.fields === 1 ? "" : "es"} to the store${r.failed ? ` · ${r.failed} didn’t save: ${r.error ?? ""}` : ""}`, bad: r.failed > 0 } : { text: r.error ?? "Nothing was saved", bad: true });
  });
  const check = () => go("check", async () => { const r = await checkStore(slug); if (r.error) setMsg({ text: r.error, bad: true }); });
  const copy = (id: string, text: string) => { void navigator.clipboard?.writeText(text); setCopied(id); setTimeout(() => setCopied(null), 1400); };
  const pick = (v: boolean) => { setAuto(v); go("mode", () => setStoreAuto(slug, v)); };
  const pill = (dark: boolean) => ({ height: 38, padding: "0 16px", borderRadius: 99, fontSize: 13.5, fontWeight: 500, flexShrink: 0, background: dark ? "#fff" : "rgba(255,255,255,.12)", color: dark ? "#121212" : "#fff" }) as const;

  const Row = (f: Fix, i: number) => {
    const on = editing?.id === f.id;
    return (
      <div key={f.id} className="row top g12" style={{ padding: "12px 0", borderTop: i ? "1px solid var(--line)" : 0 }}>
        {f.kind === "alt" && f.image
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={`${f.image}${f.image.includes("?") ? "&" : "?"}width=120`} alt="" loading="lazy" style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover", flexShrink: 0, background: "var(--tray-2)", boxShadow: "0 0 0 1px var(--line)" }} />
          : <span style={{ width: 44, height: 44, borderRadius: 8, background: "var(--tray)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name={f.kind === "search_title" ? "search" : f.kind === "thin" ? "file" : "rows"} size={16} color="#8B8883" /></span>}
        <div className="col g4 fill" style={{ minWidth: 0 }}>
          <span className="row g8"><span style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600, color: "#5B6FD6", flexShrink: 0 }}>{KIND[f.kind].name}</span><span className="xs i3 ell" title={KIND[f.kind].where}>{f.problem}</span></span>
          {f.kind === "thin" ? <span className="sm i2">Add in Shopify: who it is for, what is in it, how to use it, and the size. Kaviar won’t invent those.</span> : <>
            {f.before && <span className="xs i3" style={{ textDecoration: "line-through" }}>{f.before}</span>}
            {on ? <textarea autoFocus value={editing.text} onChange={(e) => setEditing({ id: f.id, text: e.target.value })} rows={f.kind === "search_description" ? 3 : 2}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--ink)", font: "inherit", fontSize: 13.5, lineHeight: "20px", resize: "vertical" }} />
              : f.after ? <span className="sm i1" style={{ lineHeight: "20px" }}>{f.after} <span className="xs i3 tnum">· {f.after.length} letters</span></span>
              : <span className="sm i3">Cleo hasn’t written this one yet — press “Check again”.</span>}
          </>}
          {f.error && f.status === "proposed" && <span className="xs" style={{ color: "#B4532A" }}>Not saved: {f.error}</span>}
        </div>
        <div className="row g6" style={{ flexShrink: 0, justifyContent: "flex-end" }}>
          {f.status === "proposed" && f.kind !== "thin" && (on ? <>
            <button type="button" className="btn dark sm" disabled={busy} onClick={() => { const e = editing!; setEditing(null); go(f.id, () => edit(slug, e.id, e.text)); }}>Keep</button>
            <button type="button" className="btn quiet sm" onClick={() => setEditing(null)}>Cancel</button>
          </> : <>
            {f.after && (canFix
              ? <button type="button" className="btn dark sm" disabled={busy} onClick={() => save([f.id], f.id)}>{doing === f.id ? <Icon name="spinner" size={12} className="spin" color="#fff" /> : <Icon name="check" size={12} color="#fff" />}Fix it</button>
              : <button type="button" className="btn dark sm" onClick={() => copy(f.id, f.after!)}><Icon name={copied === f.id ? "check" : "copy"} size={12} color="#fff" />{copied === f.id ? "Copied" : "Copy"}</button>)}
            {f.after && <button type="button" className="btn sm ic" title="Change the wording" aria-label="Change the wording" onClick={() => setEditing({ id: f.id, text: f.after! })}><Icon name="pencil" size={13} /></button>}
            {!canFix && f.after && <button type="button" className="btn sm" disabled={busy} title="I pasted it into Shopify" onClick={() => go(f.id, () => mark(slug, [f.id], "applied"))}>Done</button>}
            <button type="button" className="btn quiet sm" disabled={busy} onClick={() => go(f.id, () => mark(slug, [f.id], "skipped"))}>Skip</button>
          </>)}
          {f.status === "proposed" && f.kind === "thin" && <>
            {admin && <a className="btn dark sm" href={`${admin}/products/${num(f.productGid)}`} target="_blank" rel="noreferrer">Open in Shopify<Icon name="external" size={11} color="#fff" /></a>}
            <button type="button" className="btn quiet sm" disabled={busy} onClick={() => go(f.id, () => mark(slug, [f.id], "skipped"))}>Skip</button>
          </>}
          {f.status === "applied" && <>
            <span className="pill" style={{ height: 22, fontSize: 11, ...(f.by === "autopilot" ? { background: "#121212", color: "#fff" } : {}) }}>{f.by === "autopilot" ? "Kaviar fixed it" : "Fixed"}{f.appliedAt ? ` · ${f.appliedAt}` : ""}</span>
            {canFix && <button type="button" className="btn quiet sm" disabled={busy} onClick={() => go(f.id, async () => { const r = await undo(slug, f.id); if (r.error) setMsg({ text: r.error, bad: true }); })}>Undo</button>}
          </>}
          {f.status === "skipped" && <button type="button" className="btn quiet sm" disabled={busy} onClick={() => go(f.id, () => mark(slug, [f.id], "proposed"))}>Put back</button>}
        </div>
      </div>
    );
  };

  return (
    <div className="scroll" style={{ padding: "22px 24px 48px" }}>
      <div className="col g16">
        {/* ---- the state of the store, and the two buttons that matter */}
        <div style={{ position: "relative", overflow: "clip", borderRadius: 22, background: "#121212", color: "#fff", padding: "24px 26px 20px" }}>
          <div aria-hidden style={{ position: "absolute", right: -130, top: -170, width: 520, height: 520, borderRadius: 999, background: `radial-gradient(closest-side, ${open.length ? "rgba(91,111,214,.34)" : "rgba(52,199,123,.30)"}, transparent)` }} />
          <div className="row top between g20" style={{ position: "relative", flexWrap: "wrap" }}>
            <div className="row top g14" style={{ minWidth: 0 }}>
              <AgentFace kind="catalog" size={40} mood={open.length ? "up" : "happy"} />
              <div className="col g4">
                <span style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, color: DIM }}>SEO · AI search · Speed</span>
                {!audit ? <span style={{ fontSize: 30, lineHeight: "36px", fontWeight: 600, letterSpacing: "-0.02em" }}>Let Cleo read {brand}’s store</span>
                  : <span className="row g12" style={{ alignItems: "baseline", flexWrap: "wrap" }}>
                    <span className="tnum" style={{ fontSize: 56, lineHeight: "60px", fontWeight: 600, letterSpacing: "-0.035em", animation: "modalIn .6s ease-out both" }}>{open.length}</span>
                    <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em" }}>{open.length === 1 ? "thing to fix" : "things to fix"}</span>
                    {sc && <span className="tnum" style={{ fontSize: 13, color: DIM }}>{sc.ok} of {sc.total} checks pass</span>}
                  </span>}
                <span style={{ fontSize: 12.5, color: DIM }}>{audit ? `${audit.products} products · ${audit.pictures} pictures · checked ${checked}` : "About a minute. Nothing changes on the store until you say so."}</span>
              </div>
            </div>
            <div className="row g8" style={{ flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <button type="button" disabled={busy} onClick={check} className="row g6" style={pill(!audit)}>{doing === "check" ? <Icon name="spinner" size={13} className="spin" /> : <Icon name="refresh" size={13} />}{doing === "check" ? "Reading the store…" : audit ? "Check again" : "Read my store"}</button>
              {audit && ready.length > 0 && (canFix
                ? <button type="button" disabled={busy} onClick={() => save("all", "all")} className="row g6" style={pill(true)}>{doing === "all" ? <Icon name="spinner" size={13} className="spin" /> : <Icon name="check" size={13} />}Fix all {ready.length}</button>
                : <a href={allow} className="row g6" style={pill(true)}>Let Kaviar fix the store<Icon name="arrow-r" size={12} /></a>)}
            </div>
          </div>

          {audit && <>
            {sco && <div className="row g24" style={{ position: "relative", marginTop: 22, padding: "14px 18px", borderRadius: 16, background: "rgba(255,255,255,.06)", flexWrap: "wrap", alignItems: "center" }}>
              <Dial v={sco.overall} label="Overall" hint={sco.speed != null ? "SEO, AI search and Google’s speed score together" : "SEO and AI search together. Speed joins once Google’s speed test is on."} size={84} />
              <Dial v={sco.seo} label="SEO" hint="How well Google can list and describe the store: search titles, descriptions, picture descriptions, and the store-wide checks" />
              <Dial v={sco.ai} label="AI search" hint="How well ChatGPT, Claude and others can read and quote the store: descriptions, page text, crawlers let in, price and stock readable" />
              {sco.speed != null ? <Dial v={sco.speed} label="Speed" hint="Google’s speed score on a phone" />
                : sco.speedChecks.total > 0 ? <Dial v={Math.round((sco.speedChecks.ok / sco.speedChecks.total) * 100)} text={`${sco.speedChecks.ok}/${sco.speedChecks.total}`} label="Speed checks" hint="Kaviar’s own page checks that pass. Google’s speed score isn’t on yet, so speed is not part of the overall score." />
                : <Dial v={null} label="Speed" hint="Not measured yet — press Check again" />}
            </div>}
            <div className="row g20" style={{ position: "relative", marginTop: 20, flexWrap: "wrap" }}>
              <Meter k="Search titles" p={audit.title} /><Meter k="Search descriptions" p={audit.description} /><Meter k="Pictures described" p={audit.alt} /><Meter k="Pages with enough text" p={audit.text} />
            </div>
            <div className="row g12" style={{ position: "relative", marginTop: 20, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,.12)", flexWrap: "wrap" }}>
              <div style={{ display: "inline-flex", padding: 3, gap: 2, borderRadius: 99, background: "rgba(255,255,255,.1)" }} role="radiogroup" aria-label="How much Kaviar may fix alone">
                {([[false, "Ask me first"], [true, "Fix automatically"]] as const).map(([v, label]) => (
                  <button key={label} type="button" role="radio" aria-checked={auto === v} disabled={busy} onClick={() => pick(v)} style={{ height: 30, padding: "0 14px", borderRadius: 99, fontSize: 12.5, fontWeight: 500, background: auto === v ? "#fff" : "transparent", color: auto === v ? "#121212" : "rgba(255,255,255,.75)" }}>{label}</button>))}
              </div>
              <span className="fill" style={{ fontSize: 12.5, color: DIM, minWidth: 220 }}>
                {!canFix ? "Kaviar can read this store, not change it."
                  : auto ? "Fills empty fields every morning. Never replaces your words."
                  : "Nothing is saved until you press Fix."}
              </span>
              {!canFix && <a href={allow} className="row g6" style={{ ...pill(false), height: 30, fontSize: 12.5 }}>Allow in Shopify<Icon name="arrow-r" size={11} /></a>}
            </div>
          </>}
        </div>

        {msg && <div className="row g8 sm" style={{ padding: "10px 14px", borderRadius: 12, background: msg.bad ? "#FBEDE6" : "#E9F6EF", color: msg.bad ? "#B4532A" : "#1F7A52" }}><Icon name={msg.bad ? "warning-circle" : "check-circle"} size={15} />{msg.text}</div>}

        {/* ---- store-wide checks: a row of ticks; only a failing one says more */}
        {audit && <div className="row g8" style={{ flexWrap: "wrap" }}>
          {audit.site.map((c) => (
            <span key={c.key} title={c.detail} className="row g6" style={{ minHeight: 32, padding: "6px 12px", borderRadius: 99, background: "#fff", boxShadow: `0 0 0 1px ${c.ok === false ? "#EBC9B8" : "var(--line)"}`, maxWidth: "100%" }}>
              <Icon name={c.ok ? "check-circle" : c.ok === false ? "warning-circle" : "circle"} size={14} weight={c.ok == null ? "regular" : "fill"} color={c.ok ? "#1F8A5B" : c.ok === false ? "#B4532A" : "#B5B2AC"} style={{ flexShrink: 0 }} />
              <span className="xs w5 i1">{c.name}</span>{c.ok === false && c.how && <span className="xs i3">· {c.how}</span>}
            </span>))}
        </div>}

        {/* ---- speed on a phone */}
        {audit?.speed && audit.speed.pages.length > 0 && <div className="col g8">
          <span className="xs i3" style={{ letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>Speed on a phone</span>
          <div className="row g10 stretch" style={{ flexWrap: "wrap" }}>{audit.speed.pages.map((p) => <SpeedCard key={p.key} p={p} admin={admin} />)}</div>
        </div>}

        {/* ---- every fix, by product */}
        {audit && <div className="col g10">
          <div className="row between" style={{ borderBottom: "1px solid var(--line)" }}>
            <div className="tabs" style={{ borderBottom: 0 }} role="tablist">
              {([["open", "To fix", open.length], ["you", "Needs your words", you.length], ["done", "Fixed", done.length], ["skipped", "Skipped", skipped.length]] as const).map(([k, label, n]) => (
                <button key={k} role="tab" aria-selected={tab === k} className={`tab${tab === k ? " on" : ""}`} onClick={() => { setTab(k); setOpenAt(null); }}>{label}<span className="n">{n}</span></button>))}
            </div>
            {tab === "open" && unwritten > 0 && <span className="xs i3" style={{ paddingBottom: 6 }}>{unwritten} still to be written — “Check again” finishes them</span>}
          </div>
          {groups.length === 0 ? (
            <div className="row g12" style={{ padding: 22, background: "#fff", borderRadius: 16, boxShadow: "0 0 0 1px var(--line)" }}><AgentFace kind="catalog" size={32} mood="happy" /><span className="col"><span className="sm w5 i1">{tab === "open" ? "Nothing to fix" : tab === "you" ? "Every product page has enough text" : tab === "done" ? "Nothing fixed yet" : "Nothing skipped"}</span><span className="xs i3">{tab === "open" ? "Kaviar reads the store again every morning." : ""}</span></span></div>
          ) : groups.map((g, gi) => {
            const p = g[0], isOpen = openAt ? openAt === p.productGid : gi === 0, can = g.filter((f) => f.status === "proposed" && f.after && f.kind !== "thin");
            const kinds = [...Map.groupBy(g, (f) => f.kind).entries()].map(([k, v]) => `${v.length} ${v.length === 1 ? KIND[k].name.toLowerCase() : KIND[k].many}`).join(" · ");
            return (
              <div key={p.productGid} style={{ background: "#fff", borderRadius: 16, boxShadow: "0 0 0 1px var(--line)", overflow: "hidden" }}>
                <div className="row g12 hv" role="button" tabIndex={0} onClick={() => setOpenAt(isOpen ? "none" : p.productGid)} onKeyDown={(e) => { if (e.key === "Enter") setOpenAt(isOpen ? "none" : p.productGid); }} style={{ padding: "12px 16px", cursor: "pointer" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {(g.find((f) => f.kind !== "alt")?.image ?? p.image) ? <img src={`${g.find((f) => f.kind !== "alt")?.image ?? p.image}${(g.find((f) => f.kind !== "alt")?.image ?? p.image)!.includes("?") ? "&" : "?"}width=120`} alt="" loading="lazy" style={{ width: 40, height: 40, borderRadius: 10, objectFit: "cover", background: "var(--tray-2)", flexShrink: 0 }} /> : <span style={{ width: 40, height: 40, borderRadius: 10, background: "var(--tray-2)", flexShrink: 0 }} />}
                  <div className="col fill" style={{ minWidth: 0 }}><span className="sm w5 i1 ell">{p.productTitle}</span><span className="xs i3 ell">{kinds}</span></div>
                  {tab === "open" && can.length > 0 && canFix && <button type="button" className="btn sm" disabled={busy} onClick={(e) => { e.stopPropagation(); save(can.map((f) => f.id), p.productGid); }}>{doing === p.productGid ? <Icon name="spinner" size={12} className="spin" /> : null}Fix {can.length}</button>}
                  {admin && <a className="btn quiet sm ic" href={`${admin}/products/${num(p.productGid)}`} target="_blank" rel="noreferrer" title="Open in Shopify" aria-label="Open in Shopify" onClick={(e) => e.stopPropagation()}><Icon name="external" size={13} /></a>}
                  <Icon name="chev-d" size={13} color="#8B8883" style={{ transform: isOpen ? "rotate(180deg)" : undefined, transition: "transform .15s" }} />
                </div>
                {isOpen && <div style={{ padding: "0 16px 6px", borderTop: "1px solid var(--line)" }}>{g.map(Row)}</div>}
              </div>
            );
          })}
        </div>}

        {/* ---- what Kaviar did, and when */}
        {runs.length > 0 && <div className="col g6">
          <span className="xs i3" style={{ letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>Checks</span>
          <div className="card" style={{ padding: "2px 16px" }}>
            {runs.map((r, i) => (
              <div key={i} className="row g12 xs" style={{ padding: "9px 0", borderTop: i ? "1px solid var(--line)" : 0 }}>
                <span className="i3 tnum" style={{ width: 84, flexShrink: 0 }}>{r.when}</span><span className="i2 fill ell" title={r.line}>{r.line}</span><span className="i3">{r.auto ? "morning check" : "by the team"}</span>
              </div>))}
          </div>
        </div>}
      </div>
    </div>
  );
}
