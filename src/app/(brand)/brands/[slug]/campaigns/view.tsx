"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { AgentFace } from "@/components/agent";
import { Modal } from "@/components/modal";
import { Combo } from "@/components/combo";
import { StatTile } from "@/components/bento";
import type { Delta, Tile } from "@/lib/growth/trend";
import { LIB_STATUS, type LibRow } from "@/lib/growth/library";
import { REASON_NAME, STAGE_NAME, type PlanCard, type Reason } from "@/lib/growth/plans-rules";
import { MODES, type Mode } from "@/lib/growth/pilot";
import type { Plans } from "@/lib/growth/plans";
import { checkNow, setMode } from "../optimize/actions";
import { createOwnPlan, setSalesTarget } from "./actions";

/**
 * Campaigns. Kaviar proposes a campaign only when there is a reason to — and says which: a holiday coming, stock sitting, buyers going
 * quiet, sales short of the target set here. Each plan is a card that opens its own page; what already runs on Meta is listed below.
 */
type Props = { slug: string; currency: string; plans: PlanCard[]; meta: LibRow[]; tiles: Tile[]; loose: number; hasMeta: boolean; sales: { value: string; delta: Delta | null; target: number | null; share: number | null };
  options: Plans["options"]; minBudget: number; pilot: { mode: Mode; last: string | null } };
const TONE: Record<Reason, [string, string]> = { holiday: ["#121212", "#fff"], overstock: ["var(--amber-bg)", "var(--amber)"], lapsed: ["var(--blue-bg)", "var(--blue)"], sales: ["var(--red-bg)", "var(--red)"], own: ["var(--tray-2)", "var(--ink)"] };
const COLS = "minmax(240px, 2.4fr) 110px repeat(3, minmax(84px, 1fr)) 132px";

