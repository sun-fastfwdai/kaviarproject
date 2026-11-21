"use client";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { AgentFace } from "@/components/agent";
import { LEVEL, levelOf, ordersNeeded, plan, ratesFrom, type Rates, type Tri } from "@/lib/growth/plan";
import type { PlanData } from "@/lib/growth/plan-data";
import { approvePlan } from "./actions";

/**
 * Spend plan. Left: what the brand decides — goal, budget, period, margin, offer. Right: what that works out to, recalculated on every
 * change — the range of what should come back, where the budget goes, and what to do next. Numbers are arithmetic on the brand's data;
 * with no ad history it says so and shows the assumptions it started from.
 */
const KIND = { cold: "New audience", lookalike: "Look-alike", warm: "Past buyers" } as const;
const people = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(Math.round(n)));

function Stat({ k, v, sub, tone }: { k: string; v: string; sub?: string; tone?: "good" | "bad" }) {
  return (
    <div className="row between" style={{ padding: "11px 0", borderTop: "1px solid var(--line)" }}>
      <span className="col"><span className="sm i1">{k}</span>{sub && <span className="xs i3">{sub}</span>}</span>
      <span className="tnum" style={{ fontSize: 17, fontWeight: 600, color: tone === "good" ? "#1F7A52" : tone === "bad" ? "#B4532A" : "var(--ink)" }}>{v}</span>
    </div>
  );
}

