"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { AgentFace } from "@/components/agent";
import type { Action, Today } from "@/lib/growth/today";
import { MODES, type Mode } from "@/lib/growth/pilot";
import { approvePlan } from "../plan/actions";
import { checkNow, setMode } from "../optimize/actions";
import { Bento } from "@/components/bento";
import { ActionCard, GROUP_TONE as TONE } from "./action-card";

/**
 * Today, as a dashboard. Top: the day, a greeting and Autopilot's controls. Then the board — the month in blocks — and the plan in one
 * sentence with the six steps. Then
 * what is ready for action: up to four cards, each one decision with its evidence as a picture and one button. Nothing is only there
 * to be read: every number opens where it comes from.
 */
const LEVEL = ["Scenario · not a forecast", "Early estimate", "From your results"];

export function TodayView({ slug, t, day, hello }: { slug: string; t: Today; day: string; hello: string }) {
  const base = `/brands/${slug}`;
  const [more, setMore] = useState(false);
  const [busy, start] = useTransition();
  const router = useRouter();
  const [doing, setDoing] = useState<string | null>(null);
  const [mode, setM] = useState<Mode>(t.pilot.mode);
  const go = (what: string, f: () => Promise<unknown>) => { setDoing(what); start(async () => { await f(); router.refresh(); setDoing(null); }); };
  const usd = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: t.currency, maximumFractionDigits: 0 }).format(Math.round(v));
  const pl = t.plan, nowAt = t.flow.findIndex((x) => x.key === t.now), total = t.actions.length + t.later.length;
  const Go = (a: Action) => <Link className="btn sm" href={a.href ?? base} style={{ flexShrink: 0 }}>{a.cta}<Icon name="arrow-r" size={11} /></Link>;

  return (
    <div className="scroll" style={{ padding: "22px 24px 48px" }}>
      <div className="col g16">
        {/* ---- the day, a greeting, and the agents at work: Autopilot is switched, run and answered from here */}
        <div className="row between g16" style={{ flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="col g2" style={{ minWidth: 0 }}>
            <span className="xs i3" style={{ letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>{day}</span>
            <span style={{ fontSize: 30, lineHeight: "38px", fontWeight: 600, letterSpacing: "-0.03em" }}>{hello}</span>
          </div>
          <div className="row g10 rise" style={{ padding: "7px 8px 7px 12px", borderRadius: 99, background: "#fff", boxShadow: "0 0 0 1px var(--line), 0 1px 2px rgba(18,18,18,.04)", flexWrap: "wrap" }}
            title={`${t.pilot.last ? `Checked ${t.pilot.last}` : "First check within the hour"} · ${t.pilot.watched.campaigns ? `${t.pilot.watched.campaigns} campaign${t.pilot.watched.campaigns === 1 ? "" : "s"}, ${t.pilot.watched.ads} ads` : `orders and stock on ${t.pilot.watched.products} products`}${t.store ? ` · the store’s ${t.store.open ? `${t.store.open} open fixes` : "search listing"}` : ""}`}>
            <span className="row" aria-hidden>{(["analyst", "builder", "qa", "catalog"] as const).map((k, i) => <span key={k} style={{ marginLeft: i ? -7 : 0, borderRadius: 99, boxShadow: "0 0 0 2px #fff", display: "flex" }}><AgentFace kind={k} size={24} mood="happy" /></span>)}</span>
            <span className="col" style={{ lineHeight: 1.2 }}><span className="row g6 sm w5"><span style={{ width: 7, height: 7, borderRadius: 99, background: "#34C77B", boxShadow: "0 0 0 3px rgba(52,199,123,.2)", animation: "pulse 2.2s ease-in-out infinite" }} />Autopilot</span><span className="xs i3">{t.pilot.last ? `Checked ${t.pilot.last}` : "First check within the hour"}</span></span>
            <div className="seg" role="radiogroup" aria-label="How much Autopilot may decide alone">
              {(Object.keys(MODES) as Mode[]).map((m) => <button key={m} type="button" role="radio" aria-checked={mode === m} disabled={busy} className={`o${mode === m ? " on" : ""}`} onClick={() => { setM(m); go("mode", () => setMode(slug, m)); }}>{MODES[m].name}</button>)}
            </div>
            <button type="button" className="btn sm" style={{ borderRadius: 99 }} disabled={busy} onClick={() => go("check", () => checkNow(slug))}>{doing === "check" ? <Icon name="spinner" size={12} className="spin" /> : <Icon name="refresh" size={12} />}Check now</button>
            {t.pilot.waiting > 0 && <Link href={`${base}/performance#autopilot`} className="btn dark sm" style={{ borderRadius: 99 }}>Decide {t.pilot.waiting}<Icon name="arrow-r" size={11} color="#fff" /></Link>}
          </div>
        </div>

        {/* ---- the board: the month in blocks — sales, the numbers around it, campaigns, customers, stock and the store's score */}
        <Bento tiles={t.status} />

        {/* ---- the plan in one sentence, and where you are */}
        <div style={{ position: "relative", overflow: "clip", borderRadius: 22, background: "#121212", color: "#fff", padding: "26px 28px 22px" }}>
          <div aria-hidden style={{ position: "absolute", right: -120, top: -160, width: 520, height: 520, borderRadius: 999, background: `radial-gradient(closest-side, ${pl && pl.profit < 0 ? "rgba(235,122,60,.30)" : "rgba(52,199,123,.30)"}, transparent)` }} />
          <div className="row top between g20" style={{ position: "relative", flexWrap: "wrap" }}>
            {pl ? (
              <div className="col g10" style={{ minWidth: 0 }}>
                <span className="row g8" style={{ flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, color: "rgba(255,255,255,.6)" }}>{pl.approved ? "Your plan · approved" : "Your plan · draft"}</span>
                  <span style={{ height: 20, padding: "0 9px", borderRadius: 99, fontSize: 11, display: "inline-flex", alignItems: "center", background: pl.level === 2 ? "rgba(52,199,123,.22)" : "rgba(255,255,255,.12)", color: pl.level === 2 ? "#8BE8B4" : "rgba(255,255,255,.75)" }}>{LEVEL[pl.level]}</span>
                </span>
                <div className="row g14" style={{ alignItems: "baseline", flexWrap: "wrap" }}>
                  <Link href={`${base}/plan`} className="col" title="Change the budget"><span className="tnum" style={{ fontSize: 34, lineHeight: "40px", fontWeight: 600, letterSpacing: "-0.02em", color: "rgba(255,255,255,.72)" }}>{usd(pl.budget)}</span><span className="row g4" style={{ fontSize: 12, color: "rgba(255,255,255,.5)" }}>you spend<Icon name="pencil" size={10} /></span></Link>
                  <span aria-hidden style={{ fontSize: 28, color: "rgba(255,255,255,.35)" }}>→</span>
                  <Link href={`${base}/plan#how`} className="col" title="See how this number is reached"><span className="tnum" style={{ fontSize: 56, lineHeight: "60px", fontWeight: 600, letterSpacing: "-0.035em", animation: "modalIn .6s ease-out both" }}>{usd(pl.mid)}</span><span style={{ fontSize: 12, color: "rgba(255,255,255,.5)" }}>likely comes back in {pl.weeks} weeks</span></Link>
                  <Link href={`${base}/plan#how`} className="col" style={{ paddingLeft: 6 }} title="See the costs"><span className="tnum" style={{ fontSize: 22, lineHeight: "28px", fontWeight: 600, color: pl.profit >= 0 ? "#6EE7A8" : "#FF9B73" }}>{pl.profit >= 0 ? "+" : "−"}{usd(Math.abs(pl.profit))}</span><span style={{ fontSize: 12, color: "rgba(255,255,255,.5)" }}>{pl.profit >= 0 ? "profit after costs" : "short of break-even"}</span></Link>
                </div>
                {/* the range from a bad run to a good one */}
                <div className="col g4" style={{ width: 430, maxWidth: "100%" }}>
                  <div style={{ position: "relative", height: 6, borderRadius: 99, background: "rgba(255,255,255,.14)" }}>
                    <div style={{ position: "absolute", inset: 0, borderRadius: 99, background: "linear-gradient(90deg, rgba(255,155,115,.9), rgba(110,231,168,.95))", opacity: 0.85 }} />
                    <div style={{ position: "absolute", top: -4, left: `${Math.min(96, Math.max(4, ((pl.mid - pl.lo) / Math.max(1, pl.hi - pl.lo)) * 100))}%`, width: 14, height: 14, borderRadius: 99, background: "#fff", transform: "translateX(-7px)", boxShadow: "0 0 0 4px rgba(255,255,255,.18)" }} />
                  </div>
                  <div className="row between" style={{ fontSize: 11.5, color: "rgba(255,255,255,.55)" }}><span>If it goes badly {usd(pl.lo)}</span><span>If it goes well {usd(pl.hi)}</span></div>
                </div>
              </div>
            ) : (
              <div className="col g6"><span style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em" }}>Connect your store to get a plan</span><span style={{ fontSize: 13, color: "rgba(255,255,255,.6)" }}>Kaviar reads your products, prices and orders, then works out where a budget should go.</span></div>
            )}
            <div className="col g10" style={{ alignItems: "flex-end", flexShrink: 0 }}>
              {pl?.image && <Link href={`${base}/plan`} title="Change the product" className="row g10" style={{ padding: "6px 12px 6px 6px", borderRadius: 14, background: "rgba(255,255,255,.08)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={pl.image} alt="" width={44} height={44} style={{ borderRadius: 10, objectFit: "cover", background: "#fff" }} />
                <span className="col" style={{ maxWidth: 190 }}><span style={{ fontSize: 11, color: "rgba(255,255,255,.5)" }}>Selling</span><span className="ell" style={{ fontSize: 13, fontWeight: 500 }}>{pl.product}</span></span>
                <Icon name="pencil" size={11} color="rgba(255,255,255,.5)" />
              </Link>}
              <span className="row g8">
                {pl && !pl.approved && <button type="button" disabled={busy} onClick={() => go("approve", () => approvePlan(slug, { budget: pl.budget }, true))} className="row g6" style={{ height: 38, padding: "0 16px", borderRadius: 99, background: "#34C77B", color: "#0B2B1A", fontSize: 13.5, fontWeight: 600 }}>{doing === "approve" ? <Icon name="spinner" size={13} className="spin" /> : <Icon name="check" size={13} />}Approve plan</button>}
                <Link href={pl ? `${base}/plan` : `${base}/integrations`} className="row g6" style={{ height: 38, padding: "0 16px", borderRadius: 99, background: "#fff", color: "#121212", fontSize: 13.5, fontWeight: 500 }}>{pl ? `See how ${pl.campaigns} campaign${pl.campaigns === 1 ? "" : "s"} get there` : "Connect"}<Icon name="arrow-r" size={12} /></Link>
              </span>
            </div>
          </div>

          {/* the six steps */}
          <div className="row" style={{ position: "relative", marginTop: 24, paddingTop: 18, borderTop: "1px solid rgba(255,255,255,.12)", alignItems: "flex-start" }}>
            {t.flow.map((x, i) => {
              const on = i === nowAt, done = x.done && !on;
              return (
                <Link key={x.key} href={`${base}/${x.path}`} className="col g6 fill" style={{ minWidth: 0, position: "relative", paddingRight: 10 }} aria-current={on ? "step" : undefined}>
                  {i < t.flow.length - 1 && <span aria-hidden style={{ position: "absolute", left: 30, right: 4, top: 12, height: 2, borderRadius: 99, background: i < nowAt ? "rgba(110,231,168,.7)" : "rgba(255,255,255,.14)" }} />}
                  <span style={{ width: 26, height: 26, borderRadius: 99, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, position: "relative",
                    background: on ? "#fff" : done ? "#34C77B" : "rgba(255,255,255,.1)", color: on ? "#121212" : done ? "#0B2B1A" : "rgba(255,255,255,.6)", boxShadow: on ? "0 0 0 5px rgba(255,255,255,.18)" : "none", animation: on ? "pulse 2.4s ease-in-out infinite" : undefined }}>
                    {done ? <Icon name="check" size={13} color="#0B2B1A" /> : i + 1}
                  </span>
                  <span className="col" style={{ minWidth: 0 }}>
                    <span className="row g6"><span className="ell" style={{ fontSize: 13, fontWeight: on ? 600 : 500, color: on ? "#fff" : "rgba(255,255,255,.82)" }}>{x.label}</span></span>
                    <span className="ell" style={{ fontSize: 11.5, color: on ? "#8BE8B4" : "rgba(255,255,255,.5)" }}>{on ? `You are here · ${x.note}` : x.note}</span>
                  </span>
                  <span className="row g4" style={{ alignSelf: "flex-start", height: 26, padding: "0 10px", borderRadius: 99, fontSize: 11.5, fontWeight: 500, whiteSpace: "nowrap", background: on ? "#fff" : "rgba(255,255,255,.1)", color: on ? "#121212" : "rgba(255,255,255,.85)" }}>{x.act}<Icon name="arrow-r" size={10} /></span>
                </Link>
              );
            })}
          </div>
        </div>

        {/* ---- ready for action: each decision with its evidence and one button */}
        {total > 0 ? <div className="col g10">
          <span className="xs i3" style={{ letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>Ready for action · {total}</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: 12 }}>{t.actions.map((a, i) => <div key={a.key} className="rise" style={{ display: "flex", minWidth: 0, ["--i" as string]: i + 3 }}><ActionCard slug={slug} a={a} n={i + 1} primary={i === 0} /></div>)}</div>
          {t.later.length > 0 && <div className="card" style={{ padding: "0 16px" }}>
            {more && t.later.map((a, i) => (
              <div key={a.key} className="row g12" style={{ padding: "11px 0", borderBottom: "1px solid var(--line)" }}>
                <span className="tnum xs i3 w5" style={{ width: 20, flexShrink: 0 }}>{String(t.actions.length + i + 1).padStart(2, "0")}</span>
                <AgentFace kind={a.who} size={22} mood={a.urgent ? "worried" : "happy"} />
                <div className="col fill" style={{ minWidth: 0 }}>
                  <span className="row g8"><span className="sm w5 i1 ell">{a.title}</span><span style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600, color: TONE[a.group], flexShrink: 0 }}>{a.group}</span></span>
                  <span className="xs i3 ell" title={a.why}>{a.effect ? `${a.effect} · ` : ""}{a.why}</span>
                </div>
                {Go(a)}
              </div>))}
            <button type="button" className="lnk xs i3" style={{ padding: "10px 0", width: "100%", textAlign: "left" }} onClick={() => setMore((v) => !v)}>{more ? "Show fewer" : `${t.later.length} more`}</button>
          </div>}
        </div> : (
          <div className="row g12" style={{ padding: 22, background: "#fff", borderRadius: 20, boxShadow: "0 0 0 1px var(--line)" }}><AgentFace kind="catalog" size={36} mood="happy" /><span className="col"><span style={{ fontSize: 20, fontWeight: 600 }}>Nothing needs you today</span><span className="sm i3">Kaviar is watching stock, ads and orders.</span></span></div>
        )}

      </div>
    </div>
  );
}