export function CampaignsView({ slug, currency, plans, meta, tiles, loose, hasMeta, sales, options, minBudget, pilot, startNew = false }: Props & { startNew?: boolean }) {
  const base = `/brands/${slug}`, router = useRouter();
  const [busy, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [target, setTarget] = useState(sales.target ? String(sales.target) : "");
  const usd = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(Math.round(v));
  const save = (v: number | null) => start(async () => { await setSalesTarget(slug, v); setEditing(false); router.refresh(); });
  const live = plans.filter((p) => p.stage === "live"), under = plans.filter((p) => p.stage !== "suggested" && p.stage !== "live"), fresh = plans.filter((p) => p.stage === "suggested");
  // A campaign of the brand's own: what to sell, to whom, for how much.
  const [creating, setCreating] = useState(startNew);
  const [mode, setM] = useState<Mode>(pilot.mode);
  const [form, setForm] = useState({ name: "", product: options.products[0]?.title ?? "", audience: options.audiences[0]?.key ?? "new", budget: String(minBudget), days: 14 });
  const [err, setErr] = useState<string | null>(null);
  const create = () => { setErr(null); start(async () => { const r = await createOwnPlan(slug, { ...form, budget: Number(form.budget) }); if (r.error || !r.key) setErr(r.error ?? "Couldn’t start it"); else router.push(`${base}/campaigns/${encodeURIComponent(r.key)}`); }); };

  const Card = (p: PlanCard, i: number, first: boolean) => { const m = p.out[1]; return (
    <Link key={p.key} href={`${base}/campaigns/${encodeURIComponent(p.key)}`} className="col hv rise" style={{ padding: "16px 18px 14px", gap: 10, borderRadius: 18, background: "#fff", boxShadow: first ? "0 0 0 1.5px var(--ink), 0 12px 32px rgba(18,18,18,.07)" : "0 0 0 1px var(--line)", minWidth: 0, ["--i" as string]: i }}>
      <div className="row between g8">
        <span style={{ height: 22, padding: "0 8px", borderRadius: 6, fontSize: 11, fontWeight: 600, lineHeight: "22px", background: TONE[p.reason][0], color: TONE[p.reason][1] }}>{REASON_NAME[p.reason]}{p.when ? ` · ${p.when}` : ""}</span>
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
          <span className="col"><span className="tnum" style={{ fontSize: 28, lineHeight: "30px", fontWeight: 600, letterSpacing: "-0.015em" }}>{usd(m.revenue)}</span><span className="xs i3">likely back · {p.days} days</span></span>
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
        {/* ---- what runs by itself, and the two things a brand comes here to do: see results, start a campaign */}
        <div className="row g10" style={{ flexWrap: "wrap" }}>
          <div className="row g10" style={{ padding: "6px 8px 6px 8px", borderRadius: 10, background: "#fff", boxShadow: "0 0 0 1px var(--line)", flexWrap: "wrap" }} title={`Otto watches every ad on Meta, every day. ${MODES[mode].line}`}>
            <span className="row g8 sm w5"><AgentFace kind="qa" size={24} mood="happy" />Autopilot</span>
            <div className="seg" role="radiogroup" aria-label="How much Autopilot may decide alone">
              {(Object.keys(MODES) as Mode[]).map((m) => <button key={m} type="button" role="radio" aria-checked={mode === m} disabled={busy} className={`o${mode === m ? " on" : ""}`} title={MODES[m].line} onClick={() => { setM(m); start(async () => { await setMode(slug, m); router.refresh(); }); }}>{MODES[m].name}</button>)}
            </div>
            <span className="xs i3">{pilot.last ? `Checked ${pilot.last}` : "First check within the hour"}</span>
            <button type="button" className="btn quiet sm" style={{ borderRadius: 99 }} disabled={busy} onClick={() => start(async () => { await checkNow(slug); router.refresh(); })}><Icon name="refresh" size={12} />Check now</button>
          </div>
          <span className="fill" />
          <Link className="btn" href={`${base}/performance`}><Icon name="trend-up" size={14} />Running ads</Link>
          <button type="button" className="btn dark" onClick={() => { setErr(null); setCreating(true); }}><Icon name="plus" size={13} color="#fff" />New campaign</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
          {/* the bar the plans answer to: sales against the target the brand sets */}
          <button type="button" onClick={() => setEditing(true)} className="bt rise" title="Falling short of your target is a reason to advertise" style={{ padding: "12px 16px 12px", gap: 2, textAlign: "left" }}>
            <span className="row between g8"><span style={{ fontSize: 13, color: "var(--ink-2)" }}>Sales · 30 days</span><Icon name="pencil" size={13} color="#8B8883" /></span>
            <span className="row g6" style={{ alignItems: "baseline" }}><span className="bt-n" style={{ fontSize: 28, lineHeight: "36px" }}>{sales.value}</span>{sales.delta && <span className="xs tnum w5" style={{ color: sales.delta.good ? "var(--green)" : sales.delta.good === false ? "var(--red)" : "var(--ink-3)" }}>{sales.delta.dir === "up" ? "↗" : sales.delta.dir === "down" ? "↘" : "→"} {sales.delta.text}</span>}</span>
            {sales.target ? <><span className="xs i3 tnum">{sales.share}% of your {usd(sales.target)} target</span><span style={{ height: 6, borderRadius: 99, background: "var(--tray-2)", overflow: "hidden", marginTop: 8 }}><span style={{ display: "block", height: "100%", width: `${Math.max(2, Math.min(100, sales.share ?? 0))}%`, borderRadius: 99, background: (sales.share ?? 0) >= 100 ? "#34C77B" : "#E9B949" }} /></span></>
              : <span className="xs" style={{ color: "var(--blue)" }}>Set a monthly target</span>}
          </button>
          {tiles.map((k, i) => <StatTile key={k.label} k={k} tray={i % 2 === 0} i={i + 1} />)}
        </div>

        {plans.length === 0 ? (
          <div className="row g12" style={{ padding: 22, background: "#fff", borderRadius: 18, boxShadow: "0 0 0 1px var(--line)" }}><AgentFace kind="analyst" size={36} mood="happy" />
            <span className="col fill"><span style={{ fontSize: 20, fontWeight: 600 }}>No reason to advertise today</span><span className="sm i3">No holiday in the next five weeks, stock is moving, buyers are coming back and sales are holding</span></span>
            <button type="button" className="btn" onClick={() => setCreating(true)}>Start one anyway</button></div>
        ) : <>
          {live.length > 0 && <div className="col g10">
            <span className="xs i3" style={{ fontWeight: 500 }}>On Meta · {live.length}</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 380px), 1fr))", gap: 12 }}>{live.map((p, i) => Card(p, i, false))}</div>
          </div>}
          {under.length > 0 && <div className="col g10">
            <span className="xs i3" style={{ fontWeight: 500 }}>Under way · {under.length}</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 380px), 1fr))", gap: 12 }}>{under.map((p, i) => Card(p, i, i === 0))}</div>
          </div>}
          {fresh.length > 0 && <div className="col g10">
            <span className="xs i3" style={{ fontWeight: 500 }}>Suggested · {fresh.length}</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 380px), 1fr))", gap: 12 }}>{fresh.map((p, i) => Card(p, i + under.length, !under.length && i === 0))}</div>
          </div>}
        </>}

        {(meta.length > 0 || hasMeta) && <div className="card" style={{ padding: "14px 16px 6px" }}>
          <div className="row between g12" style={{ paddingBottom: 8 }}><span className="h3">On Meta</span><Link className="btn sm quiet" href={`${base}/performance`}>Running ads<Icon name="arrow-r" size={11} /></Link></div>
          {meta.length === 0 ? <span className="sm i3" style={{ padding: "6px 0 14px" }}>Nothing is running</span> : <div style={{ overflowX: "auto" }}><div style={{ minWidth: 780 }}>
            <div style={{ display: "grid", gridTemplateColumns: COLS, gap: 8, padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
              <span className="xs i3">Campaign</span><span className="xs i3">Status</span><span className="xs i3" style={{ textAlign: "right" }}>Budget</span><span className="xs i3" style={{ textAlign: "right" }}>Spent · 30 days</span><span className="xs i3" style={{ textAlign: "right" }} title="Shopify sales from this campaign ÷ what it spent">Back per $1</span><span />
            </div>
            {meta.map((r) => (
              <div key={r.key} style={{ display: "grid", gridTemplateColumns: COLS, gap: 8, alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
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
      {creating && <Modal icon={<Icon name="megaphone" size={16} />} title="New campaign" sub="Yours to start: pick what to sell and who should see it. Remy writes its ads on the next screen." onClose={() => setCreating(false)} width={500}
        footer={<><button type="button" className="btn quiet" onClick={() => setCreating(false)}>Cancel</button><button type="button" className="btn dark" disabled={busy || !form.product || !(Number(form.budget) >= 50)} onClick={create}>{busy ? <Icon name="spinner" size={13} className="spin" color="#fff" /> : null}Start campaign</button></>}>
        <div className="col g12">
          <div className="col g4"><span className="xs i2 w5">What to sell</span>
            <Combo label="What to sell" searchText="Search products" value={form.product} onChange={(v) => setForm({ ...form, product: v })}
              items={options.products.map((x) => ({ value: x.title, label: x.title, image: x.image, sub: usd(x.price), right: x.stock > 0 ? `${x.stock.toLocaleString("en-US")} in stock` : "Out of stock", ...(x.stock > 0 ? {} : { tone: "warn" as const }) }))} /></div>
          <div className="col g4"><span className="xs i2 w5">Who should see it</span>
            <Combo label="Who should see it" searchText="Search audiences" value={form.audience} onChange={(v) => setForm({ ...form, audience: v })}
              items={options.audiences.map((x) => ({ value: x.key, label: x.label.split(" · ")[0], icon: x.kind === "warm" ? "repeat" : x.kind === "lookalike" ? "users" : "globe",
                sub: x.kind === "warm" ? "Your own customers" : x.kind === "lookalike" ? "Meta finds people who resemble them" : x.key === "new" ? "Meta finds them — the widest reach" : "New to you · a buyer group from market research",
                ...(x.size ? { right: `${x.size >= 1e6 ? `${(x.size / 1e6).toFixed(1)}M` : x.size.toLocaleString("en-US")} people` } : {}) }))} /></div>
          <div className="row g10">
            <label className="col g4 fill"><span className="xs i2 w5">Budget</span><input className="input" inputMode="numeric" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value.replace(/[^0-9]/g, "").slice(0, 7) })} /></label>
            <label className="col g4"><span className="xs i2 w5">Over</span>
              <div className="seg">{[7, 14, 28].map((d) => <button key={d} type="button" className={`o${form.days === d ? " on" : ""}`} style={{ height: 30 }} onClick={() => setForm({ ...form, days: d })}>{d} days</button>)}</div></label>
          </div>
          <label className="col g4"><span className="xs i2 w5">Name <span className="i3" style={{ fontWeight: 400 }}>· optional</span></span><input className="input" placeholder="e.g. New serum launch" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          {err && <span className="xs" style={{ color: "#B4532A" }}>{err}</span>}
        </div>
      </Modal>}
      {editing && <Modal icon={<Icon name="target" size={16} />} title="Monthly sales target" sub="Falling short of it is a reason for Kaviar to suggest a campaign" onClose={() => setEditing(false)} width={420}
        footer={<>{sales.target != null && <button type="button" className="btn quiet" style={{ marginRight: "auto" }} disabled={busy} onClick={() => save(null)}>Remove target</button>}<button type="button" className="btn quiet" onClick={() => setEditing(false)}>Cancel</button><button type="button" className="btn dark" disabled={busy || !(Number(target) > 0)} onClick={() => save(Number(target))}>{busy ? <Icon name="spinner" size={13} className="spin" color="#fff" /> : null}Save</button></>}>
        <label className="col g4"><span className="xs i2 w5">Sales you want in 30 days</span>
          <input className="input" inputMode="numeric" placeholder="5000" value={target} onChange={(e) => setTarget(e.target.value.replace(/[^0-9]/g, "").slice(0, 9))} onKeyDown={(e) => { if (e.key === "Enter" && Number(target) > 0) save(Number(target)); }} autoFocus style={{ fontSize: 18, height: 42 }} />
          <span className="xs i3">The last 30 days brought {sales.value}</span></label>
      </Modal>}
    </div>
  );
}
