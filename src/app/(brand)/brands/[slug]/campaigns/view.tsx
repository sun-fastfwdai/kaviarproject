"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { AgentFace } from "@/components/agent";
import { Modal } from "@/components/modal";
import { StatTile } from "@/components/bento";
import type { Delta, Tile } from "@/lib/growth/trend";
import { LIB_STATUS, type LibRow } from "@/lib/growth/library";
import { REASON_NAME, STAGE_NAME, type PlanCard, type Reason } from "@/lib/growth/plans-rules";
import { setSalesTarget } from "./actions";

/**
 * Campaigns. Kaviar proposes a campaign only when there is a reason to — and says which: a holiday coming, stock sitting, buyers going
 * quiet, sales short of the target set here. Each plan is a card that opens its own page; what already runs on Meta is listed below.
 */
type Props = { slug: string; currency: string; plans: PlanCard[]; meta: LibRow[]; tiles: Tile[]; loose: number; hasMeta: boolean; sales: { value: string; delta: Delta | null; target: number | null; share: number | null } };
const TONE: Record<Reason, [string, string]> = { holiday: ["#121212", "#fff"], overstock: ["var(--amber-bg)", "var(--amber)"], lapsed: ["var(--blue-bg)", "var(--blue)"], sales: ["var(--red-bg)", "var(--red)"] };
const COLS = "minmax(240px, 2.4fr) 110px repeat(3, minmax(84px, 1fr)) 132px";

