import { Suspense } from "react";
import Link from "next/link";
import { FLOW, flowState, type FlowKey, type FlowStep } from "@/lib/growth/flow";
import { Icon } from "./icon";

/** Screens name themselves by route; several routes belong to one step (research and signals are both "Opportunities"). */
const STEP_OF = { opportunities: "find", research: "find", signals: "find", plan: "plan", creative: "create", audience: "test", run: "launch", performance: "learn", optimize: "learn" } as const satisfies Record<string, FlowKey>;
export type LoopKey = keyof typeof STEP_OF;

function Strip({ base, step, p }: { base: string; step: LoopKey; p: FlowStep[] | null }) {
  const key = STEP_OF[step], i = FLOW.findIndex(([k]) => k === key), [, , label, what] = FLOW[i];
  const again = i === FLOW.length - 1, [, nextPath, nextLabel] = again ? FLOW[0] : FLOW[i + 1];
  const now = p?.[i];
  return (
    <div className="row g10" style={{ height: 30, padding: "0 6px 0 10px", border: "1px solid var(--line)", borderRadius: 99, background: "var(--tray)", whiteSpace: "nowrap", flexShrink: 0, minWidth: 0 }}>
      <span className="row g4" aria-label="Growth steps">
        {FLOW.map(([k, path, l], j) => {
          const on = j === i, done = p?.[j].done;
          return (
            <Link key={k} href={`${base}/${path}`} title={`${j + 1}. ${l}${p ? ` — ${p[j].note}` : ""}`} aria-label={`${l}${done ? ", done" : ""}`} aria-current={on ? "step" : undefined}
              style={{ display: "block", width: on ? 14 : 6, height: 6, borderRadius: 99, background: on ? "#121212" : done ? "#1F8A5B" : "#D9D6D1" }} />
          );
        })}
      </span>
      <span className="xs i3">Step {i + 1} of {FLOW.length}</span>
      <span className="xs w5 i1" title={what}>{label}</span>
      <span className={`xs ell ${now?.done ? "c-green" : "i3"}`} style={{ maxWidth: 200 }} title={now ? `${what} · ${now.note}` : what}>{now ? now.note : what}</span>
      <Link href={`${base}/${nextPath}`} className="row g4" title={p ? p[again ? 0 : i + 1].note : undefined} style={{ height: 22, padding: "0 9px", borderRadius: 99, background: "#fff", border: "1px solid var(--line)", fontSize: 11.5, color: "var(--ink-2)" }}>
        {again ? `Back to ${nextLabel}` : `Next: ${nextLabel}`}<Icon name={again ? "repeat" : "arrow-r"} size={11} color="#55534F" />
      </Link>
    </div>
  );
}

async function Live({ base, brandId, step }: { base: string; brandId: string; step: LoopKey }) {
  const p = await flowState(brandId).catch(() => null);
  return <Strip base={base} step={step} p={p} />;
}

/** Header chip on every Growth screen: which of the six steps this is, where the brand really is on it, and what comes next. */
export function LoopStrip({ base, brandId, step }: { base: string; brandId: string; step: LoopKey }) {
  return <Suspense fallback={<Strip base={base} step={step} p={null} />}><Live base={base} brandId={brandId} step={step} /></Suspense>;
}
