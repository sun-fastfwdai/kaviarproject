"use client";
/* eslint-disable @next/next/no-img-element -- screens and example ads, shown full size */
import type { CSSProperties, ReactNode } from "react";
import { Deck, type Slide } from "../deck";

/**
 * The business deck, for brand owners: what they get, how it helps them grow, and — the centre of it — how optimising and repeating
 * compounds. Deliberately plain: ink on off-white, one accent, hairlines, a lot of air. No sales figures — product facts only.
 */
const INK = "#121212", G1 = "#55534F", G2 = "#8B8883", RULE = "#DEDBD5", ACC = "#1F7A52", W2 = "rgba(255,255,255,.62)";
const kicker: CSSProperties = { fontSize: 20, letterSpacing: "0.14em", textTransform: "uppercase", color: G2, fontWeight: 500 };
const title: CSSProperties = { fontSize: 72, lineHeight: "80px", fontWeight: 600, letterSpacing: "-0.03em", color: INK, margin: 0 };

function Head({ k, children, sub, dark, w = 1400 }: { k: string; children: ReactNode; sub?: string; dark?: boolean; w?: number }) {
  return (
    <div style={{ position: "absolute", left: 120, top: 104, width: w, display: "flex", flexDirection: "column", gap: 22 }}>
      <span className="dk-rise" style={{ ...kicker, color: dark ? W2 : G2 }}>{k}</span>
      <h1 className="dk-rise" style={{ ...title, color: dark ? "#fff" : INK, animationDelay: "80ms" }}>{children}</h1>
      {sub && <p className="dk-rise" style={{ fontSize: 29, lineHeight: "42px", color: dark ? W2 : G1, margin: 0, maxWidth: 1180, animationDelay: "180ms" }}>{sub}</p>}
    </div>
  );
}
/** Numbered columns separated by hairlines. */
function Columns({ items, top, h = 0 }: { items: { n: string; head: string; text: string; list?: string[] }[]; top: number; h?: number }) {
  return (
    <div style={{ position: "absolute", left: 120, top, width: 1680, display: "grid", gridTemplateColumns: `repeat(${items.length}, 1fr)`, borderTop: `1px solid ${INK}` }}>
      {items.map((x, i) => (
        <div key={x.n} className="dk-rise" style={{ padding: "30px 34px 0 0", marginLeft: i ? 34 : 0, borderLeft: i ? `1px solid ${RULE}` : "none", paddingLeft: i ? 34 : 0, minHeight: h, display: "flex", flexDirection: "column", gap: 16, animationDelay: `${260 + i * 120}ms` }}>
          <span style={{ fontSize: 20, color: G2, fontVariantNumeric: "tabular-nums" }}>{x.n}</span>
          <span style={{ fontSize: 40, lineHeight: "47px", fontWeight: 600, letterSpacing: "-0.02em", color: INK }}>{x.head}</span>
          <span style={{ fontSize: 26, lineHeight: "38px", color: G1 }}>{x.text}</span>
          {x.list && <div style={{ marginTop: 8, display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 17, letterSpacing: "0.1em", textTransform: "uppercase", color: G2, paddingBottom: 8 }}>You receive</span>
            {x.list.map((l) => <span key={l} style={{ fontSize: 23, lineHeight: "31px", color: INK, padding: "11px 0", borderTop: `1px solid ${RULE}` }}>{l}</span>)}
          </div>}
        </div>
      ))}
    </div>
  );
}
/** A short list with hairlines — the left column of the proof slides. */
function Lines({ items, top, w = 640, dark }: { items: [string, string][]; top: number; w?: number; dark?: boolean }) {
  return (
    <div style={{ position: "absolute", left: 120, top, width: w, borderTop: `1px solid ${dark ? "rgba(255,255,255,.3)" : INK}` }}>
      {items.map(([a, b], i) => (
        <div key={a} className="dk-rise" style={{ padding: "22px 0", borderBottom: `1px solid ${dark ? "rgba(255,255,255,.14)" : RULE}`, display: "flex", flexDirection: "column", gap: 6, animationDelay: `${240 + i * 120}ms` }}>
          <span style={{ fontSize: 31, lineHeight: "39px", fontWeight: 600, color: dark ? "#fff" : INK }}>{a}</span>
          <span style={{ fontSize: 25, lineHeight: "36px", color: dark ? W2 : G1 }}>{b}</span>
        </div>
      ))}
    </div>
  );
}
/** A product screen, flat and quiet. The screens are a sample brand, so they are tagged. */
function Frame({ src, left, top, w, h }: { src: string; left: number; top: number; w: number; h: number }) {
  return (
    <div className="dk-shot" style={{ position: "absolute", left, top, width: w, borderRadius: 12, overflow: "hidden", background: "#fff", boxShadow: `0 0 0 1px ${RULE}, 0 30px 80px rgba(18,18,18,.10)` }}>
      <img src={src} alt="" style={{ display: "block", width: w, height: h, objectFit: "cover", objectPosition: "top left" }} />
      <span style={{ position: "absolute", right: 12, bottom: 12, fontSize: 14, color: G1, background: "rgba(255,255,255,.92)", padding: "3px 10px", borderRadius: 99, boxShadow: `0 0 0 1px ${RULE}` }}>Product screen · sample data</span>
    </div>
  );
}

