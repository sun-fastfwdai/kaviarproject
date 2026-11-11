"use client";
import { useEffect, useRef, useState } from "react";
import { AgentFace } from "@/components/agent";

type Kind = "analyst" | "catalog" | "builder" | "qa";
const FACES: [Kind, string, number][] = [["analyst", "Iris", 64], ["catalog", "Cleo", 72], ["builder", "Remy", 72], ["qa", "Otto", 66]];
const LINES: [string, string][] = [
  ["Calm, not noisy.", "One screen per job. Color only when something needs you."],
  ["Show the work.", "Every agent shows what it did, with inputs, outputs and reasons."],
  ["People decide.", "Approvals, payments and publishing always stay with a person."],
  ["Numbers that join up.", "Shopify orders and Meta spend, checked against each other."],
];

/** The team watches you sign in: eyes follow the pointer, close while you type a password, worry on a mistake. */
export function AuthPanel() {
  const [mode, setMode] = useState("idle");
  const [look, setLook] = useState<[number, number] | undefined>();
  const [line, setLine] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const on = (e: Event) => {
      const s = (e as CustomEvent<string>).detail;
      setMode(s);
      if (s === "error") setTimeout(() => setMode("idle"), 1800);
    };
    window.addEventListener("kaviar:auth", on);
    let raf = 0;
    const move = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        const d = Math.hypot(dx, dy) || 1, k = Math.min(1.6, d / 160);
        setLook([(dx / d) * k, (dy / d) * k]);
      });
    };
    window.addEventListener("pointermove", move, { passive: true });
    const t = setInterval(() => setLine((l) => (l + 1) % LINES.length), 4500);
    return () => { window.removeEventListener("kaviar:auth", on); window.removeEventListener("pointermove", move); clearInterval(t); };
  }, []);

  const hiding = mode === "password";
  const peeking = mode === "peek";
  const caption =
    hiding ? "Eyes closed — type away." :
    peeking ? "We’ll pretend we didn’t see that." :
    mode === "error" ? "Hmm, that didn’t match. Try again?" :
    mode === "sending" ? "Opening your console…" :
    "Iris, Cleo, Remy and Otto are ready when you are.";

  return (
    <div className="auth-right" aria-hidden>
      <div className="auth-grid" />
      <div ref={ref} className={`auth-faces${hiding || peeking ? " peek" : ""}${mode === "error" ? " oops" : ""}`} style={{ position: "relative" }}>
        {FACES.map(([k, name, size], i) => (
          <div key={k} className="col g8 auth-bob" style={{ alignItems: "center", ["--i" as string]: i } as React.CSSProperties}>
            <div className="auth-face">
              <AgentFace kind={k} size={size} mood={hiding ? "happy" : mode === "error" ? "worried" : mode === "sending" ? "up" : "focus"}
                look={hiding || mode === "error" || mode === "sending" ? undefined : peeking ? [i % 2 ? 1.5 : -1.5, -1.2] : look} />
            </div>
            <span className="xs i3">{name}</span>
          </div>
        ))}
      </div>
      <span className="sm i2" style={{ position: "relative", minHeight: 20, transition: "opacity .2s ease" }}>{caption}</span>
      <div className="col g12" style={{ position: "relative", width: "100%", alignItems: "center", marginTop: 24 }}>
        <div className="auth-quote">
          {LINES.map(([t, d], i) => (
            <div key={t} className={line === i ? "on" : ""}>
              <div className="h3">{t}</div>
              <div className="sm i3">{d}</div>
            </div>
          ))}
        </div>
        <div className="auth-dots">{LINES.map((l, i) => <button key={l[0]} className={line === i ? "on" : ""} onClick={() => setLine(i)} tabIndex={-1} />)}</div>
      </div>
    </div>
  );
}
