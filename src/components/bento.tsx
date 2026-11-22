import Link from "next/link";
import { Icon, type IconName } from "./icon";
import type { Tile } from "@/lib/growth/trend";

/**
 * The board: a store's numbers as blocks of different sizes. One ink block for sales with the month's chart, a field of small blocks
 * (each a number, its change or its one fact, and a tiny chart), and one tall block for the store's score. Every block opens the place
 * its number comes from. Colour follows the design system: neutral surfaces, and a tint only where a block's state means something.
 */
const GOOD = "#1F8A5B", BAD = "#C8423B", FLAT = "#8B8883";
const tone = (k: Tile) => (!k.delta || k.delta.good == null ? FLAT : k.delta.good ? GOOD : BAD);
const arrow = (d: NonNullable<Tile["delta"]>) => (d.dir === "up" ? "↗" : d.dir === "down" ? "↘" : "→");

function Line({ data, color, h = 34, fill = true }: { data: number[]; color: string; h?: number; fill?: boolean }) {
  const max = Math.max(...data), min = Math.min(...data, 0), span = max - min;
  if (data.length < 2 || span <= 0) return <div style={{ height: h }} />;
  const y = (v: number) => 4 + (1 - (v - min) / span) * (h - 8), pts = data.map((v, i) => `${((i / (data.length - 1)) * 100).toFixed(2)},${y(v).toFixed(1)}`).join(" ");
  return (
    <div style={{ position: "relative", height: h, marginRight: 5 }} aria-hidden>
      <svg viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" style={{ width: "100%", height: h, display: "block" }}>
        {fill && <polygon points={`0,${h} ${pts} 100,${h}`} fill={color} opacity={0.1} />}
        <polyline points={pts} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <span style={{ position: "absolute", right: -3, top: y(data.at(-1)!) - 3, width: 6, height: 6, borderRadius: 99, background: color }} />
    </div>
  );
}
function Bars({ data, color, h = 34 }: { data: number[]; color: string; h?: number }) {
  const max = Math.max(...data, 0);
  if (max <= 0) return <div style={{ height: h }} />;
  return (
    <div className="row" style={{ height: h, alignItems: "flex-end", gap: 2 }} aria-hidden>
      {data.map((v, i) => <span key={i} style={{ flex: 1, minWidth: 0, height: v > 0 ? `${Math.max(12, (v / max) * 100)}%` : 2, borderRadius: 2, background: v > 0 ? color : "var(--line)", opacity: v > 0 ? (i === data.length - 1 ? 1 : 0.55) : 1 }} />)}
    </div>
  );
}

