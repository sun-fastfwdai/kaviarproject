"use client";
import { useState } from "react";
import { MetaLogo, ShopifyLogo } from "@/components/logos";

const VIEWS = {
  meta: { label: "What Meta reports", orders: 412, roas: 2.2, revenue: 21630, note: "Counts views within a day and clicks within 7 days — including orders that came through Google or email." },
  shopify: { label: "What Shopify proves", orders: 298, roas: 1.46, revenue: 14410, note: "Only orders whose visit carried Meta’s UTMs. The floor you can prove — and the number Kaviar decides on." },
} as const;

const ROWS: [string, string, number, number][] = [
  ["Peony duo · ‘still thinking?’", "Peony Duo", 84, 112],
  ["Amber No. 3 · ritual video", "Amber No. 3 · 50 ml", 96, 141],
  ["Discovery set · 6 scents", "Discovery Set", 58, 87],
];

/** Toggle between Meta's count and Shopify's proof; bars and numbers animate between them. */
export function NumbersCard() {
  const [view, setView] = useState<"meta" | "shopify">("shopify");
  const v = VIEWS[view];
  return (
    <div className="card" style={{ padding: 20, gap: 16, boxShadow: "0 1px 2px rgba(18,18,18,0.04), 0 16px 40px rgba(18,18,18,0.06)" }}>
      <div className="row between" style={{ flexWrap: "wrap", gap: 10 }}>
        <span className="h3">Last 30 days <span className="xs i3" style={{ fontWeight: 400 }}>· example brand</span></span>
        <div className="seg" role="tablist">
          {(["meta", "shopify"] as const).map((k) => (
            <button key={k} role="tab" aria-selected={view === k} className={`o${view === k ? " on" : ""}`} onClick={() => setView(k)}>
              {k === "meta" ? <MetaLogo size={13} /> : <ShopifyLogo size={13} />}{k === "meta" ? "Meta" : "Shopify"}
            </button>
          ))}
        </div>
      </div>
      <div className="row g24 top" style={{ flexWrap: "wrap" }}>
        <div className="col g2"><span className="xs i3">Purchases</span><span style={{ fontSize: 34, lineHeight: "40px", fontWeight: 500, letterSpacing: "-0.03em" }} className="tnum">{v.orders}</span></div>
        <div className="col g2"><span className="xs i3">Return on ad spend</span><span style={{ fontSize: 34, lineHeight: "40px", fontWeight: 500, letterSpacing: "-0.03em" }} className={`tnum ${view === "shopify" ? "c-green" : ""}`}>{v.roas.toFixed(2)}×</span></div>
        <div className="col g2"><span className="xs i3">Revenue</span><span style={{ fontSize: 34, lineHeight: "40px", fontWeight: 500, letterSpacing: "-0.03em" }} className="tnum">${v.revenue.toLocaleString("en-US")}</span></div>
      </div>
      <div className="col g8">
        {(["meta", "shopify"] as const).map((k) => (
          <div key={k} className="row g10" style={{ opacity: view === k ? 1 : 0.45, transition: "opacity .3s ease" }}>
            <span className="row g6 xs i2" style={{ width: 70 }}>{k === "meta" ? <MetaLogo size={12} /> : <ShopifyLogo size={12} />}{k === "meta" ? "Meta" : "Shopify"}</span>
            <div className="lp-bar fill"><i style={{ width: `${(VIEWS[k].orders / 412) * 100}%`, background: k === "meta" ? "#0866FF" : "#1F8A5B" }} /></div>
            <span className="xs tnum i1" style={{ width: 34, textAlign: "right" }}>{VIEWS[k].roas.toFixed(2)}×</span>
          </div>
        ))}
      </div>
      <p className="xs i2" style={{ lineHeight: "17px", minHeight: 34 }}>{v.note}</p>
      <div className="col">
        <div className="row between xs i3" style={{ padding: "2px 0 6px" }}><span>Which ad sold what</span><span>{view === "meta" ? "Meta purchases" : "Shopify orders"}</span></div>
        {ROWS.map(([ad, p, s, m]) => (
          <div key={ad} className="row g10 hv" style={{ padding: "9px 6px", margin: "0 -6px", borderTop: "1px solid var(--line)", borderRadius: 6 }}>
            <span className="sm i1 ell" style={{ flex: 1.2 }}>{ad}</span><span className="i4">→</span>
            <span className="sm i2 ell fill">{p}</span><span className="sm w5 tnum" style={{ width: 32, textAlign: "right" }}>{view === "meta" ? m : s}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
