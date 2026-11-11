"use client";
import { useEffect, useRef, useState } from "react";
import { sendBrief } from "./motion";

const PHRASES = [
  "Move our store from Cafe24 to Shopify before the holidays…",
  "Win back customers who haven’t ordered in 60 days…",
  "Which of our Meta ads actually sells the Peony Duo?",
  "Launch a new Shopify store for our skincare line…",
];
const CHIPS: [string, string][] = [
  ["Move to Shopify", "We’re on Cafe24 and want to move to Shopify without losing sales."],
  ["New store", "We need a new Shopify store for our brand, built and ready to launch."],
  ["Grow with Meta ads", "We run Meta ads and want to know what really sells, then grow it."],
];

/** Instant/Relume-style brief box: a typewriter suggests what to write; chips fill it; the CTA carries it to the form. */
export function HeroBrief() {
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const [ghost, setGhost] = useState("");
  const [chip, setChip] = useState<number | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (text || focused || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let p = 0, i = 0, dir = 1, t: ReturnType<typeof setTimeout>;
    const step = () => {
      const phrase = PHRASES[p];
      i += dir;
      setGhost(phrase.slice(0, i));
      let wait = dir > 0 ? 34 + Math.random() * 40 : 14;
      if (dir > 0 && i >= phrase.length) { dir = -1; wait = 1700; }
      else if (dir < 0 && i <= 0) { dir = 1; p = (p + 1) % PHRASES.length; wait = 350; }
      t = setTimeout(step, wait);
    };
    t = setTimeout(step, 900);
    return () => clearTimeout(t);
  }, [text, focused]);

  return (
    <form className="lp-brief" onSubmit={(e) => { e.preventDefault(); sendBrief(text); }}>
      <div style={{ position: "relative" }}>
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => { setText(e.target.value); setChip(null); }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendBrief(text); }}
          aria-label="Tell us about your brand"
          placeholder={focused ? "Tell us about your brand and what you need…" : ""}
          rows={2}
        />
        {!text && !focused && (
          <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", fontSize: 15, lineHeight: "23px", color: "var(--ink-3)" }}>
            {ghost}<span className="lp-caret" />
          </div>
        )}
      </div>
      <div className="row between g8" style={{ flexWrap: "wrap" }}>
        <div className="row g6" style={{ flexWrap: "wrap" }}>
          {CHIPS.map(([label, fill], i) => (
            <button key={label} type="button" className={`lp-chip${chip === i ? " on" : ""}`}
              onClick={() => { setText(fill); setChip(i); ref.current?.focus(); }}>{label}</button>
          ))}
        </div>
        <button className="btn dark">Book a call<span className="arr">→</span></button>
      </div>
    </form>
  );
}
