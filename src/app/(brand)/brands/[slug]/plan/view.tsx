"use client";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { LEVEL, levelOf, ordersNeeded, plan, ratesFrom, type Rates, type Tri } from "@/lib/growth/plan";
import type { PlanData } from "@/lib/growth/plan-data";
import { approvePlan, makeAds } from "./actions";

/**
 * Spend plan. Left: what the brand decides — goal, budget, period, margin, offer. Right: what that works out to, recalculated on every
 * change — the range of what should come back, where the budget goes, and what to do next. Numbers are arithmetic on the brand's data;
 * with no ad history it says so and shows the assumptions it started from.
 */
const KIND = { cold: "New audience", lookalike: "Look-alike", warm: "Past buyers" } as const;
const people = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(Math.round(n)));

const GOOD = "#1F7A52", BAD = "#B4532A";
/** Return on ad spend against break-even, as a picture: red below the line, green above, the likely result marked and its range shaded. */
function Gauge({ roas, breakEven }: { roas: [number, number, number]; breakEven: number }) {
  const be = Number.isFinite(breakEven) ? breakEven : 10, max = Math.max(be * 2, roas[2] * 1.1, 1), at = (v: number) => `${Math.min(100, Math.max(0, (v / max) * 100))}%`, ok = roas[1] >= be;
  return (
    <div className="col g6" style={{ padding: "12px 0 4px", borderTop: "1px solid var(--line)" }}>
      <div className="row between"><span className="col"><span className="sm i1">Return on ad spend</span><span className="xs i3">Every $1 of ads brings back ${roas[1].toFixed(2)} · needs ${be.toFixed(2)} to break even</span></span>
        <span className="tnum" style={{ fontSize: 17, fontWeight: 600, color: ok ? GOOD : BAD }}>{roas[1].toFixed(2)}×</span></div>
      <div style={{ position: "relative", height: 26 }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 9, height: 8, borderRadius: 99, background: `linear-gradient(90deg, #F3C9B8 0, #F3C9B8 ${at(be)}, #BFE0CC ${at(be)}, #BFE0CC 100%)` }} />
        <div title="The range from a bad run to a good one" style={{ position: "absolute", left: at(roas[0]), width: `calc(${at(roas[2])} - ${at(roas[0])})`, top: 9, height: 8, borderRadius: 99, background: "rgba(18,18,18,.22)" }} />
        <div style={{ position: "absolute", left: at(be), top: 3, width: 2, height: 20, background: "var(--ink)", transform: "translateX(-1px)" }} />
        <div style={{ position: "absolute", left: at(roas[1]), top: 5, width: 16, height: 16, borderRadius: 99, background: ok ? GOOD : BAD, boxShadow: "0 0 0 3px #fff", transform: "translateX(-8px)", transition: "left .3s" }} />
      </div>
      <div className="row between xs"><span style={{ color: BAD }}>Loses money</span><span className="i3">Break-even {be.toFixed(2)}×</span><span style={{ color: GOOD }}>Makes money</span></div>
    </div>
  );
}
function Stat({ k, v, sub, tone }: { k: string; v: string; sub?: string; tone?: "good" | "bad" }) {
  return (
    <div className="row between" style={{ padding: "11px 0", borderTop: "1px solid var(--line)" }}>
      <span className="col"><span className="sm i1">{k}</span>{sub && <span className="xs i3">{sub}</span>}</span>
      <span className="tnum" style={{ fontSize: 17, fontWeight: 600, color: tone === "good" ? GOOD : tone === "bad" ? BAD : "var(--ink)" }}>{v}</span>
    </div>
  );
}

