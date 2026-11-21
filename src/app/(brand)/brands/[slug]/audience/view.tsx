"use client";
import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { startCalibration, startPanel, startTest } from "./actions";
import { PanelArt, PanelRail } from "./panel";
import { TestView } from "./test";
import { Combo } from "../creative/shoots/combo";
import { Icon } from "@/components/icon";
import { AgentFace } from "@/components/agent";
import { EmptyState } from "@/components/empty";
import { MAX_VIDEOS, PANEL_NAME, PANEL_SIZE, isWarm, matchWord, type Calibration, type PanelBody, type PanelKind, type Persona, type Reaction, type TestItem, type TestResult } from "@/lib/audience/types";

export type PanelRow = { id: string; kind: PanelKind; status: "running" | "done" | "error"; stale: boolean; panel: PanelBody | null; calibration: Calibration | null; error: string | null; startedAt: string | null; finishedAt: string | null };
export type TestRow = {
  id: string; title: string; focus: string | null; purpose: "test" | "calibration"; status: "running" | "done" | "error"; stale: boolean; progress: { done: number; total: number; failed: number };
  items: TestItem[]; personas: Persona[]; reactions: Reaction[]; result: TestResult | null; error: string | null; kind: PanelKind; createdAt: string; startedAt: string | null; finishedAt: string | null;
};
type TestLite = { id: string; title: string; status: "running" | "done" | "error"; kind: PanelKind; createdAt: string; items: number; winner: string | null; top: number | null };
type Batch = { id: string; title: string; audience: string; ads: number; createdAt: string };
type Video = { id: string; name: string; seconds: number | null; final: boolean; createdAt: string };

