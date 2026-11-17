"use client";
/* eslint-disable @next/next/no-img-element -- screens and example ads, shown full size */
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { AgentFace } from "@/components/agent";
import { Icon, type IconName } from "@/components/icon";
import { AD_LOOKS, shortLook } from "@/lib/creative/layouts";

/**
 * Kaviar's walkthrough deck — the whole loop from store to winning ad — built in the product's own look: the same type, colours,
 * agents and real screens, plus the real example ads. A 1920 × 1080 stage scaled to the window.
 * Keys: → / space next · ← back · F full screen · N speaker notes.
 */
const INK = "#121212", INK2 = "#55534F", INK3 = "#8B8883", LINE = "#E7E5E1";
type Agent = "analyst" | "builder" | "qa" | "catalog";
type Who = Agent | "you";
const WHO: Record<Who, string> = { analyst: "Iris", builder: "Remy", qa: "Otto", catalog: "Cleo", you: "You" };
const AD = (k: string) => `/deck/ad-${k}.jpg`;
const STEPS = ["Connect", "Build", "Research", "Plan", "Create", "Test", "Run"];

const eyebrow: CSSProperties = { fontSize: 21, letterSpacing: "0.1em", textTransform: "uppercase", color: INK3, fontWeight: 500 };
const h1: CSSProperties = { fontSize: 66, lineHeight: "72px", fontWeight: 600, letterSpacing: "-0.025em", color: INK, margin: 0 };
const card: CSSProperties = { background: "#fff", borderRadius: 20, boxShadow: `0 0 0 1px ${LINE}, 0 18px 50px rgba(18,18,18,.07)` };
/** Where the pointer is, as a direction for the agents' eyes (they watch the room). */
type Look = [number, number];
type Ctx = { t: number; look: Look };

function Face({ who, size = 36, look }: { who: Who; size?: number; look?: Look }) {
  if (who === "you") return <span style={{ width: size, height: size, borderRadius: 99, background: INK, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.36, fontWeight: 600, flexShrink: 0 }}>You</span>;
  return <span style={{ flexShrink: 0, display: "flex" }}><AgentFace kind={who} size={size} mood={look ? "focus" : "happy"} look={look} /></span>;
}

