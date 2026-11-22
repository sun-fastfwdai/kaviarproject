"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { AgentFace } from "@/components/agent";
import type { Action, Today } from "@/lib/growth/today";
import { MODES, type Mode } from "@/lib/growth/pilot";
import { approvePlan, makeAds } from "../plan/actions";
import { checkNow, setMode } from "../optimize/actions";
import { fix } from "../seo/actions";

/**
 * Today. Top: the plan in one sentence — money in, money back — and the six steps with "you are here". Then the one thing to do now,
 * shown with the ads it is about, and the short list after it. No paragraphs — and nothing that is only there to be read: every number
 * opens the place it is set, every step is a button for what that step needs now, and Autopilot is switched right here.
 */
const TONE: Record<Action["group"], string> = { Fix: "#B4532A", Protect: "#B4832A", Decide: "#121212", Create: "#1AA7C8", Review: "#1AA7C8", Test: "#EB7A3C", Launch: "#1F7A52", Improve: "#6A8FD6", Store: "#5B6FD6", "Set up": "#8B8883" };
const LEVEL = ["Scenario · not a forecast", "Early estimate", "From your results"];
const TAG = { good: ["#E4F4EB", "#1F7A52"], bad: ["#FBEDE6", "#B4532A"], flat: ["var(--tray-2)", "var(--ink-2)"] } as const;

