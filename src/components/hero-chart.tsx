"use client";
import { useState } from "react";

/** The month as an area chart on the ink block. It draws itself in once, and the day under the pointer is read out above it. */
export function HeroChart({ data, points, color, h = 96 }: { data: number[]; points?: { label: string; text: string }[]; color: string; h?: number }) {
  const [at, setAt] = useState<number | null>(null);
  const max = Math.max(...data, 0), n = data.length;
  if (n < 2 || max <= 0) return <div style={{ height: h, borderTop: "1px dashed rgba(255,255,255,.16)" }} />;
  const x = (i: number) => (i / (n - 1)) * 100, y = (v: number) => 6 + (1 - v / max) * (h - 10);
  const pts = data.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(1)}`).join(" ");
  const move = (e: React.MouseEvent<HTMLDivElement>) => { const r = e.currentTarget.getBoundingClientRect(); setAt(Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1))))); };
  return (
    <div style={{ position: "relative", height: h, cursor: "crosshair" }} onMouseMove={move} onMouseLeave={() => setAt(null)} onClick={(e) => e.preventDefault()}>
      <svg viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" style={{ width: "100%", height: h, display: "block" }} aria-hidden>
        <defs><linearGradient id="hero-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".32" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
        {[0.33, 0.66].map((g) => <line key={g} x1="0" x2="100" y1={h * g} y2={h * g} stroke="rgba(255,255,255,.08)" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
        <polygon className="fade-in" points={`0,${h} ${pts} 100,${h}`} fill="url(#hero-fill)" />
        <polyline className="draw" pathLength={1} points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {at != null && <line x1={x(at)} x2={x(at)} y1="0" y2={h} stroke="rgba(255,255,255,.35)" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
      </svg>
      {at != null && <>
        <span style={{ position: "absolute", left: `${x(at)}%`, top: y(data[at]) - 5, width: 10, height: 10, marginLeft: -5, borderRadius: 99, background: color, boxShadow: "0 0 0 3px rgba(18,18,18,.9)" }} />
        {points?.[at] && <span className="tnum" style={{ position: "absolute", top: -30, left: `${x(at)}%`, transform: `translateX(${at < n * 0.2 ? "0" : at > n * 0.8 ? "-100%" : "-50%"})`, whiteSpace: "nowrap", height: 24, padding: "0 9px", borderRadius: 8, background: "#fff", color: "#121212", fontSize: 11.5, fontWeight: 500, lineHeight: "24px", boxShadow: "0 4px 14px rgba(0,0,0,.35)", pointerEvents: "none" }}>{points[at].label} · {points[at].text}</span>}
      </>}
    </div>
  );
}