const clock = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`; };
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** Audience test: show ads to small agents built to behave like the brand's audience, before any spend. */
export function AudienceView({ slug, brand, kind, own, hasMeta, panels, tests, test, batches, videos, batch }: {
  slug: string; brand: string; kind: PanelKind; own: { store: boolean; ads: boolean }; hasMeta: boolean; panels: Record<PanelKind, PanelRow | null>;
  tests: TestLite[]; test: TestRow | null; batches: Batch[]; videos: Video[]; batch: string | null;
}) {
  const router = useRouter(), path = usePathname();
  const [now, setNow] = useState(() => Date.now());
  const [busy, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const panel = panels[kind];
  const building = panel?.status === "running" && !panel.stale;
  const checking = panel?.calibration?.status === "running" && now - Date.parse(panel.calibration.at) < 15 * 60_000;
  const testing = test?.status === "running" && !test.stale;
  const live = building || checking || testing;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), live ? 1000 : 30_000);
    const r = live ? setInterval(() => router.refresh(), 3000) : null;
    return () => { clearInterval(t); if (r) clearInterval(r); };
  }, [live, router]);

  const go = (q: Record<string, string | null>) => {
    const u = new URLSearchParams({ panel: kind });
    for (const [k, v] of Object.entries(q)) { if (v) u.set(k, v); else u.delete(k); }
    router.replace(`${path}?${u}`, { scroll: false });
  };
  const build = () => start(async () => { setErr(null); const r = await startPanel(slug, kind); if (r.error) setErr(r.error); router.refresh(); });
  const hasOwn = own.store || own.ads;
  const ownName = [own.store && "Shopify", own.ads && "Meta"].filter(Boolean).join(" + ");

  return (
    <div className="row fill stretch" style={{ minHeight: 0 }}>
      <section className="scroll col" style={{ padding: "20px 24px 32px", gap: 16 }}>
        <div className="row between top g16">
          <div className="col g4" style={{ minWidth: 0 }}>
            <h1 className="h1">Audience test</h1>
            <p className="sm i3" style={{ maxWidth: 680 }}>{PANEL_SIZE} look-alike shoppers of {kind === "yours" ? brand : "this kind of product"} pick the winner before you spend.</p>
          </div>
          {panel?.panel && !building && <span className="chip" style={{ flexShrink: 0 }} suppressHydrationWarning><AgentFace kind="analyst" size={16} />Panel built by Iris · {panel.finishedAt ? day(panel.finishedAt) : day(panel.panel.at)}</span>}
        </div>
        {(() => { const w = tests.find((x) => x.kind === kind && x.status === "done" && x.winner); return w ? (
          <div className="row g12" style={{ padding: "14px 16px", borderRadius: 12, background: "#E7F4EC", boxShadow: "0 0 0 1px #BFE0CC" }}>
            <span style={{ width: 32, height: 32, borderRadius: 99, background: "#1F7A52", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name="check" size={16} color="#fff" /></span>
            <span className="col fill" style={{ minWidth: 0 }}>
              <span className="w5 ell" style={{ fontSize: 16, color: "#1F7A52" }}>Winner: {w.winner}</span>
              <span className="xs i2 ell">{w.title} · best of {w.items} ads{w.top != null ? ` · scored ${w.top}` : ""}</span>
            </span>
            <Link className="btn sm" href={`/brands/${slug}/audience?test=${w.id}`}>See why</Link>
            <Link className="btn dark sm" href={`/brands/${slug}/run`}>Put it live<Icon name="arrow-r" size={12} color="#fff" /></Link>
          </div>) : null; })()}

        <div className="row g8" style={{ flexWrap: "wrap" }}>
          <Combo chip label="Panel" prefix="Panel" value={kind} menuWidth={340} onChange={(v) => router.replace(`${path}?panel=${v}`, { scroll: false })} options={[
            { value: "yours", label: PANEL_NAME.yours, sub: hasOwn ? `Built from ${ownName}${panels.yours?.panel ? "" : " · not built yet"}` : "Needs Shopify orders or Meta results" },
            { value: "general", label: PANEL_NAME.general, sub: `Typical shoppers for the category${panels.general?.panel ? "" : " · not built yet"}` },
          ]} />
          <span className="fill" />
          {err && <span className="xs c-amber" style={{ maxWidth: 360 }}>{err}</span>}
          {panel?.panel && <button type="button" className="btn" disabled={busy || building} onClick={build}>{building ? <Icon name="spinner" size={13} className="spin" /> : <Icon name="refresh" size={13} />}{building ? "Building…" : "Rebuild the panel"}</button>}
        </div>

        {kind === "yours" && !hasOwn && <div className="notice amber"><Icon name="info" size={14} />This brand has no Shopify orders or Meta results yet. Use the general audience until it does.</div>}

        {panel && (building || ((panel.status === "error" || panel.stale) && !panel.panel)) && <PanelProgress panel={panel} now={now} />}
        {panel && !building && panel.status === "error" && panel.panel && <div className="notice amber"><Icon name="warning-circle" size={14} />The rebuild didn’t finish ({panel.error ?? "unknown error"}). The panel below is the previous one.</div>}

        {!panel?.panel && !building && (
          <EmptyState eyebrow="Before you spend" title="Test ads on a panel that behaves like your audience"
            body={kind === "yours"
              ? `Iris builds ${PANEL_SIZE} people from ${hasOwn ? ownName : "your data"} — who Meta shows the ads to, who clicks and buys, what the store’s buyers spend and how often they come back — plus your market research. Each one is a small agent that looks at your ads in a feed and says what they’d do.`
              : `No store or ad data needed: Iris builds ${PANEL_SIZE} people who typically see and buy this kind of product on Instagram and Facebook, from what’s known about the category and your market research. Good for a brand new to the market.`}
            steps={[
              { agent: "analyst", title: "The panel", body: kind === "yours" ? "People weighted like the audience your ads reach — including the skeptics and the price-sensitive." : "Typical shoppers for the category, fans and skeptics in their real share." },
              { icon: "eye", title: "The test", body: "Each person looks at the ads twice, in opposite orders, and says if they’d stop, tap or buy — and why." },
              { icon: "target", title: "The read", body: "Iris ranks the ads, quotes what people said, and Remy writes fixed versions of the ones that almost work." },
            ]}
            art={<PanelArt />}
            actions={<button type="button" className="btn dark" disabled={busy || (kind === "yours" && !hasOwn)} onClick={build}>{busy ? <Icon name="spinner" size={13} className="spin" color="#fff" /> : <AgentFace kind="analyst" size={14} />}Build the panel · about 1–2 min</button>}
            note={err ?? undefined} />
        )}

        {panel?.panel && (
          <>
            <NewTest slug={slug} kind={kind} batches={batches} videos={videos} preselect={batch} hasBench={kind === "yours" && hasMeta && own.ads}
              onStarted={(id) => go({ test: id, batch: null })} />
            {kind === "yours" && <CalibrationCard slug={slug} cal={panel.calibration} checking={checking} hasMeta={hasMeta && own.ads} now={now} />}
            {tests.filter((x) => x.kind === kind).length > 0 && (
              <div className="row g6" style={{ flexWrap: "wrap" }}>
                <span className="xs i3" style={{ marginRight: 4 }}>Tests</span>
                {tests.filter((x) => x.kind === kind).slice(0, 10).map((x) => (
                  <button key={x.id} type="button" className={`chip${test?.id === x.id ? "" : " dash"}`} style={{ height: 28, maxWidth: 300 }} onClick={() => go({ test: x.id })}>
                    {x.status === "running" ? <Icon name="spinner" size={12} className="spin" /> : x.status === "error" ? <Icon name="warning-circle" size={12} color="#B7791F" /> : <Icon name="check-circle" size={12} color="#1F8A5B" />}
                    <span className="ell">{x.title}</span><span className="v" suppressHydrationWarning>{day(x.createdAt)}</span>
                  </button>
                ))}
              </div>
            )}
            {test && test.purpose === "test" && test.kind === kind && <TestView key={test.id} slug={slug} brand={brand} t={test} now={now} />}
          </>
        )}
      </section>
      {panel?.panel && <PanelRail kind={kind} body={panel.panel} builtAt={panel.finishedAt} />}
    </div>
  );
}

function PanelProgress({ panel, now }: { panel: PanelRow; now: number }) {
  const running = panel.status === "running" && !panel.stale;
  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div className="card-h" style={{ background: running ? "var(--blue-bg)" : "var(--amber-bg)" }}>
        <AgentFace kind="analyst" size={22} mood={running ? "focus" : "worried"} />
        <span className="col fill" style={{ minWidth: 0 }}>
          <span className="sm w5">{running ? `Iris is building the panel · ${PANEL_NAME[panel.kind].toLowerCase()}` : panel.stale ? "Building the panel stopped before it finished" : "Iris couldn’t build the panel"}</span>
          <span className="xs i2 ell">{running ? (panel.kind === "yours" ? "Reading Shopify buyers, who Meta shows your ads to and who buys, and your market research · usually 1–2 minutes" : "Working out who typically buys this kind of product · usually 1–2 minutes") : panel.stale ? "Build it again." : panel.error}</span>
        </span>
        {running && panel.startedAt && <span className="xs tnum" style={{ color: "#1A8FAB" }}>{clock(now - Date.parse(panel.startedAt))}</span>}
      </div>
    </div>
  );
}

function NewTest({ slug, kind, batches, videos, preselect, hasBench, onStarted }: {
  slug: string; kind: PanelKind; batches: Batch[]; videos: Video[]; preselect: string | null; hasBench: boolean; onStarted: (id: string) => void;
}) {
  const [what, setWhat] = useState<"ads" | "videos">(batches.length || !videos.length ? "ads" : "videos");
  const [batchId, setBatchId] = useState(preselect && batches.some((b) => b.id === preselect) ? preselect : batches[0]?.id ?? "");
  const [picked, setPicked] = useState<string[]>([]);
  const [bench, setBench] = useState(true);
  const chosen = batches.find((b) => b.id === batchId);
  const [focusOn, setFocusOn] = useState<Record<string, boolean>>({});
  const focused = what === "ads" && Boolean(chosen?.audience) && (focusOn[batchId] ?? isWarm(chosen?.audience ?? ""));
  const [busy, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const count = what === "ads" ? Math.min(8, batches.find((b) => b.id === batchId)?.ads ?? 0) : picked.length;
  const go = () => start(async () => {
    setErr(null);
    const r = await startTest(slug, kind, what === "ads" ? { type: "batch", batchId, bench: hasBench && bench && !focused, focus: focused ? chosen?.audience : undefined } : { type: "videos", ids: picked, bench: hasBench && bench });
    if (r.error) setErr(r.error); else if (r.id) onStarted(r.id);
  });
  return (
    <div className="col g10" style={{ padding: "14px 16px", borderRadius: 14, background: "#fff", border: "1px solid var(--line)" }}>
      <div className="row g8" style={{ flexWrap: "wrap" }}>
        <span className="sm w5 i1">New test</span>
        <div className="seg">
          <button type="button" className={`o${what === "ads" ? " on" : ""}`} onClick={() => setWhat("ads")}><Icon name="image" size={13} />Ads from Creative studio</button>
          <button type="button" className={`o${what === "videos" ? " on" : ""}`} onClick={() => setWhat("videos")}><Icon name="video" size={13} />Videos from Shoots</button>
        </div>
      </div>
      {what === "ads" ? (
        batches.length ? <Combo label="Batch" prefix="Batch" value={batchId} onChange={setBatchId} menuWidth={420} searchable
          options={batches.map((b) => ({ value: b.id, label: b.title, sub: `${b.ads} ad${b.ads === 1 ? "" : "s"} · ${day(b.createdAt)}` }))} />
          : <span className="xs i3">No batches yet — <Link className="lnk" href={`/brands/${slug}/creative`}>write ads in Creative studio</Link> first.</span>
      ) : null}
      {what === "ads" && chosen?.audience && (
        <div className="row top g10" style={{ flexWrap: "wrap" }}>
          <span className="xs i3" style={{ paddingTop: 6 }}>Show to</span>
          <div className="seg">
            <button type="button" className={`o${focused ? "" : " on"}`} onClick={() => setFocusOn({ ...focusOn, [batchId]: false })}>Everyone on the panel</button>
            <button type="button" className={`o${focused ? " on" : ""}`} onClick={() => setFocusOn({ ...focusOn, [batchId]: true })}>Only who this batch is for</button>
          </div>
          <span className="xs i3 fill" style={{ minWidth: 220, lineHeight: "16px", paddingTop: 2 }}>{focused
            ? <>Iris builds {PANEL_SIZE} people from <b className="w5 i2">{chosen.audience.length > 110 ? `${chosen.audience.slice(0, 110)}…` : chosen.audience}</b> just for this test.</>
            : isWarm(chosen.audience) ? "This batch is written for people who already know the brand — most of the panel hasn’t bought, so expect low scores." : "Everyone the ads would reach, weighted like the panel."}</span>
        </div>
      )}
      {what === "ads" ? null : videos.length ? (
        <div className="col g6">
          <span className="xs i3">Pick up to {MAX_VIDEOS} — each person watches the first second, the hook, the middle and the end</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 8 }}>
            {videos.map((v) => { const on = picked.includes(v.id); return (
              <button key={v.id} type="button" onClick={() => setPicked(on ? picked.filter((x) => x !== v.id) : picked.length < MAX_VIDEOS ? [...picked, v.id] : picked)}
                className="col g4" style={{ padding: 0, textAlign: "left", opacity: !on && picked.length >= MAX_VIDEOS ? 0.5 : 1 }} title={v.name}>
                <span style={{ position: "relative", aspectRatio: "9 / 16", borderRadius: 8, overflow: "hidden", background: "var(--tray-2)", boxShadow: on ? "0 0 0 2px var(--ink)" : "0 0 0 1px var(--line)" }}>
                  <video src={`/api/assets/${v.id}#t=0.5`} muted playsInline preload="metadata" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  {on && <span style={{ position: "absolute", top: 6, right: 6, width: 18, height: 18, borderRadius: 99, background: "var(--ink)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="check" size={11} color="#fff" /></span>}
                  {v.final && <span className="pill" style={{ position: "absolute", left: 6, bottom: 6, height: 18, fontSize: 10 }}>Full ad</span>}
                </span>
                <span className="xs i2 ell">{v.name}{v.seconds ? ` · ${Math.round(v.seconds)}s` : ""}</span>
              </button>
            ); })}
          </div>
        </div>
      ) : <span className="xs i3">No videos yet — <Link className="lnk" href={`/brands/${slug}/creative/shoots`}>make one in Shoots</Link> first.</span>}
      <div className="row g10" style={{ flexWrap: "wrap" }}>
        {hasBench && !focused && <label className="row g6 xs i2" style={{ cursor: "pointer" }}><input type="checkbox" checked={bench} onChange={(e) => setBench(e.target.checked)} />Add your best live Meta ad as the bar to beat</label>}
        <span className="fill" />
        {err && <span className="xs c-amber" style={{ maxWidth: 360 }}>{err}</span>}
        <span className="xs i3">{PANEL_SIZE} people × 2 looks · about 1–3 min</span>
        <button type="button" className="btn dark" disabled={busy || !count} onClick={go}>{busy ? <Icon name="spinner" size={13} className="spin" color="#fff" /> : <Icon name="play" size={12} weight="fill" color="#fff" />}Test {count || ""} {what === "ads" ? (count === 1 ? "ad" : "ads") : count === 1 ? "video" : "videos"}</button>
      </div>
    </div>
  );
}

