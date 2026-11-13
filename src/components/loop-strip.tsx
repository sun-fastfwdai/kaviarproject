import Link from "next/link";
import { Icon } from "./icon";

// The growth loop (Sun's repeating operation): [path, label, what this step does].
const LOOP: [string, string, string][] = [
  ["signals", "Ad signals", "Find what the store data says"],
  ["creative", "Creative studio", "Turn a signal into ads"],
  ["run", "Run ads", "Launch a small, safe test"],
  ["performance", "Performance", "See what really sold"],
  ["optimize", "Optimize & repeat", "Fix what isn’t working, go again"],
];

/** Board header chip (lib.step_pill): which loop step this screen is, what it is for, and what comes next. */
export function LoopStrip({ base, step }: { base: string; step: 1 | 2 | 3 | 4 | 5 }) {
  const i = step - 1;
  const [, , doing] = LOOP[i];
  const again = i === LOOP.length - 1;
  const [nextPath, nextLabel] = LOOP[(i + 1) % LOOP.length];
  return (
    <div className="row g10" style={{ height: 30, padding: "0 6px 0 10px", border: "1px solid var(--line)", borderRadius: 99, background: "var(--tray)", whiteSpace: "nowrap", flexShrink: 0 }}>
      <span className="row g4">{LOOP.map((_, j) => <i key={j} style={{ width: j === i ? 14 : 6, height: 6, borderRadius: 99, background: j === i ? "#121212" : j < i ? "#1F8A5B" : "#D9D6D1" }} />)}</span>
      <span className="xs i3">Step {step} of {LOOP.length}</span>
      <span className="xs w5 i1">{doing}</span>
      <Link href={`${base}/${nextPath}`} className="row g4" style={{ height: 22, padding: "0 9px", borderRadius: 99, background: "#fff", border: "1px solid var(--line)", fontSize: 11.5, color: "var(--ink-2)" }}>
        {again ? `Back to ${nextLabel}` : `Next: ${nextLabel}`}<Icon name={again ? "repeat" : "arrow-r"} size={11} color="#55534F" />
      </Link>
    </div>
  );
}