/** Where we are in the loop — the same seven steps on every slide. */
function Tracker({ at, dark }: { at: number; dark?: boolean }) {
  return (
    <div className="dk-rise" style={{ position: "absolute", right: 96, top: 84, display: "flex", alignItems: "center", gap: 6, padding: 6, borderRadius: 99, background: dark ? "rgba(255,255,255,.08)" : "#fff", boxShadow: dark ? "none" : `0 0 0 1px ${LINE}` }}>
      {STEPS.map((n, i) => (
        <span key={n} style={{ display: "flex", alignItems: "center", gap: 7, height: 34, padding: i === at ? "0 14px" : "0 10px", borderRadius: 99, fontSize: 16, fontWeight: i === at ? 600 : 400,
          background: i === at ? (dark ? "#fff" : INK) : "transparent", color: i === at ? (dark ? INK : "#fff") : i < at ? (dark ? "#fff" : INK) : INK3 }}>
          {i < at ? <Icon name="check" size={12} color="#22A46E" /> : <span style={{ fontSize: 13, opacity: 0.7, fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>}{n}
        </span>
      ))}
    </div>
  );
}

/** A product screen in a window frame, turned slightly toward the room, with a few callouts on what to look at. */
function Shot({ src, w, h, style, tag = "Sample data", tilt = true, callouts = [] }: { src: string; w: number; h: number; style?: CSSProperties; tag?: string | null; tilt?: boolean; callouts?: [number, number, string][] }) {
  return (
    <div style={{ perspective: 2400, ...style }}>
      <div style={{ ...card, position: "relative", width: w, borderRadius: 16, boxShadow: `0 0 0 1px ${LINE}, 0 50px 120px rgba(18,18,18,.22), 0 12px 30px rgba(18,18,18,.08)`, transform: tilt ? "rotateY(-7deg) rotateX(2.5deg)" : "none", transformOrigin: "left center" }}>
        <div style={{ height: 34, display: "flex", alignItems: "center", gap: 7, padding: "0 14px", borderBottom: `1px solid ${LINE}`, background: "#FBFAF8", borderRadius: "16px 16px 0 0" }}>
          {["#E9A39B", "#EDCB86", "#9BCBA0"].map((c) => <span key={c} style={{ width: 10, height: 10, borderRadius: 99, background: c }} />)}
          <span style={{ marginLeft: 12, fontSize: 13, color: INK3 }}>kaviar · Jmella</span>
          {tag && <span style={{ marginLeft: "auto", fontSize: 12, color: INK3, padding: "2px 8px", borderRadius: 99, boxShadow: `0 0 0 1px ${LINE}` }}>{tag}</span>}
        </div>
        <div style={{ overflow: "hidden", borderRadius: "0 0 16px 16px", width: w, height: h }}>
          <img className="dk-drift" src={src} alt="" style={{ display: "block", width: w, height: h, objectFit: "cover", objectPosition: "top left" }} />
        </div>
        {callouts.map(([x, y, label], i) => (
          <span key={label} className="dk-pop" style={{ position: "absolute", left: `${x}%`, top: `calc(34px + ${y}%)`, display: "flex", alignItems: "center", gap: 8, animationDelay: `${1100 + i * 260}ms` }}>
            <span style={{ position: "relative", width: 16, height: 16, flexShrink: 0 }}><span className="dk-ping" style={{ position: "absolute", inset: 0, borderRadius: 99, background: "#1AA7C8" }} /><span style={{ position: "absolute", inset: 3, borderRadius: 99, background: "#1AA7C8", boxShadow: "0 0 0 2px #fff" }} /></span>
            <span style={{ padding: "6px 12px", borderRadius: 99, background: INK, color: "#fff", fontSize: 17, fontWeight: 500, whiteSpace: "nowrap", boxShadow: "0 10px 24px rgba(18,18,18,.28)" }}>{label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** An agent saying what it just did — typed out as the slide plays. */
function Bubble({ who, text, t, style }: { who: Agent; text: string; t: number; style?: CSSProperties }) {
  const n = Math.max(0, (t - 6) * 4), done = n >= text.length;
  return (
    <div className="dk-rise" style={{ position: "absolute", display: "flex", alignItems: "flex-end", gap: 12, animationDelay: "1400ms", ...style }}>
      <AgentFace kind={who} size={52} mood={done ? "happy" : "focus"} />
      <div style={{ ...card, borderRadius: "20px 20px 20px 6px", padding: "14px 20px", maxWidth: 760, display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: 15, color: INK3 }}>{WHO[who]}</span>
        <span style={{ fontSize: 23, lineHeight: "31px", color: INK, minHeight: 31 }}>{text.slice(0, n)}{!done && <span className="dk-caret" style={{ display: "inline-block", width: 2, height: 22, background: INK, marginLeft: 2, verticalAlign: "-3px" }} />}</span>
      </div>
    </div>
  );
}

function Points({ items }: { items: [Who, string, string][] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {items.map(([who, head, text], i) => (
        <div key={head} className="dk-rise" style={{ display: "flex", gap: 16, alignItems: "flex-start", animationDelay: `${220 + i * 140}ms` }}>
          <Face who={who} size={40} />
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ fontSize: 27, lineHeight: "34px", fontWeight: 600, color: INK }}>{head}</span>
            <span style={{ fontSize: 22, lineHeight: "31px", color: INK2 }}>{text}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Facts about the product itself — counts and measured run times, never a brand's sales. */
function Facts({ items, style, dark }: { items: [string, string][]; style?: CSSProperties; dark?: boolean }) {
  return (
    <div className="dk-rise" style={{ display: "flex", gap: 12, animationDelay: "680ms", ...style }}>
      {items.map(([v, l]) => (
        <div key={l} style={{ ...(dark ? { background: "rgba(255,255,255,.07)", boxShadow: "0 0 0 1px rgba(255,255,255,.12)" } : card), borderRadius: 16, padding: "14px 18px", display: "flex", flexDirection: "column", gap: 2, minWidth: 150 }}>
          <span style={{ fontSize: 38, lineHeight: "44px", fontWeight: 600, letterSpacing: "-0.02em", color: dark ? "#fff" : INK, fontVariantNumeric: "tabular-nums" }}>{v}</span>
          <span style={{ fontSize: 18, lineHeight: "24px", color: dark ? "rgba(255,255,255,.65)" : INK2 }}>{l}</span>
        </div>
      ))}
    </div>
  );
}

/** A step of the loop: what happens and who does it on the left; the real screen, its callouts and the agent's own words on the right. */
function Step({ at, n, name, title, points, shot, extra, facts, callouts, say, t }: { at: number; n: number; name: string; title: ReactNode; points: [Who, string, string][]; shot: string; extra?: ReactNode; facts?: [string, string][]; callouts?: [number, number, string][]; say?: [Agent, string]; t: number }) {
  return (
    <>
      <Tracker at={at} />
      <div style={{ position: "absolute", left: 96, top: 92, width: 640, display: "flex", flexDirection: "column", gap: 24 }}>
        <span className="dk-rise" style={eyebrow}><span style={{ color: INK, fontWeight: 600 }}>{String(n).padStart(2, "0")}</span> &nbsp;·&nbsp; {name}</span>
        <h1 className="dk-rise" style={{ ...h1, animationDelay: "90ms" }}>{title}</h1>
        <div style={{ height: 4 }} />
        <Points items={points} />
        {facts && <Facts items={facts} style={{ marginTop: 8 }} />}
      </div>
      <div className="dk-shot" style={{ position: "absolute", left: 810, top: 176 }}><Shot src={shot} w={1010} h={631} callouts={callouts} /></div>
      {say && <Bubble who={say[0]} text={say[1]} t={t} style={{ left: 820, top: 872 }} />}
      {extra}
    </>
  );
}

/** Real ads drifting past — two columns moving in opposite directions. */
function AdWall({ style }: { style?: CSSProperties }) {
  const cols = [["bigword", "reach", "giant", "peek", "splash", "portrait", "statement", "sky"], ["sky", "dark", "swatch", "colour", "benefits", "moment", "stone", "skin"], ["podium", "peek", "reach", "splash", "bigword", "giant", "portrait", "dark"]];
  return (
    <div style={{ position: "absolute", display: "flex", gap: 22, transform: "rotate(9deg)", WebkitMaskImage: "linear-gradient(180deg, transparent 4%, #000 24%, #000 76%, transparent 96%)", maskImage: "linear-gradient(180deg, transparent 4%, #000 24%, #000 76%, transparent 96%)", ...style }}>
      {cols.map((keys, c) => (
        <div key={c} className={c % 2 ? "dk-down" : "dk-up"} style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          {[...keys, ...keys].map((k, i) => <img key={i} src={AD(k)} alt="" style={{ width: 236, height: 295, objectFit: "cover", borderRadius: 18, boxShadow: "0 24px 60px rgba(0,0,0,.45)" }} />)}
        </div>
      ))}
    </div>
  );
}

const LOOP: [string, string, IconName, Who][] = [
  ["Connect", "Your store and ad data, live", "database", "catalog"],
  ["Build", "A storefront, made and tuned", "layers", "builder"],
  ["Research", "The market, with evidence", "globe", "analyst"],
  ["Plan", "Audiences and messages to test", "sparkle", "analyst"],
  ["Create", "Ads through a pipeline", "image", "builder"],
  ["Test", "On a swarm of look-alike shoppers", "user", "qa"],
  ["Run", "The winner, on Meta", "arrow-r", "you"],
];

/** The audience test as a live picture: three ads, a crowd of look-alike shoppers choosing one by one, and what they say. An illustration, not a result. */
function Swarm({ t }: { t: number }) {
  const N = 180, kinds: Agent[] = ["catalog", "analyst", "builder", "qa"];
  const cell = (i: number) => { const r = (i * 73 + 17) % 97; return { at: 5 + (r % 46), pick: r % 10 < 5 ? 0 : r % 10 < 8 ? 1 : 2, kind: kinds[(i * 7) % 4] }; };
  const seen = Array.from({ length: N }, (_, i) => cell(i)).filter((c) => t >= c.at);
  const share = (k: number) => (seen.length ? Math.round((seen.filter((c) => c.pick === k).length / seen.length) * 100) : 0);
  const COL = ["#22A46E", "#6A8FD6", "#EB7A3C"], ADS: [string, string][] = [["reach", "Original, not a dupe"], ["bigword", "Try six first"], ["sky", "People come back"]];
  const lead = [0, 1, 2].reduce((a, b) => (share(b) > share(a) ? b : a), 0), done = seen.length === N;
  const SAY: [number, number, string, number][] = [[6, 14, "Feels original.", 0], [58, 52, "Is it a dupe?", 1], [30, 60, "I’d try six first.", 1], [78, 10, "I’d click that.", 0], [46, 22, "Looks premium.", 0], [12, 56, "Price?", 2], [68, 44, "My friends use it.", 2]];
  return (
    <div style={{ position: "absolute", left: 800, top: 156, width: 1040 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {ADS.map(([k, msg], i) => (
          <div key={k} className="dk-pop" style={{ ...card, padding: 14, display: "flex", gap: 14, alignItems: "center", animationDelay: `${300 + i * 140}ms`, boxShadow: done && lead === i ? `0 0 0 2.5px ${COL[i]}, 0 24px 60px rgba(18,18,18,.16)` : card.boxShadow, transition: "box-shadow .4s" }}>
            <img src={AD(k)} alt="" style={{ width: 150, height: 188, objectFit: "cover", borderRadius: 12, flexShrink: 0 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0, flex: 1 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 12, height: 12, borderRadius: 99, background: COL[i] }} /><span style={{ fontSize: 17, color: INK3 }}>Ad {"ABC"[i]}</span>{done && lead === i && <span style={{ fontSize: 14, fontWeight: 600, color: "#fff", background: COL[i], padding: "2px 9px", borderRadius: 99 }}>Winner</span>}</span>
              <span style={{ fontSize: 21, lineHeight: "27px", fontWeight: 600, color: INK }}>{msg}</span>
              <span style={{ fontSize: 46, lineHeight: "50px", fontWeight: 600, letterSpacing: "-0.02em", color: INK, fontVariantNumeric: "tabular-nums" }}>{share(i)}%</span>
              <span style={{ height: 8, borderRadius: 99, background: "#EFEEEB", overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: `${share(i)}%`, background: COL[i], borderRadius: 99, transition: "width .5s" }} /></span>
            </div>
          </div>
        ))}
      </div>
      <div className="dk-rise" style={{ ...card, position: "relative", marginTop: 16, padding: "20px 22px 18px", animationDelay: "700ms" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <span style={{ fontSize: 21, fontWeight: 600, color: INK }}>{seen.length} of {N} look-alike shoppers have chosen</span>
          <span style={{ fontSize: 14, color: INK3, padding: "2px 9px", borderRadius: 99, boxShadow: `0 0 0 1px ${LINE}` }}>Illustration</span>
          <span style={{ marginLeft: "auto", fontSize: 17, color: INK2 }}>Built from your Meta audiences and your store’s buyers</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(30, 28px)", gap: "9px 5.2px" }}>
          {Array.from({ length: N }, (_, i) => { const c = cell(i), on = t >= c.at; return (
            <span key={i} style={{ width: 28, height: 28, borderRadius: 9, display: "flex", transition: "transform .4s cubic-bezier(.2,1.6,.4,1), box-shadow .35s, opacity .35s", opacity: on ? 1 : 0.22, transform: on ? "scale(1)" : "scale(.7)", boxShadow: on ? `0 0 0 2.5px ${COL[c.pick]}` : "none" }}>
              <AgentFace kind={c.kind} size={28} mood={on ? "happy" : "focus"} /></span>); })}
        </div>
        {SAY.map(([x, y, q, k], i) => { const show = t > 10 && Math.floor((t - 10) / 9) % SAY.length === i; return (
          <span key={q} style={{ position: "absolute", left: `${x}%`, top: `${y}%`, padding: "7px 13px", borderRadius: "14px 14px 14px 4px", background: INK, color: "#fff", fontSize: 18, whiteSpace: "nowrap", boxShadow: `0 10px 26px rgba(18,18,18,.3), 0 0 0 2px ${COL[k]}`, opacity: show ? 1 : 0, transform: show ? "translateY(0) scale(1)" : "translateY(8px) scale(.94)", transition: "opacity .35s, transform .35s", pointerEvents: "none" }}>{q}</span>); })}
      </div>
      <div className="dk-rise" style={{ display: "flex", gap: 16, alignItems: "center", marginTop: 16, animationDelay: "1000ms" }}>
        <img src="/deck/audience.jpg" alt="" style={{ width: 352, height: 220, objectFit: "cover", objectPosition: "top left", borderRadius: 12, boxShadow: `0 0 0 1px ${LINE}, 0 14px 34px rgba(18,18,18,.14)` }} />
        <span style={{ fontSize: 24, lineHeight: "34px", color: INK2 }}>In Kaviar this is the <b style={{ color: INK }}>Audience test</b>: a panel built from your data sees each ad, reacts in its own words and picks — with the reasons written out, so you know what to change.</span>
      </div>
    </div>
  );
}

/** How the loop compounds: each round keeps what the last one learned. A picture of the idea — no figures, not a forecast. */
function Growth() {
  const rounds = ["Round 1", "Round 2", "Round 3", "Round 4", "Round 5"], hs = [46, 74, 110, 156, 210], learn = ["First winner", "Better audience", "Stronger message", "New format", "Scale"];
  return (
    <div className="dk-rise" style={{ ...card, position: "absolute", left: 800, top: 610, width: 1040, height: 350, padding: "22px 28px", animationDelay: "500ms" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 25, fontWeight: 600, color: INK }}>Growth compounds round by round</span>
        <span style={{ fontSize: 15, color: INK3, padding: "2px 10px", borderRadius: 99, boxShadow: `0 0 0 1px ${LINE}` }}>Illustration · not a forecast</span>
      </div>
      <div style={{ position: "absolute", left: 28, right: 28, bottom: 22, height: 270, display: "flex", alignItems: "flex-end", gap: 22 }}>
        {rounds.map((r, i) => (
          <div key={r} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <span className="dk-rise" style={{ fontSize: 17, color: INK2, animationDelay: `${900 + i * 160}ms` }}>{learn[i]}</span>
            <span className="dk-grow" style={{ width: "100%", height: hs[i], borderRadius: "12px 12px 4px 4px", background: i === rounds.length - 1 ? INK : `rgba(106,143,214,${0.3 + i * 0.16})`, animationDelay: `${700 + i * 160}ms` }} />
            <span style={{ fontSize: 17, color: INK3 }}>{r}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

type Slide = { key: string; dark?: boolean; notes: string; body: (c: Ctx) => ReactNode };
const W = "#fff", W2 = "rgba(255,255,255,.66)";
const SLIDES: Slide[] = [
  { key: "cover", dark: true, notes: "Kaviar is one system for the whole growth loop. Four agents do the work; people approve. Everything you'll see is the live product, on a sample copy of Jmella's catalogue — and every ad on this wall was shot by Kaviar.", body: ({ look }) => (
    <>
      <AdWall style={{ right: -40, top: -260 }} />
      <div style={{ position: "absolute", left: 0, top: 0, width: 1240, height: 1080, background: "linear-gradient(90deg, #121212 62%, rgba(18,18,18,0))" }} />
      <div style={{ position: "absolute", left: 96, top: 150, width: 1040, display: "flex", flexDirection: "column", gap: 34 }}>
        <span className="dk-rise" style={{ ...eyebrow, color: W2 }}>Kaviar &nbsp;·&nbsp; prepared for Jmella</span>
        <h1 className="dk-rise" style={{ ...h1, color: W, fontSize: 118, lineHeight: "116px", animationDelay: "90ms" }}>From store<br />to winning ad.</h1>
        <p className="dk-rise" style={{ fontSize: 44, lineHeight: "52px", fontWeight: 500, letterSpacing: "-0.01em", color: W2, margin: 0, animationDelay: "200ms" }}>One loop, run by agents.</p>
        <p className="dk-rise" style={{ fontSize: 27, lineHeight: "40px", color: W2, margin: 0, width: 860, animationDelay: "320ms" }}>Connect your store and your ad data. Kaviar’s agents research the market, plan the tests, make the ads, try them on a swarm of look-alike shoppers — and launch the one that wins.</p>
      </div>
      <div style={{ position: "absolute", left: 96, bottom: 116, display: "flex", gap: 16 }}>
        {([["analyst", "reads the data and plans"], ["builder", "builds the store and the ads"], ["qa", "checks everything before it runs"], ["catalog", "keeps every source in sync"]] as [Agent, string][]).map(([k, txt], i) => (
          <div key={k} className="dk-pop" style={{ padding: "18px 22px", borderRadius: 20, background: "rgba(255,255,255,.07)", boxShadow: "0 0 0 1px rgba(255,255,255,.12)", backdropFilter: "blur(12px)", display: "flex", gap: 14, alignItems: "center", width: 268, animationDelay: `${520 + i * 110}ms` }}>
            <AgentFace kind={k} size={58} mood="focus" look={look} />
            <span style={{ display: "flex", flexDirection: "column" }}><span style={{ fontSize: 24, fontWeight: 600, color: W }}>{WHO[k]}</span><span style={{ fontSize: 17, lineHeight: "23px", color: W2 }}>{txt}</span></span>
          </div>
        ))}
      </div>
    </>
  ) },
  { key: "loop", notes: "Seven steps, and each one feeds the next: research decides the plan, the plan decides the ads, the test decides what runs, and results come back into research. An agent owns each step; a person approves anything that spends money or goes public.", body: ({ t }) => { const on = Math.floor(t / 5) % 7; return (
    <>
      <div style={{ position: "absolute", left: 96, top: 92, width: 1500, display: "flex", flexDirection: "column", gap: 22 }}>
        <span className="dk-rise" style={eyebrow}>The loop</span>
        <h1 className="dk-rise" style={{ ...h1, fontSize: 80, lineHeight: "86px", animationDelay: "80ms" }}>Seven steps. Each one feeds the next.</h1>
      </div>
      <div style={{ position: "absolute", left: 150, top: 524, width: 1620, height: 3, background: "#DCD8D1", borderRadius: 9 }} />
      <span style={{ position: "absolute", top: 517, left: 150 + (on / 6) * 1604, width: 16, height: 16, borderRadius: 99, background: INK, boxShadow: "0 0 0 6px rgba(18,18,18,.12)", transition: "left 1.1s cubic-bezier(.4,0,.2,1)" }} />
      <div style={{ position: "absolute", left: 96, top: 366, display: "flex", gap: 18 }}>
        {LOOP.map(([name, line, icon, who], i) => (
          <div key={name} className="dk-pop" style={{ animationDelay: `${200 + i * 110}ms` }}>
            <div style={{ ...card, width: 231, height: 316, padding: 22, display: "flex", flexDirection: "column", gap: 14, transition: "transform .5s cubic-bezier(.2,.7,.2,1), box-shadow .5s, background .5s", transform: on === i ? "translateY(-14px)" : "none",
              background: on === i ? INK : "#fff", boxShadow: on === i ? "0 34px 70px rgba(18,18,18,.3)" : card.boxShadow }}>
              <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ fontSize: 20, color: on === i ? W2 : INK3, fontVariantNumeric: "tabular-nums" }}>{String(i + 1).padStart(2, "0")}</span><Face who={who} size={40} /></span>
              <span style={{ width: 54, height: 54, borderRadius: 16, background: on === i ? "rgba(255,255,255,.12)" : "#F7F6F4", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name={icon} size={26} color={on === i ? "#fff" : INK} /></span>
              <span style={{ fontSize: 33, fontWeight: 600, color: on === i ? W : INK, letterSpacing: "-0.01em" }}>{name}</span>
              <span style={{ fontSize: 20, lineHeight: "27px", color: on === i ? W2 : INK2 }}>{line}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="dk-rise" style={{ position: "absolute", left: 96, top: 726, width: 1728, height: 80, borderRadius: 20, border: "2px dashed #CFCBC4", display: "flex", alignItems: "center", justifyContent: "center", gap: 14, animationDelay: "1100ms" }}>
        <span className="dk-spin" style={{ display: "flex" }}><Icon name="refresh" size={24} color={INK2} /></span><span style={{ fontSize: 25, color: INK2 }}>Results from Meta and Shopify flow back into research — so every round starts smarter than the last.</span>
      </div>
      <div style={{ position: "absolute", left: 96, top: 842, width: 1728, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <p className="dk-rise" style={{ fontSize: 25, color: INK3, margin: 0, animationDelay: "1300ms" }}>Agents do the work. <span style={{ color: INK, fontWeight: 600 }}>People approve</span> anything that spends money or goes public.</p>
        <Facts items={[["4", "agents"], ["7", "steps"], ["16", "ad styles"], ["11", "layouts"]]} style={{ animationDelay: "1400ms" }} />
      </div>
    </>
  ); } },
  { key: "connect", notes: "Start from the store you already have: connecting Shopify takes a minute and orders, products and customers stay in sync. No store yet? Kaviar starts from your website or catalogue. It reads; it never edits orders or products without a person saying yes.", body: ({ t }) => (
    <Step t={t} at={0} n={1} name="Connect" title={<>Start with the store you have — or let us build one.</>} shot="/deck/integrations.jpg" callouts={[[30, 12, "Shopify · connected"], [30, 21, "Meta Ads · connected"]]} say={["catalog", "Both sources are connected. I’ll keep them in sync from here."]} facts={[["2", "sources connected here: Shopify and Meta Ads"], ["0", "changes to your store without approval"]]} points={[
      ["catalog", "Connect Shopify in a minute", "Orders, products and customers sync, and stay live."],
      ["builder", "No store yet?", "Kaviar starts from your website or your catalogue."],
      ["you", "You stay in control", "Kaviar reads your data. Nothing in your store changes without your approval."],
    ]} />
  ) },
  { key: "data", notes: "Three kinds of data, joined: what your store sells, what your ads do — matched to real Shopify orders, not just Meta's own count — and what the market is doing: competitors' live ads from Meta's Ad Library and Meta's own audience-size estimates. Every row on this screen is a signal an ad can use.", body: ({ t }) => (
    <Step t={t} at={0} n={1} name="Connect · your data" title={<>Store, ads and the market — in one place.</>} shot="/deck/signals.jpg" callouts={[[14, 8, "Every signal comes from your own data"], [72, 30, "Ready-made audiences"]]} say={["catalog", "Your data is in. Every row here is something an ad can use."]} facts={[["3", "kinds of data, joined"], ["Live", "synced from Shopify and Meta"]]} points={[
      ["catalog", "Your store", "Sales, repeat buyers, best-sellers, stock — from Shopify."],
      ["catalog", "Your ads", "Meta campaigns and spend, matched to real Shopify orders."],
      ["analyst", "The market", "Competitors’ live ads from Meta’s Ad Library, and Meta’s own audience sizes."],
    ]} />
  ) },
  { key: "store", notes: "The store builder: Remy plans the pages from your brand and catalogue, writes them and makes product imagery; Otto checks each section; you approve section by section and can ask for changes in plain words.", body: ({ t }) => (
    <Step t={t} at={1} n={2} name="Build" title={<>Agents build your store — and tune it with you.</>} shot="/deck/store.jpg" callouts={[[2, 10, "The build plan"], [38, 40, "Live preview"], [76, 13, "Your approval"]]} say={["builder", "The homepage is ready. Pick a headline and I’ll move on to the product pages."]} facts={[["1", "build plan, section by section"], ["3", "agents on every page"]]} points={[
      ["builder", "Remy builds it", "Pages, copy and product imagery from your brand and catalogue."],
      ["qa", "Otto checks it", "Every section is checked against your brand before you see it."],
      ["you", "You shape it", "Approve section by section, or just say what to change."],
    ]} />
  ) },
  { key: "research", notes: "Research is grounded in numbers, not guesses. Iris reads your own store and ad results plus public data, and every finding shows its number and where it came from. What comes out: a positioning, the buyer groups, and hypotheses — each marked as backed by data or an assumption to test.", body: ({ t }) => (
    <Step t={t} at={2} n={3} name="Research" title={<>Research that shows its evidence.</>} shot="/deck/research.jpg" callouts={[[16, 26, "Positioning, in one sentence"], [70, 12, "Demand and price, with sources"], [16, 62, "Message pillars"]]} say={["analyst", "Here’s the positioning. Every line shows the number it stands on."]} facts={[["4", "evidence sources"], ["3", "grades: measured, estimated, calculated"]]} points={[
      ["analyst", "Three sources", "Your store data, your ad results, and public market data through Meta’s APIs."],
      ["analyst", "Every finding has a number", "With where it came from — measured, estimated or calculated."],
      ["analyst", "Out come hypotheses", "Positioning, buyer groups and what to test — marked “backed by data” or “assumption to test”."],
    ]} />
  ) },
  { key: "plan", notes: "This is the seamless part: because the research already exists, the Plan opens with tests ready to build. Each buyer group is a hypothetical audience, with the hypothetical messages to try on it. You only choose the ad format — and Remy asks a question only if something is missing.", body: ({ t }) => (
    <Step t={t} at={3} n={4} name="Plan" title={<>From research to a test that’s ready to build.</>} shot="/deck/plan.jpg" callouts={[[14, 55, "Audience and hypothesis"], [14, 74, "Messages to test"], [57, 60, "Pick a format"]]} say={["analyst", "Three tests are ready. Pick a format and I’ll hand it to Remy."]} facts={[["3–4", "messages per audience"], ["16", "ad formats to pick from"]]} points={[
      ["analyst", "Hypothetical audiences", "Each buyer group from research, with its size on Meta when we have it."],
      ["analyst", "Hypothetical messages", "Three or four messages to try on each — in the buyer’s words."],
      ["you", "You pick the format", "Choose one of the ad styles and build. No brief to write."],
    ]} />
  ) },
  { key: "styles", notes: "Sixteen ad styles — nine with the product alone, seven with a person. Each of these pictures is a real shoot made by Kaviar, with the type laid out by the same layouts your ads use. Remy briefs every one like a photographer: set, lens, light, and where the type goes.", body: ({ t }) => { const hi = Math.floor(t / 9) % AD_LOOKS.length, l = AD_LOOKS[hi]; return (
    <>
      <Tracker at={4} />
      <div style={{ position: "absolute", left: 96, top: 92, width: 1100, display: "flex", flexDirection: "column", gap: 20 }}>
        <span className="dk-rise" style={eyebrow}><span style={{ color: INK, fontWeight: 600 }}>05</span> &nbsp;·&nbsp; Create · formats</span>
        <h1 className="dk-rise" style={{ ...h1, animationDelay: "80ms" }}>Sixteen ad styles. Every one a real shoot.</h1>
      </div>
      <div style={{ position: "absolute", left: 96, top: 290, display: "grid", gridTemplateColumns: "repeat(8, 198px)", gap: "18px 20.6px" }}>
        {AD_LOOKS.map((x, i) => (
          <div key={x.key} className="dk-pop" style={{ animationDelay: `${180 + i * 55}ms`, zIndex: hi === i ? 2 : 1 }}>
            <div style={{ position: "relative", borderRadius: 16, overflow: "hidden", transition: "transform .6s cubic-bezier(.2,.7,.2,1), box-shadow .6s, filter .6s", transform: hi === i ? "scale(1.12)" : "scale(1)", boxShadow: hi === i ? "0 0 0 3px #121212, 0 34px 70px rgba(18,18,18,.34)" : `0 0 0 1px ${LINE}, 0 12px 30px rgba(18,18,18,.1)`, filter: hi === i ? "none" : "saturate(.92)" }}>
              <img src={AD(x.key)} alt={shortLook(x.name)} style={{ display: "block", width: 198, height: 248, objectFit: "cover", background: "#EFEEEB" }} />
              <span style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "26px 10px 8px", background: "linear-gradient(180deg, rgba(0,0,0,0), rgba(0,0,0,.66))", color: "#fff", fontSize: 16, fontWeight: 600 }}>{shortLook(x.name)}</span>
            </div>
          </div>
        ))}
      </div>
      <div key={l.key} className="dk-rise" style={{ ...card, position: "absolute", left: 96, top: 850, width: 1728, padding: "18px 24px", display: "flex", alignItems: "center", gap: 18 }}>
        <Face who="builder" size={46} />
        <span style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 25, fontWeight: 600, color: INK }}>{shortLook(l.name)} <span style={{ fontSize: 18, fontWeight: 400, color: INK3 }}>· {l.group.toLowerCase()} · {hi + 1} of {AD_LOOKS.length}</span></span>
          <span style={{ fontSize: 20, lineHeight: "28px", color: INK2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>How Remy briefs it: {l.camera.split(". ")[0]}.</span>
        </span>
        <Facts items={[["9", "product only"], ["7", "with a person"]]} style={{ animation: "none" }} />
      </div>
    </>
  ); } },
  { key: "create", notes: "Creative studio builds a pipeline you can see: your real product photo — label locked — plus the buyer data and brand kit go into Remy's brief; the photo model shoots; Otto checks each photo against the real product; then the ads are designed. On our runs a set of four photos costs about 34 cents and takes about two minutes.", body: ({ t }) => (
    <Step t={t} at={4} n={5} name="Create · pipeline" title={<>A creative pipeline you can see.</>} shot="/deck/shoots.jpg" callouts={[[22, 13, "Your real product"], [36, 44, "Buyer data"], [50, 12, "Remy’s brief"], [66, 30, "Photos, then Otto’s check"]]} say={["builder", "Brief written: set, lens, light and where the type goes. Shooting four photos."]} facts={[["8", "steps, all visible"], ["≈2 min", "to shoot a set"], ["≈$0.34", "for four photos"]]} points={[
      ["builder", "Remy writes the brief", "From your product, the buyer and your brand: set, lens, light, composition."],
      ["qa", "Otto checks every photo", "Same product, same label, same colours — or it doesn’t go on."],
      ["you", "Cheap enough to try everything", "Measured on our own runs — a new style costs cents, not a shoot day."],
    ]} />
  ) },
  { key: "editor", notes: "Everything Remy designs stays editable: switch layouts, change any element, or just ask Remy — for example, put the word behind the product, which is how the GLOW ad on the right was made. Three Meta sizes at once.", body: ({ t }) => (
    <Step t={t} at={4} n={5} name="Create · editor" title={<>Every element stays yours to change.</>} shot="/deck/editor.jpg" callouts={[[2, 40, "11 layouts"], [38, 5, "Zoom · three sizes"]]} say={["builder", "Done — the word now sits behind the product."]} facts={[["11", "layouts"], ["3", "Meta sizes at once"]]} points={[
      ["builder", "Ask Remy in plain words", "“Make the word sit behind the product.” Element by element, or the whole ad."],
      ["you", "Eleven layouts, one click", "The type moves and picks light or dark for the photo under it."],
      ["qa", "Ready for Meta", "Reels, Feed and square at once — checked against Meta’s safe zones."],
    ]} extra={<>
      <img className="dk-float" src={AD("bigword")} alt="" style={{ position: "absolute", left: 1548, top: 420, width: 260, borderRadius: 18, boxShadow: "0 40px 90px rgba(18,18,18,.38), 0 0 0 1px rgba(255,255,255,.6)", transform: "rotate(5deg)" }} />
    </>} />
  ) },
  { key: "test", notes: "Before spending on Meta, try the ads on a swarm. Kaviar builds a panel of look-alike shoppers from your Meta audiences and your store's buyers — each one an agent with a real buyer's profile. They see every ad, react in their own words, and choose. You get a ranked winner and the reasons, and you can test again until one clearly wins. The crowd here is an illustration of that test; the small screen is the real one.", body: ({ t }) => (
    <>
      <Tracker at={5} />
      <div style={{ position: "absolute", left: 96, top: 92, width: 640, display: "flex", flexDirection: "column", gap: 24 }}>
        <span className="dk-rise" style={eyebrow}><span style={{ color: INK, fontWeight: 600 }}>06</span> &nbsp;·&nbsp; Test</span>
        <h1 className="dk-rise" style={{ ...h1, animationDelay: "90ms" }}>Try the ads on a swarm before you spend.</h1>
        <div style={{ height: 4 }} />
        <Points items={[
          ["catalog", "Look-alike shoppers", "A panel of agents built from your Meta audiences and your store’s buyers."],
          ["qa", "They react like buyers", "Each one sees every ad, objects, compares — and picks."],
          ["you", "Until one wins", "A ranked winner with the reasons. Change the ads, test again."],
        ]} />
        <Facts items={[["$0", "ad spend to find the winner"], ["Minutes", "not a week of live testing"]]} style={{ marginTop: 8 }} />
      </div>
      <Swarm t={t} />
    </>
  ) },
  { key: "run", notes: "The winner goes to Meta from Kaviar as a paused campaign — a person switches it on. Results come back matched to real Shopify orders, and each week Iris proposes what to pause, scale or try next. The chart is the idea, not a forecast: every round keeps what the last one learned, so growth compounds.", body: () => (
    <>
      <Tracker at={6} />
      <div style={{ position: "absolute", left: 96, top: 92, width: 640, display: "flex", flexDirection: "column", gap: 24 }}>
        <span className="dk-rise" style={eyebrow}><span style={{ color: INK, fontWeight: 600 }}>07</span> &nbsp;·&nbsp; Run and repeat</span>
        <h1 className="dk-rise" style={{ ...h1, animationDelay: "90ms" }}>Launch the winner on Meta — from Kaviar.</h1>
        <div style={{ height: 4 }} />
        <Points items={[
          ["you", "One approval", "Approved ads become a Meta campaign, paused until a person switches it on."],
          ["catalog", "Real results", "Spend and sales come back matched to actual Shopify orders."],
          ["analyst", "Then it repeats", "Each week Iris proposes what to pause, scale or try next."],
        ]} />
      </div>
      <div className="dk-shot" style={{ ...card, position: "absolute", left: 800, top: 166, width: 1040, height: 420, padding: "24px 28px", display: "flex", alignItems: "center", gap: 22 }}>
        <div style={{ position: "relative", width: 300, height: 350, flexShrink: 0 }}>
          {(["sky", "bigword", "reach"] as const).map((k, i) => <img key={k} src={AD(k)} alt="" style={{ position: "absolute", left: [0, 46, 96][i], top: [36, 16, 0][i], width: 200, borderRadius: 14, boxShadow: "0 16px 40px rgba(18,18,18,.22)", transform: `rotate(${[-7, -1, 5][i]}deg)` }} />)}
          <span style={{ position: "absolute", left: 40, top: 300, padding: "6px 14px", borderRadius: 99, background: "#22A46E", color: "#fff", fontSize: 19, fontWeight: 600, whiteSpace: "nowrap", boxShadow: "0 8px 20px rgba(18,18,18,.2)" }}>Winner of the swarm test</span>
        </div>
        <Icon name="arrow-r" size={30} color={INK3} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
          {([["you", "Approve", "You approve the winning ads in Kaviar."], ["catalog", "Campaign in Meta", "Created paused in your ad account — a person switches it on."], ["analyst", "Results come back", "Spend, clicks and orders, matched to Shopify."]] as [Who, string, string][]).map(([who, a, b], i) => (
            <div key={a} className="dk-rise" style={{ display: "flex", gap: 14, alignItems: "center", padding: "14px 16px", borderRadius: 14, background: "#F7F6F4", animationDelay: `${500 + i * 160}ms` }}>
              <Face who={who} size={40} />
              <span style={{ display: "flex", flexDirection: "column" }}><span style={{ fontSize: 24, fontWeight: 600, color: INK }}>{a}</span><span style={{ fontSize: 19, lineHeight: "26px", color: INK2 }}>{b}</span></span>
            </div>
          ))}
        </div>
      </div>
      <Growth />
    </>
  ) },
  { key: "close", dark: true, notes: "That is the whole loop. Today we can run it live on one Jmella product: research, a plan, six ads in the style you pick, and a swarm test with a winner.", body: ({ look }) => (
    <>
      <AdWall style={{ right: -40, top: -260 }} />
      <div style={{ position: "absolute", left: 0, top: 0, width: 1240, height: 1080, background: "linear-gradient(90deg, #121212 62%, rgba(18,18,18,0))" }} />
      <div style={{ position: "absolute", left: 96, top: 150, width: 1040, display: "flex", flexDirection: "column", gap: 30 }}>
        <span className="dk-rise" style={{ ...eyebrow, color: W2 }}>Next</span>
        <h1 className="dk-rise" style={{ ...h1, color: W, fontSize: 108, lineHeight: "110px", animationDelay: "90ms" }}>Let’s run the loop<br />on your product.</h1>
        <p className="dk-rise" style={{ fontSize: 29, lineHeight: "42px", color: W2, margin: 0, width: 820, animationDelay: "220ms" }}>Pick one Jmella product. We’ll go from research to a tested ad while you watch.</p>
      </div>
      <div style={{ position: "absolute", left: 96, bottom: 116, display: "flex", gap: 16 }}>
        {([["analyst", "Research", "Buyers, positioning and hypotheses"], ["analyst", "Plan", "Audiences and messages to test"], ["builder", "Six ads", "In the style you choose"], ["qa", "Swarm test", "A winner, with the reasons"]] as [Agent, string, string][]).map(([who, a, b], i) => (
          <div key={a} className="dk-pop" style={{ width: 268, padding: 22, borderRadius: 20, background: "rgba(255,255,255,.07)", boxShadow: "0 0 0 1px rgba(255,255,255,.12)", backdropFilter: "blur(12px)", display: "flex", flexDirection: "column", gap: 10, animationDelay: `${400 + i * 120}ms` }}>
            <span style={{ display: "flex", alignItems: "center", gap: 12 }}><AgentFace kind={who} size={44} mood="focus" look={look} /><span style={{ fontSize: 19, color: W2 }}>{String(i + 1).padStart(2, "0")}</span></span>
            <span style={{ fontSize: 28, fontWeight: 600, color: W }}>{a}</span>
            <span style={{ fontSize: 19, lineHeight: "26px", color: W2 }}>{b}</span>
          </div>
        ))}
      </div>
    </>
  ) },
];

const CSS = `
@keyframes dk-rise { from { opacity: 0; transform: translateY(18px); } }
@keyframes dk-pop { from { opacity: 0; transform: translateY(14px) scale(.96); } }
@keyframes dk-shot { from { opacity: 0; transform: translateX(60px); } }
@keyframes dk-float { 0%, 100% { translate: 0 0; } 50% { translate: 0 -12px; } }
@keyframes dk-grow { from { transform: scaleY(0); } }
@keyframes dk-up { to { transform: translateY(-50%); } }
@keyframes dk-down { from { transform: translateY(-50%); } to { transform: translateY(0); } }
@keyframes dk-ping { 0% { transform: scale(1); opacity: .55; } 100% { transform: scale(2.6); opacity: 0; } }
@keyframes dk-caret { 50% { opacity: 0; } }
@keyframes dk-spin { to { transform: rotate(360deg); } }
@keyframes dk-drift { from { transform: scale(1); } to { transform: scale(1.035); } }
@keyframes dk-slide { from { opacity: 0; transform: scale(.985); } }
.dk-rise { animation: dk-rise .65s cubic-bezier(.2,.7,.2,1) both; }
.dk-pop { animation: dk-pop .6s cubic-bezier(.2,.7,.2,1) both; }
.dk-shot { animation: dk-shot .85s cubic-bezier(.2,.7,.2,1) .15s both; }
.dk-float { animation: dk-float 7s ease-in-out infinite; }
.dk-grow { transform-origin: bottom; animation: dk-grow .8s cubic-bezier(.2,.7,.2,1) both; }
.dk-up { animation: dk-up 70s linear infinite; }
.dk-down { animation: dk-down 70s linear infinite; }
.dk-ping { animation: dk-ping 1.8s ease-out infinite; }
.dk-caret { animation: dk-caret 1s steps(1) infinite; }
.dk-spin { animation: dk-spin 9s linear infinite; }
.dk-drift { animation: dk-drift 14s ease-out both; transform-origin: 30% 30%; }
.dk-slide { animation: dk-slide .5s cubic-bezier(.2,.7,.2,1) both; }
@media (prefers-reduced-motion: reduce) { .dk-rise, .dk-pop, .dk-shot, .dk-float, .dk-grow, .dk-up, .dk-down, .dk-ping, .dk-spin, .dk-drift, .dk-slide { animation: none; } }
`;

export function Deck() {
  const [i, setI] = useState(0);
  const [scale, setScale] = useState(0.5);
  const [notes, setNotes] = useState(false);
  const [t, setT] = useState(0); // ticks on the current slide — drives typing, the loop and the swarm
  const [look, setLook] = useState<Look>([0.7, 0.8]);
  const go = useCallback((n: number) => { setT(0); setI(Math.min(SLIDES.length - 1, Math.max(0, n))); }, []);
  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
    // On open: size the stage to the window and go to the slide in the address (#4).
    const from = Number(window.location.hash.slice(1)); // read now: the address is rewritten as soon as a slide shows
    const raf = window.requestAnimationFrame(() => { fit(); if (from >= 1 && from <= SLIDES.length) setI(from - 1); });
    const move = (e: MouseEvent) => setLook([Math.max(-1.6, Math.min(1.6, (e.clientX / window.innerWidth - 0.3) * 3.4)), Math.max(-1.4, Math.min(1.4, (e.clientY / window.innerHeight - 0.75) * 3))]);
    window.addEventListener("resize", fit); window.addEventListener("mousemove", move);
    return () => { window.cancelAnimationFrame(raf); window.removeEventListener("resize", fit); window.removeEventListener("mousemove", move); };
  }, []);
  useEffect(() => { window.history.replaceState(null, "", `#${i + 1}`); }, [i]);
  useEffect(() => { const id = window.setInterval(() => setT((x) => x + 1), 240); return () => window.clearInterval(id); }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (["ArrowRight", "PageDown", " ", "Enter"].includes(e.key)) { e.preventDefault(); go(i + 1); }
      else if (["ArrowLeft", "PageUp", "Backspace"].includes(e.key)) { e.preventDefault(); go(i - 1); }
      else if (e.key === "Home") go(0);
      else if (e.key === "End") go(SLIDES.length - 1);
      else if (e.key.toLowerCase() === "f") { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen().catch(() => undefined); }
      else if (e.key.toLowerCase() === "n") setNotes((v) => !v);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [i, go]);
  const s = SLIDES[i], dark = Boolean(s.dark);
  return (
    <div style={{ position: "fixed", inset: 0, background: dark ? "#0B0B0B" : "#E9E7E3", overflow: "hidden", fontFamily: "var(--font)", transition: "background .5s" }}>
      <style>{CSS}</style>
      <div onClick={(e) => { const x = e.clientX / window.innerWidth; go(x < 0.18 ? i - 1 : i + 1); }}
        style={{ position: "absolute", left: "50%", top: "50%", width: 1920, height: 1080, marginLeft: -960, marginTop: -540, transform: `scale(${scale})`, overflow: "hidden", cursor: "pointer", transition: "background-color .5s",
          backgroundColor: dark ? "#121212" : "#F7F6F4",
          backgroundImage: dark ? "radial-gradient(1000px 700px at 8% -10%, rgba(235,122,60,.20), transparent 60%), radial-gradient(900px 700px at 30% 110%, rgba(106,143,214,.22), transparent 60%)"
            : "radial-gradient(900px 620px at 12% -8%, rgba(245,196,150,.34), transparent 60%), radial-gradient(900px 640px at 96% 4%, rgba(160,190,240,.30), transparent 60%), radial-gradient(#DDD9D3 1.2px, transparent 1.2px)", backgroundSize: dark ? "auto" : "auto, auto, 22px 22px" }}>
        <div key={s.key} className="dk-slide" style={{ position: "absolute", inset: 0 }}>{s.body({ t, look })}</div>
        <div style={{ position: "absolute", left: 0, top: 0, height: 5, width: `${((i + 1) / SLIDES.length) * 100}%`, background: dark ? "#fff" : INK, transition: "width .5s cubic-bezier(.2,.7,.2,1)" }} />
        <div style={{ position: "absolute", left: 96, right: 96, bottom: 34, display: "flex", alignItems: "center", gap: 14, pointerEvents: "none" }}>
          <span style={{ width: 24, height: 24, borderRadius: 7, background: dark ? "#fff" : INK, color: dark ? INK : "#fff", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>K</span>
          <span style={{ fontSize: 17, fontWeight: 600, color: dark ? "#fff" : INK }}>Kaviar</span>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 17, color: dark ? W2 : INK3, fontVariantNumeric: "tabular-nums" }}>{i + 1} / {SLIDES.length}</span>
        </div>
      </div>
      {notes && <div style={{ position: "absolute", left: 16, right: 16, bottom: 16, padding: "12px 16px", borderRadius: 12, background: "rgba(18,18,18,.92)", color: "#fff", fontSize: 15, lineHeight: "22px", boxShadow: "0 0 0 1px rgba(255,255,255,.15)" }}>{s.notes}</div>}
    </div>
  );
}
