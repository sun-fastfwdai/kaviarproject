"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { AgentFace } from "@/components/agent";
import { Modal } from "@/components/modal";
import type { PlanInput } from "@/lib/growth/plan";
import { forecast, REASON_NAME, STAGE_NAME, type PlanCard, type Reason } from "@/lib/growth/plans-rules";
import { approvePlanFor, setPlanBudget } from "../campaigns/actions";
import { approvePlan } from "./actions";

/**
 * Budget. The brand's ad money, campaign by campaign — because money is only ever spent by a campaign: one product, shown to one
 * audience, for one reason. Top: what is approved in all and what it should bring back. Then every campaign with its own budget,
 * changed here; the ones Iris suggests sit below, each one yes away. Last, the few figures every forecast rests on.
 */
const LEVEL = ["Scenario · not a forecast", "Early estimate", "From your results"];
const TONE: Record<Reason, [string, string]> = { holiday: ["#121212", "#fff"], overstock: ["var(--amber-bg)", "var(--amber)"], lapsed: ["var(--blue-bg)", "var(--blue)"], sales: ["var(--red-bg)", "var(--red)"], own: ["var(--tray-2)", "var(--ink)"] };
const DAYS = [7, 14, 28];
export type Figures = { margin: number; marginFrom: "costs" | "saved" | "none"; withCost: number; variants: number; discount: number; goal: "profit" | "revenue" | "customers"; order: number | null; avg: number | null; adDays: number };
type Props = { slug: string; currency: string; plans: PlanCard[]; input: Omit<PlanInput, "candidates">; level: 0 | 1 | 2; minBudget: number; figures: Figures };
const label = { fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600 } as const;