/** The weekly cycle, drawn as a ring; the step being worked on lights up in turn. */
function Cycle({ t }: { t: number }) {
  const steps: [string, string][] = [["Run", "The winner goes live on Meta"], ["Measure", "Against real Shopify orders"], ["Learn", "What won, for whom, and why"], ["Decide", "Scale, pause or test next"], ["Create", "The next round of ads"]];
  const on = Math.floor(t / 7) % steps.length, R = 215, C = 290;
  const at = (i: number, r = R) => { const a = ((-90 + i * 72) * Math.PI) / 180; return [C + r * Math.cos(a), C + r * Math.sin(a)]; };
  return (
    <div className="dk-rise" style={{ position: "absolute", left: 110, top: 372, width: 580, height: 580, animationDelay: "300ms" }}>
      <svg viewBox="0 0 580 580" width="580" height="580" style={{ position: "absolute", inset: 0 }}>
        <circle cx={C} cy={C} r={R} fill="none" stroke="rgba(255,255,255,.22)" strokeWidth="2" />
        {steps.map((_, i) => { const [x, y] = at(i + 0.5), a = -90 + (i + 0.5) * 72 + 90; return <path key={i} d="M-9 -7L7 0L-9 7Z" fill="rgba(255,255,255,.5)" transform={`translate(${x} ${y}) rotate(${a})`} />; })}
      </svg>
      {steps.map(([n], i) => { const [x, y] = at(i), act = on === i; return (
        <span key={n} style={{ position: "absolute", left: x - 68, top: y - 68, width: 136, height: 136, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 25, fontWeight: 600, color: "#fff",
          background: act ? ACC : "#1C1C1C", boxShadow: act ? "0 0 0 8px rgba(31,122,82,.25)" : "0 0 0 1.5px rgba(255,255,255,.28)", transition: "background .5s, box-shadow .5s" }}>{n}</span>); })}
      <div style={{ position: "absolute", left: C - 130, top: C - 62, width: 260, textAlign: "center", display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ fontSize: 19, letterSpacing: "0.12em", textTransform: "uppercase", color: W2 }}>Every week</span>
        <span key={on} className="dk-rise" style={{ fontSize: 24, lineHeight: "32px", color: "#fff" }}>{steps[on][1]}</span>
      </div>
    </div>
  );
}
/** What arrives each week: a short plan with a reason on every line, and one approval. An example — the lines are illustrative. */
function WeeklyPlan() {
  const rows: [string, string, string][] = [
    ["Scale", "The winning message, to a look-alike of your best buyers", "It kept its lead in the live test."],
    ["Pause", "The ad set that has stopped earning its spend", "Its results have fallen week on week."],
    ["Test next", "The same message in a new ad format", "The message is proven; the format is the open question."],
    ["Keep", "The reorder reminder to recent buyers", "Steady, and cheap to run."],
  ];
  return (
    <div className="dk-shot" style={{ position: "absolute", left: 800, top: 372, width: 1000, background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "0 40px 100px rgba(0,0,0,.45)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "22px 28px", borderBottom: `1px solid ${RULE}` }}>
        <span style={{ fontSize: 27, fontWeight: 600, color: INK }}>This week’s plan</span>
        <span style={{ fontSize: 15, color: G2, padding: "2px 10px", borderRadius: 99, boxShadow: `0 0 0 1px ${RULE}` }}>Example</span>
        <span style={{ marginLeft: "auto", fontSize: 19, color: G1 }}>4 changes · each with its reason</span>
      </div>
      {rows.map(([tag, what, why], i) => (
        <div key={tag} className="dk-rise" style={{ display: "flex", alignItems: "center", gap: 22, padding: "20px 28px", borderBottom: `1px solid ${RULE}`, animationDelay: `${520 + i * 130}ms` }}>
          <span style={{ width: 128, flexShrink: 0, fontSize: 19, fontWeight: 600, color: tag === "Scale" ? "#fff" : INK, background: tag === "Scale" ? ACC : "transparent", boxShadow: tag === "Scale" ? "none" : `0 0 0 1.5px ${INK}`, borderRadius: 99, padding: "7px 0", textAlign: "center" }}>{tag}</span>
          <span style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1 }}><span style={{ fontSize: 23, lineHeight: "31px", fontWeight: 600, color: INK }}>{what}</span><span style={{ fontSize: 20, lineHeight: "28px", color: G1 }}>Why: {why}</span></span>
        </div>
      ))}
      <div style={{ display: "flex", alignItems: "center", padding: "20px 28px", gap: 16 }}>
        <span style={{ fontSize: 20, color: G1, flex: 1 }}>Nothing changes in your ad account until you approve.</span>
        <span style={{ fontSize: 21, fontWeight: 600, color: "#fff", background: INK, borderRadius: 10, padding: "12px 22px" }}>Approve all</span>
      </div>
    </div>
  );
}
/** Compounding, as a picture of the idea: no figures, not a forecast. */
function Compounding() {
  const rounds = ["Round 1", "Round 2", "Round 3", "Round 4", "Round 5"], hs = [70, 118, 180, 262, 370], learn = ["A first winner", "A sharper audience", "A stronger message", "A better format", "Scale what works"];
  return (
    <div className="dk-rise" style={{ position: "absolute", left: 880, top: 380, width: 920, height: 560, animationDelay: "300ms" }}>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 44, height: 470, display: "flex", alignItems: "flex-end", gap: 26, borderBottom: `1px solid ${INK}` }}>
        {rounds.map((r, i) => (
          <div key={r} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <span className="dk-rise" style={{ fontSize: 19, lineHeight: "24px", color: G1, textAlign: "center", animationDelay: `${800 + i * 150}ms` }}>{learn[i]}</span>
            <span className="dk-grow" style={{ width: "100%", height: hs[i], background: i === rounds.length - 1 ? ACC : INK, opacity: i === rounds.length - 1 ? 1 : 0.16 + i * 0.2, animationDelay: `${600 + i * 150}ms` }} />
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, display: "flex", gap: 26 }}>{rounds.map((r) => <span key={r} style={{ flex: 1, textAlign: "center", fontSize: 19, color: G2 }}>{r}</span>)}</div>
      <span style={{ position: "absolute", right: 0, top: 0, fontSize: 15, color: G2, padding: "2px 10px", borderRadius: 99, boxShadow: `0 0 0 1px ${RULE}` }}>Illustration · not a forecast</span>
    </div>
  );
}

