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
type Who = "analyst" | "builder" | "qa" | "catalog" | "you";
const WHO: Record<Who, string> = { analyst: "Iris", builder: "Remy", qa: "Otto", catalog: "Cleo", you: "You" };

const eyebrow: CSSProperties = { fontSize: 21, letterSpacing: "0.1em", textTransform: "uppercase", color: INK3, fontWeight: 500 };
const h1: CSSProperties = { fontSize: 66, lineHeight: "72px", fontWeight: 600, letterSpacing: "-0.025em", color: INK, margin: 0 };
const card: CSSProperties = { background: "#fff", borderRadius: 20, boxShadow: `0 0 0 1px ${LINE}, 0 18px 50px rgba(18,18,18,.07)` };

function Face({ who, size = 36 }: { who: Who; size?: number }) {
  if (who === "you") return <span style={{ width: size, height: size, borderRadius: 99, background: INK, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.42, fontWeight: 600, flexShrink: 0 }}>You</span>;
  return <span style={{ flexShrink: 0, display: "flex" }}><AgentFace kind={who} size={size} mood="happy" /></span>;
}

/** A product screen in a window frame. The screens are the Jmella sample brand, so the numbers are sample data. */
function Shot({ src, w, h, style, tag = "Sample data" }: { src: string; w: number; h: number; style?: CSSProperties; tag?: string | null }) {
  return (
    <div style={{ ...card, width: w, overflow: "hidden", borderRadius: 16, boxShadow: `0 0 0 1px ${LINE}, 0 34px 90px rgba(18,18,18,.16)`, ...style }}>
      <div style={{ height: 34, display: "flex", alignItems: "center", gap: 7, padding: "0 14px", borderBottom: `1px solid ${LINE}`, background: "#FBFAF8" }}>
        {["#E9A39B", "#EDCB86", "#9BCBA0"].map((c) => <span key={c} style={{ width: 10, height: 10, borderRadius: 99, background: c }} />)}
        <span style={{ marginLeft: 12, fontSize: 13, color: INK3 }}>kaviar · Jmella</span>
        {tag && <span style={{ marginLeft: "auto", fontSize: 12, color: INK3, padding: "2px 8px", borderRadius: 99, boxShadow: `0 0 0 1px ${LINE}` }}>{tag}</span>}
      </div>
      <img src={src} alt="" style={{ display: "block", width: w, height: h, objectFit: "cover", objectPosition: "top left" }} />
    </div>
  );
}