export function Budget({ slug, currency, plans, input, level, minBudget, figures: f }: Props) {
  const base = `/brands/${slug}`, router = useRouter();
  const [busy, start] = useTransition();
  const [doing, setDoing] = useState<string | null>(null);
  const [set, setSet] = useState<Record<string, { budget: number; days: number }>>({});
  const [open, setOpen] = useState(false);
  const [fig, setFig] = useState({ margin: Math.round(f.margin * 100), discount: f.discount, goal: f.goal, order: f.order ? String(Math.round(f.order)) : "" });
  const usd = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(Math.round(v));
  const signed = (v: number) => `${v >= 0 ? "+" : "−"}${usd(Math.abs(v))}`;
  const step = Math.max(50, Math.round(minBudget / 4 / 50) * 50);
  const at = (p: PlanCard) => set[p.key] ?? { budget: p.budget, days: p.days };
  const out = (p: PlanCard) => { const v = at(p); return forecast(p.c, v.budget, v.days, input); };
  const change = (p: PlanCard, v: Partial<{ budget: number; days: number }>) => { const n = { ...at(p), ...v }; setSet((s) => { const r = { ...s }; if (n.budget === p.budget && n.days === p.days) delete r[p.key]; else r[p.key] = n; return r; }); };
  // A change counts until the saved budget catches up with it, so the row never flicks back while the page reloads.
  const yes = plans.filter((p) => p.stage !== "suggested"), maybe = plans.filter((p) => p.stage === "suggested"), changed = plans.filter((p) => set[p.key] && (set[p.key].budget !== p.budget || set[p.key].days !== p.days)).map((p) => p.key);
  const sum = (list: PlanCard[]) => list.reduce((t, p) => { const [lo, mid, hi] = out(p); return { spend: t.spend + at(p).budget, back: t.back + mid.revenue, profit: t.profit + mid.profit, lo: t.lo + lo.revenue, hi: t.hi + hi.revenue, day: t.day + at(p).budget / at(p).days }; }, { spend: 0, back: 0, profit: 0, lo: 0, hi: 0, day: 0 });
  const a = sum(yes), s = sum(maybe), live = yes.filter((p) => p.meta);
  const save = () => { setDoing("save"); start(async () => { for (const k of changed) await setPlanBudget(slug, k, set[k].budget, set[k].days); router.refresh(); setDoing(null); }); };
  const approve = (p: PlanCard) => { setDoing(p.key); start(async () => { const v = at(p); await approvePlanFor(slug, p.key, v.budget, v.days); router.refresh(); setDoing(null); }); };
  const approveAll = () => { setDoing("all"); start(async () => { for (const p of maybe) { const v = at(p); await approvePlanFor(slug, p.key, v.budget, v.days); } router.refresh(); setDoing(null); }); };
  const saveFig = () => { setDoing("fig"); start(async () => { await approvePlan(slug, { margin: Math.min(95, Math.max(5, fig.margin)) / 100, discount: fig.discount, goal: fig.goal, ...(Number(fig.order) > 0 ? { order: Number(fig.order) } : {}) }, false); setOpen(false); router.refresh(); setDoing(null); }); };

  const Row = (p: PlanCard) => {
    const v = at(p), [, mid] = out(p), locked = Boolean(p.meta), share = a.spend > 0 && p.stage !== "suggested" ? v.budget / a.spend : 0;
    return (
      <div key={p.key} className="row g14" style={{ padding: "13px 0", borderTop: "1px solid var(--line)", flexWrap: "wrap" }}>
        <Link href={`${base}/campaigns/${encodeURIComponent(p.key)}`} className="row g12 fill" style={{ minWidth: 280 }}>
          {p.image
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={p.image} alt="" width={48} height={48} loading="lazy" style={{ borderRadius: 11, objectFit: "cover", flexShrink: 0, background: "#fff", boxShadow: "0 0 0 1px var(--line)" }} />
            : <span style={{ width: 48, height: 48, borderRadius: 11, background: "var(--tray-2)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="box" size={18} color="#8B8883" /></span>}
          <span className="col" style={{ minWidth: 0, gap: 2 }}>
            <span className="row g8"><span className="sm w5 i1 ell">{p.title}</span>
              <span style={{ height: 18, padding: "0 7px", borderRadius: 99, fontSize: 10.5, fontWeight: 600, lineHeight: "18px", whiteSpace: "nowrap", background: TONE[p.reason][0], color: TONE[p.reason][1] }}>{REASON_NAME[p.reason]}</span></span>
            <span className="xs i3 ell">{p.c.product} · {p.c.audience ? `${p.c.audience.toLocaleString("en-US")} people` : p.c.kind === "warm" ? "your buyers" : p.c.kind === "lookalike" ? "people like your buyers" : "new people"} · {STAGE_NAME[p.stage]}</span>
          </span>
        </Link>
        <span className="row g8" style={{ flexShrink: 0 }} title={locked ? "This campaign is on Meta — open it to change its budget there" : undefined}>
          <button type="button" aria-label={`Spend less on ${p.title}`} disabled={locked || v.budget - step < 50} onClick={() => change(p, { budget: Math.max(50, v.budget - step) })} className="btn sm ic" style={{ borderRadius: 99 }}>−</button>
          <span className="col" style={{ width: 92, alignItems: "center", lineHeight: 1.25 }}><span className="tnum w5" style={{ fontSize: 17 }}>{usd(v.budget)}</span><span className="xs i3 tnum">{usd(v.budget / v.days)} a day</span></span>
          <button type="button" aria-label={`Spend more on ${p.title}`} disabled={locked} onClick={() => change(p, { budget: v.budget + step })} className="btn sm ic" style={{ borderRadius: 99 }}>+</button>
          <div className="seg" role="radiogroup" aria-label={`How long ${p.title} runs`}>{DAYS.map((d) => <button key={d} type="button" role="radio" aria-checked={v.days === d} disabled={locked} className={`o${v.days === d ? " on" : ""}`} onClick={() => change(p, { days: d })}>{d}d</button>)}</div>
        </span>
        <span className="col" style={{ width: 150, alignItems: "flex-end", flexShrink: 0, lineHeight: 1.3 }}>
          <span className="sm w5 tnum">{usd(mid.revenue)} back</span>
          <span className="xs tnum" style={{ color: mid.profit >= 0 ? "var(--green)" : "var(--red)", fontWeight: 500 }}>{signed(mid.profit)} · {Math.round(mid.orders)} order{Math.round(mid.orders) === 1 ? "" : "s"}</span>
        </span>
        <span style={{ width: 120, display: "flex", justifyContent: "flex-end", flexShrink: 0 }}>
          {p.stage === "suggested" ? <button type="button" className="btn dark sm" disabled={busy} onClick={() => approve(p)}>{doing === p.key ? <Icon name="spinner" size={12} className="spin" color="#fff" /> : <Icon name="check" size={12} color="#fff" />}Approve</button>
            : <Link className="btn sm" href={`${base}/campaigns/${encodeURIComponent(p.key)}`}>Open<Icon name="arrow-r" size={11} /></Link>}
        </span>
        {share > 0 && <span aria-hidden style={{ flexBasis: "100%", height: 4, borderRadius: 99, background: "var(--tray-2)", marginTop: -4 }}><span style={{ display: "block", height: "100%", width: `${Math.round(share * 100)}%`, borderRadius: 99, background: "var(--ink)", transition: "width .25s ease" }} /></span>}
      </div>);
  };

  return (
    <div className="scroll" style={{ padding: "22px 24px 110px" }}>
      <div className="col g16" style={{ width: "100%" }}>
        <div className="row between g12" style={{ flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="col g6">
            <h1 className="h1">Budget</h1>
            <span className="row g8 sm i2"><AgentFace kind="analyst" size={20} /><span>{yes.length
              ? <>Your ad money goes to <b className="i1 w5">{yes.length} campaign{yes.length === 1 ? "" : "s"}</b> — <b className="i1 w5 tnum">{usd(a.spend)}</b> in all, about <b className="i1 w5 tnum">{usd(a.back)}</b> back</>
              : maybe.length ? <>No money is set aside yet. Iris suggests {maybe.length} campaign{maybe.length === 1 ? "" : "s"} below — each has its own budget</> : "No campaign has a budget yet"}</span></span>
          </div>
          <span className="row g8">
            <span className={`pill${level === 2 ? " green" : ""}`} style={level === 0 ? { background: "#FBF1DC", color: "#7A5A12" } : undefined} title={level === 0 ? "No ad results here yet — the numbers start from typical rates and are replaced by your own as ads run" : `Worked out from ${f.adDays} days of your own Meta results`}>{LEVEL[level]}</span>
            <Link className="btn" href={`${base}/campaigns?new=1`}><Icon name="plus" size={13} />New campaign</Link>
          </span>
        </div>

        {/* ---- the money in all */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          <div className="col g4" style={{ padding: "16px 18px", borderRadius: 18, background: "#121212", color: "#fff" }}>
            <span style={{ fontSize: 12.5, color: "rgba(255,255,255,.65)" }}>Approved to spend</span>
            <span className="tnum" style={{ fontSize: 34, lineHeight: "40px", fontWeight: 600, letterSpacing: "-0.03em" }}>{usd(a.spend)}</span>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,.6)" }}>{yes.length} campaign{yes.length === 1 ? "" : "s"}{a.day > 0 ? ` · ${usd(a.day)} a day` : ""}{live.length ? ` · ${live.length} on Meta` : " · none on Meta yet"}</span>
          </div>
          <div className="col g4" style={{ padding: "16px 18px", borderRadius: 18, background: "#fff", boxShadow: "0 0 0 1px var(--line)" }}>
            <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>Likely comes back</span>
            <span className="tnum" style={{ fontSize: 34, lineHeight: "40px", fontWeight: 600, letterSpacing: "-0.03em" }}>{usd(a.back)}</span>
            <span className="xs i3 tnum">{yes.length ? `${usd(a.lo)} if it goes badly · ${usd(a.hi)} if it goes well` : "Approve a campaign to see it"}</span>
          </div>
          <div className="col g4" style={{ padding: "16px 18px", borderRadius: 18, background: !yes.length ? "var(--tray)" : a.profit >= 0 ? "var(--green-bg)" : "var(--red-bg)" }}>
            <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>Profit after costs</span>
            <span className="tnum" style={{ fontSize: 34, lineHeight: "40px", fontWeight: 600, letterSpacing: "-0.03em", color: !yes.length ? "var(--ink-3)" : a.profit >= 0 ? "var(--green)" : "var(--red)" }}>{yes.length ? signed(a.profit) : "–"}</span>
            <span className="xs i3">after the goods and the ads · {Math.round(input.margin * 100)}% margin</span>
          </div>
          <div className="col g4" style={{ padding: "16px 18px", borderRadius: 18, background: "var(--tray)" }}>
            <span className="row g6" style={{ fontSize: 12.5, color: "var(--ink-2)" }}><AgentFace kind="analyst" size={16} />Suggested by Iris, not approved</span>
            <span className="row between g10" style={{ flexWrap: "wrap" }}>
              <span className="tnum" style={{ fontSize: 34, lineHeight: "40px", fontWeight: 600, letterSpacing: "-0.03em", color: maybe.length ? "var(--ink)" : "var(--ink-3)" }}>{maybe.length ? usd(s.spend) : "–"}</span>
              {maybe.length > 0 && <button type="button" className="btn dark" disabled={busy} onClick={approveAll} title="Says yes to each suggested campaign at the budget shown below. Nothing is spent until a campaign is switched on.">{doing === "all" ? <Icon name="spinner" size={13} className="spin" color="#fff" /> : <Icon name="check" size={13} color="#fff" />}Approve {maybe.length === 1 ? "it" : `all ${maybe.length}`}</button>}
            </span>
            <span className="xs i3 tnum">{maybe.length ? `${maybe.length} campaign${maybe.length === 1 ? "" : "s"} · would add ${signed(s.profit)}` : "Nothing waiting for a yes"}</span>
          </div>
        </div>

        {/* ---- where the money goes: one row per campaign, its budget changed here */}
        {yes.length > 0 && <div className="card" style={{ padding: "14px 18px 4px" }}>
          <div className="row between g12" style={{ paddingBottom: 10 }}><span className="i3" style={label}>Approved · {yes.length}</span><span className="xs i3">Each campaign sells one product to one audience</span></div>
          {yes.map(Row)}
        </div>}
        {maybe.length > 0 && <div className="card" style={{ padding: "14px 18px 4px" }}>
          <div className="row between g12" style={{ paddingBottom: 10 }}><span className="row g8"><AgentFace kind="analyst" size={16} /><span className="i3" style={label}>Suggested by Iris · {maybe.length}</span></span><span className="xs i3">Nothing is spent until you approve one and switch it on</span></div>
          {maybe.map(Row)}
        </div>}
        {!plans.length && <div className="col g10" style={{ alignItems: "flex-start", padding: "24px 22px", borderRadius: 18, background: "#fff", boxShadow: "0 0 0 1px var(--line)" }}>
          <span className="h3">No campaign yet</span><span className="sm i3">A budget belongs to a campaign: one product, one audience, one reason.</span>
          <Link className="btn dark" href={`${base}/campaigns?new=1`}><Icon name="plus" size={13} color="#fff" />New campaign</Link></div>}

        {/* ---- the few figures every campaign's numbers rest on */}
        <div className="col g8">
          <span className="i3" style={label}>Figures every campaign uses</span>
          <div className="row g8" style={{ flexWrap: "wrap", alignItems: "stretch" }}>
            {([["Margin", `${Math.round(f.margin * 100)}%${f.marginFrom === "costs" ? " · from Shopify costs" : f.marginFrom === "none" ? " · assumed" : ""}`], ["Offer", f.discount ? `${Math.round(f.discount * 100)}% off` : "Full price"], ["One order is worth", f.order ? usd(f.order) : f.avg ? `${usd(f.avg)} · your average` : "Each product’s price"],
              ["Goal", f.goal === "profit" ? "Profit" : f.goal === "revenue" ? "Revenue" : "New customers"],
              ["Rates", `${usd(input.rates.cpm[1])} per 1,000 views · ${(input.rates.ctr[1] * 100).toFixed(1)}% click · ${(input.rates.cvr.cold[1] * 100).toFixed(1)}% buy`]] as const).map(([k, v]) => (
              <button key={k} type="button" onClick={() => setOpen(true)} disabled={k === "Rates"} title={k === "Rates" ? (level === 0 ? "Typical starting rates — replaced by your own results as ads run" : `From ${f.adDays} days of your Meta results`) : undefined} className="col hv" style={{ padding: "9px 13px", borderRadius: 12, background: "#fff", boxShadow: "0 0 0 1px var(--line)", textAlign: "left", minWidth: 0 }}>
                <span className="xs i3">{k}</span><span className="sm w5 ell" style={{ maxWidth: 360 }}>{v}</span>
              </button>))}
            <button type="button" className="btn quiet" style={{ alignSelf: "center" }} onClick={() => setOpen(true)}><Icon name="pencil" size={12} />Change</button>
          </div>
        </div>
      </div>

      {/* ---- changes are kept only when the brand says so */}
      {changed.length > 0 && <div style={{ position: "sticky", bottom: 16, marginTop: 18, zIndex: 5 }}>
        <div className="row g12" style={{ padding: "10px 12px 10px 18px", borderRadius: 99, background: "#121212", color: "#fff", boxShadow: "0 14px 34px rgba(18,18,18,.22)", flexWrap: "wrap" }}>
          <span className="col fill" style={{ minWidth: 200, lineHeight: 1.3 }}><span className="sm w5 tnum">{changed.length} budget{changed.length === 1 ? "" : "s"} changed · {usd(a.spend)} approved in all</span>
            <span style={{ fontSize: 11.5, color: "rgba(255,255,255,.6)" }}>Saving spends nothing — each campaign is switched on by you</span></span>
          <button type="button" disabled={busy} onClick={() => setSet({})} className="row g6" style={{ height: 38, padding: "0 16px", borderRadius: 99, background: "rgba(255,255,255,.12)", color: "#fff", fontSize: 13.5 }}>Undo</button>
          <button type="button" disabled={busy} onClick={save} className="row g6" style={{ height: 38, padding: "0 18px", borderRadius: 99, background: "#34C77B", color: "#0B2B1A", fontSize: 13.5, fontWeight: 600 }}>{doing === "save" ? <Icon name="spinner" size={13} className="spin" color="#0B2B1A" /> : <Icon name="check" size={13} color="#0B2B1A" />}Save budgets</button>
        </div>
      </div>}

      {open && <Modal icon={<Icon name="pencil" size={16} />} title="Figures every campaign uses" sub="Each campaign’s likely sales and profit are worked out from these." onClose={() => setOpen(false)} width={480}
        footer={<><button type="button" className="btn quiet" onClick={() => setOpen(false)}>Cancel</button><button type="button" className="btn dark" disabled={busy} onClick={saveFig}>{doing === "fig" && <Icon name="spinner" size={13} className="spin" color="#fff" />}Save</button></>}>
        <div className="col g14">
          <div className="row g12" style={{ flexWrap: "wrap" }}>
            <label className="col g4 fill" style={{ minWidth: 150 }}><span className="xs i2 w5" title="What is left of the price after making the product">Margin</span>
              <div className="input"><input type="number" min={5} max={95} value={fig.margin || ""} onChange={(e) => setFig({ ...fig, margin: Number(e.target.value) })} aria-label="Margin percent" style={{ border: 0, outline: 0, background: "transparent", font: "inherit", width: "100%" }} /><span className="i3">%</span></div>
              <span className="xs i3">{f.marginFrom === "costs" ? `From ${f.withCost} of ${f.variants} costs in Shopify` : f.marginFrom === "saved" ? "Your figure" : "Assumed until you set it"}</span></label>
            <label className="col g4 fill" style={{ minWidth: 150 }}><span className="xs i2 w5">One order is worth</span>
              <div className="input"><span className="i3">$</span><input type="number" min={1} value={fig.order} placeholder={f.avg ? String(f.avg) : "Product price"} onChange={(e) => setFig({ ...fig, order: e.target.value.replace(/[^0-9.]/g, "") })} aria-label="Order value" style={{ border: 0, outline: 0, background: "transparent", font: "inherit", width: "100%" }} /></div>
              {f.avg != null && fig.order !== String(f.avg) && <button type="button" className="lnk xs" style={{ alignSelf: "flex-start" }} onClick={() => setFig({ ...fig, order: String(f.avg) })}>Use your average, {usd(f.avg)}</button>}</label>
          </div>
          <div className="col g4"><span className="xs i2 w5">Offer</span>
            <div className="seg" style={{ alignSelf: "flex-start" }}>{[0, 0.1, 0.15, 0.2, 0.3].map((d) => <button key={d} type="button" className={`o${fig.discount === d ? " on" : ""}`} onClick={() => setFig({ ...fig, discount: d })}>{d ? `${Math.round(d * 100)}% off` : "Full price"}</button>)}</div></div>
          <div className="col g4"><span className="xs i2 w5">Goal</span>
            <div className="seg" style={{ alignSelf: "flex-start" }}>{([["profit", "Profit"], ["revenue", "Revenue"], ["customers", "New customers"]] as const).map(([k, n]) => <button key={k} type="button" className={`o${fig.goal === k ? " on" : ""}`} onClick={() => setFig({ ...fig, goal: k })}>{n}</button>)}</div></div>
        </div>
      </Modal>}
    </div>
  );
}