export function SpendPlan({ slug, brand, data }: { slug: string; brand: string; data: PlanData }) {
  const base = `/brands/${slug}`, s = data.saved ?? {};
  const [goal, setGoal] = useState<"profit" | "revenue" | "customers">(s.goal ?? "profit");
  const [budget, setBudget] = useState(s.budget ?? 1500);
  const [days, setDays] = useState(s.days ?? 28);
  const [discount, setDiscount] = useState(s.discount ?? 0);
  const [margin, setMargin] = useState(data.margin.value ?? 0.6);
  const lvl = levelOf(data.history), own = useMemo(() => ratesFrom(data.history), [data.history]);
  const [cpm, setCpm] = useState(own.cpm[1]);
  const [ctr, setCtr] = useState(own.ctr[1]);
  const [cvr, setCvr] = useState(own.cvr.cold[1]);
  const [open, setOpen] = useState(false);
  // Which product the ads sell, and what an order is worth: the brand can try a dearer product or a bundle and watch break-even move.
  const first = data.candidates[0], [product, setProduct] = useState(first?.product ?? data.products[0]?.title ?? "");
  const chosen = data.products.find((x) => x.title === product) ?? null;
  const [order, setOrder] = useState(first?.price ?? chosen?.price ?? 0);
  const pick = (title: string) => { const x = data.products.find((y) => y.title === title); setProduct(title); if (x) setOrder(x.price); };
  const candidates = useMemo(() => data.candidates.map((c) => ({ ...c, product: chosen?.title ?? c.product, price: order > 0 ? order : c.price, stock: chosen ? chosen.stock : c.stock })), [data.candidates, chosen, order]);
  const [saving, start] = useTransition();
  const [approved, setApproved] = useState<string | null>(s.approvedAt ? `${s.by ?? "The team"} · ${new Date(s.approvedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : null);
  const field: React.CSSProperties = { border: 0, outline: 0, background: "transparent", font: "inherit", width: "100%" };
  const usd = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: data.currency, maximumFractionDigits: 0 }).format(Math.round(v));
  const repeat = data.orders.buyers >= 50 ? Math.min(0.5, data.orders.repeaters / data.orders.buyers) : 0;

  // The brand's edits move the likely rate; the cautious and strong ends keep their distance from it.
  const rates: Rates = useMemo(() => {
    const scale = (t: Tri, v: number): Tri => [(t[0] / t[1]) * v, v, (t[2] / t[1]) * v], k = cvr / own.cvr.cold[1];
    return { cpm: scale(own.cpm, cpm), ctr: scale(own.ctr, ctr), cvr: { cold: scale(own.cvr.cold, cvr), lookalike: scale(own.cvr.lookalike, own.cvr.lookalike[1] * k), warm: scale(own.cvr.warm, own.cvr.warm[1] * k) } };
  }, [own, cpm, ctr, cvr]);
  const p = useMemo(() => plan({ budget, days, goal, discount, margin, repeat, rates, candidates }), [budget, days, goal, discount, margin, repeat, rates, candidates]);
  const [lo, mid, hi] = p.total, pays = mid.profit >= 0, edited = cpm !== own.cpm[1] || ctr !== own.ctr[1] || cvr !== own.cvr.cold[1];

  // What to do next — at most three, each from a number above.
  const actions: { tone: "warn" | "info"; title: string; why: string; href?: string; label?: string }[] = [];
  if (data.margin.from !== "costs") actions.push({ tone: "warn", title: data.margin.from === "none" ? "Tell us your margin" : "Add product costs in Shopify", why: data.margin.from === "none" ? `Profit below assumes ${Math.round(margin * 100)}% of the price is left after making the product. Set your real figure on the left.` : `Profit uses your one figure of ${Math.round(margin * 100)}%. With a cost on each of your ${data.margin.variants} variants, it becomes exact per product.` });
  if (!data.history) actions.push({ tone: "warn", title: "Bring in your past Meta ads", why: "Kaviar holds no ad results for this brand yet, so this is a scenario. Your own results replace the starting assumptions.", href: `${base}/integrations`, label: "Integrations" });
  if (data.hero?.coverDays != null && data.hero.coverDays < 60) actions.push({ tone: "warn", title: `${data.hero.title}: about ${data.hero.coverDays} days of stock`, why: `${data.hero.stock.toLocaleString("en-US")} units at ${data.hero.sold30} sold in the last 30 days. Ads will shorten that — reorder before scaling.` });
  if (p.tooSmall) actions.push({ tone: "warn", title: `This budget is too small to learn from`, why: `One audience needs about ${usd(p.minToLearn)} to give a result you can read. Below that, a good ad and a bad one look the same.` });
  else if (p.unfunded.length) actions.push({ tone: "info", title: `Test ${p.cells} audience${p.cells === 1 ? "" : "s"} first, not ${p.cells + p.unfunded.length}`, why: `Each needs about ${usd(p.minToLearn)} to give a readable result. Spread thinner, none of them would.` });
  if (!pays && p.needCvr != null && p.needCvr > rates.cvr.cold[1]) { const need = Math.ceil((order * p.needCvr / rates.cvr.cold[1]) / 5) * 5; actions.unshift({ tone: "warn", title: `Sell a bigger order — about ${usd(need)}`, why: `At ${usd(order)} an order, ads can’t pay back at these rates. A set or bundle near ${usd(need)} would break even on the same clicks.` }); }
  if (discount > 0) actions.push({ tone: "info", title: `${Math.round(discount * 100)}% off needs ${Number.isFinite(ordersNeeded(margin, discount)) ? `${ordersNeeded(margin, discount).toFixed(1)}×` : "more than any number of"} the orders`, why: `To earn the same profit as full price. Break-even ROAS rises to ${p.breakEven.toFixed(2)}×.` });
  if (data.orders.count >= 10 && data.orders.tagged / data.orders.count < 0.5) actions.push({ tone: "info", title: "Tag every ad link", why: `${data.orders.tagged} of ${data.orders.count} orders can be traced to a campaign. Tagged links let results be matched to real orders.` });

  const approve = () => start(async () => { const r = await approvePlan(slug, { margin, budget, days, goal, discount }, true); if (r.ok) setApproved("You · just now"); });

  return (
    <div className="scroll" style={{ padding: "22px 24px 40px" }}>
      <div className="col g4" style={{ marginBottom: 18 }}>
        <h1 className="h1">Spend plan</h1>
        <p className="sm i3">Set a budget for {brand}. The left is what you decide; the right is what it works out to.</p>
      </div>
      <div className="row top g16" style={{ flexWrap: "wrap" }}>
        {/* ---- what you decide */}
        <div className="card col g16" style={{ width: 380, flexShrink: 0, padding: 18 }}>
          <span className="sm w5">What you decide</span>
          <div className="col g6"><span className="xs i3">Goal</span>
            <div className="seg">{([["profit", "Profit"], ["revenue", "Revenue"], ["customers", "New customers"]] as const).map(([k, n]) => <button key={k} type="button" className={`o${goal === k ? " on" : ""}`} onClick={() => setGoal(k)}>{n}</button>)}</div></div>
          <div className="col g6"><span className="xs i3">Budget</span>
            <div className="input" style={{ height: 48 }}><span className="i3" style={{ fontSize: 20 }}>$</span><input type="number" min={0} step={100} value={budget || ""} onChange={(e) => setBudget(Math.max(0, Number(e.target.value)))} aria-label="Budget" style={{ ...field, fontSize: 22, fontWeight: 600 }} /></div>
            <div className="row g6" style={{ flexWrap: "wrap" }}>
              {[500, 1500, 3000, 5000].map((b) => <button key={b} type="button" className="chip" onClick={() => setBudget(b)} style={{ height: 26, ...(budget === b ? { background: "var(--ink)", color: "#fff" } : {}) }}>{usd(b)}</button>)}
              {p.suggested != null && p.suggested !== budget && <button type="button" className="lnk xs" onClick={() => setBudget(p.suggested!)} title="The budget that earns the most at the likely rates — past it, the next dollar stops paying">Kaviar suggests {usd(p.suggested)}</button>}
            </div></div>
          {data.products.length > 0 && <div className="col g6"><span className="xs i3">Product to advertise · what one order is worth</span>
            <div className="row g8">
              <select value={product} onChange={(e) => pick(e.target.value)} aria-label="Product to advertise" className="input fill" style={{ font: "inherit", fontSize: 13, minWidth: 0 }}>
                {data.products.map((x) => <option key={x.title} value={x.title}>{x.title} — ${Math.round(x.price)}</option>)}
              </select>
              <div className="input" style={{ width: 96, flexShrink: 0 }}><span className="i3">$</span><input type="number" min={1} value={Math.round(order) || ""} onChange={(e) => setOrder(Math.max(0, Number(e.target.value)))} aria-label="Order value" style={field} /></div>
            </div>
            <span className="xs i3">{data.orders.aov ? <>Your average order is {usd(data.orders.aov)}{Math.abs(data.orders.aov - order) > 1 ? <> · <button type="button" className="lnk" onClick={() => setOrder(Math.round(data.orders.aov!))}>use it</button></> : null}. </> : null}Try a set or a bundle to see what a bigger order does.</span></div>}
          <div className="col g6"><span className="xs i3">Period</span>
            <div className="seg">{([[14, "2 weeks"], [28, "4 weeks"], [56, "8 weeks"]] as const).map(([d, n]) => <button key={d} type="button" className={`o${days === d ? " on" : ""}`} onClick={() => setDays(d)}>{n}</button>)}</div></div>
          <div className="col g6"><span className="xs i3">Margin — what is left of the price after making the product</span>
            <div className="input" style={{ width: 120 }}><input type="number" min={5} max={95} value={Math.round(margin * 100)} onChange={(e) => setMargin(Math.min(0.95, Math.max(0.05, Number(e.target.value) / 100)))} aria-label="Margin percent" style={field} /><span className="i3">%</span></div>
            <span className="xs i3">{data.margin.from === "costs" ? `From the cost on ${data.margin.withCost} of ${data.margin.variants} variants in Shopify` : data.margin.from === "saved" ? "Your figure" : "Assumed until you set it"}</span></div>
          <div className="col g6"><span className="xs i3">Offer</span>
            <div className="seg">{[0, 0.1, 0.15, 0.2, 0.3].map((d) => <button key={d} type="button" className={`o${discount === d ? " on" : ""}`} onClick={() => setDiscount(d)}>{d ? `${Math.round(d * 100)}% off` : "Full price"}</button>)}</div></div>
          <div className="col g8" style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
            <button type="button" className="row between" onClick={() => setOpen((v) => !v)} style={{ textAlign: "left", cursor: "pointer" }}>
              <span className="col"><span className="sm i1">{lvl === 2 ? "Rates from your ads" : "Starting assumptions"}</span><span className="xs i3">{data.history ? `From ${data.history.days} days of your Meta results${lvl < 2 ? ", blended with starting points" : ""}` : "No ad history yet — these are starting points, not your results"}</span></span>
              <span className="xs i3">{open ? "Hide" : "Show"}</span></button>
            {open && <div className="col g8">
              {([["Cost per 1,000 views", cpm, (v: number) => setCpm(Math.max(1, v)), "$", 1], ["People who click", ctr * 100, (v: number) => setCtr(Math.max(0.0005, v / 100)), "%", 0.1], ["Clickers who buy (new audience)", cvr * 100, (v: number) => setCvr(Math.max(0.0005, v / 100)), "%", 0.1]] as [string, number, (v: number) => void, string, number][]).map(([n, v, set, unit, st]) => (
                <label key={n} className="row between g8"><span className="xs i2">{n}</span>
                  <span className="input" style={{ width: 96, height: 30 }}><input type="number" step={st} value={Number(v.toFixed(2))} onChange={(e) => set(Number(e.target.value))} aria-label={n} style={{ ...field, fontSize: 13 }} /><span className="i3 xs">{unit}</span></span></label>))}
              {edited && <button type="button" className="lnk xs i3" style={{ alignSelf: "flex-start" }} onClick={() => { setCpm(own.cpm[1]); setCtr(own.ctr[1]); setCvr(own.cvr.cold[1]); }}>Back to the starting points</button>}
            </div>}
          </div>
        </div>

        {/* ---- what it works out to */}
        <div className="col g14 fill" style={{ minWidth: 520 }}>
          <div className="row g8" style={{ flexWrap: "wrap" }}>
            <span className={`pill${lvl === 2 ? " green" : ""}`} style={lvl === 0 ? { background: "#FBF1DC", color: "#7A5A12" } : undefined}>{LEVEL[lvl]}{lvl === 0 ? " · not a forecast" : ""}</span>
            <span className="xs i3">Built from:</span>
            {[data.candidates.some((c) => c.audience) ? "Meta audience sizes" : null, "Your prices and stock", data.margin.from === "costs" ? "Your product costs" : "Your margin", data.history ? `${data.history.days} days of your ads` : "Starting assumptions", repeat > 0 ? `Repeat buyers (${Math.round(repeat * 100)}%)` : null, data.hasResearch ? "Buyer groups from research" : null].filter(Boolean).map((x) => <span key={x} className="pill" style={{ height: 20, fontSize: 10.5 }}>{x}</span>)}
          </div>

          <div className="card" style={{ padding: 20 }}>
            <div className="row top between g16" style={{ flexWrap: "wrap" }}>
              <div className="col g2"><span className="xs i3">Expected revenue · {days / 7} weeks</span><span className="tnum" style={{ fontSize: 46, lineHeight: "52px", fontWeight: 600, letterSpacing: "-0.03em" }}>{usd(mid.revenue)}</span></div>
              <div className="row g20">
                {([["If it goes badly", lo.revenue], ["Likely", mid.revenue], ["If it goes well", hi.revenue]] as [string, number][]).map(([k, v]) => <div key={k} className="col g2"><span className="xs i3">{k}</span><span className="tnum" style={{ fontSize: 19, fontWeight: 600 }}>{usd(v)}</span></div>)}
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <Stat k="Ad spend" v={usd(mid.spend)} />
              <Stat k="Product cost" sub={`${Math.round(mid.orders)} orders likely (${Math.round(lo.orders)}–${Math.round(hi.orders)})`} v={usd(mid.cost)} />
              <Stat k="Expected profit" sub={`${usd(lo.profit)} to ${usd(hi.profit)}`} v={usd(mid.profit)} tone={pays ? "good" : "bad"} />
              <Stat k="Return on ad spend" sub={`Break-even is ${p.breakEven.toFixed(2)}× at this margin${discount ? " and offer" : ""}`} v={`${p.roas[1].toFixed(2)}×`} tone={p.roas[1] >= p.breakEven ? "good" : "bad"} />
            </div>
          </div>

          <div className="row top g10" style={{ padding: "12px 14px", borderRadius: 12, background: pays ? "#EAF5EE" : "#FBF1DC" }}>
            <AgentFace kind="analyst" size={22} mood={pays ? "happy" : "focus"} />
            <span className="sm i1" style={{ lineHeight: "20px" }}>{pays
              ? <>At the likely rates this plan pays for itself: about <b>{usd(mid.profit)}</b> profit.{p.next && p.next.profit > 0 ? <> The next {usd(p.next.step)} would add about {usd(p.next.profit)} more.</> : p.next ? <> The next {usd(p.next.step)} would not pay — this is about the right budget.</> : null}</>
              : <>At these rates the plan costs about <b>{usd(-mid.profit)}</b> to run. {lvl === 0 ? "Treat that as the price of finding out which audience and message clear break-even — then scale that one." : "It is below break-even."}{p.needCvr != null && <> To break even, about <b>{(p.needCvr * 100).toFixed(1)} in 100</b> clickers must buy; the plan assumes {(rates.cvr.cold[1] * 100).toFixed(1)}.</>}</>}</span>
          </div>

          <div className="card" style={{ padding: "16px 18px" }}>
            <div className="row between" style={{ marginBottom: 6 }}><span className="sm w5">Where the budget goes</span><span className="xs i3">{p.rows.length} campaign{p.rows.length === 1 ? "" : "s"} · each gets enough to read a result</span></div>
            {p.rows.map((r) => (
              <div key={r.c.key} className="col g8" style={{ padding: "14px 0", borderTop: "1px solid var(--line)" }}>
                <div className="row top between g12">
                  <span className="col g2 fill" style={{ minWidth: 0 }}>
                    <span className="row g8"><span className="sm w5 i1">{r.c.name}</span><span className="pill" style={{ height: 18, fontSize: 10 }}>{KIND[r.c.kind]}</span>{r.c.audience ? <span className="xs i3">{people(r.c.audience)} people</span> : null}{r.stockLimited && <span className="pill" style={{ height: 18, fontSize: 10, background: "#FBF1DC", color: "#7A5A12" }}>Stock is the limit</span>}</span>
                    <span className="xs i3 ell">{r.c.product} · {r.c.why}</span>
                  </span>
                  <span className="col" style={{ alignItems: "flex-end", flexShrink: 0 }}><span className="tnum" style={{ fontSize: 17, fontWeight: 600 }}>{usd(r.spend)}</span><span className="xs i3">{Math.round(r.share * 100)}% of budget</span></span>
                </div>
                <div style={{ height: 6, borderRadius: 99, background: "var(--tray-2)" }}><div style={{ height: "100%", width: `${r.share * 100}%`, borderRadius: 99, background: "var(--ink)", transition: "width .3s" }} /></div>
                <div className="row g16 xs" style={{ flexWrap: "wrap" }}>
                  <span className="i2"><span className="i3">Orders</span> <b className="tnum">{Math.round(r.out[1].orders)}</b> <span className="i3">({Math.round(r.out[0].orders)}–{Math.round(r.out[2].orders)})</span></span>
                  <span className="i2"><span className="i3">Revenue</span> <b className="tnum">{usd(r.out[1].revenue)}</b> <span className="i3">({usd(r.out[0].revenue)}–{usd(r.out[2].revenue)})</span></span>
                  <span className="i2"><span className="i3">Profit</span> <b className="tnum" style={{ color: r.out[1].profit >= 0 ? "#1F7A52" : "#B4532A" }}>{usd(r.out[1].profit)}</b></span>
                  <span className="fill" />
                  <Link className="lnk row g4" href={`${base}/creative`} style={{ whiteSpace: "nowrap" }}>Make the ads<Icon name="arrow-r" size={10} /></Link>
                </div>
              </div>
            ))}
            {p.unfunded.length > 0 && <div className="col g4" style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
              <span className="xs i3">Not funded at this budget</span>
              {p.unfunded.map((u) => <span key={u.c.key} className="row between xs"><span className="i2">{u.c.name}</span><span className="i3">{u.reason.replace(/(\d[\d,]*)/, (m) => usd(Number(m.replace(/,/g, ""))))}</span></span>)}
            </div>}
          </div>

          {actions.length > 0 && <div className="col g8">
            <span className="sm w5">Do next</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
              {actions.slice(0, 3).map((a) => (
                <div key={a.title} className="card col g6" style={{ padding: 14 }}>
                  <span className="row g6"><Icon name={a.tone === "warn" ? "warning" : "sparkle"} size={13} color={a.tone === "warn" ? "#B4832A" : "#1AA7C8"} /><span className="sm w5 i1">{a.title}</span></span>
                  <span className="xs i2" style={{ lineHeight: "17px" }}>{a.why}</span>
                  {a.href && <Link className="lnk xs row g4" href={a.href} style={{ whiteSpace: "nowrap", alignSelf: "flex-start" }}>{a.label}<Icon name="arrow-r" size={10} /></Link>}
                </div>))}
            </div>
          </div>}

          <div className="row g10" style={{ padding: 14, borderRadius: 12, background: "#fff", boxShadow: "0 0 0 1px var(--line)" }}>
            <span className="col fill"><span className="sm w5 i1">{approved ? "Plan approved" : "Happy with this plan?"}</span><span className="xs i3">{approved ? `${approved} — make the ads for each campaign, then test them before any spend.` : "Approving saves it. Kaviar then prepares each campaign for you to review — nothing is spent yet."}</span></span>
            <button type="button" className="btn dark" disabled={saving || !p.rows.length} onClick={approve}>{saving ? <Icon name="spinner" size={13} className="spin" color="#fff" /> : <Icon name="check" size={13} color="#fff" />}{approved ? "Approve again" : "Approve plan"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