export function CampaignsView({ slug, currency, plans, meta, tiles, loose, hasMeta, sales }: Props) {
  const base = `/brands/${slug}`, router = useRouter();
  const [busy, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [target, setTarget] = useState(sales.target ? String(sales.target) : "");
  const usd = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(Math.round(v));
  const save = (v: number | null) => start(async () => { await setSalesTarget(slug, v); setEditing(false); router.refresh(); });
  const under = plans.filter((p) => p.stage !== "suggested"), fresh = plans.filter((p) => p.stage === "suggested");

  const Card = (p: PlanCard, i: number, first: boolean) => { const m = p.out[1]; return (
    <Link key={p.key} href={`${base}/campaigns/${encodeURIComponent(p.key)}`} className="col hv rise" style={{ padding: "16px 18px 14px", gap: 10, borderRadius: 18, background: "#fff", boxShadow: first ? "0 0 0 1.5px var(--ink), 0 12px 32px rgba(18,18,18,.07)" : "0 0 0 1px var(--line)", minWidth: 0, ["--i" as string]: i }}>
      <div className="row between g8">
        <span style={{ height: 22, padding: "0 9px", borderRadius: 99, fontSize: 11, fontWeight: 600, lineHeight: "22px", background: TONE[p.reason][0], color: TONE[p.reason][1] }}>{REASON_NAME[p.reason]}{p.when ? ` · ${p.when}` : ""}</span>
        <span className="xs" style={{ color: p.stage === "suggested" ? "var(--ink-3)" : "var(--green)", fontWeight: p.stage === "suggested" ? 400 : 600 }}>{STAGE_NAME[p.stage]}</span>
      </div>
      <div className="col g2"><span style={{ fontSize: 18, lineHeight: "24px", fontWeight: 600, letterSpacing: "-0.015em" }}>{p.title}</span><span className="xs i3 ell" title={p.why}>{p.why}</span></div>
      <div className="row g12" style={{ alignItems: "center" }}>
        {p.ads?.thumbs.length ? <span className="row" style={{ flexShrink: 0 }}>{p.ads.thumbs.slice(0, 3).map((u, k) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={u} src={u} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} style={{ width: 40, height: 50, borderRadius: 8, objectFit: "cover", marginLeft: k ? -10 : 0, background: "var(--tray-2)", boxShadow: "0 0 0 2px #fff" }} />))}</span>
          // eslint-disable-next-line @next/next/no-img-element
          : p.image ? <img src={p.image} alt="" loading="lazy" style={{ width: 40, height: 50, borderRadius: 8, objectFit: "cover", flexShrink: 0, background: "var(--tray-2)", boxShadow: "0 0 0 1px var(--line)" }} /> : null}
        <span className="row g10" style={{ alignItems: "baseline", minWidth: 0 }}>
          <span className="col"><span className="tnum" style={{ fontSize: 20, lineHeight: "26px", fontWeight: 600, color: "var(--ink-2)" }}>{usd(p.budget)}</span><span className="xs i3">you spend</span></span>
          <span aria-hidden style={{ fontSize: 18, color: "#B5B2AC" }}>→</span>
          <span className="col"><span className="tnum" style={{ fontSize: 26, lineHeight: "30px", fontWeight: 600, letterSpacing: "-0.03em" }}>{usd(m.revenue)}</span><span className="xs i3">likely back · {p.days} days</span></span>
        </span>
      </div>
      <div className="row between g12" style={{ marginTop: "auto", paddingTop: 10, borderTop: "1px solid var(--line)" }}>
        <span className="row g8 xs i3"><AgentFace kind={p.reason === "overstock" ? "qa" : "analyst"} size={22} mood="happy" /><span className="tnum" style={{ color: m.profit >= 0 ? "var(--green)" : "var(--red)", fontWeight: 600 }}>{m.profit >= 0 ? "+" : "−"}{usd(Math.abs(m.profit))} profit</span></span>
        <span className={`btn sm${first ? " dark" : ""}`}>{p.stage === "suggested" ? "Review plan" : "Open plan"}<Icon name="arrow-r" size={11} color={first ? "#fff" : undefined} /></span>
      </div>
    </Link>); };

  return (
    <div className="scroll" style={{ padding: "22px 24px 48px" }}>
      <div className="col g16">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
          {/* the bar the plans answer to: sales against the target the brand sets */}
          <button type="button" onClick={() => setEditing(true)} className="bt rise" title="Falling short of your target is a reason to advertise" style={{ padding: "13px 15px 12px", gap: 2, textAlign: "left" }}>
            <span className="row between g8"><span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>Sales · 30 days</span><Icon name="pencil" size={13} color="#8B8883" /></span>
            <span className="row g6" style={{ alignItems: "baseline" }}><span className="bt-n" style={{ fontSize: 27, lineHeight: "36px" }}>{sales.value}</span>{sales.delta && <span className="xs tnum w5" style={{ color: sales.delta.good ? "var(--green)" : sales.delta.good === false ? "var(--red)" : "var(--ink-3)" }}>{sales.delta.dir === "up" ? "↗" : sales.delta.dir === "down" ? "↘" : "→"} {sales.delta.text}</span>}</span>
            {sales.target ? <><span className="xs i3 tnum">{sales.share}% of your {usd(sales.target)} target</span><span style={{ height: 6, borderRadius: 99, background: "var(--tray-2)", overflow: "hidden", marginTop: 8 }}><span style={{ display: "block", height: "100%", width: `${Math.max(2, Math.min(100, sales.share ?? 0))}%`, borderRadius: 99, background: (sales.share ?? 0) >= 100 ? "#34C77B" : "#E9B949" }} /></span></>
              : <span className="xs" style={{ color: "var(--blue)" }}>Set a monthly target</span>}
          </button>
          {tiles.map((k, i) => <StatTile key={k.label} k={k} tray={i % 2 === 0} i={i + 1} />)}
        </div>

        {plans.length === 0 ? (
          <div className="row g12" style={{ padding: 22, background: "#fff", borderRadius: 18, boxShadow: "0 0 0 1px var(--line)" }}><AgentFace kind="analyst" size={36} mood="happy" />
            <span className="col fill"><span style={{ fontSize: 20, fontWeight: 600 }}>No reason to advertise today</span><span className="sm i3">No holiday in the next five weeks, stock is moving, buyers are coming back and sales are holding.</span></span></div>
        ) : <>
          {under.length > 0 && <div className="col g10">
            <span className="xs i3" style={{ letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>Under way · {under.length}</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 380px), 1fr))", gap: 12 }}>{under.map((p, i) => Card(p, i, i === 0))}</div>
          </div>}
          {fresh.length > 0 && <div className="col g10">
            <span className="xs i3" style={{ letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>Suggested · {fresh.length}</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 380px), 1fr))", gap: 12 }}>{fresh.map((p, i) => Card(p, i + under.length, !under.length && i === 0))}</div>
          </div>}
        </>}

        {(meta.length > 0 || hasMeta) && <div className="card" style={{ padding: "14px 16px 6px" }}>
          <div className="row between g12" style={{ paddingBottom: 8 }}><span className="h3">On Meta</span><Link className="btn sm quiet" href={`${base}/performance`}>All results<Icon name="arrow-r" size={11} /></Link></div>
          {meta.length === 0 ? <span className="sm i3" style={{ padding: "6px 0 14px" }}>Nothing is running.</span> : <div style={{ overflowX: "auto" }}><div style={{ minWidth: 780 }}>
            <div style={{ display: "grid", gridTemplateColumns: COLS, gap: 8, padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
              <span className="xs i3">Campaign</span><span className="xs i3">Status</span><span className="xs i3" style={{ textAlign: "right" }}>Budget</span><span className="xs i3" style={{ textAlign: "right" }}>Spent · 30 days</span><span className="xs i3" style={{ textAlign: "right" }} title="Shopify sales from this campaign ÷ what it spent">Back per $1</span><span />
            </div>
            {meta.map((r) => (
              <div key={r.key} style={{ display: "grid", gridTemplateColumns: COLS, gap: 8, alignItems: "center", padding: "9px 0", borderBottom: "1px solid var(--line)" }}>
                <span className="col" style={{ minWidth: 0 }}><span className="sm w5 ell" title={r.name}>{r.name}</span><span className="xs i3 ell">{r.sub}</span></span>
                <span><span className={`pill ${r.status === "live" ? "green" : ""}`} style={{ height: 22, fontSize: 11 }}>{LIB_STATUS[r.status]}</span></span>
                <span className="sm tnum" style={{ textAlign: "right" }}>{r.perDay ? `${usd(r.perDay)}/day` : "–"}</span>
                <span className="sm tnum i2" style={{ textAlign: "right" }}>{r.spend ? usd(r.spend) : "–"}</span>
                <span className="sm tnum w5" style={{ textAlign: "right", color: r.back == null ? "var(--ink-3)" : r.back >= 1 ? "#1F7A52" : "#B4532A" }}>{r.back == null ? "–" : `${r.back.toFixed(2)}×`}</span>
                <span style={{ display: "flex", justifyContent: "flex-end" }}><Link className="btn sm" href={r.next.href ?? base}>{r.next.label}<Icon name="arrow-r" size={11} /></Link></span>
              </div>))}
          </div></div>}
        </div>}

        {loose > 0 && <Link href={`${base}/creative?tab=ads`} className="row g10 hv" style={{ padding: "12px 16px", borderRadius: 14, background: "var(--tray)" }}>
          <Icon name="folder" size={15} color="#8B8883" /><span className="sm i2 fill">{loose} earlier batch{loose === 1 ? "" : "es"} of ads belong{loose === 1 ? "s" : ""} to no plan</span><span className="xs i3 row g4">Creative studio<Icon name="arrow-r" size={11} /></span>
        </Link>}
      </div>
      {editing && <Modal icon={<Icon name="target" size={16} />} title="Monthly sales target" sub="Falling short of it is a reason for Kaviar to suggest a campaign." onClose={() => setEditing(false)} width={420}
        footer={<>{sales.target != null && <button type="button" className="btn quiet" style={{ marginRight: "auto" }} disabled={busy} onClick={() => save(null)}>Remove target</button>}<button type="button" className="btn quiet" onClick={() => setEditing(false)}>Cancel</button><button type="button" className="btn dark" disabled={busy || !(Number(target) > 0)} onClick={() => save(Number(target))}>{busy ? <Icon name="spinner" size={13} className="spin" color="#fff" /> : null}Save</button></>}>
        <label className="col g4"><span className="xs i2 w5">Sales you want in 30 days</span>
          <input className="input" inputMode="numeric" placeholder="5000" value={target} onChange={(e) => setTarget(e.target.value.replace(/[^0-9]/g, "").slice(0, 9))} onKeyDown={(e) => { if (e.key === "Enter" && Number(target) > 0) save(Number(target)); }} autoFocus style={{ fontSize: 18, height: 42 }} />
          <span className="xs i3">The last 30 days brought {sales.value}.</span></label>
      </Modal>}
    </div>
  );
}
