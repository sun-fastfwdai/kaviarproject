import Link from "next/link";
import { Icon } from "./icon";

const LOOP: [string, string, string][] = [
  ["Find what the store data says", "signals", "Ad signals"],
  ["Turn a signal into ads", "creative", "Creative studio"],
  ["Launch a small, safe test", "run", "Run ads"],
  ["See what really sold", "performance", "Performance"],
  ["Optimize & repeat", "optimize", "Optimize"],
];

/** The growth loop strip from boards 15–19: where this screen sits and what comes next. */
export function LoopStrip({ base, step }: { base: string; step: 1 | 2 | 3 | 4 | 5 }) {
  const [title] = LOOP[step - 1];
  const [, nextPath, nextLabel] = step === 5 ? ["", "signals", "Back to Ad signals"] : LOOP[step];
  return (
    <span className="row g8 xs" style={{ padding: "3px 4px 3px 10px", border: "1px solid var(--line)", borderRadius: 99, background: "#fff" }}>
      <span className="row g2">{LOOP.map((_, i) => <i key={i} style={{ width: i === step - 1 ? 14 : 6, height: 6, borderRadius: 99, background: i < step ? "var(--ink)" : "var(--line-2)" }} />)}</span>
      <span className="i3">Step {step} of 5</span><b className="w5 i1">{title}</b>
      <Link href={`${base}/${nextPath}`} className="row g4 i2" style={{ padding: "2px 8px", borderRadius: 99, background: "var(--tray)" }}>Next: {nextLabel}<Icon name="arrow-r" size={11} /></Link>
    </span>
  );
}
