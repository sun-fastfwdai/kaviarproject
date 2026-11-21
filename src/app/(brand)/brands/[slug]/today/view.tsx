"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { AgentFace } from "@/components/agent";
import type { Action, Today } from "@/lib/growth/today";
import { makeAds } from "../plan/actions";

/** Today: a short list. One line what, one line why, what it should bring, one button. No paragraphs. */
const TONE: Record<Action["group"], string> = { Fix: "#B4532A", Protect: "#B4832A", Decide: "#121212", Create: "#1AA7C8", Review: "#1AA7C8", Test: "#EB7A3C", Launch: "#1F7A52", Improve: "#6A8FD6", "Set up": "#8B8883" };

export function TodayView({ slug, t }: { slug: string; t: Today }) {
  const base = `/brands/${slug}`;
  const [making, setMaking] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [, start] = useTransition();
  const usd = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: t.currency, maximumFractionDigits: 0 }).format(Math.round(v));
  const make = (a: Action) => { setMaking(a.key); setErr(null); start(async () => { const r = await makeAds(slug, a.make!); if (r?.error) { setErr(r.error); setMaking(null); } }); };
  const Card = (a: Action, first: boolean) => (
    <div key={a.key} className="row g14 hv-card" style={{ padding: "14px 16px", background: "#fff", borderRadius: 14, boxShadow: first ? "0 0 0 1.5px var(--ink), 0 8px 24px rgba(18,18,18,.07)" : "0 0 0 1px var(--line)" }}>
      <AgentFace kind={a.who} size={30} mood={a.urgent ? "worried" : "happy"} />
      <div className="col g2 fill" style={{ minWidth: 0 }}>
        <span className="row g8"><span style={{ fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600, color: TONE[a.group] }}>{a.group}</span>{a.effect && <span className="xs i3">· {a.effect}</span>}</span>
        <span className="sm w5 i1" style={{ fontSize: 15 }}>{a.title}</span>
        <span className="xs i2 ell" title={a.why}>{a.why}</span>
      </div>
      {a.make
        ? <button type="button" className={`btn${first ? " dark" : ""}`} disabled={making != null} onClick={() => make(a)} style={{ flexShrink: 0 }}>{making === a.key ? <><Icon name="spinner" size={13} className="spin" color={first ? "#fff" : undefined} />Remy is writing…</> : a.cta}</button>
        : <Link className={`btn${first ? " dark" : ""}`} href={a.href ?? base} style={{ flexShrink: 0 }}>{a.cta}<Icon name="arrow-r" size={12} color={first ? "#fff" : undefined} /></Link>}
    </div>
  );
  const n = t.actions.length + t.later.length;
  return (
    <div className="scroll" style={{ padding: "22px 24px 40px" }}>
      <div className="col g16" style={{ maxWidth: 860 }}>
        <div className="row between top">
          <div className="col g4"><h1 className="h1">Today</h1><span className="sm i3">{n ? `${n} thing${n === 1 ? "" : "s"} for you. The rest is running.` : "Nothing needs you. Kaviar is watching stock, ads and orders."}</span></div>
          {t.plan && <Link href={`${base}/plan`} className="col hv-card" style={{ padding: "10px 14px", borderRadius: 12, background: "#fff", boxShadow: "0 0 0 1px var(--line)", alignItems: "flex-end" }}>
            <span className="xs i3">{t.plan.approved ? "Plan" : "Draft plan"} · {usd(t.plan.budget)} · {t.plan.weeks} weeks</span>
            <span className="row g6"><span className="tnum" style={{ fontSize: 19, fontWeight: 600 }}>{usd(t.plan.mid)}</span><span className="xs i3">likely back ({usd(t.plan.lo)}–{usd(t.plan.hi)})</span></span>
          </Link>}
        </div>
        {err && <span className="xs c-amber">{err}</span>}
        <div className="col g10">{t.actions.map((a, i) => Card(a, i === 0))}</div>
        {t.later.length > 0 && <details>
          <summary className="xs i3" style={{ cursor: "pointer", padding: "4px 0" }}>Later · {t.later.length} more</summary>
          <div className="col g10" style={{ paddingTop: 8 }}>{t.later.map((a) => Card(a, false))}</div>
        </details>}
      </div>
    </div>
  );
}