function Points({ items }: { items: [Who, string, string][] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {items.map(([who, head, text], i) => (
        <div key={head} className="dk-rise" style={{ display: "flex", gap: 16, alignItems: "flex-start", animationDelay: `${180 + i * 130}ms` }}>
          <Face who={who} size={40} />
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 27, lineHeight: "34px", fontWeight: 600, color: INK }}>{head}</span>
            <span style={{ fontSize: 23, lineHeight: "32px", color: INK2 }}>{text}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/** A step of the loop: what happens and who does it on the left, the real screen on the right. */
/** Facts about the product itself — counts and measured run times, never a brand's sales. */
function Facts({ items, style }: { items: [string, string][]; style?: CSSProperties }) {
  return (
    <div className="dk-rise" style={{ display: "flex", gap: 12, animationDelay: "620ms", ...style }}>
      {items.map(([v, l]) => (
        <div key={l} style={{ ...card, borderRadius: 16, padding: "14px 18px", display: "flex", flexDirection: "column", gap: 2, minWidth: 150 }}>
          <span style={{ fontSize: 38, lineHeight: "44px", fontWeight: 600, letterSpacing: "-0.02em", color: INK, fontVariantNumeric: "tabular-nums" }}>{v}</span>
          <span style={{ fontSize: 18, lineHeight: "24px", color: INK2 }}>{l}</span>
        </div>
      ))}
    </div>
  );
}

function Step({ n, name, title, points, shot, extra, facts }: { n: number; name: string; title: ReactNode; points: [Who, string, string][]; shot: string; extra?: ReactNode; facts?: [string, string][] }) {
  return (
    <>
      <div style={{ position: "absolute", left: 96, top: 92, width: 640, display: "flex", flexDirection: "column", gap: 26 }}>
        <span className="dk-rise" style={eyebrow}><span style={{ color: INK, fontWeight: 600 }}>{String(n).padStart(2, "0")}</span> &nbsp;·&nbsp; {name}</span>
        <h1 className="dk-rise" style={{ ...h1, animationDelay: "80ms" }}>{title}</h1>
        <div style={{ height: 6 }} />
        <Points items={points} />
        {facts && <Facts items={facts} style={{ marginTop: 10 }} />}
      </div>
      <div className="dk-shot" style={{ position: "absolute", left: 800, top: 150 }}><Shot src={shot} w={1040} h={650} /></div>
      {extra}
    </>
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

/** Look-alike shoppers reacting one by one — an illustration of the audience test, not a result. */
function Swarm({ t }: { t: number }) {
  const N = 96, kinds: ("catalog" | "analyst" | "builder" | "qa")[] = ["catalog", "analyst", "builder", "qa"];
  const cell = (i: number) => { const r = (i * 73 + 17) % 97; return { at: 2 + (r % 40), pick: r % 10 < 5 ? 0 : r % 10 < 8 ? 1 : 2, kind: kinds[(i * 7) % 4] }; };
  const seen = Array.from({ length: N }, (_, i) => cell(i)).filter((c) => t >= c.at);
  const share = (k: number) => (seen.length ? Math.round((seen.filter((c) => c.pick === k).length / seen.length) * 100) : 0);
  const COL = ["#22A46E", "#6A8FD6", "#EB7A3C"], NAME = ["Ad A · Original, not a dupe", "Ad B · Try six first", "Ad C · People come back"];
  return (
    <div style={{ ...card, position: "absolute", left: 800, top: 706, width: 1040, padding: "20px 24px", display: "flex", gap: 28, alignItems: "center" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(24, 20px)", gap: 6, flexShrink: 0 }}>
        {Array.from({ length: N }, (_, i) => { const c = cell(i), on = t >= c.at; return (
          <span key={i} style={{ width: 20, height: 20, borderRadius: 7, display: "flex", transition: "transform .35s, box-shadow .35s, opacity .35s", opacity: on ? 1 : 0.28, transform: on ? "scale(1)" : "scale(.78)", boxShadow: on ? `0 0 0 2px ${COL[c.pick]}` : "none" }}>
            <AgentFace kind={c.kind} size={20} mood={on ? "happy" : "focus"} /></span>); })}
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 9 }}>
        <span style={{ fontSize: 18, color: INK3 }}>{seen.length} of {N} shoppers have reacted <span style={{ marginLeft: 8, padding: "1px 8px", borderRadius: 99, boxShadow: `0 0 0 1px ${LINE}`, fontSize: 14 }}>Illustration</span></span>
        {NAME.map((n, k) => (
          <div key={n} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 19, color: INK, width: 250, flexShrink: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n}</span>
            <span style={{ flex: 1, height: 12, borderRadius: 99, background: "#EFEEEB", overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: `${share(k)}%`, background: COL[k], borderRadius: 99, transition: "width .5s" }} /></span>
            <span style={{ fontSize: 19, fontWeight: 600, color: INK, width: 52, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{share(k)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** How the loop compounds: each round keeps what the last one learned. A picture of the idea — no figures, not a forecast. */
function Growth() {
  const rounds = ["Round 1", "Round 2", "Round 3", "Round 4", "Round 5"], hs = [46, 74, 110, 156, 210], learn = ["First winner", "Better audience", "Stronger message", "New format", "Scale"];
  return (
    <div className="dk-rise" style={{ ...card, position: "absolute", left: 800, top: 604, width: 1040, height: 370, padding: "22px 28px", animationDelay: "500ms" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 25, fontWeight: 600, color: INK }}>Growth compounds round by round</span>
        <span style={{ fontSize: 15, color: INK3, padding: "2px 10px", borderRadius: 99, boxShadow: `0 0 0 1px ${LINE}` }}>Illustration · not a forecast</span>
      </div>
      <div style={{ position: "absolute", left: 28, right: 28, bottom: 24, height: 280, display: "flex", alignItems: "flex-end", gap: 22 }}>
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

type Slide = { key: string; notes: string; body: (t: number) => ReactNode };
const SLIDES: Slide[] = [
  { key: "cover", notes: "Kaviar is one system for the whole growth loop. Four agents do the work; people approve. Everything you'll see is the live product, on a sample copy of Jmella's catalogue.", body: () => (
    <>
      <div style={{ position: "absolute", left: 96, top: 150, width: 1340, display: "flex", flexDirection: "column", gap: 34 }}>
        <span className="dk-rise" style={eyebrow}>Kaviar &nbsp;·&nbsp; prepared for Jmella</span>
        <h1 className="dk-rise" style={{ ...h1, fontSize: 100, lineHeight: "106px", animationDelay: "90ms", width: 1340 }}>From store to winning ad.<br /><span style={{ color: INK3 }}>One loop, run by agents.</span></h1>
        <p className="dk-rise" style={{ fontSize: 31, lineHeight: "44px", color: INK2, margin: 0, width: 960, animationDelay: "220ms" }}>Connect your store and your ad data. Kaviar’s agents research the market, plan the tests, make the ads, try them on a swarm of look-alike shoppers — and launch the one that wins.</p>
      </div>
      <div style={{ position: "absolute", left: 96, bottom: 110, display: "flex", gap: 20 }}>
        {([["analyst", "reads the data and plans"], ["builder", "builds the store and the ads"], ["qa", "checks everything before it runs"], ["catalog", "keeps every source in sync"]] as [Exclude<Who, "you">, string][]).map(([k, t], i) => (
          <div key={k} className="dk-pop" style={{ ...card, padding: "20px 24px", display: "flex", gap: 16, alignItems: "center", width: 404, animationDelay: `${420 + i * 110}ms` }}>
            <AgentFace kind={k} size={64} mood="happy" />
            <span style={{ display: "flex", flexDirection: "column" }}><span style={{ fontSize: 27, fontWeight: 600, color: INK }}>{WHO[k]}</span><span style={{ fontSize: 20, lineHeight: "27px", color: INK2 }}>{t}</span></span>
          </div>
        ))}
      </div>
      <img className="dk-float" src="/api/looks/bigword?v=2" alt="" style={{ position: "absolute", right: 170, top: 400, width: 250, borderRadius: 18, boxShadow: "0 30px 80px rgba(18,18,18,.22)", transform: "rotate(-5deg)" }} />
      <img className="dk-float" src="/api/looks/reach?v=2" alt="" style={{ position: "absolute", right: 60, top: 96, width: 270, borderRadius: 18, boxShadow: "0 30px 80px rgba(18,18,18,.22)", transform: "rotate(6deg)", animationDelay: "-2.5s" }} />
    </>
  ) },
  { key: "loop", notes: "Seven steps, and each one feeds the next: research decides the plan, the plan decides the ads, the test decides what runs, and results come back into research. An agent owns each step; a person approves anything that spends money or goes public.", body: () => (
    <>
      <div style={{ position: "absolute", left: 96, top: 92, width: 1500, display: "flex", flexDirection: "column", gap: 22 }}>
        <span className="dk-rise" style={eyebrow}>The loop</span>
        <h1 className="dk-rise" style={{ ...h1, fontSize: 76, lineHeight: "82px", animationDelay: "80ms" }}>Seven steps. Each one feeds the next.</h1>
      </div>
      <div style={{ position: "absolute", left: 96, top: 370, display: "flex", gap: 14, alignItems: "stretch" }}>
        {LOOP.map(([name, line, icon, who], i) => (
          <div key={name} className="dk-pop" style={{ display: "flex", alignItems: "center", gap: 14, animationDelay: `${200 + i * 120}ms` }}>
            <div style={{ ...card, width: 226, height: 300, padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
              <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ fontSize: 20, color: INK3, fontVariantNumeric: "tabular-nums" }}>{String(i + 1).padStart(2, "0")}</span><Face who={who} size={38} /></span>
              <span style={{ width: 54, height: 54, borderRadius: 16, background: "#F7F6F4", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name={icon} size={26} /></span>
              <span style={{ fontSize: 31, fontWeight: 600, color: INK, letterSpacing: "-0.01em" }}>{name}</span>
              <span style={{ fontSize: 20, lineHeight: "27px", color: INK2 }}>{line}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="dk-rise" style={{ position: "absolute", left: 96, top: 716, width: 1728, height: 86, borderRadius: 20, border: `2px dashed #CFCBC4`, display: "flex", alignItems: "center", justifyContent: "center", gap: 14, animationDelay: "1150ms" }}>
        <Icon name="refresh" size={24} color={INK2} /><span style={{ fontSize: 25, color: INK2 }}>Results from Meta and Shopify flow back into research — so every round starts smarter than the last.</span>
      </div>
      <div style={{ position: "absolute", left: 96, top: 838, width: 1728, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <p className="dk-rise" style={{ fontSize: 25, color: INK3, margin: 0, animationDelay: "1300ms" }}>Agents do the work. <span style={{ color: INK, fontWeight: 600 }}>People approve</span> anything that spends money or goes public.</p>
        <Facts items={[["4", "agents"], ["7", "steps"], ["16", "ad styles"], ["11", "layouts"]]} style={{ animationDelay: "1400ms" }} />
      </div>
    </>
  ) },
  { key: "connect", notes: "Start from the store you already have: connecting Shopify takes a minute and orders, products and customers stay in sync. No store yet? Kaviar starts from your website or catalogue. It reads; it never edits orders or products without a person saying yes.", body: () => (
    <Step n={1} name="Connect" title={<>Start with the store you have — or let us build one.</>} shot="/deck/integrations.jpg" facts={[["2", "sources connected here: Shopify and Meta Ads"], ["0", "changes to your store without approval"]]} points={[
      ["catalog", "Connect Shopify in a minute", "Orders, products and customers sync, and stay live."],
      ["builder", "No store yet?", "Kaviar starts from your website or your catalogue."],
      ["you", "You stay in control", "Kaviar reads your data. Nothing in your store changes without your approval."],
    ]} />
  ) },
  { key: "data", notes: "Three kinds of data, joined: what your store sells, what your ads do — matched to real Shopify orders, not just Meta's own count — and what the market is doing: competitors' live ads from Meta's Ad Library and Meta's own audience-size estimates.", body: () => (
    <Step n={2} name="Your data" title={<>Store, ads and the market — in one place.</>} shot="/deck/signals.jpg" facts={[["3", "kinds of data, joined"], ["Live", "synced from Shopify and Meta"]]} points={[
      ["catalog", "Your store", "Sales, repeat buyers, best-sellers, stock — from Shopify."],
      ["catalog", "Your ads", "Meta campaigns and spend, matched to real Shopify orders."],
      ["analyst", "The market", "Competitors’ live ads from Meta’s Ad Library, and Meta’s own audience sizes."],
    ]} />
  ) },
  { key: "store", notes: "The store builder: Remy plans the pages from your brand and catalogue, writes them and makes product imagery; Otto checks each section; you approve section by section and can ask for changes in plain words.", body: () => (
    <Step n={3} name="Build" title={<>Agents build your store — and tune it with you.</>} shot="/deck/store.jpg" facts={[["1", "build plan, section by section"], ["3", "agents on every page"]]} points={[
      ["builder", "Remy builds it", "Pages, copy and product imagery from your brand and catalogue."],
      ["qa", "Otto checks it", "Every section is checked against your brand before you see it."],
      ["you", "You shape it", "Approve section by section, or just say what to change."],
    ]} />
  ) },
  { key: "research", notes: "Research is grounded in numbers, not guesses. Iris reads your own store and ad results plus public data, and every finding shows its number and where it came from. What comes out: a positioning, the buyer groups, and hypotheses — each marked as backed by data or an assumption to test.", body: () => (
    <Step n={4} name="Research" title={<>Research that shows its evidence.</>} shot="/deck/research.jpg" facts={[["4", "evidence sources"], ["3", "grades: measured, estimated, calculated"]]} points={[
      ["analyst", "Three sources", "Your store data, your ad results, and public market data through Meta’s APIs."],
      ["analyst", "Every finding has a number", "With where it came from — measured, estimated or calculated."],
      ["analyst", "Out come hypotheses", "Positioning, buyer groups and what to test — marked “backed by data” or “assumption to test”."],
    ]} />
  ) },
  { key: "plan", notes: "This is the seamless part: because the research already exists, the Plan opens with tests ready to build. Each buyer group is a hypothetical audience, with the hypothetical messages to try on it. You only choose the ad format — and Remy asks a question only if something is missing.", body: () => (
    <Step n={5} name="Plan" title={<>From research to a test that’s ready to build.</>} shot="/deck/plan.jpg" facts={[["3–4", "messages per audience"], ["16", "ad formats to pick from"]]} points={[
      ["analyst", "Hypothetical audiences", "Each buyer group from research, with its size on Meta when we have it."],
      ["analyst", "Hypothetical messages", "Three or four messages to try on each — in the buyer’s words."],
      ["you", "You pick the format", "Choose one of the ad styles and build. No brief to write."],
    ]} />
  ) },
  { key: "styles", notes: "Sixteen ad styles — nine with the product alone, seven with a person. Each of these pictures is a real shoot made by Kaviar, with the type laid out by the same layouts your ads use. Remy briefs every one like a photographer: set, lens, light, and where the type goes.", body: () => (
    <>
      <div style={{ position: "absolute", left: 96, top: 70, width: 1728, display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <span className="dk-rise" style={eyebrow}>Ad formats</span>
          <h1 className="dk-rise" style={{ ...h1, animationDelay: "80ms" }}>Sixteen ad styles. Every one a real shoot.</h1>
        </div>
        <span className="dk-rise" style={{ fontSize: 23, lineHeight: "32px", color: INK2, width: 520, textAlign: "right", animationDelay: "200ms" }}>Product-only and with a person. Remy briefs each like a photographer — set, lens, light and room for type.</span>
      </div>
      <div style={{ position: "absolute", left: 96, top: 262, display: "grid", gridTemplateColumns: "repeat(8, 201px)", gap: "20px 17px" }}>
        {AD_LOOKS.map((l, i) => (
          <div key={l.key} className="dk-pop" style={{ display: "flex", flexDirection: "column", gap: 8, animationDelay: `${180 + i * 55}ms` }}>
            <img src={`/api/looks/${l.key}?v=2`} alt={shortLook(l.name)} style={{ width: 201, height: 251, objectFit: "cover", borderRadius: 14, boxShadow: `0 0 0 1px ${LINE}, 0 14px 34px rgba(18,18,18,.12)`, background: "#EFEEEB" }} />
            <span style={{ fontSize: 18, fontWeight: 600, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{shortLook(l.name)}</span>
          </div>
        ))}
      </div>
      <span style={{ position: "absolute", left: 96, top: 880, fontSize: 19, color: INK3 }}>Example ads shot by Kaviar on unbranded products — 9 with the product alone, 7 with a person.</span>
    </>
  ) },
  { key: "create", notes: "Creative studio builds a pipeline you can see: your real product photo — label locked — plus the buyer data and brand kit go into Remy's brief; the photo model shoots; Otto checks each photo against the real product; then the ads are designed. On our runs a set of four photos costs about 34 cents and takes about two minutes.", body: () => (
    <Step n={6} name="Create" title={<>A creative pipeline you can see.</>} shot="/deck/shoots.jpg" facts={[["8", "steps, all visible"], ["≈2 min", "to shoot a set"], ["≈$0.34", "for four photos"]]} points={[
      ["builder", "Remy writes the brief", "From your product, the buyer and your brand: set, lens, light, composition."],
      ["qa", "Otto checks every photo", "Same product, same label, same colours — or it doesn’t go on."],
      ["you", "Cheap enough to try everything", "Measured on our own runs — so testing a new style costs cents, not a shoot day."],
    ]} extra={
      <div className="dk-rise" style={{ position: "absolute", left: 800, top: 866, width: 1040, display: "flex", gap: 10, alignItems: "center", animationDelay: "700ms" }}>
        {["Product", "Buyer data", "Brand kit", "Brief", "Photo", "Check", "Editor", "Ads"].map((n, i, all) => (
          <span key={n} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 19, fontWeight: 500, color: INK, padding: "8px 14px", borderRadius: 99, background: "#fff", boxShadow: `0 0 0 1px ${LINE}` }}>{n}</span>
            {i < all.length - 1 && <Icon name="arrow-r" size={14} color={INK3} />}
          </span>
        ))}
      </div>} />
  ) },
  { key: "editor", notes: "Everything Remy designs stays editable: switch layouts, change any element, or just ask Remy — for example, put the word behind the product. Three Meta sizes at once.", body: () => (
    <Step n={7} name="Edit" title={<>Every element stays yours to change.</>} shot="/deck/editor.jpg" facts={[["11", "layouts"], ["3", "Meta sizes at once"]]} points={[
      ["builder", "Ask Remy in plain words", "“Make the word sit behind the product.” Element by element, or the whole ad."],
      ["you", "Eleven layouts, one click", "The type moves and picks light or dark for the photo under it."],
      ["qa", "Ready for Meta", "Reels, Feed and square at once — checked against Meta’s safe zones."],
    ]} extra={<>
      <img className="dk-float" src="/api/looks/bigword?v=2" alt="" style={{ position: "absolute", left: 1500, top: 470, width: 250, borderRadius: 16, boxShadow: "0 30px 80px rgba(18,18,18,.28)", transform: "rotate(5deg)" }} />
      <img className="dk-float" src="/api/looks/peek?v=2" alt="" style={{ position: "absolute", left: 1660, top: 600, width: 210, borderRadius: 16, boxShadow: "0 30px 80px rgba(18,18,18,.28)", transform: "rotate(-4deg)", animationDelay: "-3s" }} />
    </>} />
  ) },
  { key: "test", notes: "Before spending on Meta, try the ads on a swarm. Kaviar builds a panel of look-alike shoppers from your Meta audiences and your store's buyers — each one an agent with a real buyer's profile. They see every ad, react, object and choose. You get a ranked winner and the reasons, and you can test again until one clearly wins. The screen is the real audience test; the swarm strip below is an illustration.", body: (t) => (
    <Step n={8} name="Test" title={<>Try the ads on a swarm before you spend.</>} shot="/deck/audience.jpg" points={[
      ["catalog", "Look-alike shoppers", "A panel of agents built from your Meta audiences and your store’s buyers."],
      ["qa", "They react like buyers", "Each one sees every ad, objects, compares — and picks."],
      ["you", "Until one wins", "A ranked winner with the reasons. Change the ads, test again."],
    ]} extra={<Swarm t={t} />} />
  ) },
  { key: "run", notes: "The winner goes to Meta from Kaviar as a paused campaign — a person switches it on. Results come back matched to real Shopify orders, and each week Iris proposes what to pause, scale or try next. The chart is the idea, not a forecast: every round keeps what the last one learned, so growth compounds.", body: () => (
    <>
      <div style={{ position: "absolute", left: 96, top: 92, width: 640, display: "flex", flexDirection: "column", gap: 26 }}>
        <span className="dk-rise" style={eyebrow}><span style={{ color: INK, fontWeight: 600 }}>09</span> &nbsp;·&nbsp; Run and repeat</span>
        <h1 className="dk-rise" style={{ ...h1, animationDelay: "80ms" }}>Launch the winner on Meta — from Kaviar.</h1>
        <div style={{ height: 6 }} />
        <Points items={[
          ["you", "One approval", "Approved ads become a Meta campaign, paused until a person switches it on."],
          ["catalog", "Real results", "Spend and sales come back matched to actual Shopify orders."],
          ["analyst", "Then it repeats", "Each week Iris proposes what to pause, scale or try next."],
        ]} />
      </div>
      <div className="dk-shot" style={{ ...card, position: "absolute", left: 800, top: 120, width: 1040, height: 440, padding: "26px 28px", display: "flex", alignItems: "center", gap: 22 }}>
        <div style={{ position: "relative", width: 300, height: 360, flexShrink: 0 }}>
          {(["sky", "reach", "bigword"] as const).map((k, i) => <img key={k} src={`/api/looks/${k}?v=2`} alt="" style={{ position: "absolute", left: [0, 46, 96][i], top: [38, 18, 0][i], width: 200, borderRadius: 14, boxShadow: "0 16px 40px rgba(18,18,18,.22)", transform: `rotate(${[-7, -1, 5][i]}deg)` }} />)}
          <span style={{ position: "absolute", left: 40, top: 306, padding: "6px 14px", borderRadius: 99, background: "#22A46E", color: "#fff", fontSize: 19, fontWeight: 600, whiteSpace: "nowrap", boxShadow: "0 8px 20px rgba(18,18,18,.2)" }}>Winner of the swarm test</span>
        </div>
        <Icon name="arrow-r" size={30} color={INK3} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
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
  { key: "close", notes: "That is the whole loop. Today we can run it live on one Jmella product: research, a plan, six ads in the style you pick, and a swarm test with a winner.", body: () => (
    <>
      <div style={{ position: "absolute", left: 96, top: 170, width: 1100, display: "flex", flexDirection: "column", gap: 30 }}>
        <span className="dk-rise" style={eyebrow}>Next</span>
        <h1 className="dk-rise" style={{ ...h1, fontSize: 104, lineHeight: "108px", animationDelay: "90ms" }}>Let’s run the loop on your product.</h1>
        <p className="dk-rise" style={{ fontSize: 31, lineHeight: "44px", color: INK2, margin: 0, width: 900, animationDelay: "220ms" }}>Pick one Jmella product. We’ll go from research to a tested ad while you watch.</p>
      </div>
      <div style={{ position: "absolute", left: 96, bottom: 120, display: "flex", gap: 20 }}>
        {([["analyst", "Research", "Buyers, positioning and hypotheses"], ["analyst", "Plan", "Audiences and messages to test"], ["builder", "Six ads", "In the style you choose"], ["qa", "Swarm test", "A winner, with the reasons"]] as [Who, string, string][]).map(([who, a, b], i) => (
          <div key={a} className="dk-pop" style={{ ...card, width: 300, padding: 24, display: "flex", flexDirection: "column", gap: 12, animationDelay: `${400 + i * 120}ms` }}>
            <span style={{ display: "flex", alignItems: "center", gap: 12 }}><Face who={who} size={40} /><span style={{ fontSize: 20, color: INK3 }}>{String(i + 1).padStart(2, "0")}</span></span>
            <span style={{ fontSize: 30, fontWeight: 600, color: INK }}>{a}</span>
            <span style={{ fontSize: 21, lineHeight: "29px", color: INK2 }}>{b}</span>
          </div>
        ))}
      </div>
      {(["giant", "splash", "sky"] as const).map((k, i) => <img key={k} className="dk-float" src={`/api/looks/${k}?v=2`} alt="" style={{ position: "absolute", left: [1330, 1560, 1440][i], top: [110, 250, 560][i], width: [270, 250, 290][i], borderRadius: 18, boxShadow: "0 30px 80px rgba(18,18,18,.22)", transform: `rotate(${[-6, 5, -3][i]}deg)`, animationDelay: `${-i * 2}s` }} />)}
    </>
  ) },
];

const CSS = `
@keyframes dk-rise { from { opacity: 0; transform: translateY(18px); } }
@keyframes dk-pop { from { opacity: 0; transform: translateY(14px) scale(.96); } }
@keyframes dk-shot { from { opacity: 0; transform: translateX(46px); } }
@keyframes dk-float { 0%, 100% { translate: 0 0; } 50% { translate: 0 -10px; } }
@keyframes dk-grow { from { transform: scaleY(0); } }
.dk-grow { transform-origin: bottom; animation: dk-grow .8s cubic-bezier(.2,.7,.2,1) both; }
.dk-rise { animation: dk-rise .6s cubic-bezier(.2,.7,.2,1) both; }
.dk-pop { animation: dk-pop .55s cubic-bezier(.2,.7,.2,1) both; }
.dk-shot { animation: dk-shot .75s cubic-bezier(.2,.7,.2,1) .15s both; }
.dk-float { animation: dk-float 7s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .dk-rise, .dk-pop, .dk-shot, .dk-float, .dk-grow { animation: none; } }
`;

export function Deck() {
  const [i, setI] = useState(0);
  const [scale, setScale] = useState(0.5);
  const [notes, setNotes] = useState(false);
  const [t, setT] = useState(0); // seconds on the current slide — drives the swarm
  const go = useCallback((n: number) => { setT(0); setI((cur) => Math.min(SLIDES.length - 1, Math.max(0, typeof n === "number" ? n : cur))); }, []);
  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
    // On open: size the stage to the window and go to the slide in the address (#4).
    const raf = window.requestAnimationFrame(() => { fit(); const from = Number(window.location.hash.slice(1)); if (from >= 1 && from <= SLIDES.length) setI(from - 1); });
    window.addEventListener("resize", fit);
    return () => { window.cancelAnimationFrame(raf); window.removeEventListener("resize", fit); };
  }, []);
  useEffect(() => { window.history.replaceState(null, "", `#${i + 1}`); }, [i]);
  useEffect(() => { const id = window.setInterval(() => setT((x) => x + 1), 260); return () => window.clearInterval(id); }, []);
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
  const s = SLIDES[i];
  return (
    <div style={{ position: "fixed", inset: 0, background: "#E9E7E3", overflow: "hidden", fontFamily: "var(--font)" }}>
      <style>{CSS}</style>
      <div onClick={(e) => { const x = e.clientX / window.innerWidth; go(x < 0.18 ? i - 1 : i + 1); }}
        style={{ position: "absolute", left: "50%", top: "50%", width: 1920, height: 1080, marginLeft: -960, marginTop: -540, transform: `scale(${scale})`, overflow: "hidden", cursor: "pointer",
          background: "#F7F6F4", backgroundImage: "radial-gradient(900px 620px at 12% -8%, rgba(245,196,150,.34), transparent 60%), radial-gradient(900px 640px at 96% 4%, rgba(160,190,240,.30), transparent 60%), radial-gradient(#DDD9D3 1.2px, transparent 1.2px)", backgroundSize: "auto, auto, 22px 22px" }}>
        <div key={s.key} style={{ position: "absolute", inset: 0 }}>{s.body(t)}</div>
        <div style={{ position: "absolute", left: 96, right: 96, bottom: 34, display: "flex", alignItems: "center", gap: 14, pointerEvents: "none" }}>
          <span style={{ width: 24, height: 24, borderRadius: 7, background: INK, color: "#fff", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>K</span>
          <span style={{ fontSize: 17, fontWeight: 600, color: INK }}>Kaviar</span>
          <span style={{ flex: 1, display: "flex", gap: 6, justifyContent: "center" }}>{SLIDES.map((x, n) => <span key={x.key} style={{ width: n === i ? 30 : 8, height: 8, borderRadius: 99, background: n === i ? INK : "#CFCBC4", transition: "width .3s" }} />)}</span>
          <span style={{ fontSize: 17, color: INK3, fontVariantNumeric: "tabular-nums" }}>{i + 1} / {SLIDES.length}</span>
        </div>
      </div>
      {notes && <div style={{ position: "absolute", left: 16, right: 16, bottom: 16, padding: "12px 16px", borderRadius: 12, background: "rgba(18,18,18,.92)", color: "#fff", fontSize: 15, lineHeight: "22px" }}>{s.notes}</div>}
    </div>
  );
}
