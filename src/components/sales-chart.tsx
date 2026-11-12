"use client";
import { useEffect, useRef, useState } from "react";

/** Board 15: warm grey for all Shopify sales, Meta blue for the part Meta ads brought in. */
const SHOPIFY = "#DEDBD5";
const META = "#0866FF";

type Day = { day: string; revenue: number; meta: number; spend: number };

const fmt = (v: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(v);
const axis = (v: number) => (v >= 1000 ? `$${(v / 1000).toFixed(v % 1000 ? 1 : 0)}k` : `$${v}`);
const label = (d: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { ...o, timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

function niceMax(v: number) {
  if (v <= 0) return 100;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((m) => m * p).find((m) => m >= v)!;
}

/**
 * One $ axis. Bars = Shopify sales per day, the blue part = sales proven to come from Meta ads (UTMs).
 * Line = Meta spend. When the blue part clears the line, Meta paid for itself that day.
 */
export function SalesChart({ data, currency, height = 220, animate = false }: { data: Day[]; currency: string; height?: number; animate?: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  // Draw at the real pixel width so labels stay 10px instead of scaling with the card.
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(320, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const W = width, H = height, padL = 46, padR = 8, padT = 10, padB = 24;
  const cw = W - padL - padR, ch = H - padT - padB;
  const top = niceMax(Math.max(...data.map((d) => Math.max(d.revenue, d.spend)), 1));
  const y = (v: number) => padT + ch - (v / top) * ch;
  const bw = cw / Math.max(data.length, 1);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * top);
  const step = Math.max(1, Math.ceil(data.length / 6));
  const line = data.map((d, i) => `${i ? "L" : "M"}${(padL + i * bw + bw / 2).toFixed(1)} ${y(d.spend).toFixed(1)}`).join(" ");
  const h = hover != null ? data[hover] : null;
  const hasSpend = data.some((d) => d.spend > 0);
  if (!data.some((d) => d.revenue > 0 || d.spend > 0)) {
    return (
      <div className="col center" style={{ height: H * 0.6, alignItems: "center", gap: 4 }}>
        <span className="sm i2">No sales or spend in this range yet.</span>
        <span className="xs i3">Bars appear as soon as the first orders sync.</span>
      </div>
    );
  }

  return (
    <div ref={box} style={{ position: "relative" }} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ display: "block" }} role="img" aria-label="Sales and Meta spend per day" className={animate ? "lp-chart-anim" : undefined}>
        {ticks.map((t) => (
          <g key={t}>
            <path d={`M${padL} ${y(t)} H${W - padR}`} stroke={t ? "#EEECE8" : "#D9D6D0"} />
            <text x={padL - 10} y={y(t) + 3.5} textAnchor="end" fontSize="10" fill="#8B8883">{t ? axis(Math.round(t)) : "$0"}</text>
          </g>
        ))}
        {hover != null && <rect x={padL + hover * bw} y={padT} width={bw} height={ch} fill="#121212" fillOpacity="0.045" />}
        {data.map((d, i) => {
          const x = padL + i * bw + bw * 0.18, w = bw * 0.64, on = hover === i;
          return (
            <g key={d.day}>
              {d.revenue > 0 && <rect className="sc-bar" style={{ "--i": i } as React.CSSProperties} x={x} y={y(d.revenue)} width={w} height={Math.max(0, y(d.meta) - y(d.revenue))} rx={Math.min(2, w / 3)} fill={on ? "#CFCBC3" : SHOPIFY} />}
              {d.meta > 0 && <rect className="sc-bar" style={{ "--i": i } as React.CSSProperties} x={x} y={y(d.meta)} width={w} height={y(0) - y(d.meta)} fill={META} fillOpacity={on ? 0.95 : 0.8} />}
              <rect x={padL + i * bw} y={padT} width={bw} height={ch} fill="transparent" onMouseEnter={() => setHover(i)} />
            </g>
          );
        })}
        {hasSpend && <path className="sc-spend" d={line} stroke="#121212" strokeWidth="1.75" fill="none" strokeLinejoin="round" strokeLinecap="round" pointerEvents="none" />}
        {h && hasSpend && <circle cx={padL + hover! * bw + bw / 2} cy={y(h.spend)} r="3.5" fill="#fff" stroke="#121212" strokeWidth="1.75" />}
        {data.map((d, i) =>
          i % step === 0 || i === data.length - 1 ? (
            <text key={d.day} x={padL + i * bw + bw / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="#8B8883">{label(d.day, { month: "short", day: "numeric" })}</text>
          ) : null,
        )}
      </svg>
      {h && (
        <div
          className="col g4"
          style={{
            position: "absolute", top: 4, width: 196, padding: "9px 11px", background: "#fff", borderRadius: 9, pointerEvents: "none",
            boxShadow: "0 0 0 1px var(--line), 0 6px 18px rgba(18,18,18,0.08)",
            ...(hover! > data.length / 2 ? { right: `${((data.length - hover!) / data.length) * 100}%`, marginRight: 8 } : { left: `calc(${((hover! + 1) / data.length) * 100}% + 8px)` }),
          }}
        >
          <span className="xs w5 i1">{label(h.day, { weekday: "short", month: "short", day: "numeric" })}</span>
          <Row sw={<i style={{ width: 8, height: 8, borderRadius: 2, background: SHOPIFY }} />} k="All Shopify sales" v={fmt(h.revenue, currency)} />
          <Row sw={<i style={{ width: 8, height: 8, borderRadius: 2, background: META, opacity: 0.85 }} />} k="From Meta ads" v={fmt(h.meta, currency)} />
          <Row sw={<i style={{ width: 10, height: 2, borderRadius: 2, background: "#121212" }} />} k="Meta spend" v={fmt(h.spend, currency)} />
          {h.spend > 0 && (
            <div className="row between xs" style={{ paddingTop: 5, borderTop: "1px solid var(--line)" }}>
              <span className="i2">Each $1 on Meta made</span>
              <span className={`tnum w5 ${h.meta / h.spend >= 1 ? "c-green" : "c-amber"}`}>${(h.meta / h.spend).toFixed(2)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ sw, k, v }: { sw: React.ReactNode; k: string; v: string }) {
  return (
    <div className="row between xs">
      <span className="row g6 i2">{sw}{k}</span>
      <span className="tnum i1">{v}</span>
    </div>
  );
}

export function ChartLegend() {
  return (
    <div className="row g16 xs i3" style={{ whiteSpace: "nowrap" }}>
      <span className="row g6"><i style={{ width: 9, height: 9, borderRadius: 2, background: SHOPIFY }} />All Shopify sales</span>
      <span className="row g6"><i style={{ width: 9, height: 9, borderRadius: 2, background: META, opacity: 0.85 }} />Sales from Meta ads</span>
      <span className="row g6"><i style={{ width: 14, height: 2, borderRadius: 2, background: "#121212" }} />Meta spend</span>
    </div>
  );
}
