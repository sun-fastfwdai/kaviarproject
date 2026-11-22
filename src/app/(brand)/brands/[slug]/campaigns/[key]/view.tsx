"use client";
import { useCallback, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { AgentFace } from "@/components/agent";
import { Modal } from "@/components/modal";
import { Working, type Work } from "@/components/working";
import type { PlanInput } from "@/lib/growth/plan";
import type { PlanAd, PlanExtras, PlanFacts, Plans } from "@/lib/growth/plans";
import { MODES, type Mode } from "@/lib/growth/pilot";
import { forecast, REASON_NAME, STAGE_NAME, stepsOf, type PlanCard, type StepKey } from "@/lib/growth/plans-rules";
import { makeAds } from "../../plan/actions";
import { setAdStatus } from "../../creative/actions";
import { decide, setMode } from "../../optimize/actions";
import { addReference, approvePlanFor, deleteOwnPlan, launchPlan, removeReference, saveBrief, setPlanBudget } from "../actions";

/**
 * One campaign, whole. The brand never leaves this page to run it: approve the budget, have the ads written (progress shows at the
 * bottom of the screen and the ads appear here), say yes or no to each ad, put the campaign on Meta, and watch what it brings against
 * the plan — with Autopilot's part in it said plainly. Each step's one button sits under the step and in the card's corner.
 */
const LEVEL = ["Scenario · not a forecast", "Early estimate", "From your results"];
const DAYS = [7, 14, 28];
type Props = {
  slug: string; currency: string; plan: PlanCard; input: Omit<PlanInput, "candidates">; minBudget: number; level: 0 | 1 | 2;
  ads: PlanAd[]; facts: PlanFacts; shop: Plans["shop"]; results: PlanExtras["results"]; brief: PlanExtras["brief"]; productPhoto: string | null; pilot: { mode: Mode; last: string | null; canAct: boolean; changes: PlanExtras["pilot"]["changes"] };
};
const label = { fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600 } as const;

export function PlanView({ slug, currency, plan: p, input, minBudget, level, ads, facts, shop, results, pilot, brief, productPhoto }: Props) {
  const base = `/brands/${slug}`, router = useRouter();
  const [busy, start] = useTransition();
  const [doing, setDoing] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [work, setWork] = useState<Work | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [budget, setBudget] = useState(p.budget);
  const [days, setDays] = useState(p.days);
  const [mode, setM] = useState<Mode>(pilot.mode);
  const clear = useCallback(() => setWork(null), []);
  // What Remy works from: the brand's own pictures and words, and whether to shoot new pictures in the references' style.
  const [note, setNote] = useState(brief.note);
  const [shootNew, setShootNew] = useState(brief.shoot);
  const fileRef = useRef<HTMLInputElement>(null);
  const addRefs = (files: File[]) => { if (!files.length) return; setErr(null); setDoing("ref"); start(async () => { for (const f of files.slice(0, 8)) { const fd = new FormData(); fd.set("file", f); const r = await addReference(slug, p.key, fd); if (r.error) { setErr(r.error); break; } } router.refresh(); setDoing(null); }); };
  const usd = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(Math.round(v));
  const [lo, mid, hi] = forecast(p.c, budget, days, input), changed = budget !== p.budget || days !== p.days;
  const go = (what: string, f: () => Promise<{ error?: string } | void>, done?: string) => { setDoing(what); setErr(null); start(async () => { const r = await f(); if (r && r.error) setErr(r.error); else { router.refresh(); if (done) setWork({ done }); } setDoing(null); }); };
  const { steps, now } = stepsOf(p), nowAt = steps.findIndex((s) => s.key === now), a = p.ads, step = Math.max(50, Math.round(minBudget / 4 / 50) * 50);
  const toReview = ads.filter((x) => x.status === "review"), okAds = ads.filter((x) => x.status === "approved");
  const daily = budget / days, spin = (k: string, c?: string) => doing === k && <Icon name="spinner" size={13} className="spin" color={c} />;

  // Remy writes the ads while the brand stays here: the dock at the bottom says so, and the ads appear below when he is done.
  const write = () => {
    const shooting = shootNew && brief.refs.length > 0;
    setErr(null); setDoing("make"); setWork({ who: "builder", what: shooting ? `Remy is writing 3 ads and shooting their pictures` : `Remy is writing 3 ads for “${p.title}”`, usually: shooting ? "Usually two to three minutes" : "Usually under a minute", since: Date.now() });
    start(async () => {
      await saveBrief(slug, p.key, note, shootNew);
      const r = await makeAds(slug, p.key, true);
      if (r?.error) { setWork({ done: r.error, bad: true }); setErr(r.error); } else { router.refresh(); setWork(r?.note ? { done: r.note, bad: true } : { done: "3 ads are ready — say yes or no to each, below" }); setTimeout(() => document.getElementById("ads")?.scrollIntoView({ behavior: "smooth", block: "start" }), 400); }
      setDoing(null);
    });
  };
  const launch = () => { setConfirm(false); setErr(null); setDoing("launch"); setWork({ who: "analyst", what: "Making the campaign on Meta, paused", usually: "A few seconds", since: Date.now() });
    start(async () => { const r = await launchPlan(slug, p.key); if (r.error) { setWork({ done: r.error, bad: true }); setErr(r.error); } else { router.refresh(); setWork({ done: "The campaign is on Meta, paused. Add the ads there and switch it on." }); } setDoing(null); }); };
  const review = (ad: PlanAd, status: "approved" | "rejected") => go(ad.id, () => setAdStatus(slug, ad.id, status));
  const approveAll = () => go("all", async () => { for (const x of toReview) await setAdStatus(slug, x.id, "approved"); }, `${toReview.length} ads approved`);
  const manager = p.meta ? `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${p.meta.account}&selected_campaign_ids=${p.meta.campaignId}` : null;

  // What each step does when it is this plan's turn — the same button in the card's corner and under the step.
  const act = (k: StepKey, small = false): React.ReactNode => {
    const cls = small ? "row g4" : "row g6", st = small ? ({ height: 26, padding: "0 10px", borderRadius: 99, fontSize: 11.5, fontWeight: 500, whiteSpace: "nowrap", background: "#fff", color: "#121212" } as const) : ({ height: 40, padding: "0 18px", borderRadius: 99, background: "#34C77B", color: "#0B2B1A", fontSize: 14, fontWeight: 600 } as const), ic = small ? 10 : 12;
    if (k === "budget") return <button type="button" disabled={busy} className={cls} style={st} onClick={() => go("approve", () => approvePlanFor(slug, p.key, budget, days), "Plan approved — Remy can write its ads now")}>{spin("approve", "#0B2B1A") || <Icon name="check" size={ic} />}Approve plan</button>;
    if (k === "ads") return toReview.length ? <a className={cls} style={st} href="#ads">Review {toReview.length} ad{toReview.length === 1 ? "" : "s"}<Icon name="arrow-r" size={ic} style={{ transform: "rotate(90deg)" }} /></a>
      : <button type="button" disabled={busy} className={cls} style={st} onClick={write}>{spin("make", "#0B2B1A")}{doing === "make" ? "Remy is writing…" : "Make 3 ads"}</button>;
    if (k === "launch") return <button type="button" disabled={busy} className={cls} style={st} onClick={() => setConfirm(true)}>{spin("launch", "#0B2B1A")}Put it on Meta<Icon name="arrow-r" size={ic} /></button>;
    if (k === "results" && manager) return <a className={cls} style={st} href={manager} target="_blank" rel="noreferrer">Open in Ads Manager<Icon name="external" size={ic} /></a>;
    return null;
  };

  return (
    <div className="scroll" style={{ padding: "22px 24px 96px" }}>
      <div className="col g16">
        {/* ---- the plan in one line, and where it has got to */}
        <div style={{ position: "relative", overflow: "clip", borderRadius: 22, background: "#121212", color: "#fff", padding: "26px 28px 22px" }}>
          <div aria-hidden style={{ position: "absolute", right: -120, top: -160, width: 520, height: 520, borderRadius: 999, background: `radial-gradient(closest-side, ${mid.profit < 0 ? "rgba(235,122,60,.30)" : "rgba(52,199,123,.30)"}, transparent)` }} />
          <div className="row top between g20" style={{ position: "relative", flexWrap: "wrap" }}>
            <div className="col g10" style={{ minWidth: 0 }}>
              <span className="row g8" style={{ flexWrap: "wrap" }}>
                <span style={{ ...label, color: "rgba(255,255,255,.6)" }}>{REASON_NAME[p.reason]} · {STAGE_NAME[p.stage]}</span>
                {p.when && <span style={{ height: 20, padding: "0 9px", borderRadius: 99, fontSize: 11, lineHeight: "20px", fontWeight: 600, background: p.urgent ? "rgba(255,155,115,.2)" : "rgba(255,255,255,.12)", color: p.urgent ? "#FFB49A" : "rgba(255,255,255,.8)" }}>{p.when}</span>}
                <span style={{ height: 20, padding: "0 9px", borderRadius: 99, fontSize: 11, lineHeight: "20px", background: level === 2 ? "rgba(52,199,123,.22)" : "rgba(255,255,255,.12)", color: level === 2 ? "#8BE8B4" : "rgba(255,255,255,.75)" }}>{LEVEL[level]}</span>
              </span>
              <span style={{ fontSize: 22, lineHeight: "28px", fontWeight: 600, letterSpacing: "-0.015em", maxWidth: 640 }}>{p.title}</span>
              <div className="row g14" style={{ alignItems: "baseline", flexWrap: "wrap" }}>
                <span className="col">
                  <span className="row g6" style={{ alignItems: "center" }}>
                    <button type="button" aria-label="Spend less" disabled={budget - step < 50 || Boolean(p.meta)} onClick={() => setBudget((b) => Math.max(50, b - step))} style={{ width: 26, height: 26, borderRadius: 99, background: "rgba(255,255,255,.1)", color: "#fff", fontSize: 16 }}>−</button>
                    <span className="tnum" style={{ fontSize: 34, lineHeight: "40px", fontWeight: 600, letterSpacing: "-0.02em", color: "rgba(255,255,255,.72)" }}>{usd(budget)}</span>
                    <button type="button" aria-label="Spend more" disabled={Boolean(p.meta)} onClick={() => setBudget((b) => b + step)} style={{ width: 26, height: 26, borderRadius: 99, background: "rgba(255,255,255,.1)", color: "#fff", fontSize: 16 }}>+</button>
                  </span>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,.5)" }}>you spend · {usd(daily)} a day</span>
                </span>
                <span aria-hidden style={{ fontSize: 28, color: "rgba(255,255,255,.35)" }}>→</span>
                <span className="col"><span className="tnum" style={{ fontSize: 56, lineHeight: "60px", fontWeight: 600, letterSpacing: "-0.035em" }}>{usd(mid.revenue)}</span>
                  <span className="row g6" style={{ fontSize: 12, color: "rgba(255,255,255,.5)" }}>likely comes back in
                    <span style={{ display: "inline-flex", padding: 2, gap: 2, borderRadius: 99, background: "rgba(255,255,255,.1)" }}>{DAYS.map((d) => <button key={d} type="button" disabled={Boolean(p.meta)} onClick={() => setDays(d)} style={{ height: 20, padding: "0 8px", borderRadius: 99, fontSize: 11, background: days === d ? "#fff" : "transparent", color: days === d ? "#121212" : "rgba(255,255,255,.75)" }}>{d} days</button>)}</span>
                  </span></span>
                <span className="col" style={{ paddingLeft: 6 }} title={`${Math.round(mid.orders)} orders at the likely rates, after the cost of the goods and the ad spend`}><span className="tnum" style={{ fontSize: 22, lineHeight: "28px", fontWeight: 600, color: mid.profit >= 0 ? "#6EE7A8" : "#FF9B73" }}>{mid.profit >= 0 ? "+" : "−"}{usd(Math.abs(mid.profit))}</span><span style={{ fontSize: 12, color: "rgba(255,255,255,.5)" }}>{mid.profit >= 0 ? "profit after costs" : "short of break-even"} · {Math.round(mid.orders)} orders</span></span>
              </div>
              <div className="col g4" style={{ width: 430, maxWidth: "100%" }}>
                <div style={{ position: "relative", height: 6, borderRadius: 99, background: "rgba(255,255,255,.14)" }}>
                  <div style={{ position: "absolute", inset: 0, borderRadius: 99, background: "linear-gradient(90deg, rgba(255,155,115,.9), rgba(110,231,168,.95))", opacity: 0.85 }} />
                  <div style={{ position: "absolute", top: -4, left: `${Math.min(96, Math.max(4, ((mid.revenue - lo.revenue) / Math.max(1, hi.revenue - lo.revenue)) * 100))}%`, width: 14, height: 14, borderRadius: 99, background: "#fff", transform: "translateX(-7px)", boxShadow: "0 0 0 4px rgba(255,255,255,.18)" }} />
                </div>
                <div className="row between" style={{ fontSize: 11.5, color: "rgba(255,255,255,.55)" }}><span>If it goes badly {usd(lo.revenue)}</span><span>If it goes well {usd(hi.revenue)}</span></div>
              </div>
            </div>
            <div className="col g10" style={{ alignItems: "flex-end", flexShrink: 0 }}>
              <span className="row g10" style={{ padding: "6px 12px 6px 6px", borderRadius: 14, background: "rgba(255,255,255,.08)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.image ? <img src={p.image} alt="" width={44} height={44} style={{ borderRadius: 10, objectFit: "cover", background: "#fff" }} /> : <span style={{ width: 44, height: 44, borderRadius: 10, background: "rgba(255,255,255,.1)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="box" size={16} color="rgba(255,255,255,.6)" /></span>}
                <span className="col" style={{ maxWidth: 210 }}><span style={{ fontSize: 11, color: "rgba(255,255,255,.5)" }}>Selling</span><span className="ell" style={{ fontSize: 13, fontWeight: 500 }}>{p.c.product}</span></span>
              </span>
              <span className="row g8" style={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
                {!p.approvedAt && p.stage !== "suggested" && !changed && <button type="button" disabled={busy} title="Its ads were written before this plan was approved" className="row g6" style={{ height: 40, padding: "0 16px", borderRadius: 99, background: "rgba(255,255,255,.12)", color: "#fff", fontSize: 13.5 }} onClick={() => go("approve", () => approvePlanFor(slug, p.key, budget, days), "Budget approved")}>{spin("approve") || <Icon name="check" size={12} />}Approve the budget</button>}
                {changed && p.stage !== "suggested" && <button type="button" disabled={busy} className="row g6" style={{ height: 40, padding: "0 16px", borderRadius: 99, background: "rgba(255,255,255,.12)", color: "#fff", fontSize: 13.5 }} onClick={() => go("save", () => setPlanBudget(slug, p.key, budget, days), "Budget saved")}>{spin("save")}Save the change</button>}
                {act(now)}
              </span>
            </div>
          </div>

          {/* this plan's six steps */}
          <div className="row" style={{ position: "relative", marginTop: 24, paddingTop: 18, borderTop: "1px solid rgba(255,255,255,.12)", alignItems: "flex-start" }}>
            {steps.map((x, i) => {
              const on = i === nowAt, done = x.done && !on;
              return (
                <div key={x.key} className="col g6 fill" style={{ minWidth: 0, position: "relative", paddingRight: 10 }} aria-current={on ? "step" : undefined}>
                  {i < steps.length - 1 && <span aria-hidden style={{ position: "absolute", left: 30, right: 4, top: 12, height: 2, borderRadius: 99, background: i < nowAt ? "rgba(110,231,168,.7)" : "rgba(255,255,255,.14)" }} />}
                  <span style={{ width: 26, height: 26, borderRadius: 99, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, position: "relative",
                    background: on ? "#fff" : done ? "#34C77B" : "rgba(255,255,255,.1)", color: on ? "#121212" : done ? "#0B2B1A" : "rgba(255,255,255,.6)", boxShadow: on ? "0 0 0 5px rgba(255,255,255,.18)" : "none" }}>
                    {done ? <Icon name="check" size={13} color="#0B2B1A" /> : i + 1}
                  </span>
                  <span className="col" style={{ minWidth: 0 }}>
                    <span className="ell" style={{ fontSize: 13, fontWeight: on ? 600 : 500, color: on ? "#fff" : "rgba(255,255,255,.82)" }}>{x.label}</span>
                    <span className="ell" style={{ fontSize: 11.5, color: on ? "#8BE8B4" : "rgba(255,255,255,.5)" }}>{on ? `You are here · ${x.note}` : x.note}</span>
                  </span>
                  {on && <span style={{ alignSelf: "flex-start" }}>{act(x.key, true)}</span>}
                  {x.key === "test" && !x.done && a && p.stage === "ready" && <Link href={`${base}/audience?batch=${a.batchId}`} title="Show the ads to look-alike shoppers before any money is spent" className="row g4" style={{ alignSelf: "flex-start", height: 26, padding: "0 10px", borderRadius: 99, fontSize: 11.5, background: "rgba(255,255,255,.1)", color: "rgba(255,255,255,.85)" }}>Test first<Icon name="arrow-r" size={10} /></Link>}
                </div>
              );
            })}
          </div>
        </div>

        {err && <div className="row g8 sm" style={{ padding: "10px 14px", borderRadius: 12, background: "#FBEDE6", color: "#B4532A" }}><Icon name="warning-circle" size={14} weight="fill" color="#B4532A" />{err}</div>}

        {/* ---- Autopilot's part in this campaign, switched from here */}
        <div className="col" style={{ borderRadius: 14, background: "#fff", boxShadow: "0 0 0 1px var(--line)" }}>
          <div className="row g12" style={{ padding: "10px 12px 10px 16px", flexWrap: "wrap" }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: "#34C77B", boxShadow: "0 0 0 4px rgba(52,199,123,.2)", animation: p.meta ? "pulse 2.2s ease-in-out infinite" : undefined, opacity: p.meta ? 1 : 0.45, flexShrink: 0 }} />
            <span className="sm w5 i1" style={{ flexShrink: 0 }}>Autopilot</span>
            <div className="seg" role="radiogroup" aria-label="How much Autopilot may decide alone" style={{ flexShrink: 0 }}>
              {(Object.keys(MODES) as Mode[]).map((m) => <button key={m} type="button" role="radio" aria-checked={mode === m} disabled={busy} className={`o${mode === m ? " on" : ""}`} title={MODES[m].line} onClick={() => { setM(m); go("mode", () => setMode(slug, m)); }}>{MODES[m].name}</button>)}
            </div>
            <span className="xs i2 fill" style={{ minWidth: 200 }}>{!p.meta ? "Starts watching this campaign the day it is on Meta" : pilot.changes.length ? `Found ${pilot.changes.length} change${pilot.changes.length === 1 ? "" : "s"} for this campaign` : `Watching this campaign every day${pilot.last ? ` · checked ${pilot.last}` : ""}`}
              <span className="i3"> · {mode === "ask" ? "it asks you before every change" : mode === "protect" ? "it pauses what loses money by itself, never raises spend" : "it pauses losers and moves budget to winners by itself"}</span></span>
          </div>
          {pilot.changes.map((c) => (
            <div key={c.id} className="row g12" style={{ padding: "10px 16px", borderTop: "1px solid var(--line)" }}>
              <AgentFace kind="analyst" size={22} />
              <span className="col fill" style={{ minWidth: 0 }}><span className="sm w5 ell">{c.title}</span><span className="xs i3 ell" title={c.why}>{c.before && c.after ? `${c.before} → ${c.after} · ` : ""}{c.why}</span></span>
              <button type="button" className="btn dark sm" disabled={busy} onClick={() => go(c.id, () => decide(slug, [c.id], "approved"), "Change approved")}>{spin(c.id, "#fff")}Approve</button>
              <button type="button" className="btn quiet sm" disabled={busy} onClick={() => go(c.id, () => decide(slug, [c.id], "skipped"))}>Skip</button>
            </div>))}
        </div>

        {/* ---- on Meta: what Kaviar made, what is left for the brand, and what it has brought against the plan */}
        {p.meta && results && <div className="col g12" style={{ padding: "16px 18px", borderRadius: 18, background: "#fff", boxShadow: "0 0 0 1px var(--line)" }}>
          <div className="row between g12" style={{ flexWrap: "wrap" }}>
            <span className="row g8"><span className="i3" style={label}>Results against this plan</span>
              <span className={`pill ${results.status === "ACTIVE" ? "green" : "amber"}`} style={{ height: 22, fontSize: 11 }}>{results.status === "ACTIVE" ? "Running on Meta" : "Paused on Meta"}</span></span>
            <span className="row g6">{a && <Link className="btn quiet sm" href={`${base}/run/${a.batchId}`} title="The ads, laid out for Ads Manager">Set-up sheet<Icon name="arrow-r" size={11} /></Link>}{manager && <a className="btn sm" href={manager} target="_blank" rel="noreferrer">Open in Ads Manager<Icon name="external" size={11} /></a>}</span>
          </div>
          {results.status !== "ACTIVE" && results.spend === 0 && <div className="row g10 sm" style={{ padding: "10px 12px", borderRadius: 12, background: "var(--amber-bg)", color: "var(--amber)" }}>
            <Icon name="info" size={14} /><span className="fill">Kaviar made the campaign at {usd(p.meta.daily)} a day and left it paused. Add the {okAds.length || "approved"} ad{okAds.length === 1 ? "" : "s"} in Ads Manager and switch it on — Kaviar can’t place ads on Meta itself yet.</span></div>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 8 }}>
            {([["Spent", results.spend, p.budget, usd(results.spend), `of ${usd(p.budget)} planned`], ["Orders", results.orders, mid.orders, String(results.orders), `${Math.round(mid.orders)} expected`], ["Sales", results.revenue, mid.revenue, usd(results.revenue), `${usd(mid.revenue)} expected`]] as const).map(([k, got, want, v, sub]) => (
              <div key={k} className="col g4" style={{ padding: "11px 13px", borderRadius: 14, background: "var(--tray)" }}>
                <span className="xs i3">{k}</span>
                <span className="row g6" style={{ alignItems: "baseline" }}><span className="tnum" style={{ fontSize: 22, lineHeight: "28px", fontWeight: 600, letterSpacing: "-0.02em" }}>{v}</span><span className="xs i3">{sub}</span></span>
                <span style={{ height: 5, borderRadius: 99, background: "var(--tray-2)", overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: `${want > 0 ? Math.min(100, (got / want) * 100) : 0}%`, borderRadius: 99, background: k === "Spent" ? "#55534F" : "#34C77B" }} /></span>
              </div>))}
          </div>
        </div>}

        {/* ---- its ads: written here, judged here */}
        <div id="ads" className="col g12" style={{ padding: "16px 18px", borderRadius: 18, background: "#fff", boxShadow: "0 0 0 1px var(--line)", scrollMarginTop: 16 }}>
          <div className="row between g12" style={{ flexWrap: "wrap" }}>
            <span className="row g8"><AgentFace kind="builder" size={18} /><span className="i3" style={label}>Its ads</span>{ads.length > 0 && <span className="xs i3 tnum">{toReview.length ? `${toReview.length} to review` : ""}{toReview.length && okAds.length ? " · " : ""}{okAds.length ? `${okAds.length} approved` : ""}</span>}</span>
            <span className="row g6">
              {toReview.length > 1 && <button type="button" className="btn dark sm" disabled={busy} onClick={approveAll}>{spin("all", "#fff") || <Icon name="check" size={12} color="#fff" />}Approve all {toReview.length}</button>}
              {a && <Link className="btn quiet sm" href={`${base}/creative/${a.batchId}`} title="Change the words or the picture">Edit in the studio<Icon name="arrow-r" size={11} /></Link>}
            </span>
          </div>
          {/* what Remy works from: the product photo, the brand's own pictures and its own words */}
          {!p.meta && <div className="col g10" style={{ padding: "12px 14px", borderRadius: 14, background: "var(--tray)" }}>
            <div className="row g8" style={{ flexWrap: "wrap", alignItems: "center" }}>
              <span className="xs i2 w5" style={{ width: "100%" }}>Work from</span>
              {productPhoto && <span title="The product’s own photo — the product in every picture stays exactly this" style={{ position: "relative", flexShrink: 0 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={productPhoto} alt="" style={{ width: 56, height: 56, borderRadius: 10, objectFit: "cover", background: "#fff", boxShadow: "0 0 0 1px var(--line)" }} />
                <span style={{ position: "absolute", left: 3, bottom: 3, padding: "0 5px", borderRadius: 5, fontSize: 9.5, lineHeight: "14px", background: "rgba(18,18,18,.78)", color: "#fff" }}>Product</span></span>}
              {brief.refs.map((r) => (
                <span key={r.id} title={r.name} style={{ position: "relative", flexShrink: 0 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/assets/${r.id}?w=480`} alt="" style={{ width: 56, height: 56, borderRadius: 10, objectFit: "cover", background: "#fff", boxShadow: "0 0 0 1px var(--line)" }} />
                  <button type="button" aria-label={`Remove ${r.name}`} disabled={busy} onClick={() => go(r.id, () => removeReference(slug, p.key, r.id))} style={{ position: "absolute", right: -5, top: -5, width: 18, height: 18, borderRadius: 99, background: "#121212", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="x" size={9} color="#fff" /></button>
                </span>))}
              <button type="button" className="btn sm" disabled={busy || brief.refs.length >= 8} onClick={() => fileRef.current?.click()} title="Your own photos, or pictures whose look you like — up to 8, 4 MB each" style={{ height: 56, borderStyle: "dashed" }}>{doing === "ref" ? <Icon name="spinner" size={13} className="spin" /> : <Icon name="plus" size={13} />}Add reference pictures</button>
              <input ref={fileRef} type="file" multiple accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const fs = [...(e.target.files ?? [])]; e.target.value = ""; addRefs(fs); }} />
            </div>
            <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 600))} onBlur={() => { if (note !== brief.note) void saveBrief(slug, p.key, note, shootNew); }} rows={2} aria-label="Your notes for this campaign" placeholder="Anything Remy should use — the offer, a line you like, what to leave out"
              style={{ width: "100%", padding: "9px 11px", borderRadius: 10, border: "1px solid var(--line-2)", background: "#fff", font: "inherit", fontSize: 13.5, lineHeight: "19px", resize: "vertical" }} />
            <div className="row g10" style={{ flexWrap: "wrap" }}>
              {brief.refs.length > 0 && <div className="seg" role="radiogroup" aria-label="Where the pictures come from">
                {([[false, "Use my pictures"], [true, "Shoot new ones in their style"]] as const).map(([v, text]) => <button key={text} type="button" role="radio" aria-checked={shootNew === v} className={`o${shootNew === v ? " on" : ""}`} title={v ? "New pictures are made from your product photo, lit and composed like your references. Each one is charged by the image service." : "Your reference pictures go on the ads as they are"} onClick={() => setShootNew(v)}>{text}</button>)}
              </div>}
              <span className="fill" />
              {p.stage !== "suggested" && <button type="button" className={`btn sm${ads.length ? "" : " dark"}`} disabled={busy} onClick={write}>{doing === "make" ? <Icon name="spinner" size={12} className="spin" color={ads.length ? undefined : "#fff"} /> : null}{ads.length ? "Make 3 new ads" : "Make 3 ads"}</button>}
            </div>
          </div>}
          {ads.length === 0 ? (
            <div className="row g12" style={{ padding: "8px 0 4px" }}>
              <span className="sm i3 fill">{p.stage === "suggested" ? "Ads are written once you approve the plan." : doing === "make" ? "Remy is writing them now…" : "None yet."}</span>

            </div>
          ) : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
            {ads.map((ad) => (
              <div key={ad.id} className="col" style={{ borderRadius: 14, overflow: "hidden", boxShadow: "0 0 0 1px var(--line)", background: "#fff" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {ad.image && <img src={ad.image} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover", background: "var(--tray-2)" }} />}
                <div className="col g4" style={{ padding: "10px 12px" }}>
                  <span className="sm w5" style={{ lineHeight: "19px" }}>{ad.hook || ad.headline}</span>
                  <span className="xs i2" title={ad.text} style={{ lineHeight: "17px", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{ad.text}</span>
                </div>
                <div className="row g6" style={{ padding: "8px 12px", borderTop: "1px solid var(--line)", marginTop: "auto" }}>
                  {ad.status === "approved" ? <><span className="pill green" style={{ height: 24, fontSize: 11.5 }}><Icon name="check" size={11} />Approved</span><span className="fill" /><button type="button" className="btn quiet sm" disabled={busy} onClick={() => go(ad.id, () => setAdStatus(slug, ad.id, "review"))}>Undo</button></>
                    : <><button type="button" className="btn dark sm" disabled={busy} onClick={() => review(ad, "approved")}>{spin(ad.id, "#fff") || <Icon name="check" size={12} color="#fff" />}Approve</button><button type="button" className="btn quiet sm" disabled={busy} onClick={() => review(ad, "rejected")}>Reject</button><span className="fill" /><span className="xs i3 ell">{ad.cta}</span></>}
                </div>
              </div>))}
          </div>}
        </div>

        {/* ---- what the plan rests on: one block per source Kaviar read, each opening that source */}
        <div className="col g10">
          <div className="row g10" style={{ flexWrap: "wrap" }}>
            <AgentFace kind={p.reason === "overstock" ? "qa" : "analyst"} size={22} />
            <span className="col fill" style={{ minWidth: 220 }}><span className="i3" style={label}>What this plan rests on</span><span className="xs i3">{p.why}</span></span>
            {p.reason === "own" && !a && !p.meta && <button type="button" className="btn quiet sm" disabled={busy} onClick={() => start(async () => { await deleteOwnPlan(slug, p.key); router.push(`${base}/campaigns`); })}>Delete campaign</button>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 10 }}>
            {(() => {
              const need = Math.round(mid.orders), st = facts.store, short = st != null && st.inventory < need, repeat = shop.buyers >= 20 ? Math.round((shop.repeaters / shop.buyers) * 100) : null;
              const blocks: { src: string; big: string; unit?: string; line: string; href: string; bad?: boolean }[] = [];
              if (st) blocks.push({ src: "Your store · Shopify", big: st.units30.toLocaleString("en-US"), unit: "sold in 30 days", bad: short,
                line: short ? `Only ${st.inventory} in stock — the plan expects ${need} orders` : `${st.inventory.toLocaleString("en-US")} in stock — enough for the ${need} orders expected`, href: `${base}/inventory` });
              blocks.push({ src: "Who sees it · your customers", big: p.c.audience ? p.c.audience.toLocaleString("en-US") : p.c.kind === "lookalike" ? "Look-alikes" : "New people", unit: p.c.audience ? "people" : undefined,
                line: repeat != null ? `${repeat}% of your ${shop.buyers.toLocaleString("en-US")} buyers have come back` : `${shop.buyers.toLocaleString("en-US")} buyers so far`, href: `${base}/shopify?tab=customers` });
              if (facts.lastYear) blocks.push({ src: `The same ${p.days} days last year`, big: usd(facts.lastYear.revenue), unit: "in sales", line: `${facts.lastYear.orders.toLocaleString("en-US")} orders, with no plan behind them`, href: `${base}/shopify` });
              if (facts.rivals) blocks.push({ src: "Competitors now · Meta Ad Library", big: facts.rivals.ads.toLocaleString("en-US"), unit: `ads from ${facts.rivals.brands} brand${facts.rivals.brands === 1 ? "" : "s"}`,
                line: facts.rivals.gap ? `Nobody says: ${facts.rivals.gap}` : facts.rivals.angle ? `Most say “${facts.rivals.angle.name}” · ${facts.rivals.angle.share}% of their ads` : `${facts.rivals.new30} started in the last 30 days`, href: `${base}/competitors` });
              if (facts.page) blocks.push({ src: "Where the ads send people · product page", big: facts.page.open ? String(facts.page.open) : "Ready", unit: facts.page.open ? `thing${facts.page.open === 1 ? "" : "s"} to fix first` : undefined, bad: facts.page.open > 0,
                line: facts.page.stars === false ? "No review stars showing in Google yet" : facts.page.stars ? "Review stars show in Google" : "Search listing checked", href: `${base}/seo` });
              blocks.push({ src: "Your ads so far · Meta", big: shop.adBack != null ? `${shop.adBack.toFixed(2)}×` : "None yet", unit: shop.adBack != null ? "back per $1" : undefined,
                line: shop.adDays ? `${usd(shop.adSpend)} spent over ${shop.adDays} days — the forecast uses it` : "So the numbers above are a scenario, not a forecast", href: `${base}/performance` });
              return blocks.map((x) => (
                <Link key={x.src} href={x.href} className="col g4 hv" style={{ padding: "13px 15px", borderRadius: 16, background: x.bad ? "var(--amber-bg)" : "#fff", boxShadow: x.bad ? "none" : "0 0 0 1px var(--line)", minWidth: 0 }}>
                  <span className="row between g8"><span className="xs i3 ell">{x.src}</span><Icon name="arrow-ur" size={12} color="#B5B2AC" /></span>
                  <span className="row g6" style={{ alignItems: "baseline", minWidth: 0 }}><span className="tnum" style={{ fontSize: 24, lineHeight: "30px", fontWeight: 600, letterSpacing: "-0.02em" }}>{x.big}</span>{x.unit && <span className="xs i2 ell">{x.unit}</span>}</span>
                  <span className="xs" title={x.line} style={{ color: x.bad ? "var(--amber)" : "var(--ink-3)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{x.line}</span>
                </Link>));
            })()}
          </div>
        </div>
        {/* ---- how the money comes back: each step of the sum, with the rate it rests on */}
        <div className="col g12" style={{ padding: "16px 18px", borderRadius: 18, background: "#fff", boxShadow: "0 0 0 1px var(--line)" }}>
          <div className="row between g12" style={{ flexWrap: "wrap" }}>
            <span className="i3" style={label}>How {usd(budget)} comes back</span>
            <Link className="btn quiet sm" href={`${base}/plan`} title="Your margin, offer and goal — used by every plan">Margin &amp; assumptions<Icon name="arrow-r" size={11} /></Link>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
            {([
              ["People who see it", Math.round(mid.seen).toLocaleString("en-US"), `${usd(input.rates.cpm[1])} per 1,000 views`],
              ["Click", Math.round(mid.clicks).toLocaleString("en-US"), `${(input.rates.ctr[1] * 100).toFixed(1)}% of them`],
              ["Order", String(Math.round(mid.orders)), `${(input.rates.cvr[p.c.kind][1] * 100).toFixed(1)}% of clicks`],
              ["Sales", usd(mid.revenue), `${usd(p.c.price)} an order`],
              ["Profit", `${mid.profit >= 0 ? "+" : "−"}${usd(Math.abs(mid.profit))}`, `after ${usd(mid.cost)} of goods and ${usd(budget)} of ads`],
            ] as const).map(([k, v, how], i) => (
              <div key={k} className="col g2" style={{ padding: "11px 13px", borderRadius: 14, background: i === 4 ? (mid.profit >= 0 ? "var(--green-bg)" : "var(--red-bg)") : "var(--tray)", minWidth: 0 }}>
                <span className="xs i3">{k}</span>
                <span className="tnum" style={{ fontSize: 22, lineHeight: "28px", fontWeight: 600, letterSpacing: "-0.02em", color: i === 4 ? (mid.profit >= 0 ? "var(--green)" : "var(--red)") : "var(--ink)" }}>{v}</span>
                <span className="xs i3 ell" title={how}>{how}</span>
              </div>))}
          </div>
          <div className="row g8 xs" style={{ flexWrap: "wrap" }}>
            <span className="pill" style={{ height: 24 }} title="The cautious rates">If it goes badly · {Math.round(lo.orders)} orders · {usd(lo.revenue)}</span>
            <span className="pill" style={{ height: 24 }} title="The strong rates">If it goes well · {Math.round(hi.orders)} orders · {usd(hi.revenue)}</span>
            <span className="pill" style={{ height: 24 }} title={level === 0 ? "Starting assumptions for a brand with no ad history — they are replaced by your own results as ads run" : "From your own ad results"}>{level === 0 ? "Rates are starting assumptions" : "Rates from your results"}</span>
            <span className="pill" style={{ height: 24 }}>{Math.round(input.margin * 100)}% margin</span>
          </div>
        </div>

      </div>

      {confirm && <Modal icon={<Icon name="facebook" size={16} />} title="Put this campaign on Meta" sub="Kaviar makes it paused. Nothing is spent until you switch it on in Ads Manager." onClose={() => setConfirm(false)} width={460}
        footer={<><button type="button" className="btn quiet" onClick={() => setConfirm(false)}>Cancel</button><button type="button" className="btn dark" onClick={launch}>Make it on Meta</button></>}>
        <div className="col g8">
          {([["Campaign", p.title], ["Daily budget", `${usd(p.budget / p.days)} · ${usd(p.budget)} over ${p.days} days`], ["Ads approved", String(okAds.length)], ["Starts", "Paused — you switch it on"]] as const).map(([k, v]) => (
            <span key={k} className="row between g12 sm" style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}><span className="i3">{k}</span><span className="w5 ell" style={{ maxWidth: 280 }}>{v}</span></span>))}
          <span className="xs i3">Kaviar can’t place the ads on Meta itself yet: after this, add the approved ads in Ads Manager.</span>
        </div>
      </Modal>}
      <Working work={work} onClear={clear} />
    </div>
  );
}
