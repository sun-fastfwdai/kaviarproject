"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { AgentFace } from "@/components/agent";
import type { Action, Viz } from "@/lib/growth/today";
import { makeAds } from "../plan/actions";
import { fix } from "../seo/actions";

/**
 * The action card Today and Campaigns share: one decision, the evidence for it as a picture (the ads, stock against restock time, you
 * against competitors), and one button that does it here where it can.
 */
export const GROUP_TONE: Record<Action["group"], string> = { Fix: "#B4532A", Protect: "#B4832A", Plan: "#121212", Decide: "#121212", Create: "#1AA7C8", Review: "#1AA7C8", Test: "#EB7A3C", Launch: "#1F7A52", Improve: "#6A8FD6", Store: "#5B6FD6", "Set up": "#8B8883" };
const WHO = { analyst: "Iris", builder: "Remy", qa: "Otto", catalog: "Cleo" } as const;

export function VizView({ v }: { v: Viz }) {
  if (v.kind === "bars") { const max = Math.max(...v.rows.map((r) => r.value), 1); return (
    <div className="col g10" style={{ width: "100%" }}>{v.rows.map((r) => (
      <div key={r.label} className="row g12"><span className="xs i2" style={{ width: 104, flexShrink: 0 }}>{r.label}</span>
        <span className="fill" style={{ height: 10, borderRadius: 99, background: "var(--tray-2)", overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: `${Math.max(r.value > 0 ? 3 : 0, (r.value / max) * 100)}%`, borderRadius: 99, background: r.tone === "warn" ? "#E08A5C" : "#9DB8A6" }} /></span>
        <span className="xs tnum w5" style={{ width: 58, textAlign: "right", flexShrink: 0 }}>{r.text}</span></div>))}
    </div>); }
  if (v.kind === "flow") return (
    <div className="row g14" style={{ alignItems: "center", width: "100%" }}>
      <span className="col" style={{ minWidth: 0 }}><span className="tnum ell" style={{ fontSize: 24, lineHeight: "30px", fontWeight: 600, letterSpacing: "-0.02em", color: "var(--ink-2)" }}>{v.from}</span><span className="xs i3">{v.fromLabel}</span></span>
      <span aria-hidden style={{ fontSize: 22, color: "#B5B2AC" }}>→</span>
      <span className="col" style={{ minWidth: 0 }}><span className="tnum ell" style={{ fontSize: 30, lineHeight: "34px", fontWeight: 700, letterSpacing: "-0.03em" }}>{v.to}</span><span className="xs i3">{v.toLabel}</span></span>
    </div>);
  if (v.kind === "pair") return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, width: "100%" }}>
      {[v.a, v.b].map((x, i) => (
        <div key={x.label} className="col g2" style={{ padding: "10px 12px", borderRadius: 12, background: i ? "var(--tray)" : "#FBEDE6", minWidth: 0 }}>
          <span className="xs i3 ell">{x.label}</span><span className="tnum ell" style={{ fontSize: 22, lineHeight: "28px", fontWeight: 600, letterSpacing: "-0.02em", color: i ? "var(--ink)" : "#B4532A" }}>{x.value}</span>
        </div>))}
    </div>);
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(1, v.items.length)}, 1fr)`, gap: 8, width: "100%" }}>
      {v.items.map((x) => (
        <div key={x.label} className="col g2" style={{ padding: "10px 12px", borderRadius: 12, background: "var(--tray)", minWidth: 0 }}>
          <span className="tnum" style={{ fontSize: 22, lineHeight: "28px", fontWeight: 600, letterSpacing: "-0.02em" }}>{x.n}</span><span className="xs i3 ell">{x.label}</span>
        </div>))}
    </div>);
}

export function ActionCard({ slug, a, n, primary = false }: { slug: string; a: Action; n: number; primary?: boolean }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const make = () => { setMsg(null); start(async () => { const r = await makeAds(slug, a.make!); if (r?.error) setMsg({ text: r.error, bad: true }); }); };
  // Done here, without leaving the page: save every written fix to the store.
  const fixStore = () => { setMsg(null); start(async () => { const r = await fix(slug, "all"); setMsg(r.fields && !r.failed ? { text: `Saved ${r.fields} fix${r.fields === 1 ? "" : "es"} to your store` } : { text: r.error ?? (r.failed ? `${r.failed} didn’t save` : "Nothing was saved"), bad: true }); router.refresh(); }); };
  const cls = `btn${primary ? " dark" : ""}`, ink = primary ? "#fff" : undefined;
  const button = a.run === "store-fix" ? <button type="button" className={cls} disabled={busy} onClick={fixStore}>{busy ? <><Icon name="spinner" size={13} className="spin" color={ink} />Saving…</> : <><Icon name="check" size={12} color={ink} />{a.cta}</>}</button>
    : a.make ? <button type="button" className={cls} disabled={busy} onClick={make}>{busy ? <><Icon name="spinner" size={13} className="spin" color={ink} />Remy is writing…</> : a.cta}</button>
    : <Link className={cls} href={a.href ?? `/brands/${slug}`}>{a.cta}<Icon name="arrow-r" size={12} color={ink} /></Link>;
  return (
    <div className="col fill" style={{ padding: "16px 18px 14px", gap: 10, borderRadius: 18, background: "#fff", boxShadow: primary ? "0 0 0 1.5px var(--ink), 0 12px 32px rgba(18,18,18,.07)" : "0 0 0 1px var(--line)", minWidth: 0 }}>
      <div className="row between g10">
        <span className="row g8" style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600 }}><span className="tnum i3">{String(n).padStart(2, "0")}</span><span style={{ color: GROUP_TONE[a.group] }}>{a.label ?? a.group}</span></span>
        {(a.effect || a.urgent) && <span className="ell" style={{ height: 22, padding: "0 9px", borderRadius: 99, fontSize: 11, fontWeight: 600, lineHeight: "22px", maxWidth: "60%", background: a.urgent ? "#FBEDE6" : "#E4F4EB", color: a.urgent ? "#B4532A" : "#1F7A52" }}>{a.effect ?? "Urgent"}</span>}
      </div>
      <div className="col g2"><span style={{ fontSize: 19, lineHeight: "25px", fontWeight: 600, letterSpacing: "-0.015em" }}>{a.title}</span><span className="xs i3" title={a.why} style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{a.why}</span></div>
      {a.thumbs && a.thumbs.length > 0 ? <div className="row g8" style={{ overflow: "hidden" }}>
        {a.thumbs.slice(0, 5).map((u) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={u} src={u} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} style={{ width: 68, height: 86, borderRadius: 10, objectFit: "cover", flexShrink: 0, background: "var(--tray-2)", boxShadow: "0 0 0 1px var(--line)" }} />))}
      </div> : a.viz ? <div className="row" style={{ minHeight: 86, alignItems: "center" }}><VizView v={a.viz} /></div> : null}
      {a.thumbs && a.thumbs.length > 0 && a.viz?.kind === "flow" && <span className="xs i3 tnum">{a.viz.from} {a.viz.fromLabel} → <b className="i1 w5">{a.viz.to}</b> {a.viz.toLabel}</span>}
      {msg && <span className="xs" style={{ color: msg.bad ? "#B4532A" : "#1F7A52" }}>{msg.text}</span>}
      <div className="row between g12" style={{ marginTop: "auto", paddingTop: 10, borderTop: "1px solid var(--line)" }}>
        <span className="row g8 xs i3"><AgentFace kind={a.who} size={22} mood={a.urgent ? "worried" : "happy"} />{WHO[a.who]}</span>
        {button}
      </div>
    </div>
  );
}
