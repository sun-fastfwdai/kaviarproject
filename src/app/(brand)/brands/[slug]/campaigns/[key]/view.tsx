"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { AgentFace } from "@/components/agent";
import type { PlanInput } from "@/lib/growth/plan";
import { forecast, REASON_NAME, STAGE_NAME, stepsOf, type PlanCard, type StepKey } from "@/lib/growth/plans-rules";
import { makeAds } from "../../plan/actions";
import { approvePlanFor, setPlanBudget } from "../actions";

/**
 * One plan. It opens with what it is in one line — money in, money back — over its own six steps, with "you are here" and the one
 * button that step needs. Then why now, and the ads made for it. Everything about this campaign is done from this page.
 */
const LEVEL = ["Scenario · not a forecast", "Early estimate", "From your results"];
const DAYS = [7, 14, 28];
type Props = { slug: string; currency: string; plan: PlanCard; input: Omit<PlanInput, "candidates">; minBudget: number; level: 0 | 1 | 2 };

export function PlanView({ slug, currency, plan: p, input, minBudget, level }: Props) {
  const base = `/brands/${slug}`, router = useRouter();
  const [busy, start] = useTransition();
  const [doing, setDoing] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [budget, setBudget] = useState(p.budget);
  const [days, setDays] = useState(p.days);
  const usd = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(Math.round(v));
  const [lo, mid, hi] = forecast(p.c, budget, days, input), changed = budget !== p.budget || days !== p.days;
  const go = (what: string, f: () => Promise<{ error?: string } | void>) => { setDoing(what); setErr(null); start(async () => { const r = await f(); if (r && r.error) setErr(r.error); else router.refresh(); setDoing(null); }); };
  const { steps, now } = stepsOf(p), nowAt = steps.findIndex((s) => s.key === now), a = p.ads, step = Math.max(50, Math.round(minBudget / 4 / 50) * 50);
  const spin = (k: string, dark = false) => doing === k && <Icon name="spinner" size={13} className="spin" color={dark ? "#0B2B1A" : undefined} />;
  // What each step does when it is this plan's turn — the same button in the card's corner and under the step.
  const act = (k: StepKey, small = false): React.ReactNode => {
    const cls = small ? "row g4" : "row g6", st = small ? ({ height: 26, padding: "0 10px", borderRadius: 99, fontSize: 11.5, fontWeight: 500, whiteSpace: "nowrap", background: "#fff", color: "#121212" } as const) : ({ height: 40, padding: "0 18px", borderRadius: 99, background: "#34C77B", color: "#0B2B1A", fontSize: 14, fontWeight: 600 } as const);
    if (k === "budget") return <button type="button" disabled={busy} className={cls} style={st} onClick={() => go("approve", () => approvePlanFor(slug, p.key, budget, days))}>{spin("approve", true) || <Icon name="check" size={small ? 10 : 13} />}Approve plan</button>;
    if (k === "ads") return a?.review ? <Link className={cls} style={st} href={`${base}/creative/${a.batchId}`}>Review {a.review} ad{a.review === 1 ? "" : "s"}<Icon name="arrow-r" size={small ? 10 : 12} /></Link>
      : <button type="button" disabled={busy} className={cls} style={st} onClick={() => go("make", () => makeAds(slug, p.key))}>{spin("make", true)}{doing === "make" ? "Remy is writing…" : "Make 3 ads"}</button>;
    if (k === "test") return <Link className={cls} style={st} href={`${base}/audience?batch=${a?.batchId ?? ""}`}>Run the test<Icon name="arrow-r" size={small ? 10 : 12} /></Link>;
    if (k === "launch") return <Link className={cls} style={st} href={`${base}/run`}>Put it live<Icon name="arrow-r" size={small ? 10 : 12} /></Link>;
    return null;
  };

  return (
    <div className="scroll" style={{ padding: "22px 24px 48px" }}>
      <div className="col g16">
        {/* ---- the plan in one line, and where it has got to */}
        <div style={{ position: "relative", overflow: "clip", borderRadius: 22, background: "#121212", color: "#fff", padding: "26px 28px 22px" }}>
          <div aria-hidden style={{ position: "absolute", right: -120, top: -160, width: 520, height: 520, borderRadius: 999, background: `radial-gradient(closest-side, ${mid.profit < 0 ? "rgba(235,122,60,.30)" : "rgba(52,199,123,.30)"}, transparent)` }} />
          <div className="row top between g20" style={{ position: "relative", flexWrap: "wrap" }}>
            <div className="col g10" style={{ minWidth: 0 }}>
              <span className="row g8" style={{ flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, color: "rgba(255,255,255,.6)" }}>{REASON_NAME[p.reason]} · {STAGE_NAME[p.stage]}</span>
                {p.when && <span style={{ height: 20, padding: "0 9px", borderRadius: 99, fontSize: 11, lineHeight: "20px", fontWeight: 600, background: p.urgent ? "rgba(255,155,115,.2)" : "rgba(255,255,255,.12)", color: p.urgent ? "#FFB49A" : "rgba(255,255,255,.8)" }}>{p.when}</span>}
                <span style={{ height: 20, padding: "0 9px", borderRadius: 99, fontSize: 11, lineHeight: "20px", background: level === 2 ? "rgba(52,199,123,.22)" : "rgba(255,255,255,.12)", color: level === 2 ? "#8BE8B4" : "rgba(255,255,255,.75)" }}>{LEVEL[level]}</span>
              </span>
              <span style={{ fontSize: 22, lineHeight: "28px", fontWeight: 600, letterSpacing: "-0.015em", maxWidth: 640 }}>{p.title}</span>
              <div className="row g14" style={{ alignItems: "baseline", flexWrap: "wrap" }}>
                <span className="col">
                  <span className="row g6" style={{ alignItems: "center" }}>
                    <button type="button" aria-label="Spend less" disabled={budget - step < 50} onClick={() => setBudget((b) => Math.max(50, b - step))} style={{ width: 26, height: 26, borderRadius: 99, background: "rgba(255,255,255,.1)", color: "#fff", fontSize: 16 }}>−</button>
                    <span className="tnum" style={{ fontSize: 34, lineHeight: "40px", fontWeight: 600, letterSpacing: "-0.02em", color: "rgba(255,255,255,.72)" }}>{usd(budget)}</span>
                    <button type="button" aria-label="Spend more" onClick={() => setBudget((b) => b + step)} style={{ width: 26, height: 26, borderRadius: 99, background: "rgba(255,255,255,.1)", color: "#fff", fontSize: 16 }}>+</button>
                  </span>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,.5)" }}>you spend</span>
                </span>
                <span aria-hidden style={{ fontSize: 28, color: "rgba(255,255,255,.35)" }}>→</span>
                <span className="col"><span className="tnum" style={{ fontSize: 56, lineHeight: "60px", fontWeight: 600, letterSpacing: "-0.035em" }}>{usd(mid.revenue)}</span>
                  <span className="row g6" style={{ fontSize: 12, color: "rgba(255,255,255,.5)" }}>likely comes back in
                    <span style={{ display: "inline-flex", padding: 2, gap: 2, borderRadius: 99, background: "rgba(255,255,255,.1)" }}>{DAYS.map((d) => <button key={d} type="button" onClick={() => setDays(d)} style={{ height: 20, padding: "0 8px", borderRadius: 99, fontSize: 11, background: days === d ? "#fff" : "transparent", color: days === d ? "#121212" : "rgba(255,255,255,.75)" }}>{d} days</button>)}</span>
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
              <span className="row g8">
                {changed && p.stage !== "suggested" && <button type="button" disabled={busy} className="row g6" style={{ height: 40, padding: "0 16px", borderRadius: 99, background: "rgba(255,255,255,.12)", color: "#fff", fontSize: 13.5 }} onClick={() => go("save", () => setPlanBudget(slug, p.key, budget, days))}>{spin("save")}Save the change</button>}
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
                  {x.key === "results" && !on && <Link href={`${base}/performance`} className="row g4" style={{ alignSelf: "flex-start", height: 26, padding: "0 10px", borderRadius: 99, fontSize: 11.5, background: "rgba(255,255,255,.1)", color: "rgba(255,255,255,.85)" }}>See results<Icon name="arrow-r" size={10} /></Link>}
                </div>
              );
            })}
          </div>
        </div>

        {err && <div className="row g8 sm" style={{ padding: "10px 14px", borderRadius: 12, background: "#FBEDE6", color: "#B4532A" }}><Icon name="warning-circle" size={14} weight="fill" color="#B4532A" />{err}</div>}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))", gap: 12 }}>
          {/* ---- why now */}
          <div className="col g10" style={{ padding: "16px 18px", borderRadius: 18, background: "#fff", boxShadow: "0 0 0 1px var(--line)" }}>
            <span className="row g8" style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600 }}><AgentFace kind={p.reason === "overstock" ? "qa" : "analyst"} size={18} /><span className="i3">Why now</span></span>
            <span style={{ fontSize: 19, lineHeight: "25px", fontWeight: 600, letterSpacing: "-0.015em" }}>{p.title}</span>
            <span className="sm i2">{p.why}</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: "auto" }}>
              {([["Who sees it", p.c.audience ? `${p.c.audience.toLocaleString("en-US")} people` : p.c.kind === "lookalike" ? "Look-alikes" : "New people"], ["At", usd(p.c.price)], ["In stock", p.c.stock != null ? p.c.stock.toLocaleString("en-US") : "–"]] as const).map(([k, v]) => (
                <div key={k} className="col g2" style={{ padding: "9px 11px", borderRadius: 12, background: "var(--tray)", minWidth: 0 }}><span className="xs i3 ell">{k}</span><span className="tnum sm w5 ell">{v}</span></div>))}
            </div>
          </div>
          {/* ---- the ads made for this plan */}
          <div className="col g10" style={{ padding: "16px 18px", borderRadius: 18, background: "#fff", boxShadow: "0 0 0 1px var(--line)" }}>
            <span className="row between g8"><span className="row g8" style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600 }}><AgentFace kind="builder" size={18} /><span className="i3">Its ads</span></span>
              {a && <span className="xs i3 tnum">{a.review ? `${a.review} to review` : ""}{a.review && a.approved ? " · " : ""}{a.approved ? `${a.approved} approved` : ""}</span>}</span>
            {a ? <>
              <div className="row g8" style={{ overflow: "hidden" }}>
                {a.thumbs.length ? a.thumbs.map((u) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={u} src={u} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} style={{ width: 84, height: 106, borderRadius: 12, objectFit: "cover", flexShrink: 0, background: "var(--tray-2)", boxShadow: "0 0 0 1px var(--line)" }} />))
                  : <span className="sm i3">{a.review + a.approved} ad{a.review + a.approved === 1 ? "" : "s"} written</span>}
              </div>
              <Link className="btn sm" style={{ alignSelf: "flex-start", marginTop: "auto" }} href={`${base}/creative/${a.batchId}`}>Open the ads<Icon name="arrow-r" size={11} /></Link>
            </> : <span className="sm i3" style={{ margin: "auto 0" }}>{p.stage === "suggested" ? "None yet — ads are made once you approve the plan." : "None yet."}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
