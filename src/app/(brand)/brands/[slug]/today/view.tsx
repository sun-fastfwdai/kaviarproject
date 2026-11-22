"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { AgentFace } from "@/components/agent";
import type { Action, Today } from "@/lib/growth/today";
import { MODES, type Mode } from "@/lib/growth/pilot";
import { checkNow, setMode } from "../optimize/actions";
import { Bento } from "@/components/bento";
import { ActionCard, GROUP_TONE as TONE } from "./action-card";

/**
 * Today, as a dashboard. Top: the day, a greeting and Autopilot's controls. Then the board — the month in blocks. Then
 * what is ready for action: up to four cards, each one decision with its evidence as a picture and one button. Nothing is only there
 * to be read: every number opens where it comes from.
 */

export function TodayView({ slug, t, day, hello }: { slug: string; t: Today; day: string; hello: string }) {
  const base = `/brands/${slug}`;
  const [more, setMore] = useState(false);
  const [busy, start] = useTransition();
  const router = useRouter();
  const [doing, setDoing] = useState<string | null>(null);
  const [mode, setM] = useState<Mode>(t.pilot.mode);
  const go = (what: string, f: () => Promise<unknown>) => { setDoing(what); start(async () => { await f(); router.refresh(); setDoing(null); }); };
  const total = t.actions.length + t.later.length;
  const Go = (a: Action) => <Link className="btn sm" href={a.href ?? base} style={{ flexShrink: 0 }}>{a.cta}<Icon name="arrow-r" size={11} /></Link>;

  return (
    <div className="scroll" style={{ padding: "22px 24px 48px" }}>
      <div className="col g16">
        {/* ---- the day, a greeting, and the agents at work: Autopilot is switched, run and answered from here */}
        <div className="row between g16" style={{ flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="col g2" style={{ minWidth: 0 }}>
            <span className="xs i3" style={{ letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>{day}</span>
            <span style={{ fontSize: 30, lineHeight: "38px", fontWeight: 600, letterSpacing: "-0.03em" }}>{hello}</span>
            {t.pulse && <span className="sm i2 tnum" title="The last full day, against the same day a week earlier">Yesterday <b className="i1 w5">{t.pulse.sales}</b> from {t.pulse.orders} order{t.pulse.orders === 1 ? "" : "s"}
              {t.pulse.delta && <span style={{ color: t.pulse.delta.good ? "var(--green)" : t.pulse.delta.good === false ? "var(--red)" : "var(--ink-3)", fontWeight: 600 }}> {t.pulse.delta.dir === "up" ? "↗" : t.pulse.delta.dir === "down" ? "↘" : "→"} {t.pulse.delta.text}</span>}{t.pulse.delta && <span className="i3"> on last week</span>}</span>}
            {t.more.note && <span className="row top g8 sm i2" style={{ maxWidth: 720, paddingTop: 4 }}><AgentFace kind="analyst" size={18} /><span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }} title={t.more.note}>{t.more.note}</span></span>}
          </div>
          <div className="row g10 rise" style={{ padding: "7px 8px 7px 12px", borderRadius: 99, background: "#fff", boxShadow: "0 0 0 1px var(--line), 0 1px 2px rgba(18,18,18,.04)", flexWrap: "wrap" }}
            title={`${t.pilot.last ? `Checked ${t.pilot.last}` : "First check within the hour"} · ${t.pilot.watched.campaigns ? `${t.pilot.watched.campaigns} campaign${t.pilot.watched.campaigns === 1 ? "" : "s"}, ${t.pilot.watched.ads} ads` : `orders and stock on ${t.pilot.watched.products} products`}${t.store ? ` · the store’s ${t.store.open ? `${t.store.open} open fixes` : "search listing"}` : ""}`}>
            <span className="row" aria-hidden>{(["analyst", "builder", "qa", "catalog"] as const).map((k, i) => <span key={k} style={{ marginLeft: i ? -7 : 0, borderRadius: 99, boxShadow: "0 0 0 2px #fff", display: "flex" }}><AgentFace kind={k} size={24} mood="happy" /></span>)}</span>
            <span className="col" style={{ lineHeight: 1.2 }}><span className="sm w5">Autopilot</span><span className="xs i3">{t.pilot.last ? `Checked ${t.pilot.last}` : "First check within the hour"}</span></span>
            <div className="seg" role="radiogroup" aria-label="How much Autopilot may decide alone">
              {(Object.keys(MODES) as Mode[]).map((m) => <button key={m} type="button" role="radio" aria-checked={mode === m} disabled={busy} className={`o${mode === m ? " on" : ""}`} onClick={() => { setM(m); go("mode", () => setMode(slug, m)); }}>{MODES[m].name}</button>)}
            </div>
            <button type="button" className="btn sm" style={{ borderRadius: 99 }} disabled={busy} onClick={() => go("check", () => checkNow(slug))}>{doing === "check" ? <Icon name="spinner" size={12} className="spin" /> : <Icon name="refresh" size={12} />}Check now</button>
            {t.pilot.waiting > 0 && <Link href={`${base}/performance#autopilot`} className="btn dark sm" style={{ borderRadius: 99 }}>Decide {t.pilot.waiting}<Icon name="arrow-r" size={11} color="#fff" /></Link>}
          </div>
        </div>

        {/* ---- the board: the month in blocks — sales, the numbers around it, campaigns, customers, stock and the store's score */}
        <Bento tiles={t.status} />

        {/* ---- the month in the store, a block per source: what sells, where it comes from, when, and what competitors run */}
        {(t.more.sellers.length > 0 || t.more.channels.length > 0 || t.more.week.length > 0 || t.more.rivals) && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 10 }}>
          {t.more.sellers.length > 0 && <Link href={`${base}/shopify?tab=products`} className="bt rise" style={{ padding: "13px 15px 12px", gap: 8, ["--i" as string]: 10 }}>
            <span className="row between g8"><span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>Best sellers · 30 days</span><Icon name="bag" size={15} color="#8B8883" /></span>
            {t.more.sellers.map((x) => (
              <span key={x.title} className="row g10" style={{ minWidth: 0 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {x.image ? <img src={x.image} alt="" loading="lazy" style={{ width: 30, height: 30, borderRadius: 7, objectFit: "cover", flexShrink: 0, background: "var(--tray-2)" }} /> : <span style={{ width: 30, height: 30, borderRadius: 7, background: "var(--tray-2)", flexShrink: 0 }} />}
                <span className="col fill" style={{ minWidth: 0, gap: 3 }}><span className="row between g8"><span className="xs w5 ell">{x.title}</span><span className="xs tnum i2" style={{ flexShrink: 0 }}>{x.revenue}</span></span>
                  <span style={{ height: 4, borderRadius: 99, background: "var(--tray-2)", overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: `${Math.max(3, x.share)}%`, borderRadius: 99, background: "#121212" }} /></span></span>
                <span className="xs tnum i3" style={{ width: 44, textAlign: "right", flexShrink: 0 }}>{x.units} sold</span>
              </span>))}
          </Link>}
          {t.more.channels.length > 0 && <Link href={`${base}/shopify`} className="bt tray rise" title="From how each order arrived" style={{ padding: "13px 15px 12px", gap: 10, ["--i" as string]: 11 }}>
            <span className="row between g8"><span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>Where sales come from</span><Icon name="split" size={15} color="#8B8883" /></span>
            <span className="row" style={{ height: 10, borderRadius: 99, overflow: "hidden", gap: 2 }}>{t.more.channels.map((c) => <span key={c.name} style={{ width: `${Math.max(2, c.share)}%`, background: c.color }} />)}</span>
            <span className="col g4">{t.more.channels.slice(0, 4).map((c) => <span key={c.name} className="row g8 xs"><span style={{ width: 8, height: 8, borderRadius: 3, background: c.color, flexShrink: 0 }} /><span className="i2 ell fill">{c.name}</span><span className="tnum w5">{c.share}%</span></span>)}</span>
          </Link>}
          {t.more.week.length > 0 && <Link href={`${base}/shopify`} className="bt rise" title="Orders by day of the week, last 90 days" style={{ padding: "13px 15px 12px", gap: 6, ["--i" as string]: 12 }}>
            <span className="row between g8"><span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>When people buy</span><Icon name="calendar" size={15} color="#8B8883" /></span>
            <span className="bt-n" style={{ fontSize: 20, lineHeight: "26px" }}>{t.more.bestDay ?? "Too few orders to say"}</span>
            {(() => { const max = Math.max(...t.more.week.map((x) => x.orders), 1); return (
              <span className="row" style={{ alignItems: "flex-end", gap: 6, height: 54, marginTop: "auto" }}>{t.more.week.map((x) => (
                <span key={x.day} className="col fill" style={{ alignItems: "center", gap: 4, height: "100%", justifyContent: "flex-end" }} title={`${x.orders} orders`}>
                  <span style={{ width: "100%", height: `${Math.max(4, (x.orders / max) * 100)}%`, borderRadius: 4, background: x.orders === max && t.more.bestDay !== "Evenly through the week" ? "#121212" : "#D9D6D1" }} />
                  <span style={{ fontSize: 10, color: "var(--ink-3)" }}>{x.day}</span>
                </span>))}</span>); })()}
          </Link>}
          {t.more.rivals && <Link href={`${base}/competitors`} className="bt tray rise" title="From Meta’s Ad Library" style={{ padding: "13px 15px 12px", gap: 4, ["--i" as string]: 13 }}>
            <span className="row between g8"><span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>Competitors’ ads now</span><Icon name="globe" size={15} color="#8B8883" /></span>
            <span className="row g6" style={{ alignItems: "baseline" }}><span className="bt-n" style={{ fontSize: 27, lineHeight: "36px" }}>{t.more.rivals.ads.toLocaleString("en-US")}</span><span className="xs i2">from {t.more.rivals.brands} brand{t.more.rivals.brands === 1 ? "" : "s"}</span></span>
            <span className="xs i3 tnum">{t.more.rivals.new30.toLocaleString("en-US")} started in the last 30 days</span>
            {t.more.rivals.top && <span className="xs" style={{ marginTop: "auto", padding: "5px 9px", borderRadius: 9, background: "#fff", alignSelf: "flex-start", maxWidth: "100%" }} title="The message most of their ads lead with">Most say “{t.more.rivals.top}”</span>}
          </Link>}
        </div>}

        {/* ---- ready for action: each decision with its evidence and one button */}
        {total > 0 ? <div className="col g10">
          <span className="xs i3" style={{ letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>Ready for action</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: 12 }}>{t.actions.map((a, i) => <div key={a.key} className="rise" style={{ display: "flex", minWidth: 0, ["--i" as string]: i + 3 }}><ActionCard slug={slug} a={a} n={i + 1} primary={i === 0} /></div>)}</div>
          {t.later.length > 0 && <div className="card" style={{ padding: "0 16px" }}>
            {more && t.later.map((a, i) => (
              <div key={a.key} className="row g12" style={{ padding: "11px 0", borderBottom: "1px solid var(--line)" }}>
                <span className="tnum xs i3 w5" style={{ width: 20, flexShrink: 0 }}>{String(t.actions.length + i + 1).padStart(2, "0")}</span>
                <AgentFace kind={a.who} size={22} mood={a.urgent ? "worried" : "happy"} />
                <div className="col fill" style={{ minWidth: 0 }}>
                  <span className="row g8"><span className="sm w5 i1 ell">{a.title}</span><span style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600, color: TONE[a.group], flexShrink: 0 }}>{a.label ?? a.group}</span></span>
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
