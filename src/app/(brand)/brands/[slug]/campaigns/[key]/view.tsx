"use client";
import { useCallback, useState, useTransition } from "react";
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
import { AdsBlock, useAds } from "./ads";
import { decide, setMode } from "../../optimize/actions";
import { approvePlanFor, deleteOwnPlan, metaCheck, placeStep, setPlanBudget, switchPlan } from "../actions";
import { Combo } from "@/components/combo";
import { COUNTRIES } from "@/lib/meta/place-rules";
import type { Ready } from "@/lib/meta/place";

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
  const [confirm, setConfirm] = useState<false | "place" | "on" | "off">(false);
  // What Meta says it needs, asked when the brand opens "Put it on Meta" — and what the brand picks there.
  const [check, setCheck] = useState<{ ready: Ready | null; link: string | null } | "asking" | null>(null);
  const [pick, setPick] = useState<{ page?: string; pixel?: string; country: string }>({ country: p.meta?.country ?? "US" });
  const [budget, setBudget] = useState(p.budget);
  const [days, setDays] = useState(p.days);
  const [mode, setM] = useState<Mode>(pilot.mode);
  const clear = useCallback(() => setWork(null), []);
  const usd = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(Math.round(v));
  const [lo, mid, hi] = forecast(p.c, budget, days, input), changed = budget !== p.budget || days !== p.days;
  const go = (what: string, f: () => Promise<{ error?: string } | void>, done?: string) => { setDoing(what); setErr(null); start(async () => { const r = await f(); if (r && r.error) setErr(r.error); else { router.refresh(); if (done) setWork({ done }); } setDoing(null); }); };
  const { steps, now } = stepsOf(p), nowAt = steps.findIndex((s) => s.key === now), a = p.ads, step = Math.max(50, Math.round(minBudget / 4 / 50) * 50);
  const m = useAds({ slug, planKey: p.key, title: p.title, brief, ads, onWork: setWork, onError: setErr });
  const toReview = m.toReview, okAds = ads.filter((x) => x.status === "approved");
  const daily = budget / days, spin = (k: string, c?: string) => doing === k && <Icon name="spinner" size={13} className="spin" color={c} />;

  const openPlace = () => {
    setConfirm("place"); setCheck("asking");
    metaCheck(slug, p.key).then((r) => { setCheck({ ready: r.ready, link: r.link }); setPick((x) => ({ country: r.country, page: x.page ?? r.ready?.pages[0]?.id, pixel: x.pixel ?? r.ready?.pixels[0]?.id })); }).catch(() => setCheck({ ready: null, link: null }));
  };
  // Otto puts it on Meta piece by piece — the campaign, the ad set, each ad — and the dock says which piece he is on.
  const launch = () => {
    setConfirm(false); setErr(null); setDoing("launch");
    const say = (what: string) => setWork({ who: "qa", what: `Otto · ${what}`, usually: "Meta takes a few seconds for each piece", since: Date.now() });
    say(p.meta ? (p.meta.adset ? "Placing the ads on Meta" : "Making the ad set") : "Making the campaign on Meta, paused");
    start(async () => {
      for (let i = 0; i < 16; i++) {
        const r = await placeStep(slug, p.key, pick);
        if (r.error) { setWork({ done: r.error, bad: true }); setErr(r.error); router.refresh(); break; }
        if (r.done) { router.refresh(); setWork({ done: `${r.placed} ad${r.placed === 1 ? " is" : "s are"} in the campaign on Meta, paused — switch it on when you’re ready` }); break; }
        say(r.next ?? "Placing the ads on Meta"); router.refresh();
      }
      setDoing(null);
    });
  };
  const flip = (on: boolean) => { setConfirm(false); setErr(null); setDoing("switch"); setWork({ who: "qa", what: on ? "Otto · Switching the campaign on" : "Otto · Pausing the campaign", usually: "A few seconds", since: Date.now() });
    start(async () => { const r = await switchPlan(slug, p.key, on); if (r.error) { setWork({ done: r.error, bad: true }); setErr(r.error); } else { router.refresh(); setWork({ done: on ? `It’s running — ${usd(p.budget / p.days)} a day for ${p.days} days, then Meta stops it` : "Paused on Meta. Nothing more is spent." }); } setDoing(null); }); };
  const placedN = okAds.filter((x) => p.meta?.placed?.[x.id]).length, unplaced = p.meta ? okAds.length - placedN : 0;
  const running = results?.status === "ACTIVE" || Boolean(p.meta?.onAt);
  const manager = p.meta ? `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${p.meta.account}&selected_campaign_ids=${p.meta.campaignId}` : null;

  // What each step does when it is this plan's turn — the same button in the card's corner and under the step.
  const act = (k: StepKey, small = false): React.ReactNode => {
    const cls = small ? "row g4" : "row g6", st = small ? ({ height: 26, padding: "0 10px", borderRadius: 99, fontSize: 11.5, fontWeight: 500, whiteSpace: "nowrap", background: "#fff", color: "#121212" } as const) : ({ height: 40, padding: "0 18px", borderRadius: 99, background: "#34C77B", color: "#0B2B1A", fontSize: 14, fontWeight: 600 } as const), ic = small ? 10 : 12;
    if (k === "budget") return <button type="button" disabled={busy} className={cls} style={st} onClick={() => go("approve", () => approvePlanFor(slug, p.key, budget, days), "Plan approved — Remy can write its ads now")}>{spin("approve", "#0B2B1A") || <Icon name="check" size={ic} />}Approve plan</button>;
    if (k === "ads") return toReview.length ? <a className={cls} style={st} href="#ads">Review {toReview.length} ad{toReview.length === 1 ? "" : "s"}<Icon name="arrow-r" size={ic} style={{ transform: "rotate(90deg)" }} /></a>
      : <button type="button" disabled={busy || m.busy} className={cls} style={st} onClick={m.write}>{m.doing === "make" && <Icon name="spinner" size={13} className="spin" color="#0B2B1A" />}{m.doing === "make" ? "Remy is writing…" : "Make 3 ads"}</button>;
    if (k === "launch" && !p.approvedAt) return <button type="button" disabled={busy} className={cls} style={st} onClick={() => go("approve", () => approvePlanFor(slug, p.key, budget, days), "Budget approved — it can go on Meta now")}>{spin("approve", "#0B2B1A") || <Icon name="check" size={ic} />}Approve the budget</button>;
    if (k === "launch") return <button type="button" disabled={busy} className={cls} style={st} onClick={openPlace}>{spin("launch", "#0B2B1A")}Put it on Meta<Icon name="arrow-r" size={ic} /></button>;
    if (k === "results" && unplaced > 0) return <button type="button" disabled={busy} className={cls} style={st} onClick={openPlace}>{spin("launch", "#0B2B1A")}{doing === "launch" ? "Placing…" : `Add ${unplaced} ad${unplaced === 1 ? "" : "s"} on Meta`}{doing !== "launch" && <Icon name="arrow-r" size={ic} />}</button>;
    if (k === "results" && placedN > 0 && !running) return <button type="button" disabled={busy} className={cls} style={st} onClick={() => setConfirm("on")}>{spin("switch", "#0B2B1A") || <Icon name="play" size={ic} />}Switch it on</button>;
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
                {!p.approvedAt && p.stage !== "suggested" && now !== "launch" && !changed && <button type="button" disabled={busy} title="Its ads were written before this plan was approved" className="row g6" style={{ height: 40, padding: "0 16px", borderRadius: 99, background: "rgba(255,255,255,.12)", color: "#fff", fontSize: 13.5 }} onClick={() => go("approve", () => approvePlanFor(slug, p.key, budget, days), "Budget approved")}>{spin("approve") || <Icon name="check" size={12} />}Approve the budget</button>}
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

        {/* ---- who is on this campaign, what each one does, and where each has got to. Autopilot is Otto's part, switched from here */}
        <div className="col" style={{ borderRadius: 16, background: "#fff", boxShadow: "0 0 0 1px var(--line)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 1, background: "var(--line)", borderRadius: "16px 16px 0 0", overflow: "hidden" }}>
            {([
              ["analyst", "Iris", "The reason and the numbers", `${REASON_NAME[p.reason]} · ${usd(mid.revenue)} likely back`, true],
              ["builder", "Remy", "Writes the ads", m.doing === "make" ? "Writing now…" : ads.length ? `${ads.length} written${toReview.length ? ` · ${toReview.length} wait${toReview.length === 1 ? "s" : ""} for you` : ` · ${okAds.length} approved`}` : p.stage === "suggested" ? "Starts when you approve" : "Ready to write", ads.length > 0],
              ["catalog", "Cleo", "Product page and stock", facts.page?.open ? `${facts.page.open} thing${facts.page.open === 1 ? "" : "s"} to fix on the page` : facts.store ? `Page ready · ${facts.store.inventory.toLocaleString("en-US")} in stock` : "Page ready", !facts.page?.open],
              ["qa", "Otto", "Places the ads, watches the spend", doing === "launch" ? "Placing now…" : !p.meta ? "Starts when the ads are approved" : unplaced > 0 ? `${placedN} of ${okAds.length} ads on Meta` : running ? `Watching every day${pilot.last ? ` · checked ${pilot.last}` : ""}` : placedN ? `${placedN} ad${placedN === 1 ? "" : "s"} on Meta · paused` : "Campaign on Meta · no ads yet", Boolean(p.meta) && unplaced === 0 && placedN > 0],
            ] as const).map(([kind, name, does, at, done]) => (
              <div key={name} className="row g10" style={{ padding: "12px 14px", background: "#fff", minWidth: 0 }}>
                <AgentFace kind={kind} size={30} mood={done ? "happy" : "focus"} />
                <span className="col" style={{ minWidth: 0, lineHeight: 1.3 }}>
                  <span className="row g6"><span className="sm w5 i1">{name}</span><span className="xs i3 ell" title={does}>{does}</span></span>
                  <span className="xs ell tnum" title={at} style={{ color: done ? "var(--green)" : "var(--ink-2)", fontWeight: 500 }}>{at}</span>
                </span>
              </div>))}
          </div>
          <div className="row g10" style={{ padding: "10px 12px 10px 12px", flexWrap: "wrap" }}>
            <span className="sm w5 i1" style={{ flexShrink: 0, paddingLeft: 4 }}>Autopilot</span>
            <div className="seg" role="radiogroup" aria-label="How much Autopilot may decide alone" style={{ flexShrink: 0 }}>
              {(Object.keys(MODES) as Mode[]).map((m) => <button key={m} type="button" role="radio" aria-checked={mode === m} disabled={busy} className={`o${mode === m ? " on" : ""}`} title={MODES[m].line} onClick={() => { setM(m); go("mode", () => setMode(slug, m)); }}>{MODES[m].name}</button>)}
            </div>
            <span className="xs i2 fill" style={{ minWidth: 200 }}>{!p.meta ? "Otto starts watching the day it is on Meta" : pilot.changes.length ? `Found ${pilot.changes.length} change${pilot.changes.length === 1 ? "" : "s"} for this campaign` : `Watching this campaign every day${pilot.last ? ` · checked ${pilot.last}` : ""}`}
              <span className="i3"> · {mode === "ask" ? "it asks you before every change" : mode === "protect" ? "it pauses what loses money by itself, never raises spend" : "it pauses losers and moves budget to winners by itself"}</span></span>
          </div>
          {pilot.changes.map((c) => (
            <div key={c.id} className="row g12" style={{ padding: "10px 16px", borderTop: "1px solid var(--line)" }}>
              <AgentFace kind="qa" size={22} />
              <span className="col fill" style={{ minWidth: 0 }}><span className="sm w5 ell">{c.title}</span><span className="xs i3 ell" title={c.why}>{c.before && c.after ? `${c.before} → ${c.after} · ` : ""}{c.why}</span></span>
              <button type="button" className="btn dark sm" disabled={busy} onClick={() => go(c.id, () => decide(slug, [c.id], "approved"), "Change approved")}>{spin(c.id, "#fff")}Approve</button>
              <button type="button" className="btn quiet sm" disabled={busy} onClick={() => go(c.id, () => decide(slug, [c.id], "skipped"))}>Skip</button>
            </div>))}
        </div>

        {/* ---- on Meta: what Kaviar made, what is left for the brand, and what it has brought against the plan */}
        {p.meta && results && <div className="col g12" style={{ padding: "16px 18px", borderRadius: 18, background: "#fff", boxShadow: "0 0 0 1px var(--line)" }}>
          <div className="row between g12" style={{ flexWrap: "wrap" }}>
            <span className="row g8"><span className="i3" style={label}>Results against this plan</span>
              <span className={`pill ${running ? "green" : "amber"}`} style={{ height: 22, fontSize: 11 }}>{running ? "Running on Meta" : "Paused on Meta"}</span></span>
            <span className="row g6">{a && <Link className="btn quiet sm" href={`${base}/run/${a.batchId}`} title="The ads, laid out for Ads Manager">Set-up sheet<Icon name="arrow-r" size={11} /></Link>}{manager && <a className="btn sm" href={manager} target="_blank" rel="noreferrer">Open in Ads Manager<Icon name="external" size={11} /></a>}</span>
          </div>
          {unplaced > 0 ? <div className="row g10 sm" style={{ padding: "10px 12px", borderRadius: 12, background: "var(--amber-bg)", color: "var(--amber)", flexWrap: "wrap" }}>
            <Icon name="info" size={14} /><span className="fill" style={{ minWidth: 220 }}>{placedN ? `${placedN} of ${okAds.length} ads are in the campaign` : "The campaign is on Meta with no ads in it yet"}</span>
            <button type="button" className="btn dark sm" disabled={busy} onClick={openPlace}>{spin("launch", "#fff")}Add {unplaced} ad{unplaced === 1 ? "" : "s"} on Meta</button></div>
          : placedN > 0 && !running ? <div className="row g10 sm" style={{ padding: "10px 12px", borderRadius: 12, background: "var(--tray)", flexWrap: "wrap" }}>
            <Icon name="check-circle" size={14} color="#1F7A52" /><span className="fill i2" style={{ minWidth: 220 }}>{placedN} ad{placedN === 1 ? " is" : "s are"} in the campaign, paused · nothing is spent yet</span>
            <button type="button" className="btn dark sm" disabled={busy} onClick={() => setConfirm("on")}>{spin("switch", "#fff") || <Icon name="play" size={11} color="#fff" />}Switch it on · {usd(p.meta.daily)} a day</button></div>
          : running ? <div className="row g10 sm" style={{ padding: "10px 12px", borderRadius: 12, background: "var(--green-bg)", flexWrap: "wrap" }}>
            <span style={{ width: 7, height: 7, borderRadius: 99, background: "#34C77B", boxShadow: "0 0 0 3px rgba(52,199,123,.2)", animation: "pulse 2.2s ease-in-out infinite" }} /><span className="fill" style={{ minWidth: 220, color: "var(--green)" }}>Running · {usd(p.meta.daily)} a day{p.meta.until ? ` until ${new Date(p.meta.until).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}</span>
            <button type="button" className="btn sm" disabled={busy} onClick={() => setConfirm("off")}>{spin("switch") || <Icon name="pause" size={11} />}Pause</button></div>
          : null}
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
        <AdsBlock m={m} base={base} stage={p.stage} locked={Boolean(p.meta)} ads={ads} brief={brief} productPhoto={productPhoto} batchId={a?.batchId ?? null} placed={p.meta?.placed} />

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

      {confirm === "place" && (() => {
        const got = check && check !== "asking" ? check : null, r = got?.ready ?? null, asking = !got, page = r?.pages.find((x) => x.id === pick.page) ?? r?.pages[0], pixel = r?.pixels.find((x) => x.id === pick.pixel) ?? r?.pixels[0];
        const stop = asking ? null : !r ? "Meta isn’t connected — connect it in Settings › Integrations." : !r.account.ok ? r.account.note : !page ? "Kaviar can’t see a Facebook Page on this ad account. Reconnect Meta in Settings › Integrations and include your Page." : !pixel ? "This ad account has no Meta pixel, so purchases can’t be counted. Add the Facebook & Instagram app in Shopify." : !got?.link ? "Kaviar doesn’t know this product’s page on your store yet — run a sync in Settings." : r.dry && !r.dry.ok ? r.dry.note : null;
        const row = (k: string, v: React.ReactNode) => <span key={k} className="row between g12 sm" style={{ padding: "9px 0", borderBottom: "1px solid var(--line)", minHeight: 40 }}><span className="i3" style={{ flexShrink: 0 }}>{k}</span><span className="w5 ell" style={{ maxWidth: 300, textAlign: "right" }}>{v}</span></span>;
        return (
          <Modal icon={<Icon name="facebook" size={16} />} title={p.meta ? "Add the ads on Meta" : "Put this campaign on Meta"} sub="Otto makes everything paused. Nothing is spent until you switch it on." onClose={() => setConfirm(false)} width={480}
            footer={<><button type="button" className="btn quiet" onClick={() => setConfirm(false)}>Cancel</button><button type="button" className="btn dark" disabled={asking || Boolean(stop)} onClick={launch}>{asking && <Icon name="spinner" size={13} className="spin" color="#fff" />}{asking ? "Asking Meta…" : "Put it on Meta, paused"}</button></>}>
            <div className="col">
              {row("Campaign", p.title)}
              {row("Budget", `${usd(p.budget / p.days)} a day · ${usd(p.budget)} over ${p.days} days`)}
              {row("Ads", `${okAds.length} approved${placedN ? ` · ${placedN} already there` : ""}`)}
              {!asking && r && <>
                {row("Shown as", r.pages.length > 1 ? <select className="input" style={{ height: 30, fontSize: 13 }} value={page?.id} onChange={(e) => setPick({ ...pick, page: e.target.value })} aria-label="Facebook Page">{r.pages.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select> : page ? <span className="row g6" style={{ justifyContent: "flex-end" }}><Icon name="check" size={12} color="#1F7A52" />{page.name}</span> : <span style={{ color: "var(--red)" }}>No Page found</span>)}
                {row("Purchases counted by", pixel ? <span className="row g6" style={{ justifyContent: "flex-end" }}><Icon name="check" size={12} color="#1F7A52" />{pixel.name}</span> : <span style={{ color: "var(--red)" }}>No pixel found</span>)}
                {r.dry && row("Meta’s check", r.dry.ok ? <span className="row g6" style={{ justifyContent: "flex-end", color: "var(--green)" }}><Icon name="check" size={12} color="#1F7A52" />Accepts this set-up</span> : <span style={{ color: "var(--red)" }}>Refused</span>)}
              </>}
              {!p.meta?.adset && <div className="col g4" style={{ paddingTop: 12 }}><span className="xs i2 w5">Shown to people in</span>
                <Combo label="Country" searchText="Search countries" value={pick.country} onChange={(v) => setPick({ ...pick, country: v })} items={COUNTRIES.map(([k, name]) => ({ value: k, label: name, icon: "globe" as const, sub: "Meta finds the likely buyers there" }))} /></div>}
              {stop && <span className="row top g8 sm" style={{ marginTop: 12, padding: "10px 12px", borderRadius: 12, background: "#FBEDE6", color: "#B4532A" }}><Icon name="warning-circle" size={14} weight="fill" color="#B4532A" style={{ marginTop: 2, flexShrink: 0 }} /><span>{stop}</span></span>}
            </div>
          </Modal>);
      })()}
      {(confirm === "on" || confirm === "off") && p.meta && <Modal icon={<Icon name={confirm === "on" ? "play" : "pause"} size={16} />} title={confirm === "on" ? "Switch this campaign on" : "Pause this campaign"} sub={confirm === "on" ? "This is the step that spends money." : "Meta stops showing its ads. You can switch it on again."} onClose={() => setConfirm(false)} width={440}
        footer={<><button type="button" className="btn quiet" onClick={() => setConfirm(false)}>Cancel</button><button type="button" className="btn dark" onClick={() => flip(confirm === "on")}>{confirm === "on" ? `Start spending ${usd(p.meta.daily)} a day` : "Pause it"}</button></>}>
        {confirm === "on" ? <div className="col">
          {([["Spends", `${usd(p.meta.daily)} a day`], ["For", `${p.days} days · about ${usd(p.budget)} in all`], ["Then", "Meta stops it by itself"], ["Ads", `${placedN} on Meta`], ["Autopilot", MODES[mode].name]] as const).map(([k, v]) => (
            <span key={k} className="row between g12 sm" style={{ padding: "9px 0", borderBottom: "1px solid var(--line)" }}><span className="i3">{k}</span><span className="w5">{v}</span></span>))}
        </div> : <span className="sm i2">{results ? `${usd(results.spend)} spent so far.` : "Nothing more is spent after this."}</span>}
      </Modal>}
      <Working work={work} onClear={clear} />
    </div>
  );
}