/** Thirty days as a line — the shape, not the numbers. */
function Spark({ data, color = "#1F8A5B" }: { data: number[]; color?: string }) {
  const max = Math.max(...data, 0), w = 120, h = 30;
  if (data.length < 2 || max <= 0) return null;
  const pts = data.map((v, i) => `${((i / (data.length - 1)) * w).toFixed(1)},${(h - 2 - (v / max) * (h - 4)).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: "100%", height: h, display: "block" }} aria-hidden>
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill={color} opacity={0.1} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function TodayView({ slug, t }: { slug: string; t: Today }) {
  const base = `/brands/${slug}`;
  const [making, setMaking] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [busy, start] = useTransition();
  const router = useRouter();
  const [doing, setDoing] = useState<string | null>(null);
  const [mode, setM] = useState<Mode>(t.pilot.mode);
  const go = (what: string, f: () => Promise<unknown>) => { setDoing(what); setErr(null); start(async () => { await f(); router.refresh(); setDoing(null); }); };
  const usd = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: t.currency, maximumFractionDigits: 0 }).format(Math.round(v));
  const make = (a: Action) => { setMaking(a.key); setErr(null); start(async () => { const r = await makeAds(slug, a.make!); if (r?.error) { setErr(r.error); setMaking(null); } }); };
  const [first, ...rest] = t.actions, pl = t.plan, nowAt = t.flow.findIndex((x) => x.key === t.now);
  // Done here, without leaving Today: save every written fix to the store.
  const fixStore = () => { setDoing("store-fix"); setErr(null); setDone(null); start(async () => { const r = await fix(slug, "all"); if (r.fields) setDone(`Saved ${r.fields} fix${r.fields === 1 ? "" : "es"} to your store`); if (!r.fields || r.failed) setErr(r.error ?? (r.failed ? `${r.failed} didn’t save` : "Nothing was saved")); router.refresh(); setDoing(null); }); };
  const Button = (a: Action, big: boolean) => a.run === "store-fix"
    ? <button type="button" className={`btn${big ? " dark" : ""}`} disabled={busy} onClick={fixStore} style={{ flexShrink: 0, ...(big ? { height: 44, padding: "0 20px", fontSize: 14.5 } : {}) }}>{doing === "store-fix" ? <><Icon name="spinner" size={13} className="spin" color={big ? "#fff" : undefined} />Saving to your store…</> : <><Icon name="check" size={12} color={big ? "#fff" : undefined} />{a.cta}</>}</button>
    : a.make
    ? <button type="button" className={`btn${big ? " dark" : ""}`} disabled={making != null} onClick={() => make(a)} style={{ flexShrink: 0, ...(big ? { height: 44, padding: "0 20px", fontSize: 14.5 } : {}) }}>{making === a.key ? <><Icon name="spinner" size={13} className="spin" color={big ? "#fff" : undefined} />Remy is writing…</> : a.cta}</button>
    : <Link className={`btn${big ? " dark" : ""}`} href={a.href ?? base} style={{ flexShrink: 0, ...(big ? { height: 44, padding: "0 20px", fontSize: 14.5 } : {}) }}>{a.cta}<Icon name="arrow-r" size={12} color={big ? "#fff" : undefined} /></Link>;

  return (
    <div className="scroll" style={{ padding: "22px 24px 48px" }}>
      <div className="col g16">
        {/* ---- how the store is doing: each number opens where it comes from */}
        {t.status.length > 0 && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
          {t.status.map((k) => (
            <Link key={k.label} href={k.href} title={k.hint} className="col hv" style={{ padding: "12px 14px 10px", borderRadius: 14, background: "#fff", boxShadow: "0 0 0 1px var(--line)", minWidth: 0, gap: 4 }}>
              <span className="xs i3 ell">{k.label}</span>
              <span className="row g8" style={{ alignItems: "baseline" }}><span className="tnum" style={{ fontSize: 22, lineHeight: "28px", fontWeight: 600, letterSpacing: "-0.02em" }}>{k.value}</span>
                {k.change != null && <span className="xs tnum w5" style={{ color: k.change >= 0 ? "#1F7A52" : "#B4532A" }}>{k.change >= 0 ? "↑" : "↓"} {Math.abs(k.change)}%</span>}</span>
              {k.tag ? <span style={{ alignSelf: "flex-start", height: 20, padding: "0 8px", borderRadius: 99, fontSize: 11, fontWeight: 500, lineHeight: "20px", marginTop: 5, marginBottom: 5, background: TAG[k.tag.tone][0], color: TAG[k.tag.tone][1] }}>{k.tag.text}</span>
                : k.spark ? <Spark data={k.spark} color={k.change != null && k.change < 0 ? "#C9705A" : "#1F8A5B"} /> : <span style={{ height: 30 }} />}
            </Link>))}
        </div>}
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

        {/* ---- working in the background: switch it, run it, decide — all from here */}
        <div className="row g12" style={{ padding: "10px 12px 10px 16px", borderRadius: 14, background: "#fff", boxShadow: "0 0 0 1px var(--line)", flexWrap: "wrap" }}>
          <span style={{ width: 8, height: 8, borderRadius: 99, background: "#34C77B", boxShadow: "0 0 0 4px rgba(52,199,123,.2)", animation: "pulse 2.2s ease-in-out infinite", flexShrink: 0 }} />
          <span className="sm w5 i1" style={{ flexShrink: 0 }}>Autopilot</span>
          <div className="seg" role="radiogroup" aria-label="How much Autopilot may decide alone" style={{ flexShrink: 0 }}>
            {(Object.keys(MODES) as Mode[]).map((m) => <button key={m} type="button" role="radio" aria-checked={mode === m} disabled={busy} className={`o${mode === m ? " on" : ""}`} onClick={() => { setM(m); go("mode", () => setMode(slug, m)); }}>{MODES[m].name}</button>)}
          </div>
          <span className="xs i3 ell fill" style={{ minWidth: 160 }}>{t.pilot.last ? `Checked ${t.pilot.last}` : "First check within the hour"} · {t.pilot.watched.campaigns ? `${t.pilot.watched.campaigns} campaign${t.pilot.watched.campaigns === 1 ? "" : "s"}, ${t.pilot.watched.ads} ads` : `orders and stock on ${t.pilot.watched.products} products`}{t.store ? ` · the store’s ${t.store.open ? `${t.store.open} open fixes` : "search listing"}` : ""}</span>
          <button type="button" className="btn sm" disabled={busy} onClick={() => go("check", () => checkNow(slug))}>{doing === "check" ? <Icon name="spinner" size={12} className="spin" /> : <Icon name="refresh" size={12} />}Check now</button>
          {t.pilot.waiting
            ? <Link href={`${base}/performance#autopilot`} className="btn dark sm">Decide {t.pilot.waiting} change{t.pilot.waiting === 1 ? "" : "s"}<Icon name="arrow-r" size={11} color="#fff" /></Link>
            : <Link href={`${base}/performance#autopilot`} className="btn quiet sm">Nothing to decide<Icon name="arrow-r" size={11} /></Link>}
        </div>

        {done && <div className="row g8 sm" style={{ padding: "10px 14px", borderRadius: 12, background: "#E9F6EF", color: "#1F7A52" }}><Icon name="check-circle" size={15} />{done}</div>}
        {err && <span className="xs c-amber">{err}</span>}

        {/* ---- the one thing to do now */}
        {first ? (
          <div className="col g14" style={{ padding: 22, background: "#fff", borderRadius: 20, boxShadow: "0 0 0 1.5px var(--ink), 0 14px 40px rgba(18,18,18,.08)" }}>
            <div className="row top between g16">
              <div className="row top g14" style={{ minWidth: 0 }}>
                <AgentFace kind={first.who} size={40} mood={first.urgent ? "worried" : "happy"} />
                <div className="col g4" style={{ minWidth: 0 }}>
                  <span className="row g8"><span style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, color: TONE[first.group] }}>Do this now · {first.group}</span>{first.effect && <span className="pill green" style={{ height: 20, fontSize: 11 }}>{first.effect}</span>}</span>
                  <span style={{ fontSize: 24, lineHeight: "30px", fontWeight: 600, letterSpacing: "-0.02em" }}>{first.title}</span>
                  <span className="sm i2">{first.why}</span>
                </div>
              </div>
              {Button(first, true)}
            </div>
            {first.thumbs && first.thumbs.length > 0 && <div className="row g10">
              {first.thumbs.map((u) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={u} src={u} alt="" loading="lazy" style={{ width: 112, height: 140, borderRadius: 12, objectFit: "cover", background: "var(--tray-2)", boxShadow: "0 0 0 1px var(--line)" }} />))}
            </div>}
          </div>
        ) : (
          <div className="row g12" style={{ padding: 22, background: "#fff", borderRadius: 20, boxShadow: "0 0 0 1px var(--line)" }}><AgentFace kind="catalog" size={36} mood="happy" /><span className="col"><span style={{ fontSize: 20, fontWeight: 600 }}>Nothing needs you today</span><span className="sm i3">Kaviar is watching stock, ads and orders.</span></span></div>
        )}

        {/* ---- after that */}
        {rest.length > 0 && <div className="col g8">
          <span className="xs i3" style={{ letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>After that</span>
          <div className="card" style={{ padding: "2px 16px" }}>
            {(more ? [...rest, ...t.later] : rest).map((a, i) => (
              <div key={a.key} className="row g12" style={{ padding: "12px 0", borderTop: i ? "1px solid var(--line)" : 0 }}>
                <span className="tnum" style={{ width: 22, height: 22, borderRadius: 99, background: "var(--tray-2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11.5, fontWeight: 600, flexShrink: 0 }}>{i + 2}</span>
                {a.thumbs?.[0]
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={a.thumbs[0]} alt="" loading="lazy" style={{ width: 30, height: 38, borderRadius: 6, objectFit: "cover", flexShrink: 0, boxShadow: "0 0 0 1px var(--line)" }} />
                  : <AgentFace kind={a.who} size={24} mood={a.urgent ? "worried" : "happy"} />}
                <div className="col fill" style={{ minWidth: 0 }}>
                  <span className="row g8"><span className="sm w5 i1 ell">{a.title}</span><span style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600, color: TONE[a.group], flexShrink: 0 }}>{a.group}</span></span>
                  <span className="xs i3 ell" title={a.why}>{a.effect ? `${a.effect} · ` : ""}{a.why}</span>
                </div>
                {Button(a, false)}
              </div>))}
            {t.later.length > 0 && <button type="button" className="lnk xs i3" style={{ padding: "10px 0", borderTop: "1px solid var(--line)", width: "100%", textAlign: "left" }} onClick={() => setMore((v) => !v)}>{more ? "Show fewer" : `${t.later.length} more`}</button>}
          </div>
        </div>}
      </div>
    </div>
  );
}
