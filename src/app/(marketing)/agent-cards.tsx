"use client";
import { useEffect, useRef, useState } from "react";
import { AgentFace } from "@/components/agent";

type A = { kind: "analyst" | "catalog" | "builder" | "qa"; name: string; role: string; does: string; asks: string };

function Card({ a, i }: { a: A; i: number }) {
  const face = useRef<HTMLDivElement>(null);
  const [look, setLook] = useState<[number, number] | undefined>();
  const [happy, setHappy] = useState(false);
  useEffect(() => {
    if (matchMedia("(pointer: coarse)").matches) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = face.current?.getBoundingClientRect();
        if (!r) return;
        const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        const d = Math.hypot(dx, dy) || 1, k = Math.min(1.6, d / 120);
        setLook([(dx / d) * k, (dy / d) * k]);
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => { window.removeEventListener("pointermove", onMove); cancelAnimationFrame(raf); };
  }, []);
  return (
    <div className="lp-card lp-agent" data-reveal style={{ ["--i" as string]: i } as React.CSSProperties} onMouseEnter={() => setHappy(true)} onMouseLeave={() => setHappy(false)}>
      <div className="in" style={{ gap: 10 }}>
        <div ref={face} className="face" style={{ width: 52 }}><AgentFace kind={a.kind} size={52} mood={happy ? "happy" : "focus"} look={look} /></div>
        <div className="col g2"><span className="h3">{a.name}</span><span className="xs i3">{a.role}</span></div>
        <span className="sm i2" style={{ lineHeight: "20px" }}>{a.does}</span>
        <span className="xs i3" style={{ paddingTop: 6, borderTop: "1px solid var(--line)" }}>{a.asks}</span>
      </div>
    </div>
  );
}

export function AgentCards({ agents }: { agents: A[] }) {
  return <div className="lp-grid">{agents.map((a, i) => <Card key={a.name} a={a} i={i} />)}</div>;
}
