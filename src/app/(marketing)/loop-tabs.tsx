"use client";
import { useEffect, useRef, useState } from "react";

type Tab = { icon: React.ReactNode; title: string; sub: string };

/** Five steps that advance on their own (progress bar under the active tab). Hover, focus or pause to stop. */
export function LoopTabs({ tabs, panes, seconds = 6 }: { tabs: Tab[]; panes: React.ReactNode[]; seconds?: number }) {
  const [on, setOn] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hover, setHover] = useState(false);
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.3 });
    io.observe(ref.current!);
    return () => io.disconnect();
  }, []);

  const stopped = paused || hover || !visible;
  return (
    <div ref={ref} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div className={`lp-tabs${stopped ? " paused" : ""}`} role="tablist" style={{ ["--dur" as string]: `${seconds}s` }}>
        {tabs.map((t, i) => (
          <button key={t.title} role="tab" aria-selected={on === i} className={`lp-tab${on === i ? " on" : ""}`} onClick={() => setOn(i)}>
            <span className="row between"><span className="row g8 sm w5 i1">{t.icon}{t.title}</span><span className="lp-num">{i + 1}/{tabs.length}</span></span>
            <span className="xs i3">{t.sub}</span>
            <span key={on === i ? `on-${on}` : "off"} className="lp-prog" onAnimationEnd={() => setOn((on + 1) % tabs.length)} />
          </button>
        ))}
      </div>
      <div className="lp-panel">
        {panes.map((p, i) => <div key={i} className={`pane${on === i ? " on" : ""}`} aria-hidden={on !== i}>{p}</div>)}
        <button className="btn sm" onClick={() => setPaused(!paused)} aria-label={paused ? "Play" : "Pause"} style={{ position: "absolute", right: 14, bottom: 14, width: 30, padding: 0, borderRadius: 99 }}>
          {paused ? "▶" : "❚❚"}
        </button>
      </div>
    </div>
  );
}

/** Optimize pane: proposed changes you can approve — the "people decide" moment, clickable. */
export function ApproveList({ items }: { items: [string, string][] }) {
  const [done, setDone] = useState<number[]>([]);
  return (
    <div className="col" style={{ border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" }}>
      {items.map(([t, why], i) => {
        const ok = done.includes(i);
        return (
          <div key={t} className="row g12 it" style={{ ["--i" as string]: i, padding: "11px 14px", borderTop: i ? "1px solid var(--line)" : 0, background: ok ? "var(--green-bg)" : "#fff", transition: "background-color .3s ease" } as React.CSSProperties}>
            <div className="col fill" style={{ minWidth: 0 }}><span className="sm w5 i1">{t}</span><span className="xs i3">{why}</span></div>
            <button className={`btn sm${ok ? "" : " dark"}`} onClick={() => setDone(ok ? done.filter((d) => d !== i) : [...done, i])} style={{ minWidth: 92 }}>
              {ok ? "✓ Approved" : "Approve"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
