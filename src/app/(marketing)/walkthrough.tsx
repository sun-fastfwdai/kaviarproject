"use client";
import { useEffect, useRef, useState } from "react";

type Step = { num: string; title: string; muted: string; body: string };

/** Instant-style sticky walkthrough: the copy scrolls, the canvas stays, and the rail fills as you read. */
export function Walkthrough({ steps, scenes }: { steps: Step[]; scenes: React.ReactNode[] }) {
  const [on, setOn] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const items = [...wrap.current!.querySelectorAll<HTMLElement>(".step")];
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) setOn(Number((e.target as HTMLElement).dataset.i)); });
    }, { rootMargin: "-45% 0px -45% 0px" });
    items.forEach((i) => io.observe(i));
    const onScroll = () => {
      if (!wrap.current) return;
      const r = wrap.current.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (window.innerHeight * 0.5 - r.top) / r.height));
      rail.current?.style.setProperty("--p", String(p));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { io.disconnect(); window.removeEventListener("scroll", onScroll); };
  }, []);

  return (
    <div className="lp-walk">
      <div className="steps" ref={wrap} style={{ position: "relative" }}>
        <div className="rail" ref={rail}><i /></div>
        {steps.map((s, i) => (
          <div key={s.num} data-i={i} className={`step${on === i ? " on" : ""}`}>
            <span className="lp-num">{s.num}</span>
            <span className="h2" style={{ fontSize: 28, lineHeight: "32px" }}>{s.title} <span className="i3">{s.muted}</span></span>
            <p className="t i2" style={{ fontSize: 15, lineHeight: "24px", maxWidth: 440 }}>{s.body}</p>
          </div>
        ))}
      </div>
      <div className="stage" aria-live="polite">
        {scenes.map((sc, i) => <div key={i} className={`scene${on === i ? " on" : ""}`}>{sc}</div>)}
      </div>
    </div>
  );
}