const SLIDES: Slide[] = [
  { key: "cover", notes: "This is the business view: what your brand gets from Kaviar and how the results build on each other. The short version is the title — more winning ads, less wasted spend, and it repeats every week.", body: () => (
    <>
      <div style={{ position: "absolute", left: 120, top: 250, width: 1500, display: "flex", flexDirection: "column", gap: 40 }}>
        <span className="dk-rise" style={kicker}>Kaviar &nbsp;·&nbsp; for brand owners</span>
        <h1 className="dk-rise" style={{ ...title, fontSize: 124, lineHeight: "126px", animationDelay: "90ms" }}>More winning ads.<br />Less wasted spend.<br /><span style={{ color: ACC }}>Every week.</span></h1>
      </div>
      <div className="dk-rise" style={{ position: "absolute", left: 120, right: 120, bottom: 150, borderTop: `1px solid ${INK}`, paddingTop: 26, display: "flex", justifyContent: "space-between", animationDelay: "320ms" }}>
        <span style={{ fontSize: 29, color: G1 }}>What your brand gets from Kaviar — and how the results compound.</span>
        <span style={{ fontSize: 29, color: G2 }}>Prepared for Jmella</span>
      </div>
    </>
  ) },
  { key: "problem", notes: "Most brands don't lack ideas — they lack a fast, cheap way to find out which idea works. Each new ad is slow and expensive, decisions get made on opinion, and whatever is learned gets lost between tools and agencies.", body: () => (
    <>
      <Head k="The problem">Growth stalls when testing is slow.</Head>
      <Columns top={440} h={420} items={[
        { n: "01", head: "Every new ad is slow and costly", text: "A shoot, a designer and a week — for one idea that may not work." },
        { n: "02", head: "Decisions rest on opinion", text: "Which audience, which message, which format? Too often it is a guess." },
        { n: "03", head: "What you learn gets lost", text: "Results sit in different tools and agencies, so each campaign starts from zero." },
      ]} />
    </>
  ) },
  { key: "get", notes: "Four things you receive. A store that is built and kept sharp. Research on your market with the evidence shown. Ads in the formats you choose, tested before you spend. And every week, a plan of what to scale, pause and try next — with the reason for each line.", body: () => (
    <>
      <Head k="What you get">Four things, working as one.</Head>
      <Columns top={380} h={560} items={[
        { n: "01", head: "A store that sells", text: "Built or sharpened from your brand and catalogue.", list: ["Storefront pages and copy", "Product imagery", "Every change, for your approval"] },
        { n: "02", head: "Evidence on your market", text: "Who buys, why, and what to say to them.", list: ["A positioning statement", "Buyer groups, with audience sizes", "Hypotheses worth testing"] },
        { n: "03", head: "Ads, tested first", text: "On-brand ads made with your real product.", list: ["Sets of ads in the formats you pick", "A ranked winner, with reasons", "Before any ad spend"] },
        { n: "04", head: "A plan, every week", text: "The part that makes growth compound.", list: ["What to scale, pause and try next", "The reason for each change", "One approval from you"] },
      ]} />
    </>
  ) },
  { key: "how", notes: "How it works from your side. We understand your store, ads and market; create the ads; test them on look-alike shoppers before any spend; then run the winner on Meta and improve it weekly. Your part is to connect once and then approve — nothing is published or spent without you.", body: () => (
    <>
      <Head k="How it works">Four stages. Your part is to approve.</Head>
      <div style={{ position: "absolute", left: 120, top: 470, width: 1680, height: 2, background: INK }} />
      <div style={{ position: "absolute", left: 120, top: 440, width: 1680, display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
        {([["Understand", "Your store, your ads and your market, read together."], ["Create", "Ads in the formats you choose, with your real product."], ["Test", "On look-alike shoppers — before you spend on media."], ["Run and optimise", "The winner goes live on Meta, and improves each week."]] as [string, string][]).map(([a, b], i) => (
          <div key={a} className="dk-rise" style={{ display: "flex", flexDirection: "column", gap: 16, paddingRight: 40, animationDelay: `${260 + i * 140}ms` }}>
            <span style={{ width: 62, height: 62, borderRadius: 99, background: i === 3 ? ACC : INK, color: "#fff", fontSize: 24, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 0 10px #FBFAF8" }}>{i + 1}</span>
            <span style={{ fontSize: 40, fontWeight: 600, letterSpacing: "-0.02em", color: INK, marginTop: 14 }}>{a}</span>
            <span style={{ fontSize: 26, lineHeight: "38px", color: G1 }}>{b}</span>
          </div>
        ))}
      </div>
      <div className="dk-rise" style={{ position: "absolute", left: 120, right: 120, top: 830, borderTop: `1px solid ${RULE}`, paddingTop: 26, display: "flex", justifyContent: "space-between", animationDelay: "900ms" }}>
        <span style={{ fontSize: 27, color: INK }}><b>Your part:</b> connect once, then approve.</span>
        <span style={{ fontSize: 27, color: G1 }}>Nothing is published or spent without your approval.</span>
      </div>
    </>
  ) },
  { key: "research", notes: "The research you receive shows its evidence. It draws on your own store data, your ad results and public market data, and every finding carries its number and where it came from. Hypotheses are marked as backed by data, or as an assumption to test — so you know what is known and what is a bet.", body: () => (
    <>
      <Head k="Research" w={720}>Evidence, not opinion.</Head>
      <Lines top={400} items={[["Three sources, read together", "Your store data, your ad results and public market data."], ["Every finding shows its number", "And where it came from — measured, estimated or calculated."], ["Clear about what is a bet", "Each hypothesis is marked “backed by data” or “assumption to test”."]]} />
      <Frame src="/deck/research.jpg" left={860} top={180} w={940} h={720} />
    </>
  ) },
  { key: "creative", notes: "Creative stops being the bottleneck. Sixteen ad styles, each made with your real product and checked against it; a set takes about two minutes and costs cents on our own runs — so you can try an idea the same day you have it. These six are real ads shot by Kaviar on unbranded products.", body: () => (
    <>
      <Head k="Creative">On-brand ads, the day you have the idea.</Head>
      <div style={{ position: "absolute", left: 120, top: 400, display: "flex", gap: 24 }}>
        {["bigword", "reach", "benefits", "giant", "peek", "dark"].map((k, i) => <img key={k} className="dk-pop" src={`/deck/ad-${k}.jpg`} alt="" style={{ width: 260, height: 325, objectFit: "cover", borderRadius: 10, boxShadow: `0 0 0 1px ${RULE}`, animationDelay: `${240 + i * 90}ms` }} />)}
      </div>
      <div className="dk-rise" style={{ position: "absolute", left: 120, top: 790, width: 1680, borderTop: `1px solid ${INK}`, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", animationDelay: "800ms" }}>
        {([["16", "ad styles, with the product alone or with a person"], ["About 2 minutes", "to make a set — measured on our own runs"], ["Your real product", "every photo is checked against it before it is used"]] as [string, string][]).map(([a, b], i) => (
          <div key={a} style={{ padding: "22px 30px 0", paddingLeft: i ? 30 : 0, borderLeft: i ? `1px solid ${RULE}` : "none", display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 40, fontWeight: 600, letterSpacing: "-0.02em", color: INK }}>{a}</span><span style={{ fontSize: 22, lineHeight: "31px", color: G1 }}>{b}</span>
          </div>
        ))}
      </div>
      <span style={{ position: "absolute", right: 120, top: 740, fontSize: 17, color: G2 }}>Example ads shot by Kaviar on unbranded products</span>
    </>
  ) },
  { key: "test", notes: "Before you spend on media, the ads are tried on a panel of look-alike shoppers built from your Meta audiences and your store's buyers. They react in their own words and choose. You get a ranked winner and the reasons — so the money goes behind the ad most likely to work.", body: () => (
    <>
      <Head k="Testing" w={720}>Know the winner before you spend.</Head>
      <Lines top={480} items={[["A panel built from your data", "Look-alike shoppers from your Meta audiences and your store’s buyers."], ["They react and choose", "Each one sees every ad, objects, compares — and picks."], ["A winner, with reasons", "So your media spend goes behind the ad most likely to work."]]} />
      <Frame src="/deck/audience.jpg" left={860} top={180} w={940} h={720} />
    </>
  ) },
  { key: "optimise", dark: true, notes: "This is the centre of it. Launching the winner is the start, not the end. Every week the same cycle runs: the ads run, results are measured against real Shopify orders, we learn what won and why, decide what to scale, pause or test next, and create the next round. What you see is a short plan with a reason on every line — and nothing changes until you approve.", body: ({ t }) => (
    <>
      <Head k="Optimise and repeat" dark>The first winner is the start. <span style={{ color: "#7FD1A8" }}>The growth is in the repeat.</span></Head>
      <Cycle t={t} />
      <WeeklyPlan />
    </>
  ) },
  { key: "compound", notes: "Why repeating matters: each round starts from what the last one learned. Three things build up — what you know about your audience, the messages that are proven, and a library of creative that works. The chart is a picture of the idea, not a forecast.", body: () => (
    <>
      <Head k="Why it compounds" w={720}>Each round starts ahead of the last.</Head>
      <Lines top={480} items={[["Audience knowledge", "Who responds, and who does not, is kept from round to round."], ["Proven messages", "Winning messages are reused; losing ones are not paid for twice."], ["A creative library", "Every ad that worked is there to build on."]]} />
      <Compounding />
    </>
  ) },
  { key: "together", notes: "Working together is light on your side: access to Shopify and your Meta ad account, one product to start with, and a few minutes a week for approvals. And what stays yours stays yours — your store, your ad account, your data and every asset made for you.", body: () => (
    <>
      <Head k="Working together">Light on your time. Everything stays yours.</Head>
      <div style={{ position: "absolute", left: 120, top: 400, width: 1680, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 100 }}>
        {([["What we need from you", [["Access", "Shopify and your Meta ad account, connected once."], ["One product to start", "We prove the loop on it before widening."], ["Approvals", "A few minutes a week — nothing runs without them."]]], ["What stays yours", [["Your store and ad account", "We work inside them; we never own them."], ["Your data", "Used for your brand only."], ["Every asset", "The research, the ads and the photos made for you."]]]] as [string, [string, string][]][]).map(([h, rows], c) => (
          <div key={h} className="dk-rise" style={{ animationDelay: `${260 + c * 160}ms` }}>
            <span style={{ fontSize: 22, letterSpacing: "0.12em", textTransform: "uppercase", color: c ? ACC : G2, fontWeight: 600 }}>{h}</span>
            <div style={{ marginTop: 18, borderTop: `1px solid ${INK}` }}>
              {rows.map(([a, b]) => <div key={a} style={{ padding: "24px 0", borderBottom: `1px solid ${RULE}`, display: "flex", flexDirection: "column", gap: 6 }}><span style={{ fontSize: 33, fontWeight: 600, color: INK }}>{a}</span><span style={{ fontSize: 25, lineHeight: "36px", color: G1 }}>{b}</span></div>)}
            </div>
          </div>
        ))}
      </div>
    </>
  ) },
  { key: "month", notes: "A proposed first month. Week one: connect, research and positioning. Week two: the first ads and a test on look-alike shoppers. Week three: the winner goes live on Meta. Week four: the first optimise round and the plan for the next. This is a proposal to agree together, not a promise of results.", body: () => (
    <>
      <Head k="A proposed first month">From connected to optimising in four weeks.</Head>
      <div style={{ position: "absolute", left: 120, top: 470, width: 1680, height: 2, background: INK }} />
      <div style={{ position: "absolute", left: 120, top: 440, width: 1680, display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
        {([["Week 1", "Connect and understand", "Store and ad data connected. Research and positioning delivered."], ["Week 2", "Create and test", "First ads made. A winner chosen by look-alike shoppers."], ["Week 3", "Go live", "The winner runs on Meta, switched on by you."], ["Week 4", "Optimise and repeat", "First weekly plan: what to scale, pause and test next."]] as [string, string, string][]).map(([w, a, b], i) => (
          <div key={w} className="dk-rise" style={{ display: "flex", flexDirection: "column", gap: 14, paddingRight: 40, animationDelay: `${260 + i * 140}ms` }}>
            <span style={{ width: 62, height: 62, borderRadius: 99, background: i === 3 ? ACC : INK, boxShadow: "0 0 0 10px #FBFAF8", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 24, fontWeight: 600 }}>{i + 1}</span>
            <span style={{ fontSize: 20, letterSpacing: "0.12em", textTransform: "uppercase", color: G2, marginTop: 14 }}>{w}</span>
            <span style={{ fontSize: 38, lineHeight: "45px", fontWeight: 600, letterSpacing: "-0.02em", color: INK }}>{a}</span>
            <span style={{ fontSize: 25, lineHeight: "37px", color: G1 }}>{b}</span>
          </div>
        ))}
      </div>
      <span className="dk-rise" style={{ position: "absolute", left: 120, top: 880, fontSize: 21, color: G2, animationDelay: "900ms" }}>A proposal to agree together — the pace depends on approvals and access.</span>
    </>
  ) },
  { key: "close", notes: "The ask is small: start with one product. We run the first round with you, and you see the winner and the first weekly plan before deciding anything bigger.", body: () => (
    <>
      <div style={{ position: "absolute", left: 120, top: 300, width: 1500, display: "flex", flexDirection: "column", gap: 40 }}>
        <span className="dk-rise" style={kicker}>Next step</span>
        <h1 className="dk-rise" style={{ ...title, fontSize: 124, lineHeight: "126px", animationDelay: "90ms" }}>Start with<br /><span style={{ color: ACC }}>one product.</span></h1>
      </div>
      <div className="dk-rise" style={{ position: "absolute", left: 120, right: 120, bottom: 150, borderTop: `1px solid ${INK}`, paddingTop: 26, animationDelay: "320ms" }}>
        <span style={{ fontSize: 29, color: G1 }}>We run the first round with you — research, ads, a tested winner and the first weekly plan.</span>
      </div>
    </>
  ) },
];

export function BrandDeck() {
  return <Deck slides={SLIDES} plain pptx="/deck/kaviar-for-brands.pptx" />;
}