/** An ordinary block: a number with its change and tiny chart, or with its unit and one fact. */
export function StatTile({ k, tray = false, span }: { k: Tile; tray?: boolean; span?: number }) {
  const c = tone(k), cls = `bt${k.tone ? ` ${k.tone}` : tray ? " tray" : ""}`;
  return (
    <Link href={k.href} title={k.hint} className={cls} style={{ padding: "13px 15px 12px", gap: 2, ...(span ? { gridColumn: `span ${span}` } : {}) }}>
      <span className="row between g8"><span className="ell" style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{k.label}</span>{k.icon && <Icon name={k.icon as IconName} size={15} color="#8B8883" />}</span>
      <span className="row g6" style={{ alignItems: "baseline", minWidth: 0 }}><span className="bt-n" style={{ fontSize: 27, lineHeight: "36px" }}>{k.value}</span>{k.unit && <span className="xs i2 ell" style={{ fontWeight: 500 }}>{k.unit}</span>}</span>
      {k.delta ? <span className="row g4 tnum" style={{ fontSize: 12 }}><span style={{ color: c, fontWeight: 600 }}>{arrow(k.delta)} {k.delta.text}</span><span className="i3">vs prior</span></span>
        : k.sub ? <span className="xs" style={{ color: k.tone === "warn" ? "var(--amber)" : "var(--ink-3)", fontWeight: k.tone === "warn" ? 500 : 400, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{k.sub}</span>
        : k.spark ? <span className="xs i3">last 30 days</span> : null}
      {k.spark && <div style={{ marginTop: "auto", paddingTop: 8 }}>{k.chart === "bars" ? <Bars data={k.spark} color={c === FLAT ? "#55534F" : c} /> : <Line data={k.spark} color={c === FLAT ? "#55534F" : c} />}</div>}
    </Link>
  );
}

/** The ink block: the month's sales, large, over its chart. */
function Hero({ k }: { k: Tile }) {
  const d = k.delta, up = d ? d.good !== false : true, line = up ? "#6EE7A8" : "#FF9B73", data = k.spark ?? [], h = 96;
  const max = Math.max(...data, 0), y = (v: number) => 6 + (1 - (max > 0 ? v / max : 0)) * (h - 10), pts = data.map((v, i) => `${((i / Math.max(1, data.length - 1)) * 100).toFixed(2)},${y(v).toFixed(1)}`).join(" ");
  return (
    <Link href={k.href} title={k.hint} className="bt ink" style={{ padding: "18px 20px 14px", minHeight: 262 }}>
      <div aria-hidden style={{ position: "absolute", right: -150, top: -190, width: 460, height: 460, borderRadius: 999, background: `radial-gradient(closest-side, ${up ? "rgba(52,199,123,.26)" : "rgba(235,122,60,.24)"}, transparent)` }} />
      <span className="row between g8" style={{ position: "relative" }}><span style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, color: "rgba(255,255,255,.6)" }}>{k.label}</span><Icon name="arrow-ur" size={14} color="rgba(255,255,255,.5)" /></span>
      <span className="bt-n" style={{ position: "relative", fontSize: 52, lineHeight: "60px", marginTop: 6 }}>{k.value}</span>
      {d && <span className="row g6" style={{ position: "relative", marginTop: 2 }}>
        <span className="tnum" style={{ height: 22, padding: "0 9px", borderRadius: 99, fontSize: 12, fontWeight: 600, lineHeight: "22px", background: up ? "rgba(110,231,168,.16)" : "rgba(255,155,115,.16)", color: up ? "#8BE8B4" : "#FFB49A" }}>{arrow(d)} {d.text}</span>
        <span style={{ fontSize: 12, color: "rgba(255,255,255,.5)" }}>vs the 30 days before</span></span>}
      <div style={{ position: "relative", marginTop: "auto", paddingTop: 14 }} aria-hidden>
        {data.length > 1 && max > 0 ? <svg viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" style={{ width: "100%", height: h, display: "block" }}>
          <defs><linearGradient id="bento-hero" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={line} stopOpacity=".3" /><stop offset="1" stopColor={line} stopOpacity="0" /></linearGradient></defs>
          {[0.33, 0.66].map((g) => <line key={g} x1="0" x2="100" y1={h * g} y2={h * g} stroke="rgba(255,255,255,.08)" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
          <polygon points={`0,${h} ${pts} 100,${h}`} fill="url(#bento-hero)" />
          <polyline points={pts} fill="none" stroke={line} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg> : <div style={{ height: h, borderTop: "1px dashed rgba(255,255,255,.16)" }} />}
        <div className="row between" style={{ fontSize: 11, color: "rgba(255,255,255,.45)", paddingTop: 6 }}><span>30 days ago</span><span>Today</span></div>
      </div>
    </Link>
  );
}

/** The tall block: the store's score as a ring, where it stands, and the three scores it is made of. */
function Score({ k }: { k: Tile }) {
  const v = k.meter ?? 0, size = 92, r = (size - 10) / 2, c = 2 * Math.PI * r, ring = v >= 90 ? "#34C77B" : v >= 50 ? "#E9B949" : "#FF8A5C";
  const TAG = { good: ["var(--green-bg)", "var(--green)"], bad: ["var(--red-bg)", "var(--red)"], flat: ["var(--tray-2)", "var(--ink-2)"] } as const;
  return (
    <Link href={k.href} title={k.hint} className="bt" style={{ padding: "13px 15px 12px", gap: 10 }}>
      <span className="row between g8"><span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{k.label}</span><Icon name="store" size={15} color="#8B8883" /></span>
      <div className="col" style={{ alignItems: "center", gap: 8, padding: "4px 0" }}>
        <span style={{ position: "relative", width: size, height: size }}>
          <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }} aria-hidden>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--tray-2)" strokeWidth={8} />
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={ring} strokeWidth={8} strokeLinecap="round" strokeDasharray={`${(Math.max(2, v) / 100) * c} ${c}`} />
          </svg>
          <span className="bt-n" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30 }}>{k.value}</span>
        </span>
        {k.tag && <span style={{ height: 22, padding: "0 10px", borderRadius: 99, fontSize: 11.5, fontWeight: 600, lineHeight: "22px", background: TAG[k.tag.tone][0], color: TAG[k.tag.tone][1] }}>{k.tag.text}</span>}
      </div>
      {k.parts && <div className="col" style={{ marginTop: "auto" }}>
        {k.parts.map((p, i) => <span key={p.label} className="row between sm" style={{ padding: "6px 0", borderTop: i ? "1px solid var(--line)" : 0 }}><span className="i2">{p.label}</span><span className="tnum w5">{p.value}</span></span>)}
      </div>}
    </Link>
  );
}

export function Bento({ tiles }: { tiles: Tile[] }) {
  const hero = tiles.find((t) => t.kind === "hero"), score = tiles.find((t) => t.kind === "score"), rest = tiles.filter((t) => !t.kind);
  if (!tiles.length) return null;
  // Without a month of sales there is no ink block: the blocks sit in one even row.
  if (!hero) return <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>{rest.map((k, i) => <StatTile key={k.label} k={k} tray={i % 2 === 1} />)}{score && <Score k={score} />}</div>;
  const cols = Math.max(1, Math.ceil(rest.length / 2)), odd = rest.length % 2 === 1 && rest.length > 1;
  return (
    <div className={`bento${score ? "" : " two"}`}>
      <Hero k={hero} />
      {rest.length > 0 && <div className="bento-mid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {rest.map((k, i) => <StatTile key={k.label} k={k} tray={(i + Math.floor(i / cols)) % 2 === 1} span={odd && i === rest.length - 1 ? 2 : undefined} />)}
      </div>}
      {score && <Score k={score} />}
    </div>
  );
}