export function SpendPlan({ slug, data }: { slug: string; data: PlanData }) {
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
  const first = data.candidates[0], [product, setProduct] = useState(s.product ?? first?.product ?? data.products[0]?.title ?? "");
  const chosen = data.products.find((x) => x.title === product) ?? null;
  const avg = data.orders.count >= 10 && data.orders.aov ? Math.round(data.orders.aov) : null; // their real average order, once there are enough
  const [order, setOrder] = useState(s.order ?? avg ?? chosen?.price ?? first?.price ?? 0);
  const [noFix, setNoFix] = useState(false);
  const pick = (title: string) => { const x = data.products.find((y) => y.title === title); setProduct(title); if (x) setOrder(x.price); };
  const candidates = useMemo(() => data.candidates.map((c) => ({ ...c, product: chosen?.title ?? c.product, price: order > 0 ? order : c.price, stock: chosen ? chosen.stock : c.stock })), [data.candidates, chosen, order]);
  const [saving, start] = useTransition();
  const [making, setMaking] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const make = (key: string) => { setMaking(key); setErr(null); start(async () => { const r = await makeAds(slug, key); if (r?.error) { setErr(r.error); setMaking(null); } }); };
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
  if (!data.history) actions.push({ tone: "warn", title: "Bring in your past Meta ads", why: "No ad results here yet, so this is a scenario. Connect the ad account your ads ran on and your own results replace the starting assumptions.", href: `${base}/integrations`, label: "Integrations" });
  if (data.hero?.coverDays != null && data.hero.coverDays < 60) actions.push({ tone: "warn", title: `${data.hero.title}: about ${data.hero.coverDays} days of stock`, why: `${data.hero.stock.toLocaleString("en-US")} units at ${data.hero.sold30} sold in the last 30 days. Ads will shorten that — reorder before scaling.` });
  if (p.tooSmall) actions.push({ tone: "warn", title: `This budget is too small to learn from`, why: `One audience needs about ${usd(p.minToLearn)} to give a result you can read. Below that, a good ad and a bad one look the same.` });
  else if (p.unfunded.length) actions.push({ tone: "info", title: `Test ${p.cells} audience${p.cells === 1 ? "" : "s"} first, not ${p.cells + p.unfunded.length}`, why: `Each needs about ${usd(p.minToLearn)} to give a readable result. Spread thinner, none of them would.` });
  if (!pays && p.needCvr != null && p.needCvr > rates.cvr.cold[1]) { const need = Math.ceil((order * p.needCvr / rates.cvr.cold[1]) / 5) * 5; actions.unshift({ tone: "warn", title: `Sell a bigger order — about ${usd(need)}`, why: `At ${usd(order)} an order, ads can’t pay back at these rates. A set or bundle near ${usd(need)} would break even on the same clicks.` }); }
  if (discount > 0) actions.push({ tone: "info", title: `${Math.round(discount * 100)}% off needs ${Number.isFinite(ordersNeeded(margin, discount)) ? `${ordersNeeded(margin, discount).toFixed(1)}×` : "more than any number of"} the orders`, why: `To earn the same profit as full price. Break-even ROAS rises to ${p.breakEven.toFixed(2)}×.` });
  if (data.orders.count >= 10 && data.orders.tagged / data.orders.count < 0.5) actions.push({ tone: "info", title: "Tag every ad link", why: `${data.orders.tagged} of ${data.orders.count} orders can be traced to a campaign. Tagged links let results be matched to real orders.` });

  // "Show a plan that pays": full price, then the smallest real order that turns the likely case positive — their average order first,
  // then each product in the catalogue. Only things that exist; if none works, say so.
  const fix = () => {
    const tries = [...(avg && avg > order ? [{ title: product, value: avg }] : []), ...[...data.products].sort((x, y) => x.price - y.price).filter((x) => x.price > order * (1 - discount)).map((x) => ({ title: x.title, value: x.price }))];
    if (discount > 0) tries.unshift({ title: product, value: order });
    for (const t of tries) {
      const stock = data.products.find((x) => x.title === t.title)?.stock ?? null;
      const q = plan({ budget, days, goal, discount: 0, margin, repeat, rates, candidates: data.candidates.map((c) => ({ ...c, product: t.title, price: t.value, stock: stock ?? c.stock })) }, false);
      if (q.total[1].profit >= 0) { setDiscount(0); setProduct(t.title); setOrder(t.value); setNoFix(false); return; }
    }
    setNoFix(true);
  };
  const approve = () => start(async () => { const r = await approvePlan(slug, { margin, budget, days, goal, discount, product, order }, true); if (r.ok) setApproved("You · just now"); });

  return (
    <div className="scroll" style={{ padding: "22px 24px 40px" }}>
      <div className="col g4" style={{ marginBottom: 18 }}>
        <h1 className="h1">Spend plan</h1>
        <p className="sm i3">You set the budget. Kaviar works out where it goes and what comes back.</p>
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
              {lvl >= 1 && p.suggested != null && p.suggested !== budget && <button type="button" className="lnk xs" onClick={() => setBudget(p.suggested!)} title="The budget that earns the most at the likely rates — past it, the next dollar stops paying">Kaviar suggests {usd(p.suggested)}</button>}
            </div></div>
          {data.products.length > 0 && <div className="col g6"><span className="xs i3">Product to advertise · what one order is worth</span>
            <div className="row g8">
              <select value={product} onChange={(e) => pick(e.target.value)} aria-label="Product to advertise" className="input fill" style={{ font: "inherit", fontSize: 13, minWidth: 0 }}>
                {data.products.map((x) => <option key={x.title} value={x.title}>{x.title} — ${Math.round(x.price)}</option>)}
              </select>
              <div className="input" style={{ width: 96, flexShrink: 0 }}><span className="i3">$</span><input type="number" min={1} value={Math.round(order) || ""} onChange={(e) => setOrder(Math.max(0, Number(e.target.value)))} aria-label="Order value" style={field} /></div>
            </div>
            <span className="xs i3">{avg ? <>{order === avg ? `Your average across ${data.orders.count} orders.` : <>Your orders average {usd(avg)} · <button type="button" className="lnk" onClick={() => setOrder(avg)}>use it</button>.</>} </> : null}Pick a product to see a single-item order.</span></div>}
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
                {([["If it goes badly", lo], ["Likely", mid], ["If it goes well", hi]] as [string, typeof mid][]).map(([k, o]) => <div key={k} className="col g2"><span className="xs i3">{k}</span><span className="tnum" style={{ fontSize: 19, fontWeight: 600 }}>{usd(o.revenue)}</span>
                  <span className="tnum xs w5" style={{ color: o.profit >= 0 ? GOOD : BAD }}>{o.profit >= 0 ? "+" : "−"}{usd(Math.abs(o.profit))} profit</span></div>)}
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <Stat k="Ad spend" v={usd(mid.spend)} />
              <Stat k="Product cost" sub={`${Math.round(mid.orders)} orders likely (${Math.round(lo.orders)}–${Math.round(hi.orders)})`} v={usd(mid.cost)} />
              <Stat k="Expected profit" sub={pays ? "After ad spend and product cost" : "Ads cost more than they bring back"} v={`${mid.profit >= 0 ? "+" : "−"}${usd(Math.abs(mid.profit))}`} tone={pays ? "good" : "bad"} />
              <Gauge roas={p.roas} breakEven={p.breakEven} />
            </div>
          </div>

          <div className="row g12" style={{ padding: "12px 14px", borderRadius: 12, background: pays ? "#E7F4EC" : "#FBECE5", boxShadow: `0 0 0 1px ${pays ? "#BFE0CC" : "#F1CDBE"}` }}>
            <span style={{ width: 30, height: 30, borderRadius: 99, background: pays ? GOOD : BAD, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name={pays ? "check" : "warning"} size={15} color="#fff" /></span>
            <span className="col fill" style={{ minWidth: 0 }}>
              <span className="sm w5" style={{ color: pays ? GOOD : BAD }}>{pays ? `This plan pays: about ${usd(mid.profit)} profit` : `This plan doesn’t pay yet: about ${usd(-mid.profit)} short`}</span>
              <span className="xs i2" style={{ lineHeight: "17px" }}>{pays
                ? lvl === 0 ? "If the starting rates hold. Run it small first — your own results replace the assumptions within two weeks." : p.next && p.next.profit > 0 ? `The next ${usd(p.next.step)} would add about ${usd(p.next.profit)} more.` : "More budget would not add profit — this is about the right size."
                : noFix ? `Nothing in the catalogue pays back at these rates. About ${p.needCvr != null ? (p.needCvr * 100).toFixed(1) : "more"} in 100 clickers must buy; the plan assumes ${(rates.cvr.cold[1] * 100).toFixed(1)}.` : `Each order brings ${usd(order * (1 - discount))}${discount ? ` after ${Math.round(discount * 100)}% off` : ""}; ads need ${p.breakEven.toFixed(2)}× back to break even.`}</span>
            </span>
            {!pays && !noFix && <button type="button" className="btn dark" onClick={fix} style={{ flexShrink: 0 }}>Show a plan that pays</button>}
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
                  <span className="i2"><span className="i3">Profit</span> <b className="tnum" style={{ color: r.out[1].profit >= 0 ? GOOD : BAD }}>{r.out[1].profit >= 0 ? "+" : "−"}{usd(Math.abs(r.out[1].profit))}</b></span>
                  <span className="fill" />
                  <button type="button" className="lnk row g4" disabled={making != null} onClick={() => make(r.c.key)} style={{ whiteSpace: "nowrap" }}>{making === r.c.key ? "Remy is writing the ads…" : "Make the ads"}<Icon name={making === r.c.key ? "spinner" : "arrow-r"} size={10} className={making === r.c.key ? "spin" : undefined} /></button>
                </div>
              </div>
            ))}
            {p.unfunded.length > 0 && <div className="col g4" style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
              <span className="xs i3">Not funded at this budget</span>
              {p.unfunded.map((u) => <span key={u.c.key} className="row between xs"><span className="i2">{u.c.name}</span><span className="i3">{u.reason.replace(/(\d[\d,]*)/, (m) => usd(Number(m.replace(/,/g, ""))))}</span></span>)}
            </div>}
          </div>

          {err && <span className="xs c-amber">{err}</span>}
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
            <span className="col fill"><span className="sm w5 i1">{approved ? "Plan approved" : "Happy with this plan?"}</span><span className="xs i3">{approved ? `${approved} · next steps are on Today` : "Nothing is spent yet — you review every ad first."}</span></span>
            <button type="button" className="btn dark" disabled={saving || !p.rows.length} onClick={approve}>{saving ? <Icon name="spinner" size={13} className="spin" color="#fff" /> : <Icon name="check" size={13} color="#fff" />}{approved ? "Approve again" : "Approve plan"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