function CalibrationCard({ slug, cal, checking, hasMeta, now }: { slug: string; cal: Calibration | null; checking: boolean; hasMeta: boolean; now: number }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const run = () => start(async () => { setErr(null); const r = await startCalibration(slug); if (r.error) setErr(r.error); router.refresh(); });
  const done = cal?.status === "done";
  const word = done ? matchWord(cal.rho) : null;
  const tone = word === "Good" ? "green" : word === "Fair" ? "blue" : "amber";
  return (
    <div className="col g8" style={{ padding: "12px 14px", borderRadius: 12, background: "var(--tray)" }}>
      <div className="row g10" style={{ flexWrap: "wrap" }}>
        <Icon name="seal-check" size={16} color={done && word === "Good" ? "#1F8A5B" : "#8B8883"} />
        <span className="col fill" style={{ minWidth: 220 }}>
          <span className="sm w5 i1">{checking ? "Checking the panel against your real ads…" : done ? <>Matches your real results: <span className={`c-${tone}`}>{word}</span></> : "Check the panel against your real ads"}</span>
          <span className="xs i3" style={{ lineHeight: "16px" }}>{checking ? `The panel is looking at your past Meta ads · ${clock(now - Date.parse(cal!.at))}`
            : done ? `It ranked ${cal.n} of your past Meta ads${cal.rho != null ? ` with a ${cal.rho.toFixed(2)} rank match to their real click rates` : ""}. ${cal.fit ? "Tests now show an estimated click rate." : "Not close enough to estimate click rates — compare ads with each other instead."}`
            : cal?.status === "error" ? cal.note ?? "The check didn’t finish." : hasMeta ? "The panel looks at up to 8 of your past Meta ads, and Kaviar compares its picks with their real click rates — so you know how far to trust it." : "Needs Meta Ads connected, with past ads that ran."}</span>
        </span>
        {done && <button type="button" className="lnk xs i2" onClick={() => setOpen((x) => !x)}>{open ? "Hide" : "See the ads"}</button>}
        {err && <span className="xs c-amber">{err}</span>}
        <button type="button" className="btn sm" disabled={busy || checking || !hasMeta} onClick={run}>{checking || busy ? <Icon name="spinner" size={12} className="spin" /> : <Icon name={done ? "refresh" : "seal-check"} size={12} />}{done ? "Check again" : "Check it"}</button>
      </div>
      {open && done && (
        <div className="col" style={{ background: "#fff", borderRadius: 10, border: "1px solid var(--line)", padding: "4px 12px" }}>
          <div className="row g8 xs i3" style={{ height: 28 }}><span className="fill">Past ad</span><span style={{ width: 90, textAlign: "right" }}>Real click rate</span><span style={{ width: 80, textAlign: "right" }}>Panel score</span></div>
          {[...cal.ads].sort((a, b) => b.ctr - a.ctr).map((a) => (
            <div key={a.key} className="row g8 xs" style={{ height: 30, borderTop: "1px solid var(--line)" }}>
              <span className="fill ell i1">{a.name}</span><span className="tnum" style={{ width: 90, textAlign: "right" }}>{(a.ctr * 100).toFixed(2)}%</span><span className="tnum w5" style={{ width: 80, textAlign: "right" }}>{a.score}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
