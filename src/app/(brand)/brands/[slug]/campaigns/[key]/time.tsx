"use client";
import { useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import type { Candidate, PlanInput } from "@/lib/growth/plan";
import { timeline } from "@/lib/growth/timeline";

/**
 * The same budget over one, three or six months. Profit is what is being chased; the stock and the deadline are the limits. Each
 * column says what sells without ads, what the ads add, the offer that earns the most by that date, what is left, and how the
 * testing goes at that pace. A filled dot marks a number read from the brand's own data; a ring marks one that rests on an assumption.
 */
const NAME: Record<number, string> = { 30: "1 month", 90: "3 months", 180: "6 months" };
const label = { fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600 } as const;
const LIFTS: [number, string][] = [[1, "10% more"], [2, "20% more"], [3, "30% more"]];

export function TimeCard({ c, budget, input, minToLearn, stock, units30, cycle, level, usd, unitPrice }: {
  unitPrice: number | null; // the product's own price; an ad's order is worth c.price, the brand's figure for a whole order
  c: Candidate; budget: number; input: Omit<PlanInput, "candidates">; minToLearn: number; stock: number | null; units30: number | null; cycle: number | null; level: 0 | 1 | 2; usd: (v: number) => string;
}) {
  const [lift, setLift] = useState(2);
  const t = useMemo(() => timeline({ c, budget, input, stock, pace: (units30 ?? 0) / 30, minToLearn, cycle: cycle ?? 7, lift, unitPrice: unitPrice ?? undefined }), [c, budget, input, stock, units30, minToLearn, cycle, lift, unitPrice]);
  const n = (v: number) => Math.round(v).toLocaleString("en-US"), own = level > 0;
  const Dot = ({ real }: { real: boolean }) => <span aria-label={real ? "From your data" : "Rests on an assumption"} style={{ width: 7, height: 7, borderRadius: 99, flexShrink: 0, ...(real ? { background: "currentColor", opacity: 0.55 } : { boxShadow: "inset 0 0 0 1.5px currentColor", opacity: 0.6 }) }} />;
  return (
    <div className="col g12" style={{ padding: "16px 18px", borderRadius: 18, background: "#fff", boxShadow: "0 0 0 1px var(--line)" }}>
      <div className="row between g12" style={{ flexWrap: "wrap" }}>
        <span className="row g8"><Icon name="calendar" size={14} color="#8B8883" /><span className="i3" style={label}>The same {usd(budget)} over more time</span></span>
        <span className="xs i3">{stock != null ? `${n(stock)} in stock` : "Stock isn’t counted"}{units30 != null ? ` · sells ${n(units30)} a month without ads` : ""}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
        {t.rows.map((r, i) => {
          const on = i === t.best, dim = on ? "rgba(255,255,255,.6)" : "var(--ink-3)", line = on ? "rgba(255,255,255,.14)" : "var(--line)";
          const rows: [string, string, boolean, string?][] = [
            ["Sells without ads", n(r.organic), units30 != null, `Your own pace of sales over these days${unitPrice ? `, at ${usd(unitPrice)} each` : ""}`],
            ["The ads add", `${n(r.ads)} order${Math.round(r.ads) === 1 ? "" : "s"}`, own, `${own ? "From your own ad results" : "From starting rates — your own results replace them once ads have run"} · ${usd(c.price)} an order`],
            ["Offer that earns most", r.discount ? `${Math.round(r.discount * 100)}% off` : "Full price", false, r.discount ? `Adds ${usd(r.profit - r.fullProfit)} over full price, if a discount sells as assumed below` : "A discount would earn less"],
            [stock != null ? "Sold · left" : "Sold", stock != null ? `${n(r.sold)} · ${r.clears ? "none left" : `${n(r.left ?? 0)} left`}` : n(r.sold), false],
            ["Tests", r.tests === 0 ? "Too small to read" : r.rounds > 1 ? `${r.rounds} rounds, one after another` : r.tests > 1 ? `${r.tests} at once` : "1", own, `One readable test costs about ${usd(minToLearn)}. The budget buys ${r.tests}; with ${cycle ?? 7} days a round, ${r.rounds} can follow one another by this date.`],
            ["First result you can read", r.readDay ? `day ${r.readDay}` : "not by this date", own, `At ${usd(r.daily)} a day`],
          ];
          return (
            <div key={r.days} className="col" style={{ padding: "14px 16px 8px", borderRadius: 16, background: on ? "#121212" : "var(--tray)", color: on ? "#fff" : "var(--ink)" }}>
              <span className="row between g8"><span style={{ fontSize: 15, fontWeight: 600 }}>{NAME[r.days] ?? `${r.days} days`}</span>
                {on ? <span style={{ height: 20, padding: "0 9px", borderRadius: 99, fontSize: 11, fontWeight: 600, lineHeight: "20px", background: "rgba(110,231,168,.2)", color: "#8BE8B4" }}>Earns the most</span> : <span className="tnum" style={{ fontSize: 12, color: dim }}>{usd(r.daily)} a day</span>}</span>
              <span className="row g6" style={{ alignItems: "baseline", padding: "6px 0 10px" }}>
                <span className="tnum" style={{ fontSize: 30, lineHeight: "36px", fontWeight: 600, letterSpacing: "-0.03em", color: r.profit >= 0 ? (on ? "#6EE7A8" : "var(--green)") : (on ? "#FF9B73" : "var(--red)") }}>{r.profit >= 0 ? "+" : "−"}{usd(Math.abs(r.profit))}</span>
                <span style={{ fontSize: 12, color: dim }}>profit · store and ads</span></span>
              {rows.map(([k, v, real, hint]) => (
                <span key={k} className="row between g10" title={hint} style={{ padding: "7px 0", borderTop: `1px solid ${line}`, fontSize: 12.5 }}>
                  <span className="row g6" style={{ color: dim }}><Dot real={real} />{k}</span><span className="tnum w5" style={{ textAlign: "right" }}>{v}</span></span>))}
            </div>);
        })}
      </div>
      <div className="row g10 xs i3" style={{ flexWrap: "wrap" }}>
        <span className="row g6"><span style={{ width: 7, height: 7, borderRadius: 99, background: "var(--ink-3)" }} />From your data</span>
        <span className="row g6"><span style={{ width: 7, height: 7, borderRadius: 99, boxShadow: "inset 0 0 0 1.5px var(--ink-3)" }} />Assumed</span>
        <span className="row g6" title="Kaviar has no measure yet of how your buyers answer a discount, so this is yours to set">Every 10% off sells
          <span className="seg" role="radiogroup" aria-label="How much more a discount sells">{LIFTS.map(([v, name]) => <button key={v} type="button" role="radio" aria-checked={lift === v} className={`o${lift === v ? " on" : ""}`} style={{ height: 22, fontSize: 11.5 }} onClick={() => setLift(v)}>{name}</button>)}</span></span>
        <span className="fill" />
        <span title={cycle ? "The median number of days your competitors’ live ads have been running, from Meta’s Ad Library" : "Meta’s own learning period for a new ad"}>A round of testing: {cycle ?? 7} days · {cycle ? "from competitors’ ads" : "Meta’s learning period"}</span>
        <span>Unsold stock isn’t counted as profit</span>
      </div>
    </div>
  );
}
