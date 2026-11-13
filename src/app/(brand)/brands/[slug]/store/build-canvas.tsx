"use client";
/* eslint-disable @next/next/no-img-element -- product photos from Shopify */
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addComment, chooseHero, markDecided, pauseBuild, redoStore, resolveComment, restoreRev, resumeBuild, retryStage, reviseStore, startBuild, undoStore } from "./actions";
import { StorePreview, type Look } from "./preview";
import { DEVICE_W, PAGES, SECTION_LABEL, type StorePage } from "./store-pages";
import { Icon, type IconName } from "@/components/icon";
import { AgentFace, AGENT_NAME } from "@/components/agent";
import type { BuildTask, StoreContent } from "@/lib/db/schema";
import type { QA, StoreProduct } from "@/lib/store/build";

type Who = "remy" | "cleo" | "otto" | "iris" | "you";
type Log = { rev: number; at: string; who: string; agent: Who; what: string; scope: string | null };
type Comment = { id: string; at: string; who: string; section: string; text: string; done?: boolean };
type Rev = { rev: number; at: string; content: StoreContent };
const KIND = { iris: "analyst", cleo: "catalog", remy: "builder", otto: "qa" } as const;
const ROLE = { builder: "builds pages", catalog: "manages catalog", qa: "checks quality", analyst: "reads the data" } as const;
const HOME = ["header", "hero", "promises", "bestsellers", "story", "faq", "newsletter"];
const DEVICES: [keyof typeof DEVICE_W, IconName, string][] = [["desktop", "monitor", "Desktop"], ["tablet", "tablet", "Tablet"], ["mobile", "mobile", "Mobile"]];
const dur = (ms: number) => { if (ms < 1000) return "<1s"; const s = Math.round(ms / 1000); return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`; };
const clock = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const ago = (iso: string, now: number) => { const m = Math.round((now - Date.parse(iso)) / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const initials = (n: string) => n.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();

function StateIcon({ s }: { s: BuildTask["status"] }) {
  if (s === "done") return <Icon name="check-circle" size={16} weight="fill" color="#1F8A5B" />;
  if (s === "running") return <span className="spin" style={{ width: 15, height: 15, margin: 0.5, borderRadius: 99, border: "1.5px solid #E7E5E1", borderTopColor: "#121212", borderRightColor: "#121212", flexShrink: 0 }} />;
  if (s === "needs" || s === "error") return <span style={{ width: 15, height: 15, margin: 0.5, borderRadius: 99, background: "#FBF3E6", border: "1.5px solid #B7791F", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><span style={{ width: 5, height: 5, borderRadius: 99, background: "#B7791F" }} /></span>;
  return <span style={{ width: 15, height: 15, margin: 0.5, borderRadius: 99, border: "1.5px dashed #D2CEC8", flexShrink: 0 }} />;
}

function Tool({ icon, on, label, onClick, disabled }: { icon: IconName; on?: boolean; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" title={label} aria-label={label} aria-pressed={on} disabled={disabled} onClick={onClick} className={on ? "hv-dark" : "hv"}
      style={{ width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: on ? "var(--ink)" : "transparent", opacity: disabled ? 0.35 : 1 }}>
      <Icon name={icon} size={16} color={on ? "#fff" : "#55534F"} />
    </button>
  );
}

function Card({ head, children }: { head: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="col" style={{ border: "1px solid #EFDDBE", borderRadius: 12, overflow: "hidden", background: "#fff", flexShrink: 0 }}>
      <div className="row g8" style={{ height: 36, padding: "0 12px", background: "var(--amber-bg)", borderBottom: "1px solid #F3E6CF" }}>{head}</div>
      {children}
    </div>
  );
}
const Pin = ({ n }: { n: number }) => <span style={{ width: 18, height: 18, borderRadius: "99px 99px 99px 3px", background: "#B7791F", color: "#fff", fontSize: 10, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{n}</span>;
const chipStyle: React.CSSProperties = { height: 24, padding: "0 8px", borderRadius: 6, background: "var(--tray)", fontSize: 11, color: "var(--ink-2)", whiteSpace: "nowrap" };

/** Board 05 · AI store build: build plan · live canvas with select / pan / comment · Activity, Decisions, Changes · Ask Remy. */
export function BuildCanvas(p: {
  slug: string; brand: string; category: string | null; currency: string; tasks: BuildTask[]; content: StoreContent | null; products: StoreProduct[]; look: Look; hero: string | null;
  running: boolean; startedAt: string | null; finishedAt: string | null; approved: string[]; log: Log[]; comments: Comment[]; history: Rev[]; qa: QA[];
  appsWaiting: string[]; setupDone: boolean;
}) {
  const { slug, brand, content, products, tasks, log, history, running } = p;
  const router = useRouter();
  const [page, setPage] = useState<StorePage>("home");
  const [device, setDevice] = useState<keyof typeof DEVICE_W>("desktop");
  const [zoom, setZoom] = useState(0.75);
  const [tool, setTool] = useState<"select" | "hand" | "comment">("select");
  const [sel, setSel] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [tab, setTab] = useState<"activity" | "decisions" | "changes">("activity");
  const [ask, setAsk] = useState("");
  const [image, setImage] = useState<{ name: string; url: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [view, setView] = useState<number | null>(null);      // viewing an older revision
  const [compare, setCompare] = useState(false);
  const [allLog, setAllLog] = useState(false);
  const [decision, setDecision] = useState(0);
  const [redo, setRedo] = useState<StoreContent[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [busy, start] = useTransition();
  const stage = useRef<HTMLDivElement>(null);
  const pan = useRef<{ x: number; y: number; l: number; t: number } | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const t = setInterval(() => { setNow(Date.now()); if (running) router.refresh(); }, running ? 2500 : 30000);
    return () => clearInterval(t);
  }, [running, router]);

  const act = useCallback((fn: () => Promise<{ error?: string; summary?: string } | void>, ok?: string) => start(async () => {
    const r = await fn();
    setMsg((r && r.error) || (r && r.summary ? `Remy: ${r.summary}` : ok ?? null));
    router.refresh();
  }), [router]);
  const undo = useCallback(() => { if (!content || !history.length) return; setRedo((s) => [...s, content]); act(() => undoStore(slug), "Undone — back one revision."); }, [act, content, history.length, slug]);
  const redoLast = useCallback(() => { const c = redo.at(-1); if (!c) return; setRedo((s) => s.slice(0, -1)); act(() => redoStore(slug, c), "Redone."); }, [act, redo, slug]);

  // V / H / C tools, ⌘Z undo, ⇧⌘Z redo, Esc clears the selection — like a design tool.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("textarea, input, select")) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redoLast(); else undo(); return; }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "v") setTool("select"); else if (e.key === "h") setTool("hand"); else if (e.key === "c") setTool("comment"); else if (e.key === "Escape") setSel(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redoLast]);

  const rev = log.at(-1)?.rev ?? 0;
  const done = tasks.filter((t) => t.status === "done").length;
  const total = tasks.length || 10;
  const cur = tasks.find((t) => t.status === "running") ?? null;
  const paused = !running && tasks.some((t) => t.status === "waiting") && tasks.some((t) => t.status === "done");
  // Running: wall clock since the start. Otherwise the time the stages actually took (pauses don't count).
  const elapsed = running && p.startedAt ? now - Date.parse(p.startedAt) : tasks.reduce((a, t) => a + (t.ms ?? 0), 0);
  const timed = tasks.filter((t) => t.status === "done" && t.ms);
  const avg = timed.length ? timed.reduce((a, t) => a + (t.ms ?? 0), 0) / timed.length : 0;
  const left = running && avg ? Math.max(1, Math.ceil(((total - done) * avg) / 60000)) : 0;
  const shown: StoreContent | null = view != null ? history.find((h) => h.rev === view)?.content ?? content : content;
  const before = compare ? (view != null ? content : history.at(-1)?.content ?? null) : null;
  const beforeRev = compare ? (view != null ? rev : history.at(-1)?.rev ?? null) : null;
  const noPhoto = products.filter((x) => !x.image);
  const openComments = p.comments.filter((c) => !c.done);
  const commentCount = Object.fromEntries(Object.keys(SECTION_LABEL).map((s) => [s, openComments.filter((c) => c.section === s).length]));
  const failing = p.qa.filter((q) => !q.ok && !/photo/i.test(q.label));
  const heroOpen = Boolean(content) && !p.approved.includes("hero");
  const appsOpen = p.appsWaiting.length > 0 && !p.approved.includes("apps");
  const photosOpen = noPhoto.length > 0 && !p.approved.includes("photos");
  const decisions = [heroOpen && "hero", appsOpen && "apps"].filter(Boolean) as string[];
  const d = decisions[Math.min(decision, decisions.length - 1)] ?? null;
  const W = DEVICE_W[device];
  const label = PAGES.find(([k]) => k === page)?.[1] ?? "Homepage";
  const deviceLabel = DEVICES.find(([k]) => k === device)?.[2];
  const writing = cur?.key === "content" || cur?.key === "mapping";
  const cursor = !running ? null : cur?.key === "catalog" || cur?.key === "pages" ? { section: "bestsellers", agent: "cleo" as const } : writing ? { section: "hero", agent: "remy" as const } : cur?.key === "qa" ? { section: "bestsellers", agent: "otto" as const } : null;
  const secStatus = (s: string) => (!content ? "queued" : running && writing ? (s === "hero" ? "writing" : "queued") : "done");
  const remyLast = log.filter((l) => l.agent === "remy").at(-1);
  const focus = sel ? SECTION_LABEL[sel] : cur ? cur.label : null;
  const nextDecision = () => setDecision((x) => (x + 1) % Math.max(1, decisions.length));

  const pick = (s: string) => { setSel(s); if (tool === "comment") setTimeout(() => composer.current?.focus(), 0); };
  const send = () => {
    const text = ask.trim();
    if (!text || !content) return;
    if (tool === "comment") {
      if (!sel) { setMsg("Pick a section on the canvas to comment on."); return; }
      const s = sel;
      act(async () => { await addComment(slug, s, text); setAsk(""); }, `Comment added to ${SECTION_LABEL[s]}.`);
      return;
    }
    act(async () => { const r = await reviseStore(slug, text, sel, image?.url); if (!r.error) { setAsk(""); setImage(null); setRedo([]); } return r; });
  };
  const attach = (f: File | undefined) => {
    if (!f) return;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(f.type) || f.size > 3_000_000) { setMsg("Attach a PNG, JPG or WebP under 3 MB."); return; }
    const r = new FileReader(); r.onload = () => setImage({ name: f.name, url: String(r.result) }); r.readAsDataURL(f);
  };
  const restore = (n: number) => { setView(null); setCompare(false); act(() => restoreRev(slug, n), `Restored r${n}.`); };

  // ---------------------------------------------------------------- right-panel cards
  const counter = (key: string) => (
    <button type="button" className="row g4 xs" style={{ color: "#B7791F" }} onClick={nextDecision} disabled={decisions.length < 2} aria-label="Next decision">
      {decisions.indexOf(key) + 1} of {decisions.length}<Icon name="chev-r" size={12} color="#B7791F" />
    </button>
  );
  const heroCard = content && (
    <Card head={<><Pin n={decisions.indexOf("hero") + 1} /><span className="xs w5" style={{ color: "#8A5A12" }}>Needs your approval</span><span className="fill" />{counter("hero")}</>}>
      <div className="col g8" style={{ padding: 12 }}>
        <div className="row between"><span className="sm w5">Hero headline</span><span className="xs i3">Homepage · Hero</span></div>
        {content.heroOptions.map((h, i) => {
          const on = content.hero === h;
          return (
            <button key={h} type="button" disabled={busy} onClick={() => act(() => chooseHero(slug, h), `Approved “${h}”.`)} className="row top g10 opt"
              style={{ padding: 10, border: on ? "1.5px solid var(--ink)" : "1px solid var(--line)", borderRadius: 9, textAlign: "left", background: "#fff" }}>
              <span className={`radio${on ? " on" : ""}`} style={{ marginTop: 2 }} />
              <span className="col g2 fill"><span className={`sm ${on ? "i1" : "i2"}`}>“{h}”</span><span className="xs i3">{i === 0 ? "Remy’s pick" : `Option ${i + 1}`} · {h.trim().split(/\s+/).length} words</span></span>
              {i === 0 && <span className="pill" style={{ height: 20, fontSize: 10.5, padding: "0 7px" }}>Recommended</span>}
            </button>
          );
        })}
        <div className="row top g8" style={{ padding: "2px 2px 0" }}><AgentFace kind="builder" size={18} mood="happy" />
          <span className="xs i3" style={{ lineHeight: "16px" }}><span className="i2 w5">Remy:</span> “Short enough for two lines on mobile, in the brand’s own words.”</span></div>
        <div className="row g8" style={{ marginTop: 2 }}>
          <button type="button" className="btn dark sm fill" disabled={busy} onClick={() => act(() => chooseHero(slug, content.hero), "Hero approved.")}>Approve</button>
          <button type="button" className="btn sm" onClick={() => { setPage("home"); setSel("hero"); setTool("select"); composer.current?.focus(); }}><Icon name="pencil" size={13} />Edit</button>
          <button type="button" className="btn sm ic" title="Three new options" aria-label="Three new options" disabled={busy} onClick={() => act(() => reviseStore(slug, "Write three new hero headline options, each under 6 words, and set the best as the hero", "hero"))}><Icon name="refresh" size={14} /></button>
        </div>
      </div>
    </Card>
  );
  const appsCard = (
    <Card head={<><Pin n={decisions.indexOf("apps") + 1} /><span className="xs w5" style={{ color: "#8A5A12" }}>Needs your approval</span><span className="fill" />{counter("apps")}</>}>
      <div className="col g8" style={{ padding: 12 }}>
        <div className="row between"><span className="sm w5">Shopify apps</span><span className="xs i3">Merchant auth</span></div>
        {p.appsWaiting.map((a) => <span key={a} className="row g8 sm i1"><Icon name="plug" size={13} color="#B7791F" />{a}<span className="fill" /><span className="xs c-amber">waiting</span></span>)}
        <div className="row top g8"><AgentFace kind="catalog" size={18} /><span className="xs i3" style={{ lineHeight: "16px" }}><span className="i2 w5">Cleo:</span> “The merchant approves these in their Shopify admin; I wire them in once they’re connected.”</span></div>
        <div className="row g6"><Link className="btn dark sm" href={`/brands/${slug}/integrations`}><Icon name="plug" size={13} color="#fff" />Open integrations</Link><button type="button" className="btn quiet sm" disabled={busy} onClick={() => act(() => markDecided(slug, "apps"))}>Mark handled</button></div>
      </div>
    </Card>
  );
  const photoCard = photosOpen && (
    <Card head={<><Icon name="image" size={14} color="#B7791F" /><span className="xs w5" style={{ color: "#8A5A12" }}>Needs a new photo</span><span className="fill" /><span className="xs" style={{ color: "#B7791F" }}>Product page</span></>}>
      <button type="button" className="row top g12 hv" style={{ padding: "12px 12px 10px", textAlign: "left" }} onClick={() => setPage("product")}>
        <div style={{ width: 44, height: 44, borderRadius: 8, background: "var(--tray-2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name="image" size={16} color="#B5B2AC" /></div>
        <span className="col g2 fill" style={{ minWidth: 0 }}><span className="sm w5 ell">{noPhoto[0].title}</span><span className="xs i3" style={{ lineHeight: "17px" }}>No photo in Shopify{noPhoto.length > 1 ? ` — and ${noPhoto.length - 1} more` : ""}. The grid shows a gap until it has one.</span></span>
      </button>
      <div className="row top g8" style={{ padding: "0 12px 10px" }}><AgentFace kind="qa" size={18} /><span className="xs i3" style={{ lineHeight: "16px" }}><span className="i2 w5">Otto:</span> “Everything else on this page is ready. A photo and I’ll finish it.”</span></div>
      <div className="row g6" style={{ padding: "0 12px 12px" }}>
        <Link className="btn dark sm" href={`/brands/${slug}/creative/shoots?product=${encodeURIComponent(noPhoto[0].title)}`}><Icon name="image" size={13} color="#fff" />Make a photo</Link>
        <button type="button" className="btn sm" disabled={busy || running} onClick={() => act(() => retryStage(slug, "pages"), "Checking the product photos again…")}><Icon name="refresh" size={13} />Retry</button>
        <button type="button" className="btn quiet sm" disabled={busy} onClick={() => act(() => markDecided(slug, "photos"))}>Skip</button>
      </div>
    </Card>
  );
  const logRow = (l: Log, i: number) => {
    const kind = l.agent === "you" ? null : KIND[l.agent];
    return (
      <div key={i} className="row top g10" style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
        {kind ? <AgentFace kind={kind} size={22} mood="focus" /> : <span className="av" style={{ width: 22, height: 22, fontSize: 9 }}>{initials(l.who)}</span>}
        <div className="col fill g4" style={{ minWidth: 0 }}>
          <div className="row between"><span className="xs w5 i1">{kind ? AGENT_NAME[kind] : l.who}<span className="i3" style={{ fontWeight: 400 }}> · {kind ? ROLE[kind] : "team"}</span></span><span className="xs i4 tnum">{hhmm(l.at)}</span></div>
          <span className="xs i2" style={{ lineHeight: "17px" }}>{l.what}</span>
          {l.scope && SECTION_LABEL[l.scope] && <button type="button" className="row g4 xs i3" style={{ alignSelf: "flex-start" }} onClick={() => { setPage(l.scope === "about" ? "story" : "home"); setSel(l.scope); }}><Icon name="layers" size={11} />{SECTION_LABEL[l.scope]}</button>}
        </div>
      </div>
    );
  };

  // ---------------------------------------------------------------- layout
  return (<>
    <header className="bar">
      <nav className="crumb" aria-label="Breadcrumb">
        <Link className="lnk" href={`/brands/${slug}`}>{brand}</Link><Icon name="chev-r" size={12} color="#B5B2AC" />
        <Link className="lnk" href={`/brands/${slug}/store?step=setup`}>Store builder</Link><Icon name="chev-r" size={12} color="#B5B2AC" /><b>Build</b>
      </nav>
      <div className="fill" />
      <div className="seg" aria-label="Pipeline">
        <Link className="o" href="?step=setup">{p.setupDone ? <Icon name="check-circle" size={14} weight="fill" color="#1F8A5B" /> : null}Setup</Link>
        <span className="o on"><span style={{ width: 6, height: 6, borderRadius: 99, background: running ? "#1AA7C8" : paused ? "#B7791F" : "#1F8A5B" }} />Build</span>
        {content && !running ? <Link className="o" href="?step=review">Review</Link> : <span className="o" style={{ color: "var(--ink-4)" }}>Review</span>}
        <span className="o" style={{ color: "var(--ink-4)" }}><Icon name="lock" size={13} color="#B5B2AC" />Publish</span>
      </div>
      <div className="fill" />
      <div className="row" aria-label="Agents on this build">{(["builder", "catalog", "qa"] as const).map((k, i) => <div key={k} style={{ marginLeft: i ? -6 : 0, borderRadius: 99, background: "#fff", padding: 2, display: "flex" }}><AgentFace kind={k} size={22} /></div>)}</div>
      <span className="row g6 sm i2" style={{ whiteSpace: "nowrap" }}>
        <span className="dot" style={{ background: running ? "#1AA7C8" : paused ? "#B7791F" : "#1F8A5B" }} />{running ? "Running" : paused ? "Paused" : "Built"}
        <span className="i4">·</span><span className="i3 tnum">{dur(elapsed)}</span>
      </span>
      <div className="vr" style={{ margin: "14px 2px" }} />
      {running ? <button type="button" className="btn sm" disabled={busy} onClick={() => act(() => pauseBuild(slug), "Pausing after this stage…")}><Icon name="pause" size={14} />Pause</button>
        : paused ? <button type="button" className="btn sm" disabled={busy} onClick={() => act(() => resumeBuild(slug), "Resumed.")}><Icon name="play" size={13} />Resume</button>
        : <button type="button" className="btn sm" disabled={busy} onClick={() => act(() => startBuild(slug), "Rebuilding…")}><Icon name="refresh" size={13} />Rebuild</button>}
      {content ? <a className="btn dark sm" href={`/preview/${slug}?page=${page}`} target="_blank" rel="noreferrer">Open preview<Icon name="arrow-ur" size={13} color="#fff" /></a>
        : <span className="btn dark sm" style={{ opacity: 0.4 }}>Open preview<Icon name="arrow-ur" size={13} color="#fff" /></span>}
    </header>

    <div className="row fill stretch" style={{ minHeight: 0 }}>
      {/* ------------------------------------------------ Build plan */}
      <section className="col" style={{ width: 300, flexShrink: 0, borderRight: "1px solid var(--line)", minHeight: 0 }}>
        <div className="col g10" style={{ padding: "18px 18px 14px" }}>
          <div className="row between"><span className="h3">Build plan</span><span className="xs i3 tnum">{done} of {total}{left ? ` · ~${left} min left` : ""}</span></div>
          <div className="steps">{(tasks.length ? tasks : Array.from({ length: 10 }, () => null)).map((t, i) => <span key={i} className={`s${t?.status === "done" ? " done" : t?.status === "running" ? " now" : ""}`} style={t?.status === "needs" || t?.status === "error" ? { background: "#EBCF9F" } : undefined} />)}</div>
        </div>
        <div className="col" style={{ padding: "0 8px", gap: 1, overflowY: "auto", minHeight: 0 }}>
          {tasks.length === 0 && <span className="xs i3" style={{ padding: "0 10px" }}>Starting — Iris reads the brand first.</span>}
          {tasks.map((t, i) => {
            const on = t.status === "running" || (t.key === "content" && !running && page === "home" && Boolean(content));
            const tone = on || t.status === "needs" || t.status === "error" ? "i1 w5" : t.status === "done" ? "i2" : "i3";
            const right = t.status === "needs" || t.status === "error" ? <span className="xs c-amber ell" style={{ maxWidth: 120 }}>{t.detail}</span>
              : t.status === "running" && t.at ? <span className="xs tnum i3">{dur(now - Date.parse(t.at))}</span>
              : t.status === "done" && t.ms != null ? <span className="xs tnum i3">{dur(t.ms)}</span> : null;
            const go = t.key === "review" && content && !running ? () => router.push(`/brands/${slug}/store?step=review`)
              : t.key === "pages" ? () => setPage("product") : t.key === "apps" && appsOpen ? () => setTab("decisions") : t.key === "content" ? () => setPage("home") : undefined;
            return (
              <div key={t.key} className="col">
                <button type="button" onClick={go} disabled={!go} title={t.detail || undefined} className="row g10 ti"
                  style={{ height: 34, padding: "0 8px 0 10px", borderRadius: 8, textAlign: "left", cursor: go ? "pointer" : "default", color: "inherit", ...(on ? { background: "var(--tray)", boxShadow: "inset 0 0 0 1px var(--line)" } : {}) }}>
                  <StateIcon s={t.status} />
                  <span className="xs i4 tnum" style={{ width: 15 }}>{String(i + 1).padStart(2, "0")}</span>
                  <span className={`sm fill ell ${tone}`}>{t.label}</span>
                  {right}
                </button>
                {t.key === "content" && on && (
                  <div className="col" style={{ margin: "4px 8px 6px 17px", paddingLeft: 16, borderLeft: "1px solid var(--line)" }}>
                    {HOME.map((s) => {
                      const st = secStatus(s), here = sel === s || st === "writing";
                      return (
                        <button key={s} type="button" className="row g10 hv" style={{ height: 25, borderRadius: 6, textAlign: "left" }} onClick={() => { setPage("home"); setSel(s); setTool("select"); }}>
                          <span className="row" style={{ width: 12, justifyContent: "center" }}>
                            {here ? <span style={{ width: 7, height: 7, borderRadius: 99, background: "#1AA7C8", boxShadow: "0 0 0 3px rgba(26,167,200,.18)" }} />
                              : st === "done" ? <Icon name="check" size={12} color="#1F8A5B" /> : <span className="dot" style={{ background: "#E2DFDA", width: 6, height: 6 }} />}
                          </span>
                          <span className={`xs fill ${here ? "i1 w5" : st === "queued" ? "i3" : "i2"}`}>{SECTION_LABEL[s]}</span>
                          <span className={`xs tnum ${here ? "i1" : "i4"}`}>{commentCount[s] ? `${commentCount[s]} note${commentCount[s] > 1 ? "s" : ""}` : st === "writing" ? "writing" : sel === s ? "selected" : ""}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="fill" />
        <div className="col g10" style={{ margin: 12, padding: 12, border: "1px solid var(--line)", borderRadius: 12, background: "#fff", boxShadow: "0 1px 2px rgba(18,18,18,.04)", flexShrink: 0 }}>
          <div className="row g10">
            <AgentFace kind="builder" size={30} mood={running ? "focus" : "happy"} />
            <div className="col fill" style={{ minWidth: 0 }}><span className="sm w5">Remy<span className="i3" style={{ fontWeight: 400 }}> · builds pages</span></span><span className="xs i3 ell">{focus ? `Focused on ${focus}` : paused ? "Paused" : "Ready for changes"}</span></div>
            {running && <button type="button" className="btn quiet sm ic" title="Pause" aria-label="Pause" disabled={busy} onClick={() => act(() => pauseBuild(slug), "Pausing after this stage…")}><Icon name="pause" size={14} /></button>}
          </div>
          <p className="xs i2" style={{ lineHeight: "17px" }}>{running && cur ? cur.detail || `Working on ${cur.label.toLowerCase()}…` : remyLast?.what ?? "Select any section on the canvas and ask for a change — or ask for the whole page."}</p>
          <div className="row g6">
            <span className="row g6" style={chipStyle}><Icon name="box" size={12} color="#8B8883" />{products.length} products</span>
            <Icon name="arrow-r" size={12} color="#B5B2AC" />
            <span className="row g6" style={chipStyle}><Icon name="layers" size={12} color="#8B8883" />{sel && HOME.includes(sel) ? `Section ${String(HOME.indexOf(sel) + 1).padStart(2, "0")}` : `r${rev}`}</span>
            <span className="fill" />{running && cur?.at && <span className="xs i3 tnum">{clock(now - Date.parse(cur.at))}</span>}
          </div>
          {running && <div className="prog" style={{ height: 3 }}><div className="v" style={{ width: `${Math.round((done / total) * 100)}%`, height: 3, background: "#1AA7C8" }} /></div>}
        </div>
      </section>

      {/* ------------------------------------------------ Canvas */}
      <section className="col fill" style={{ background: "var(--tray)", position: "relative", minWidth: 0 }}>
        <div className="row g8" style={{ height: 48, padding: "0 14px", borderBottom: "1px solid var(--line)", background: "var(--sheet)", flexShrink: 0 }}>
          <label className="chip" style={{ position: "relative" }}><Icon name="file" size={14} color="#8B8883" />{label}<Icon name="chev-d" size={12} color="#8B8883" />
            <select aria-label="Page" value={page} onChange={(e) => { setPage(e.target.value as StorePage); setSel(null); }} style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}>{PAGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </label>
          <div className="seg">{DEVICES.map(([k, ic, l]) => <button key={k} type="button" title={l} aria-label={l} className={`o ic${device === k ? " on" : ""}`} onClick={() => setDevice(k)}><Icon name={ic} size={15} /></button>)}</div>
          <div className="fill" />
          {content && (
            <label className="chip" style={{ position: "relative" }}><Icon name="clock" size={14} color="#8B8883" />r{view ?? rev}<span className="v">· {ago((view != null ? history.find((h) => h.rev === view)?.at : log.at(-1)?.at) ?? new Date(now).toISOString(), now)}</span><Icon name="chev-d" size={12} color="#8B8883" />
              <select aria-label="Revision" value={view ?? ""} onChange={(e) => setView(e.target.value ? Number(e.target.value) : null)} style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}>
                <option value="">r{rev} · current</option>{[...history].reverse().map((h) => <option key={h.rev} value={h.rev}>r{h.rev} · {hhmm(h.at)}</option>)}
              </select>
            </label>
          )}
          <button type="button" className="chip" disabled={!history.length} onClick={() => setCompare((c) => !c)} style={compare ? { background: "var(--ink)", color: "#fff", borderColor: "var(--ink)" } : history.length ? undefined : { opacity: 0.5 }}><Icon name="split" size={14} color={compare ? "#fff" : "#8B8883"} />Compare</button>
        </div>

        <div ref={stage} onClick={() => tool !== "hand" && setSel(null)}
          onPointerDown={(e) => { if (tool === "hand" && stage.current) pan.current = { x: e.clientX, y: e.clientY, l: stage.current.scrollLeft, t: stage.current.scrollTop }; }}
          onPointerMove={(e) => { if (pan.current && stage.current) { stage.current.scrollLeft = pan.current.l - (e.clientX - pan.current.x); stage.current.scrollTop = pan.current.t - (e.clientY - pan.current.y); } }}
          onPointerUp={() => { pan.current = null; }} onPointerLeave={() => { pan.current = null; }}
          className="fill" style={{ overflow: "auto", padding: "18px 24px 90px", cursor: tool === "hand" ? "grab" : "default", minHeight: 0 }}>
          {shown ? (
            <div className="row top" style={{ gap: 28, justifyContent: "center", minWidth: "fit-content" }}>
              {before && (
                <div className="col" style={{ width: W * zoom, flexShrink: 0 }}>
                  <div className="row between" style={{ height: 22, padding: "0 2px" }}><span className="xs i2 w5">r{beforeRev}<span className="i3" style={{ fontWeight: 400 }}> · before</span></span>{view == null && beforeRev != null && <button type="button" className="xs lnk i2" onClick={() => restore(beforeRev)}>Restore this</button>}</div>
                  <div style={{ zoom, pointerEvents: "none" }}><StorePreview brand={brand} category={p.category} c={before} products={products} look={p.look} hero={p.hero} width={W} currency={p.currency} page={page} /></div>
                </div>
              )}
              <div className="col" style={{ width: W * zoom, flexShrink: 0 }}>
                <div className="row between" style={{ height: 22, padding: "0 2px" }}>
                  <span className="xs i2 w5">{label}<span className="i3" style={{ fontWeight: 400 }}> · {deviceLabel}</span></span>
                  {view != null
                    ? <span className="row g6 xs i3"><span className="dot" style={{ width: 6, height: 6, background: "#B7791F" }} />Viewing r{view} · <button type="button" className="lnk i2" onClick={() => restore(view)}>Restore</button> · <button type="button" className="lnk i2" onClick={() => setView(null)}>Back to r{rev}</button></span>
                    : <span className="row g6 xs i3"><span className="dot blue" style={{ width: 6, height: 6 }} />Draft r{rev} · not published</span>}
                </div>
                <div style={{ zoom, position: "relative" }}>
                  <StorePreview brand={brand} category={p.category} c={shown} products={products} look={p.look} hero={p.hero} width={W} currency={p.currency} page={page}
                    pins={heroOpen && view == null && page === "home" ? { hero: decisions.indexOf("hero") + 1 } : undefined} cursor={view == null ? cursor : null}
                    pick={view != null ? undefined : { selected: sel, hover, onHover: setHover, onPick: pick, comments: commentCount, tool, status: sel ? { [sel]: running && writing && sel === "hero" ? "writing" : "selected" } : {} }} />
                </div>
              </div>
            </div>
          ) : (
            <div className="col g10" style={{ width: W * zoom, margin: "0 auto" }}>
              <div className="row between" style={{ height: 22 }}><span className="xs i2 w5">{label}<span className="i3" style={{ fontWeight: 400 }}> · {deviceLabel}</span></span><span className="xs i3">Waiting for Remy’s copy</span></div>
              {[26, 52, 262, 290, 200].map((h, i) => <div key={i} className="skel" style={{ height: h * zoom * (W / 600), borderRadius: i ? 0 : "8px 8px 0 0" }} />)}
              <span className="xs i3" style={{ textAlign: "center" }}>{running ? `${cur?.label ?? "The build"} in progress — the canvas fills in as soon as Remy writes the homepage.` : "Start the build and the store appears here."}</span>
            </div>
          )}
        </div>

        <div className="row center" style={{ position: "absolute", left: 0, right: 0, bottom: 16, pointerEvents: "none" }}>
          <div className="row g2" style={{ height: 40, padding: "0 5px", background: "#fff", borderRadius: 12, boxShadow: "0 0 0 1px rgba(18,18,18,.08), 0 8px 24px rgba(18,18,18,.12)", pointerEvents: "auto" }}>
            <Tool icon="pointer" label="Select (V)" on={tool === "select"} onClick={() => setTool("select")} />
            <Tool icon="hand" label="Pan (H)" on={tool === "hand"} onClick={() => setTool("hand")} />
            <Tool icon="msg" label="Comment (C)" on={tool === "comment"} onClick={() => setTool("comment")} />
            <div className="vr" style={{ margin: "9px 4px" }} />
            <Tool icon="minus" label="Zoom out" onClick={() => setZoom((z) => Math.max(0.3, +(z - 0.05).toFixed(2)))} />
            <button type="button" className="sm w5 tnum" style={{ width: 40, textAlign: "center" }} title="Back to 75%" onClick={() => setZoom(0.75)}>{Math.round(zoom * 100)}%</button>
            <Tool icon="plus" label="Zoom in" onClick={() => setZoom((z) => Math.min(1.5, +(z + 0.05).toFixed(2)))} />
            <div className="vr" style={{ margin: "9px 4px" }} />
            <Tool icon="undo" label="Undo (⌘Z)" disabled={busy || !history.length} onClick={undo} />
            <Tool icon="redo" label="Redo (⇧⌘Z)" disabled={busy || !redo.length} onClick={redoLast} />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ Activity · Decisions · Changes */}
      <section className="col" style={{ width: 340, flexShrink: 0, borderLeft: "1px solid var(--line)", background: "#fff", minHeight: 0 }}>
        <div className="tabs" style={{ padding: "0 16px", gap: 20, flexShrink: 0 }}>
          {([["activity", "Activity", 0], ["decisions", "Decisions", decisions.length + (photosOpen ? 1 : 0) + failing.length], ["changes", "Changes", rev]] as const).map(([k, l, n]) => (
            <button key={k} type="button" className={`tab${tab === k ? " on" : ""}`} onClick={() => setTab(k)}>{l}{n ? <span className="n">{n}</span> : null}</button>
          ))}
        </div>
        <div className="col fill" style={{ overflowY: "auto", minHeight: 0 }}>
          {tab === "activity" && <>
            {(d || photoCard) && <div className="col g10" style={{ padding: "14px 14px 0" }}>{d === "hero" ? heroCard : d === "apps" ? appsCard : null}{photoCard}</div>}
            {openComments.length > 0 && (
              <div className="col" style={{ padding: "4px 16px 0" }}>
                <span className="xs w5 i3" style={{ padding: "10px 0 2px" }}>Comments · {openComments.length}</span>
                {openComments.slice(-4).map((c) => (
                  <div key={c.id} className="row top g10" style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
                    <span className="av j" style={{ width: 22, height: 22, fontSize: 9 }}>{initials(c.who)}</span>
                    <div className="col fill g4" style={{ minWidth: 0 }}>
                      <div className="row between"><button type="button" className="xs w5 i1" onClick={() => { setPage(c.section === "about" ? "story" : "home"); setSel(c.section); }}>{c.who}<span className="i3" style={{ fontWeight: 400 }}> · {SECTION_LABEL[c.section]}</span></button><span className="xs i4 tnum">{hhmm(c.at)}</span></div>
                      <span className="xs i2" style={{ lineHeight: "17px" }}>{c.text}</span>
                      <div className="row g10"><button type="button" className="xs lnk i2" onClick={() => { setSel(c.section); setTool("select"); setAsk(c.text); composer.current?.focus(); }}>Ask Remy to fix</button><button type="button" className="xs lnk i3" onClick={() => act(() => resolveComment(slug, c.id))}>Resolve</button></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="col" style={{ padding: "4px 16px 12px" }}>
              <div className="row between" style={{ padding: "10px 0 0" }}><span className="xs w5 i3">Earlier</span>{log.length > 6 && <button type="button" className="xs i2 lnk" onClick={() => setAllLog((x) => !x)}>{allLog ? "Show less" : `View all ${log.length}`}</button>}</div>
              {[...log].reverse().slice(0, allLog ? 200 : 6).map(logRow)}
              {log.length === 0 && <span className="xs i3" style={{ padding: "10px 0" }}>The agents’ work shows up here as they go.</span>}
            </div>
          </>}
          {tab === "decisions" && (
            <div className="col g10" style={{ padding: 14 }}>
              {decisions.includes("hero") && heroCard}{decisions.includes("apps") && appsCard}{photoCard}
              {failing.map((q) => (
                <div key={q.label} className="col g4" style={{ padding: 12, borderRadius: 12, border: "1px solid var(--line)" }}>
                  <span className="row g6 sm w5"><Icon name="warning-circle" size={14} color="#B7791F" />{q.label}</span>
                  <span className="xs i3">{q.detail}{q.fix ? ` · ${q.fix}` : ""}</span>
                </div>
              ))}
              {!decisions.length && !photosOpen && !failing.length && (
                <div className="col g6" style={{ padding: "24px 8px", alignItems: "center", textAlign: "center" }}><Icon name="check-circle" size={22} weight="fill" color="#1F8A5B" /><span className="sm w5">Nothing waiting on you</span><span className="xs i3">Select any section on the canvas to change it, or open Review when it looks right.</span></div>
              )}
            </div>
          )}
          {tab === "changes" && (
            <div className="col" style={{ padding: "4px 16px 12px" }}>
              {[...log].reverse().filter((l, i, a) => l.rev > 0 && a.findIndex((x) => x.rev === l.rev) === i).map((l) => (
                <div key={l.rev} className="row top g10" style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
                  <span className="pill" style={{ height: 20, fontSize: 10.5, flexShrink: 0 }}>r{l.rev}</span>
                  <div className="col fill g2" style={{ minWidth: 0 }}><span className="xs i1" style={{ lineHeight: "17px" }}>{l.what}</span><span className="xs i3">{l.who} · {hhmm(l.at)}{l.scope && SECTION_LABEL[l.scope] ? ` · ${SECTION_LABEL[l.scope]}` : ""}</span></div>
                  {l.rev === rev ? <span className="xs c-green" style={{ flexShrink: 0 }}>Current</span>
                    : history.some((h) => h.rev === l.rev) ? <span className="row g8" style={{ flexShrink: 0 }}><button type="button" className="xs lnk i2" onClick={() => { setView(l.rev); setCompare(false); }}>View</button><button type="button" className="xs lnk i2" disabled={busy} onClick={() => restore(l.rev)}>Restore</button></span> : null}
                </div>
              ))}
              {rev === 0 && <span className="xs i3" style={{ padding: "12px 0" }}>Every change Remy or the team makes becomes a revision here, and any of them can be viewed or restored.</span>}
            </div>
          )}
        </div>

        <div className="col g8" style={{ margin: "0 14px 14px", padding: "10px 10px 8px", border: "1px solid var(--line-2)", borderRadius: 12, background: "#fff", boxShadow: "0 1px 2px rgba(18,18,18,.05), 0 6px 16px rgba(18,18,18,.04)", flexShrink: 0 }}>
          {msg && <span className="xs i2" style={{ padding: "0 2px" }}>{msg}</span>}
          {(sel || image) && (
            <div className="row g6" style={{ flexWrap: "wrap" }}>
              {sel && <span className="row g4 xs" style={{ height: 22, padding: "0 4px 0 8px", borderRadius: 6, background: "rgba(26,167,200,.10)", color: "#0E7490" }}>{tool === "comment" ? "Comment on" : "Only"} {SECTION_LABEL[sel]}<button type="button" aria-label="Clear selection" onClick={() => setSel(null)} style={{ display: "flex", padding: 2 }}><Icon name="x" size={10} /></button></span>}
              {image && <span className="row g4 xs i2" style={{ height: 22, padding: "0 4px 0 3px", borderRadius: 6, border: "1px solid var(--line)" }}><img src={image.url} alt="" style={{ width: 16, height: 16, borderRadius: 3, objectFit: "cover" }} /><span className="ell" style={{ maxWidth: 120 }}>{image.name}</span><button type="button" aria-label="Remove attachment" onClick={() => setImage(null)} style={{ display: "flex", padding: 2 }}><Icon name="x" size={10} /></button></span>}
            </div>
          )}
          <textarea ref={composer} value={ask} onChange={(e) => setAsk(e.target.value)} rows={2} disabled={!content}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } }}
            placeholder={!content ? "Available once Remy has written the store" : tool === "comment" ? (sel ? `Comment on ${SECTION_LABEL[sel]}…` : "Pick a section on the canvas to comment on") : sel ? `Ask Remy to change the ${SECTION_LABEL[sel].toLowerCase()}…` : "Ask Remy to change something…"}
            style={{ border: 0, outline: 0, resize: "none", font: "inherit", fontSize: 13, padding: "2px 2px 0", minHeight: 30, background: "transparent" }} />
          <div className="row g6">
            <button type="button" className="btn quiet sm ic" title="Attach a reference image" aria-label="Attach a reference image" disabled={!content || tool === "comment"} onClick={() => file.current?.click()}><Icon name="clip" size={15} /></button>
            <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => { attach(e.target.files?.[0]); e.target.value = ""; }} />
            <span className="row g6" style={{ height: 26, padding: "0 8px 0 4px", borderRadius: 7, background: "var(--tray)", fontSize: 12, color: "var(--ink-2)" }}>
              {tool === "comment" ? <><Icon name="msg" size={14} />Comment</> : <><AgentFace kind="builder" size={16} />Remy</>}
            </span>
            <span className="fill" /><span className="xs i4">⌘↵</span>
            <button type="button" className="btn dark sm ic" style={{ borderRadius: 8 }} aria-label="Send" disabled={busy || !ask.trim() || !content || (tool === "comment" && !sel)} onClick={send}>
              {busy ? <Icon name="spinner" size={14} className="spin" color="#fff" /> : <Icon name="arrow-up" size={14} color="#fff" />}
            </button>
          </div>
        </div>
      </section>
    </div>
  </>);
}
