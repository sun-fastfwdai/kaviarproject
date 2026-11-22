"use client";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { AgentFace } from "@/components/agent";
import { Modal } from "@/components/modal";
import { Combo } from "@/components/combo";
import { LEVEL, levelOf, ordersNeeded, plan, ratesFrom, type Rates, type Tri } from "@/lib/growth/plan";
import type { PlanData } from "@/lib/growth/plan-data";
import { approvePlan } from "./actions";

/**
 * Budget. One choice — how much — offered as three sizes worked out for this brand, or its own figure. Below it, what that size brings
 * back and how the sum is reached, where the money goes, and one bar to say yes. The figures every number rests on (product, margin,
 * offer, goal, rates) live in one modal. Numbers are arithmetic on the brand's data; with no ad history it says so.
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
/** The estimate as a chain: each box is the one before it times a rate, so nothing is a black box. */
function Funnel({ steps }: { steps: { v: string; k: string; how: string; end?: boolean }[] }) {
  return (
    <div className="row" style={{ alignItems: "stretch", gap: 0, flexWrap: "wrap", rowGap: 8 }}>
      {steps.map((x, i) => (
        <div key={x.k} className="row fill" style={{ minWidth: 104 }}>
          <div className="col g2 fill" style={{ padding: "10px 12px", borderRadius: 12, background: x.end ? "#E7F4EC" : "var(--tray)", boxShadow: x.end ? "0 0 0 1px #BFE0CC" : "none", minWidth: 0 }}>
            <span className="tnum ell" style={{ fontSize: 20, lineHeight: "24px", fontWeight: 600, letterSpacing: "-0.01em", color: x.end ? GOOD : "var(--ink)" }}>{x.v}</span>
            <span className="xs i1 ell">{x.k}</span>
            <span style={{ fontSize: 10.5, lineHeight: "14px", color: "var(--ink-3)" }}>{x.how}</span>
          </div>
          {i < steps.length - 1 && <span aria-hidden className="i3" style={{ width: 22, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>→</span>}
        </div>))}
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

  // Three ready sizes, each worked out from the same numbers: the smallest test that can be read, the size Iris would pick — the one
  // that earns most at the likely rates once there is ad history, enough to compare audiences before that — and double it.
  const sizeOf = (b: number) => { const q = plan({ budget: b, days, goal, discount, margin, repeat, rates, candidates }, false); return { budget: b, mid: q.total[1], cells: q.cells }; };
  const round50 = (v: number) => Math.max(50, Math.round(v / 50) * 50), small = round50(p.minToLearn);
  // Iris never suggests more than doubling what the brand spends today: the rates were measured at today's size, and they slip as spend grows.
  const nowPace = data.history && data.history.days > 0 ? (data.history.spend / data.history.days) * days : null, cap = nowPace && nowPace > 0 ? round50(nowPace * 2) : null;
  const best = lvl >= 1 && p.suggested ? p.suggested : null, capped = best != null && cap != null && best > cap;
  const pickAt = best != null ? (capped ? cap! : best) : round50(p.minToLearn * Math.min(3, Math.max(1, candidates.length)));
  const sizes = useMemo(() => ([["Careful", "The smallest test you can read", small], ["Iris’s pick", capped ? "Twice what you spend now" : lvl >= 1 ? "Earns the most at your rates" : "Enough to compare audiences", Math.max(pickAt, small + 50)], ["Push", "Twice the pick", Math.max(pickAt, small + 50) * 2]] as const).map(([name, why, b]) => ({ name, why, ...sizeOf(b) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [small, pickAt, capped, days, goal, discount, margin, repeat, rates, candidates, lvl]);
  const figures: [string, string][] = [["Product", `${product || "–"} · ${usd(order)} an order`], ["Margin", `${Math.round(margin * 100)}%${data.margin.from === "costs" ? " · from Shopify costs" : data.margin.from === "none" ? " · assumed" : ""}`], ["Offer", discount ? `${Math.round(discount * 100)}% off` : "Full price"], ["Goal", goal === "profit" ? "Profit" : goal === "revenue" ? "Revenue" : "New customers"],
    ["Rates", data.history ? `From ${data.history.days} days of your ads` : edited ? "Your own figures" : "Starting assumptions"]];

  return (
    <div className="scroll" style={{ padding: "22px 24px 96px" }}>
      <div className="col g16" style={{ width: "100%" }}>
        <div className="row between g12" style={{ flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="col g6">
            <h1 className="h1">Budget</h1>
            <span className="row g8 sm i2"><AgentFace kind="analyst" size={20} /><span>Iris suggests <b className="i1 w5 tnum">{usd(sizes[1].budget)}</b> over {days / 7} weeks — about <b className="i1 w5 tnum">{usd(sizes[1].mid.revenue)}</b> back, <b className="tnum w5" style={{ color: sizes[1].mid.profit >= 0 ? GOOD : BAD }}>{sizes[1].mid.profit >= 0 ? "+" : "−"}{usd(Math.abs(sizes[1].mid.profit))}</b> after costs</span></span>
          </div>
          <span className="row g8">
            <span className={`pill${lvl === 2 ? " green" : ""}`} style={lvl === 0 ? { background: "#FBF1DC", color: "#7A5A12" } : undefined} title={data.history ? `Worked out from ${data.history.days} days of your own Meta results` : "No ad results here yet — these start from typical rates and are replaced by your own as ads run"}>{LEVEL[lvl]}{lvl === 0 ? " · not a forecast" : ""}</span>
            <div className="seg" role="radiogroup" aria-label="Period">{([[14, "2 weeks"], [28, "4 weeks"], [56, "8 weeks"]] as const).map(([d, n]) => <button key={d} type="button" role="radio" aria-checked={days === d} className={`o${days === d ? " on" : ""}`} onClick={() => setDays(d)}>{n}</button>)}</div>
          </span>
        </div>

        {/* ---- one choice: how much. Three sizes worked out for this brand, or its own figure */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12 }}>
          {sizes.map((z, n) => { const on = budget === z.budget, win = z.mid.profit >= 0; return (
            <button key={z.name} type="button" aria-pressed={on} onClick={() => setBudget(z.budget)} className="col g8" style={{ padding: "16px 18px", borderRadius: 18, textAlign: "left", background: on ? "#121212" : "#fff", color: on ? "#fff" : "var(--ink)", boxShadow: on ? "0 10px 26px rgba(18,18,18,.18)" : "0 0 0 1px var(--line)", transition: "background .15s ease, box-shadow .15s ease" }}>
              <span className="row between g8"><span className="row g6" style={{ fontSize: 12.5, fontWeight: 500, color: on ? "rgba(255,255,255,.75)" : "var(--ink-2)" }}>{n === 1 && <AgentFace kind="analyst" size={16} />}{z.name}</span>{on && <Icon name="check-circle" size={16} weight="fill" color="#6EE7A8" />}</span>
              <span className="row g8" style={{ alignItems: "baseline", flexWrap: "wrap" }}>
                <span className="tnum" style={{ fontSize: 30, lineHeight: "36px", fontWeight: 600, letterSpacing: "-0.03em" }}>{usd(z.budget)}</span>
                <span aria-hidden style={{ color: on ? "rgba(255,255,255,.4)" : "var(--ink-3)" }}>→</span>
                <span className="tnum" style={{ fontSize: 18, fontWeight: 600, color: on ? "rgba(255,255,255,.85)" : "var(--ink-2)" }}>{usd(z.mid.revenue)}</span>
              </span>
              <span className="row between g8" style={{ fontSize: 12 }}>
                <span className="tnum w5" style={{ color: win ? (on ? "#6EE7A8" : GOOD) : (on ? "#FF9B73" : BAD) }}>{win ? "+" : "−"}{usd(Math.abs(z.mid.profit))} profit</span>
                <span style={{ color: on ? "rgba(255,255,255,.55)" : "var(--ink-3)" }}>{z.cells} audience{z.cells === 1 ? "" : "s"} · {z.why}</span>
              </span>
            </button>); })}
          <div className="col g8" style={{ padding: "16px 18px", borderRadius: 18, background: "var(--tray)" }}>
            <span style={{ fontSize: 12.5, fontWeight: 500, color: "var(--ink-2)" }}>Your own figure</span>
            <div className="input" style={{ height: 44, background: "#fff" }}><span className="i3" style={{ fontSize: 18 }}>$</span><input type="number" min={0} step={50} value={budget || ""} onChange={(e) => setBudget(Math.max(0, Number(e.target.value)))} aria-label="Budget" style={{ ...field, fontSize: 20, fontWeight: 600 }} /></div>
            <span className="xs i3">{usd(budget / Math.max(1, days))} a day</span>
          </div>
        </div>

        {/* ---- what that budget works out to */}
        <div className="card" style={{ padding: 20 }}>
          <div className="row top between g16" style={{ flexWrap: "wrap" }}>
            <div className="col g2"><span className="xs i3">{usd(budget)} over {days / 7} weeks likely brings back</span><span className="tnum" style={{ fontSize: 46, lineHeight: "52px", fontWeight: 600, letterSpacing: "-0.03em" }}>{usd(mid.revenue)}</span></div>
            <div className="row g20">
              {([["If it goes badly", lo], ["Likely", mid], ["If it goes well", hi]] as [string, typeof mid][]).map(([k, o]) => <div key={k} className="col g2"><span className="xs i3">{k}</span><span className="tnum" style={{ fontSize: 19, fontWeight: 600 }}>{usd(o.revenue)}</span>
                <span className="tnum xs w5" style={{ color: o.profit >= 0 ? GOOD : BAD }}>{o.profit >= 0 ? "+" : "−"}{usd(Math.abs(o.profit))} profit</span></div>)}
            </div>
          </div>
          <div className="col g10" style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
            <Funnel steps={[
              { v: usd(mid.spend), k: "ad spend", how: `${p.rows.length} audience${p.rows.length === 1 ? "" : "s"}` },
              { v: people(mid.seen), k: "see an ad", how: `$${rates.cpm[1].toFixed(0)} per 1,000 views` },
              { v: Math.round(mid.clicks).toLocaleString("en-US"), k: "click", how: `${(rates.ctr[1] * 100).toFixed(1)}% of viewers` },
              { v: String(Math.round(mid.orders)), k: "buy", how: mid.clicks > 0 ? `${((mid.orders / mid.clicks) * 100).toFixed(1)}% of clickers` : "" },
              { v: usd(mid.revenue), k: "revenue", how: `${Math.round(mid.orders)} orders × ${usd(order * (1 - discount))}${repeat > 0 ? ", plus repeats" : ""}`, end: true },
            ]} />
            <div className="row g8 sm" style={{ flexWrap: "wrap", alignItems: "center" }}>
              <span className="chip" style={{ height: 26 }}>{usd(mid.revenue)} revenue</span><span className="i3">−</span>
              <span className="chip" style={{ height: 26 }}>{usd(mid.spend)} ads</span><span className="i3">−</span>
              <span className="chip" style={{ height: 26 }} title={`${Math.round((1 - margin) * 100)}% of the price goes on making the product`}>{usd(mid.cost)} product cost</span><span className="i3">=</span>
              <span className="tnum w5" style={{ fontSize: 17, color: pays ? GOOD : BAD }}>{mid.profit >= 0 ? "+" : "−"}{usd(Math.abs(mid.profit))} profit</span>
            </div>
          </div>
          <Gauge roas={p.roas} breakEven={p.breakEven} />
        </div>

        {!pays && <div className="row g12" style={{ padding: "12px 14px", borderRadius: 14, background: "#FBECE5", flexWrap: "wrap" }}>
          <Icon name="warning-circle" size={18} weight="fill" color={BAD} />
          <span className="col fill" style={{ minWidth: 240 }}>
            <span className="sm w5" style={{ color: BAD }}>This doesn’t pay yet — about {usd(-mid.profit)} short</span>
            <span className="xs i2">{noFix ? `Nothing in the catalogue pays back at these rates: about ${p.needCvr != null ? (p.needCvr * 100).toFixed(1) : "more"} in 100 clickers must buy, and the plan assumes ${(rates.cvr.cold[1] * 100).toFixed(1)}.` : `Each order brings ${usd(order * (1 - discount))}${discount ? ` after ${Math.round(discount * 100)}% off` : ""}; ads need ${p.breakEven.toFixed(2)}× back to break even.`}</span>
          </span>
          {!noFix && <button type="button" className="btn dark" onClick={fix}><AgentFace kind="analyst" size={16} />Find a plan that pays</button>}
        </div>}

        {/* ---- the figures every number above rests on — changed in one place */}
        <div className="row g8" style={{ flexWrap: "wrap", alignItems: "stretch" }}>
          {figures.map(([k, v]) => (
            <button key={k} type="button" onClick={() => setOpen(true)} className="col hv" style={{ padding: "9px 13px", borderRadius: 12, background: "#fff", boxShadow: "0 0 0 1px var(--line)", textAlign: "left", minWidth: 0, maxWidth: 300 }}>
              <span className="xs i3">{k}</span><span className="sm w5 ell" style={{ maxWidth: 270 }}>{v}</span>
            </button>))}
          <button type="button" className="btn quiet" style={{ alignSelf: "center" }} onClick={() => setOpen(true)}><Icon name="pencil" size={12} />Change</button>
        </div>

        {/* ---- where the money goes */}
        <div className="card" style={{ padding: "14px 18px 6px" }}>
          <div className="row between g12" style={{ paddingBottom: 8 }}><span className="h3">Where it goes</span><Link className="btn quiet sm" href={`${base}/campaigns`}>All campaigns<Icon name="arrow-r" size={11} /></Link></div>
          {p.rows.map((r) => { const pic = data.products.find((x) => x.title === r.c.product)?.image ?? null, o = r.out[1]; return (
            <div key={r.c.key} className="row g14" style={{ padding: "12px 0", borderTop: "1px solid var(--line)", flexWrap: "wrap" }}>
              {pic
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={pic} alt="" width={44} height={44} loading="lazy" style={{ borderRadius: 10, objectFit: "cover", flexShrink: 0, background: "var(--tray-2)", boxShadow: "0 0 0 1px var(--line)" }} />
                : <span style={{ width: 44, height: 44, borderRadius: 10, background: "var(--tray-2)", flexShrink: 0 }} />}
              <span className="col fill" style={{ minWidth: 220 }}>
                <span className="row g8"><span className="sm w5 ell" title={r.c.why}>{r.c.name}</span>{r.stockLimited && <span className="pill" style={{ height: 18, fontSize: 10, background: "#FBF1DC", color: "#7A5A12" }}>Limited by stock</span>}</span>
                <span className="xs i3 ell">{KIND[r.c.kind]}{r.c.audience ? ` · ${people(r.c.audience)} people` : ""} · {r.c.product}</span>
              </span>
              <span className="col" style={{ width: 150 }}><span className="row between xs"><span className="tnum w5">{usd(r.spend)}</span><span className="i3 tnum">{Math.round(r.share * 100)}%</span></span>
                <span style={{ height: 5, borderRadius: 99, background: "var(--tray-2)", marginTop: 5 }}><span style={{ display: "block", height: "100%", width: `${r.share * 100}%`, borderRadius: 99, background: "var(--ink)", transition: "width .3s" }} /></span></span>
              <span className="col" style={{ width: 150, alignItems: "flex-end" }}><span className="sm w5 tnum">{usd(o.revenue)} back</span><span className="xs tnum" style={{ color: o.profit >= 0 ? GOOD : BAD }}>{o.profit >= 0 ? "+" : "−"}{usd(Math.abs(o.profit))} · {Math.round(o.orders)} order{Math.round(o.orders) === 1 ? "" : "s"}</span></span>
            </div>); })}
          {p.unfunded.length > 0 && <span className="row g6 xs i3" style={{ padding: "10px 0", borderTop: "1px solid var(--line)" }} title={p.unfunded.map((u) => u.c.name).join(" · ")}><Icon name="info" size={12} />{p.unfunded.length} more audience{p.unfunded.length === 1 ? "" : "s"} wait for a bigger budget — each needs about {usd(p.minToLearn)} to give a result you can read</span>}
        </div>

        {actions.length > 0 && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
          {actions.slice(0, 3).map((a) => (
            <div key={a.title} className="col g4" style={{ padding: "12px 14px", borderRadius: 14, background: a.tone === "warn" ? "var(--amber-bg)" : "var(--tray)" }}>
              <span className="sm w5 i1">{a.title}</span>
              <span className="xs i2" title={a.why} style={{ lineHeight: "17px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{a.why}</span>
              {a.href && <Link className="lnk xs row g4" href={a.href} style={{ whiteSpace: "nowrap", alignSelf: "flex-start" }}>{a.label}<Icon name="arrow-r" size={10} /></Link>}
            </div>))}
        </div>}
      </div>

      {/* ---- one yes, always in reach */}
      <div style={{ position: "sticky", bottom: 16, marginTop: 18, width: "100%", zIndex: 5 }}>
        <div className="row g12" style={{ padding: "10px 12px 10px 18px", borderRadius: 99, background: "#121212", color: "#fff", boxShadow: "0 14px 34px rgba(18,18,18,.22)", flexWrap: "wrap" }}>
          <span className="col fill" style={{ minWidth: 200, lineHeight: 1.3 }}><span className="sm w5 tnum">{usd(budget)} over {days / 7} weeks · {mid.profit >= 0 ? "+" : "−"}{usd(Math.abs(mid.profit))} likely</span>
            <span style={{ fontSize: 11.5, color: "rgba(255,255,255,.6)" }}>{approved ? `Approved · ${approved}` : "Nothing is spent by approving — each campaign is switched on by you"}</span></span>
          <button type="button" disabled={saving || !p.rows.length} onClick={approve} className="row g6" style={{ height: 38, padding: "0 18px", borderRadius: 99, background: "#34C77B", color: "#0B2B1A", fontSize: 13.5, fontWeight: 600 }}>{saving ? <Icon name="spinner" size={13} className="spin" color="#0B2B1A" /> : <Icon name="check" size={13} color="#0B2B1A" />}{approved ? "Approve this instead" : "Approve budget"}</button>
        </div>
      </div>

      {open && <Modal icon={<Icon name="pencil" size={16} />} title="Your figures" sub="Every number on this page — and on each campaign — is worked out from these." onClose={() => setOpen(false)} width={520}
        footer={<><span className="fill">{edited && <button type="button" className="btn quiet" onClick={() => { setCpm(own.cpm[1]); setCtr(own.ctr[1]); setCvr(own.cvr.cold[1]); }}>Reset the rates</button>}</span><button type="button" className="btn dark" onClick={() => setOpen(false)}>Done</button></>}>
        <div className="col g14">
          {data.products.length > 0 && <div className="col g4"><span className="xs i2 w5">Product the ads sell</span>
            <Combo label="Product to advertise" searchText="Search products" value={product} onChange={pick} items={data.products.map((x) => ({ value: x.title, label: x.title, image: x.image, sub: usd(x.price), right: `${x.stock.toLocaleString("en-US")} in stock` }))} /></div>}
          <div className="row g12" style={{ flexWrap: "wrap" }}>
            <label className="col g4 fill" style={{ minWidth: 150 }}><span className="xs i2 w5">One order is worth</span>
              <div className="input"><span className="i3">$</span><input type="number" min={1} value={Math.round(order) || ""} onChange={(e) => setOrder(Math.max(0, Number(e.target.value)))} aria-label="Order value" style={field} /></div>
              {avg != null && order !== avg && <button type="button" className="lnk xs" style={{ alignSelf: "flex-start" }} onClick={() => setOrder(avg)}>Use your average, {usd(avg)}</button>}</label>
            <label className="col g4 fill" style={{ minWidth: 150 }}><span className="xs i2 w5" title="What is left of the price after making the product">Margin</span>
              <div className="input"><input type="number" min={5} max={95} value={Math.round(margin * 100)} onChange={(e) => setMargin(Math.min(0.95, Math.max(0.05, Number(e.target.value) / 100)))} aria-label="Margin percent" style={field} /><span className="i3">%</span></div>
              <span className="xs i3">{data.margin.from === "costs" ? `From ${data.margin.withCost} of ${data.margin.variants} costs in Shopify` : data.margin.from === "saved" ? "Your figure" : "Assumed until you set it"}</span></label>
          </div>
          <div className="col g4"><span className="xs i2 w5">Offer</span>
            <div className="seg" style={{ alignSelf: "flex-start" }}>{[0, 0.1, 0.15, 0.2, 0.3].map((d) => <button key={d} type="button" className={`o${discount === d ? " on" : ""}`} onClick={() => setDiscount(d)}>{d ? `${Math.round(d * 100)}% off` : "Full price"}</button>)}</div></div>
          <div className="col g4"><span className="xs i2 w5">Goal</span>
            <div className="seg" style={{ alignSelf: "flex-start" }}>{([["profit", "Profit"], ["revenue", "Revenue"], ["customers", "New customers"]] as const).map(([k, n]) => <button key={k} type="button" className={`o${goal === k ? " on" : ""}`} onClick={() => setGoal(k)}>{n}</button>)}</div></div>
          <div className="col g8" style={{ paddingTop: 12, borderTop: "1px solid var(--line)" }}>
            <span className="xs i2 w5">Rates <span className="i3" style={{ fontWeight: 400 }}>· {data.history ? `from ${data.history.days} days of your Meta results` : "typical starting points until your ads have run"}</span></span>
            {([["Cost per 1,000 views", cpm, (v: number) => setCpm(Math.max(1, v)), "$", 1], ["People who click", ctr * 100, (v: number) => setCtr(Math.max(0.0005, v / 100)), "%", 0.1], ["Clickers who buy · new audience", cvr * 100, (v: number) => setCvr(Math.max(0.0005, v / 100)), "%", 0.1]] as [string, number, (v: number) => void, string, number][]).map(([n, v, set, unit, st]) => (
              <label key={n} className="row between g8"><span className="sm i2">{n}</span>
                <span className="input" style={{ width: 104, height: 32 }}><input type="number" step={st} value={Number(v.toFixed(2))} onChange={(e) => set(Number(e.target.value))} aria-label={n} style={{ ...field, fontSize: 13 }} /><span className="i3 xs">{unit}</span></span></label>))}
          </div>
        </div>
      </Modal>}
    </div>
  );
}
