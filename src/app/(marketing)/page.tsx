import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Fragment } from "react";
import { Icon, type IconName } from "@/components/icon";
import { AgentFace } from "@/components/agent";
import { MetaLogo, ShopifyLogo } from "@/components/logos";
import { Wordmark } from "@/components/shell/parts";
import { ContactForm } from "./contact-form";
import { CountUp, Dock, NavShell, RevealObserver } from "./motion";
import { Walkthrough } from "./walkthrough";
import { ApproveList, LoopTabs } from "./loop-tabs";
import { NumbersCard } from "./numbers";
import { HeroBrief } from "./hero-brief";
import { AgentCards } from "./agent-cards";

export const metadata: Metadata = {
  title: { absolute: "Kaviar — ads for your Shopify brand, planned from your own store data" },
  description:
    "Kaviar reads your Shopify orders, stock and customers, works out what is worth advertising and what it should bring back, makes the ads from your real product photos and runs them on Meta. Nothing is spent until you approve it.",
  robots: { index: true, follow: true },
};

const css = (o: Record<string, unknown>) => o as React.CSSProperties;

type Kind = "analyst" | "catalog" | "builder" | "qa";

function NavItem({ icon, label, on }: { icon: IconName; label: string; on?: boolean }) {
  return <div className={`ni${on ? " on" : ""}`}><Icon name={icon} />{label}</div>;
}

function Cursor({ kind, name, color, style }: { kind: Kind; name: string; color: string; style: React.CSSProperties }) {
  return (
    <div className="lp-cursor" style={style} aria-hidden>
      <svg width="18" height="18" viewBox="0 0 24 24" fill={color} stroke="#fff" strokeWidth="1.6" strokeLinejoin="round"><path d="M4 3l16 7-7 2.2L10 20z" /></svg>
      <span className="nm" style={{ background: color }}><i><AgentFace kind={kind} size={13} /></i>{name}</span>
    </div>
  );
}

function SelHandles() {
  return <>{["h-tl", "h-tr", "h-bl", "h-br"].map((c) => <span key={c} className={`handle ${c}`} />)}</>;
}

function ProductWindow() {
  // An example brand's campaign, as its page shows it: the budget, what should come back, what is left — and the same budget over more time.
  const dim = "rgba(255,255,255,.55)";
  const figure = (label: string, value: React.ReactNode, note: string, d: number, color?: string) => (
    <div className="col g4 anim-up" style={css({ "--d": d })}>
      <span style={{ fontSize: 12, color: dim }}>{label}</span>
      <span className="tnum" style={{ fontSize: 36, lineHeight: "40px", fontWeight: 500, letterSpacing: "-0.02em", color }}>{value}</span>
      <span style={{ fontSize: 12, color: dim }}>{note}</span>
    </div>
  );
  const STEPS = ["Why now", "Budget", "Ads", "Test", "Launch", "Results"];
  const TIME: [string, string, [string, string][], boolean][] = [
    ["1 month", "+$4,120", [["Sells without ads", "243"], ["The ads add", "14 orders"], ["Offer that earns most", "10% off"], ["Sold · left", "283 · 127"], ["First result you can read", "day 14"]], false],
    ["3 months", "+$6,480", [["Sells without ads", "396"], ["The ads add", "14 orders"], ["Offer that earns most", "Full price"], ["Sold · left", "410 · none"], ["First result you can read", "day 42"]], true],
    ["6 months", "+$6,480", [["Sells without ads", "396"], ["The ads add", "14 orders"], ["Offer that earns most", "Full price"], ["Sold · left", "410 · none"], ["First result you can read", "day 84"]], false],
  ];
  return (
    <div className="lp-window" aria-label="Kaviar showing one campaign: its budget, what should come back and what is left">
      <div style={{ width: 1120, height: 640, display: "flex", background: "var(--page)", borderRadius: 18, overflow: "hidden", boxShadow: "0 0 0 1px rgba(18,18,18,0.08), 0 1px 2px rgba(18,18,18,0.04), 0 24px 32px -28px rgba(18,18,18,0.28)" }}>
        <aside className="side" style={{ width: 204, overflow: "hidden" }}>
          <Wordmark href="/" />
          <div className="switcher boxed">
            <div className="thumb" style={{ width: 28, height: 28, borderRadius: 8, position: "relative" }}><Image src="/landing/amber-eau-de-parfum.jpg" alt="" fill sizes="28px" /></div>
            <div className="col fill"><span className="nm">Maison Oré</span><span className="sb">Fine fragrance</span></div>
          </div>
          <nav className="nav">
            <NavItem icon="lightning" label="Today" />
            <NavItem icon="megaphone" label="Campaigns" />
            <div className="nav-sub"><div className="ni on">All campaigns</div><div className="ni">Running ads</div><div className="ni">Budget</div></div>
            <NavItem icon="store" label="Store" />
            <NavItem icon="palette" label="Creative studio" />
            <NavItem icon="globe" label="Market" />
            <NavItem icon="settings" label="Settings" />
          </nav>
        </aside>
        <div className="sheet" style={{ margin: "8px 8px 8px 0" }}>
          <header className="bar">
            <div className="crumb"><span>Maison Oré</span><Icon name="chev-r" size={12} color="#B5B2AC" /><span>Campaigns</span><Icon name="chev-r" size={12} color="#B5B2AC" /><b>Win back lapsed buyers</b></div>
            <div className="fill" />
            <span className="row g6 xs i3"><span className="dot green" />synced just now</span>
          </header>
          <div className="col" style={{ padding: "16px 20px", gap: 12 }}>
            <div className="col g16" style={{ borderRadius: 16, background: "#121212", color: "#fff", padding: "20px 24px 16px" }}>
              <div className="row between g16">
                <div className="col g6">
                  <span className="row g8"><span style={{ fontSize: 12, color: dim }}>Buyers going quiet · Suggested</span><span style={{ height: 20, padding: "0 8px", borderRadius: 6, fontSize: 11, lineHeight: "20px", background: "rgba(52,199,123,.22)", color: "#8BE8B4" }}>From your results</span></span>
                  <span style={{ fontSize: 20, lineHeight: "24px", fontWeight: 600 }}>Win back lapsed buyers</span>
                </div>
                <div className="row g8">
                  <span className="row g8" style={{ height: 36, padding: "0 12px 0 8px", borderRadius: 8, background: "rgba(255,255,255,.12)", fontSize: 13, fontWeight: 500 }}><AgentFace kind="analyst" size={20} />Find the best set-up</span>
                  <span className="row g6" style={{ height: 36, padding: "0 16px", borderRadius: 8, background: "#34C77B", color: "#0B2B1A", fontSize: 13, fontWeight: 600 }}><Icon name="check" size={12} />Approve plan</span>
                </div>
              </div>
              <div className="row g24" style={{ alignItems: "flex-start" }}>
                {figure("Budget · yours to set", <CountUp to={250} prefix="$" />, "over 14 days · $18 a day", 200)}
                <span aria-hidden className="anim-up" style={css({ "--d": 280, fontSize: 24, color: "rgba(255,255,255,.35)", paddingTop: 24 })}>→</span>
                {figure("Likely comes back", <CountUp to={1214} prefix="$" />, "14 orders · $87 each", 320)}
                {figure("Profit after costs", <CountUp to={622} prefix="+$" />, "what is left for you", 440, "#6EE7A8")}
              </div>
              <div className="row" style={{ borderTop: "1px solid rgba(255,255,255,.1)", paddingTop: 12 }}>
                {STEPS.map((t, j) => (
                  <span key={t} className="row g8 fill" style={{ fontSize: 12, color: j < 2 ? "#fff" : dim }}>
                    <span className="row center" style={{ width: 20, height: 20, borderRadius: 99, alignItems: "center", fontSize: 11, background: j === 0 ? "#34C77B" : j === 1 ? "#fff" : "rgba(255,255,255,.12)", color: j === 0 ? "#0B2B1A" : j === 1 ? "#121212" : dim }}>{j === 0 ? "✓" : j + 1}</span>{t}
                  </span>))}
              </div>
            </div>
            <div className="card anim-up" style={css({ padding: "12px 16px 16px", gap: 12, "--d": 420 })}>
              <div className="row between"><span className="sm i2">The same $250 over more time</span><span className="xs i3">410 in stock · sells 243 a month without ads</span></div>
              <div className="row g12" style={{ alignItems: "stretch" }}>
                {TIME.map(([t, v, rows, best]) => (
                  <div key={t} className="col g8 fill" style={{ padding: "12px 16px", borderRadius: 12, background: best ? "#121212" : "var(--tray)", color: best ? "#fff" : undefined }}>
                    <span className="row between"><span className="sm w5">{t}</span>{best && <span style={{ height: 20, padding: "0 8px", borderRadius: 6, fontSize: 11, lineHeight: "20px", background: "rgba(52,199,123,.22)", color: "#8BE8B4" }}>Earns the most</span>}</span>
                    <span className="tnum" style={{ fontSize: 24, lineHeight: "28px", fontWeight: 500, color: best ? "#6EE7A8" : "var(--green)" }}>{v}</span>
                    {rows.map(([k, x]) => <span key={k} className="row between xs" style={{ color: best ? dim : "var(--ink-3)" }}><span>{k}</span><span className="tnum" style={{ color: best ? "#fff" : "var(--ink)" }}>{x}</span></span>)}
                  </div>))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="lp-float hide-md lp-pop" style={css({ right: 4, top: 262, width: 214, "--delay": "2.4s" })}>
        <div className="card" style={{ overflow: "visible", boxShadow: "0 0 0 1px rgba(18,18,18,0.04), 0 8px 20px -4px rgba(18,18,18,0.12)", padding: 8, gap: 8 }}>
          <div style={{ position: "relative", height: 220, outline: "1.5px solid var(--select)", outlineOffset: -1, borderRadius: 6 }}>
            <div className="thumb" style={{ position: "absolute", inset: 0, borderRadius: 6 }}><Image src="/landing/duo-perfume.jpg" alt="A product photo used in an ad" fill sizes="214px" style={{ objectFit: "cover" }} /></div>
            <span className="sel-label" style={{ top: -21 }}>Ad picture</span>
            <SelHandles />
          </div>
          <div className="col g2" style={{ padding: "2px 4px 4px" }}><span className="sm w5">Still thinking about it?</span><span className="xs i3">Your own photo · 1 of 3 ads</span></div>
        </div>
        <div className="row g6 lp-remy" style={{ position: "absolute", left: -46, top: 168 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#1AA7C8" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round"><path d="M4 3l16 7-7 2.2L10 20z" /></svg>
          <span className="row g4" style={{ height: 22, padding: "0 8px 0 4px", borderRadius: 6, background: "#1AA7C8", color: "#fff", fontSize: 12, fontWeight: 500, marginTop: 14 }}>
            <span style={{ width: 16, height: 16, borderRadius: 99, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}><AgentFace kind="builder" size={14} /></span>Remy
          </span>
        </div>
      </div>

      <div className="lp-float hide-md lp-pop" style={css({ left: 4, bottom: 24, width: 268, "--delay": "3s" })}>
        <div className="col g6" style={{ padding: "12px 16px", background: "#fff", border: "1px solid var(--line)", borderRadius: 12, boxShadow: "0 0 0 1px rgba(18,18,18,0.04), 0 8px 20px -4px rgba(18,18,18,0.12)" }}>
          <div className="row g8"><AgentFace kind="analyst" size={20} mood="up" /><span className="sm w5">Iris</span><span className="xs i3">· read 1,032 orders</span></div>
          <span className="sm w5 i1">3,095 buyers have gone quiet</span>
          <span className="xs i2" style={{ lineHeight: "16px" }}>They bought 2–6 months ago and haven’t been back. $250 over 14 days should bring about 14 of them back</span>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- content */
const WALK: { num: string; title: string; muted: string; body: string; who: Kind[]; you: string }[] = [
  { num: "01", title: "Connect.", muted: "Shopify and Meta, a few clicks.", body: "Cleo reads your orders, products, stock and customers, and up to three years of your ad results. No names, emails or addresses are copied.", who: ["catalog", "analyst"], you: "You connect two accounts" },
  { num: "02", title: "Plan.", muted: "A reason, a budget, what comes back.", body: "Iris lists the campaigns worth running today — a holiday, buyers going quiet, stock sitting — each with a budget and the profit it should leave.", who: ["analyst"], you: "You set the budget and approve" },
  { num: "03", title: "Run.", muted: "Ads on Meta, results you can check.", body: "Remy writes the ads from your real product photos. Otto puts them on Meta paused, then watches spend against the orders Shopify can prove.", who: ["builder", "qa"], you: "You switch it on" },
];

const AGENTS: { kind: Kind; name: string; role: string; does: string; asks: string }[] = [
  { kind: "analyst", name: "Iris", role: "The reason and the numbers", does: "Reads your orders, ad results and competitors’ ads, and works out each campaign: why now, how much, and what it should bring back.", asks: "Marks every assumption as an assumption" },
  { kind: "catalog", name: "Cleo", role: "Products and stock", does: "Keeps Shopify and Meta in sync every hour, watches what is running out or sitting, and fixes store listings Google and AI search read.", asks: "Never copies customer contact details" },
  { kind: "builder", name: "Remy", role: "Writes the ads", does: "Writes each campaign’s ads in your brand’s voice, from your real product photos and your own words. Ask for changes in plain language.", asks: "Nothing runs until you approve it" },
  { kind: "qa", name: "Otto", role: "Places the ads, watches the spend", does: "Puts approved ads on Meta paused, checks every one, and pauses what loses money once it is running.", asks: "Never raises spend on his own" },
];

const FAQ: [string, string][] = [
  ["Do we need to be on Shopify already?", "Yes. Kaviar works on the Shopify store you have, and connecting it takes a few minutes. If you are on another platform, tell us on the call."],
  ["Does Kaviar spend money or change our ads on its own?", "Only what you allow. Every campaign waits for your yes on its budget, ads go onto Meta paused, and you switch them on. Autopilot can pause what loses money if you let it. It never raises spend by itself."],
  ["Where do the forecast numbers come from?", "From your own store: prices, margins, stock and orders. Ad rates start as labelled assumptions and are replaced by your own results as your ads run. Nothing is borrowed from competitors, because Meta does not share what their ads earn."],
  ["Why do Meta and Shopify show different sales numbers?", "Meta counts a sale if someone saw or clicked an ad in the last few days, even when the order came through Google or email. Shopify only counts orders that arrived through tagged Meta links. Kaviar shows both and decides on the number Shopify can prove."],
  ["What can you see about our competitors?", "What Meta publishes: every ad they run, its words, and how long they kept it — six months back, for ads shown in the EU or UK. Not their spend or sales. Kaviar also reads their public store pages the same way it reads yours."],
  ["Who owns the store and the data?", "You do. The Shopify store and the ad account stay in your name, and you can disconnect either at any time."],
  ["How do we start?", "Book a call. We look at your store and your numbers together and suggest a first campaign."],
];

function ScenePanel({ children }: { children: React.ReactNode }) {
  return <div className="col g12" style={{ width: "100%", maxWidth: 540, margin: "0 auto" }}>{children}</div>;
}
const paper = { background: "#fff", border: "1px solid var(--line)", borderRadius: 12 } as const;

const SCENES = [
  /* 1 · Connect — the two sources, and what is in Kaviar a few minutes later */
  <ScenePanel key="connect">
    <div className="row g12 row-in" style={css({ "--i": 0, alignItems: "stretch" })}>
      {([[<ShopifyLogo key="s" size={18} />, "Shopify", "maison-ore.myshopify.com"], [<MetaLogo key="m" size={18} />, "Meta Ads", "Maison Oré · ad account"]] as [React.ReactNode, string, string][]).map(([logo, name, sub]) => (
        <div key={name} className="col g12 fill" style={{ ...paper, padding: 16, minWidth: 0 }}>
          <span className="row between"><span className="row center" style={{ width: 36, height: 36, borderRadius: 8, alignItems: "center", border: "1px solid var(--line)" }}>{logo}</span><span className="pill green"><span className="dot green" />Connected</span></span>
          <span className="col"><span className="sm w5 i1">{name}</span><span className="xs i3 ell">{sub}</span></span>
        </div>
      ))}
    </div>
    <div className="col row-in" style={css({ "--i": 1, ...paper, padding: "4px 16px" })}>
      {([["bag", "Orders", "a year back, and every new one", "1,032"], ["box", "Products", "prices, costs and stock", "38"], ["users", "Customers", "counted, never copied", "3,095"], ["chart-bar", "Ad results", "per ad, per day, back to 2023", "412 days"]] as [IconName, string, string, string][]).map(([ic, t, sub, n], i) => (
        <div key={t} className="row g12" style={{ padding: "12px 0", borderTop: i ? "1px solid var(--line)" : 0 }}>
          <Icon name={ic} size={15} color="#8B8883" />
          <span className="sm w5 i1" style={{ width: 96 }}>{t}</span><span className="xs i3 fill ell">{sub}</span><span className="sm w5 tnum">{n}</span>
        </div>
      ))}
    </div>
    <div className="row g8 row-in" style={css({ "--i": 2, padding: "8px 12px", ...paper })}><AgentFace kind="catalog" size={18} /><span className="xs i2">Cleo syncs every hour, and the moment a new order arrives</span></div>
  </ScenePanel>,

  /* 2 · Plan — the Budget screen: what is suggested, what it brings back, one press to approve */
  <ScenePanel key="plan">
    <div className="row g12 row-in" style={css({ "--i": 0, alignItems: "stretch" })}>
      {([["Suggested by Iris", "$550", "3 campaigns", "#121212"], ["Likely comes back", "$2,548", "at the likely rates", null], ["Profit after costs", "+$1,280", "after goods and ads", null]] as [string, string, string, string | null][]).map(([k, v, sub, dark], i) => (
        <div key={k} className="col g4 fill" style={{ padding: "12px 16px", borderRadius: 12, minWidth: 0, background: dark ?? "#fff", color: dark ? "#fff" : undefined, border: dark ? 0 : "1px solid var(--line)" }}>
          <span className="xs" style={{ color: dark ? "rgba(255,255,255,.6)" : "var(--ink-3)" }}>{k}</span>
          <span className="tnum" style={{ fontSize: 24, lineHeight: "28px", fontWeight: 500, letterSpacing: "-0.015em", color: i === 2 ? "var(--green)" : undefined }}>{v}</span>
          <span className="xs" style={{ color: dark ? "rgba(255,255,255,.6)" : "var(--ink-3)" }}>{sub}</span>
        </div>
      ))}
    </div>
    <div className="col row-in" style={css({ "--i": 1, ...paper, padding: "4px 16px" })}>
      {([
        ["amber-eau-de-parfum", "Black Friday is in 4 days", "Holiday", "$150", "+$652", true],
        ["duo-perfume", "Win back lapsed buyers", "Buyers going quiet", "$250", "+$622", false],
        ["cream-jars", "380 hand creams are sitting", "Stock sitting", "$150", "+$6", false],
      ] as [string, string, string, string, string, boolean][]).map(([img, t, why, budget, profit, first], i) => (
        <div key={t} className="row g12" style={{ padding: "12px 0", borderTop: i ? "1px solid var(--line)" : 0 }}>
          <div className="thumb" style={{ width: 40, height: 40, borderRadius: 8, position: "relative" }}><Image src={`/landing/${img}.jpg`} alt="" fill sizes="40px" /></div>
          <div className="col fill" style={{ minWidth: 0 }}><span className="sm i1 w5 ell">{t}</span><span className="xs i3">{why}</span></div>
          <div className="col" style={{ alignItems: "flex-end" }}><span className="sm w5 tnum">{budget}</span><span className="xs tnum c-green">{profit}</span></div>
          <span className={`btn sm${first ? " dark" : ""}`} style={{ pointerEvents: "none" }}>{first ? "Approve" : "Open"}</span>
        </div>
      ))}
    </div>
    <div className="row g8 row-in" style={css({ "--i": 2, padding: "8px 12px", ...paper })}><AgentFace kind="analyst" size={18} /><span className="xs i2">Each campaign sells one product to one audience, with its own budget</span></div>
  </ScenePanel>,

  /* 3 · Run — the ad as it runs, the switch, and what it brought back */
  <ScenePanel key="run">
    <div className="row g12" style={{ alignItems: "stretch" }}>
      <div className="col row-in" style={css({ "--i": 0, ...paper, width: 216, flexShrink: 0, overflow: "hidden" })}>
        <span className="row g8" style={{ padding: "8px 12px" }}>
          <span className="thumb" style={{ width: 24, height: 24, borderRadius: 99, position: "relative" }}><Image src="/landing/amber-eau-de-parfum.jpg" alt="" fill sizes="24px" /></span>
          <span className="col" style={{ lineHeight: "14px" }}><span className="xs w5 i1">Maison Oré</span><span className="i3" style={{ fontSize: 11 }}>Sponsored</span></span>
        </span>
        <span className="xs i1" style={{ padding: "0 12px 8px" }}>Still thinking about it? Amber No. 3 is back, and yours ships today</span>
        <div style={{ position: "relative", height: 196 }}><Image src="/landing/duo-perfume.jpg" alt="An ad made from the brand’s own product photo" fill sizes="216px" style={{ objectFit: "cover" }} /></div>
        <span className="row between" style={{ padding: "8px 12px", background: "var(--tray)" }}><span className="col" style={{ lineHeight: "14px" }}><span className="i3" style={{ fontSize: 11 }}>maison-ore.com</span><span className="xs w5 i1 ell">Amber No. 3</span></span><span className="btn sm" style={{ pointerEvents: "none" }}>Shop now</span></span>
      </div>
      <div className="col g12 fill" style={{ minWidth: 0 }}>
        <div className="col g8 row-in" style={css({ "--i": 1, ...paper, padding: 16 })}>
          <span className="row between"><span className="sm w5 i1">On Meta</span><span className="switch on"><span className="k" /></span></span>
          <span className="xs i3">Running · $18 a day · Meta stops it in 9 days</span>
        </div>
        <div className="col g8 row-in" style={css({ "--i": 2, ...paper, padding: 16 })}>
          <span className="xs i3">Day 5 of 14</span>
          {([["Spent", "$90"], ["Orders Shopify can prove", "6"], ["Came back", "$522"]] as [string, string][]).map(([k, v]) => <span key={k} className="row between sm"><span className="i2">{k}</span><span className="w5 tnum i1">{v}</span></span>)}
        </div>
        <div className="row g8 row-in" style={css({ "--i": 3, padding: "8px 12px", ...paper })}><AgentFace kind="qa" size={18} /><span className="xs i2">Otto pauses it if it starts losing money</span></div>
      </div>
    </div>
  </ScenePanel>,
];

const LOOP_TABS = [
  { icon: <Icon name="lightning" size={15} />, title: "Why now", sub: "A reason from your data" },
  { icon: <Icon name="chart-bar" size={15} />, title: "Budget", sub: "What it should bring back" },
  { icon: <Icon name="image" size={15} />, title: "Ads", sub: "From your real photos" },
  { icon: <Icon name="target" size={15} />, title: "Launch", sub: "On Meta, paused first" },
  { icon: <Icon name="repeat" size={15} />, title: "Results", sub: "Keep, fix, go again" },
];

function PaneText({ k, title, body }: { k: string; title: string; body: string }) {
  return (
    <div className="col g8 it" style={css({ "--i": 0, flex: "0 1 300px", minWidth: 0 })}>
      <span className="lp-kicker">{k}</span><span className="h2">{title}</span><p className="sm i2">{body}</p>
    </div>
  );
}

const PANES = [
  <Fragment key="pane-0">
    <PaneText k="Step 1" title="No campaign without a reason" body="Iris reads orders, stock and customers every hour. A campaign appears only when something in your data says it is worth running today." />
    <div className="col g8 fill" style={{ minWidth: 0 }}>
      {([
        ["calendar", "Holiday", "Black Friday is in 4 days", "Suggested"],
        ["users", "Buyers going quiet", "3,095 bought 2–6 months ago, not since", "Suggested"],
        ["box", "Stock sitting", "380 hand creams, none sold in 30 days", "Suggested"],
        ["megaphone", "Nobody says it", "A message no competitor is using", "Yours to test"],
      ] as [IconName, string, string, string][]).map(([ic, t, v, st], i) => (
        <div key={t} className="row g12 it" style={css({ "--i": i + 1, padding: "12px 16px", border: "1px solid var(--line)", borderRadius: 12 })}>
          <span className="row center" style={{ width: 32, height: 32, borderRadius: 8, alignItems: "center", background: "var(--tray)", border: "1px solid var(--line)" }}><Icon name={ic} size={15} /></span>
          <div className="col fill" style={{ minWidth: 0 }}><span className="sm w5 i1">{t}</span><span className="xs i3 ell">{v}</span></div>
          <span className={`pill ${st === "Suggested" ? "green" : "amber"}`}>{st}</span>
        </div>
      ))}
    </div>
  </Fragment>,
  <Fragment key="pane-1">
    <PaneText k="Step 2" title="A budget, and what it brings back" body="Every campaign shows what the spend should return and what is left after costs, as a range. Profit is the goal; your stock and your deadline are the limits." />
    <div className="col g10 fill" style={{ minWidth: 0 }}>
      <div className="row g16 it" style={css({ "--i": 1, padding: 16, border: "1px solid var(--line)", borderRadius: 12, flexWrap: "wrap" })}>
        {[["Budget", "$250 · 14 days"], ["Likely comes back", "$1,214"], ["Profit after costs", "+$622"], ["If it goes badly", "+$214"]].map(([k, v]) => <div key={k} className="col"><span className="xs i3">{k}</span><span className="sm w5 i1 tnum">{v}</span></div>)}
      </div>
      {["The same budget compared over 1, 3 and 6 months", "It never plans to sell stock you don’t have", "Rates start as assumptions, replaced by your own results"].map((t, i) => (
        <span key={t} className="row g8 sm i1 it" style={css({ "--i": i + 2 })}><Icon name="check-circle" size={16} weight="fill" color="#1F8A5B" />{t}</span>
      ))}
      <div className="row g10 it" style={css({ "--i": 5, padding: "8px 12px", background: "var(--tray)", borderRadius: 12 })}><AgentFace kind="analyst" size={18} /><span className="xs i2">“Find the best set-up” works out who should see it, how much and for how long</span></div>
    </div>
  </Fragment>,
  <Fragment key="pane-2">
    <PaneText k="Step 3" title="Ads made from what you sell" body="Tell Remy what you want in your own words, pick a product, add your own pictures. He writes the ads; Otto checks every one. You approve what runs." />
    <div className="row g10 fill" style={{ flexWrap: "wrap", minWidth: 0 }}>
      {["amber-eau-de-parfum", "duo-perfume", "gold-bottles", "cream-jars", "perfume-lineup", "dropper-pedestal"].map((p, i) => (
        <div key={p} className="lp-thumb-ad it" style={css({ "--i": i + 1, width: "calc((100% - 20px) / 3)", height: 132 })}>
          <Image src={`/landing/${p}.jpg`} alt="" fill sizes="160px" style={{ objectFit: "cover" }} />
          <span className="row g4" style={{ position: "absolute", left: 8, bottom: 8, height: 24, padding: "0 8px", borderRadius: 6, background: "#fff", fontSize: 11, fontWeight: 500, color: i < 2 ? "var(--green)" : "var(--ink-2)" }}>{i < 2 ? "Approved" : "To review"}</span>
        </div>
      ))}
    </div>
  </Fragment>,
  <Fragment key="pane-3">
    <PaneText k="Step 4" title="On Meta, paused until you say go" body="Otto builds the campaign on Meta with your Page, your pixel and a set end date. Everything arrives paused. You switch it on." />
    <div className="col g10 fill" style={{ minWidth: 0 }}>
      <div className="col g10 it" style={css({ "--i": 1, padding: 16, border: "1px solid var(--line)", borderRadius: 12 })}>
        <div className="row between"><span className="t w5 i1">Win back lapsed buyers</span><span className="pill blue"><span className="dot blue" />On Meta · paused</span></div>
        <div className="row g16" style={{ flexWrap: "wrap" }}>
          {[["Budget", "$18 a day"], ["Length", "14 days"], ["Ads", "3 approved"], ["Audience", "3,095 lapsed"]].map(([k, v]) => <div key={k} className="col"><span className="xs i3">{k}</span><span className="sm w5 i1">{v}</span></div>)}
        </div>
      </div>
      {["Nothing is spent until you switch it on", "Meta stops it on the end date you set", "Change the budget or pause it from the same page"].map((t, i) => (
        <span key={t} className="row g8 sm i1 it" style={css({ "--i": i + 2 })}><Icon name="check-circle" size={16} weight="fill" color="#1F8A5B" />{t}</span>
      ))}
    </div>
  </Fragment>,
  <Fragment key="pane-4">
    <PaneText k="Step 5" title="See what sold, then decide" body="Autopilot checks your ads every morning against the orders Shopify can prove, and proposes changes with the reason for each. Try approving one." />
    <div className="fill" style={{ minWidth: 0 }}>
      <ApproveList items={[
        ["Hold the Peony Duo ads", "12 left — ads would sell out stock in 4 days"],
        ["Pause Lookalike 1%", "0.7× verified on $322 this week"],
        ["Refresh the win-back ads", "Seen 4 times each — clicks are falling"],
        ["Test a reorder reminder", "Buyers come back about 51 days after a first order"],
      ]} />
    </div>
  </Fragment>,
];

/** The brand's day as the app's Today screen shows it: the month in blocks, then what needs a yes. An example brand's figures. */
function TodayBoard() {
  const tile = (label: string, value: string, note: string, logo: React.ReactNode, tone?: string) => (
    <div className="col g4" style={{ flex: "1 1 40%", minWidth: 0, padding: 16, borderRadius: 16, background: tone ?? "var(--tray)", border: "1px solid var(--line)" }}>
      <span className="row between xs i3"><span>{label}</span>{logo}</span>
      <span className="tnum" style={{ fontSize: 28, lineHeight: "32px", fontWeight: 500, letterSpacing: "-0.015em" }}>{value}</span>
      <span className="xs i3">{note}</span>
    </div>
  );
  const act = (n: string, kind: string, title: string, sub: string, cta: string, tag: string, dark: boolean) => (
    <div className="col g12" style={{ flex: "1 1 320px", minWidth: 0, padding: 20, borderRadius: 16, background: "#fff", border: dark ? "1.5px solid var(--ink)" : "1px solid var(--line)" }}>
      <span className="row between g8"><span className="row g8 sm"><span className="mono i3">{n}</span><span className="c-amber">{kind}</span></span><span className="pill amber">{tag}</span></span>
      <span className="col g4"><span className="h2">{title}</span><span className="sm i3">{sub}</span></span>
      <span className="row g8"><span className={`btn sm${dark ? " dark" : ""}`} style={{ pointerEvents: "none" }}>{cta}</span></span>
    </div>
  );
  return (
    <div className="col g12" data-reveal>
      <div className="row g12" style={{ alignItems: "stretch", flexWrap: "wrap" }}>
        <div className="col" style={{ flex: "1.3 1 320px", minWidth: 0, padding: 20, borderRadius: 16, background: "#121212", color: "#fff", gap: 8 }}>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,.55)" }}>Sales · last 30 days</span>
          <span className="tnum" style={{ fontSize: 44, lineHeight: "48px", fontWeight: 500, letterSpacing: "-0.02em" }}>$48,920</span>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,.55)" }}><span style={{ color: "#6EE7A8" }}>+12%</span> vs the 30 days before</span>
          <svg viewBox="0 0 320 84" preserveAspectRatio="none" style={{ display: "block", width: "100%", height: 84, marginTop: "auto" }} aria-hidden>
            <polyline points="0,62 26,58 52,64 78,50 104,54 130,40 156,46 182,34 208,38 234,24 260,30 286,16 320,12" fill="none" stroke="#6EE7A8" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
        <div className="row g12" style={{ flex: "2 1 420px", minWidth: 0, flexWrap: "wrap", alignItems: "stretch" }}>
          {tile("Orders", "1,032", "+9% vs prior", <ShopifyLogo size={12} />)}
          {tile("Ad spend", "$9,840", "3 campaigns running", <MetaLogo size={12} />)}
          {tile("Back per $1", "1.46×", "verified by Shopify orders", <span className="row g4"><ShopifyLogo size={12} /><MetaLogo size={12} /></span>)}
          {tile("Inventory", "2 to reorder", "1 runs out this week", <Icon name="box" size={13} color="#B7791F" />, "var(--amber-bg)")}
        </div>
      </div>
      <div className="row g12" style={{ alignItems: "stretch", flexWrap: "wrap" }}>
        {act("01", "Protect", "Peony Duo runs out in 4 days", "12 left · sells 3 a day", "Restock", "4 days with nothing to sell", true)}
        {act("02", "Holiday", "Black Friday is in 4 days", "$150 over 7 days should bring back about $1,117", "Approve $150", "Campaign ready", false)}
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <>
      <RevealObserver />
      <NavShell>
        <div className="lp-wrap">
          <Wordmark href="/" />
          <div className="lp-links">
            <a href="#how">How it works</a><a href="#loop">Campaigns</a><a href="#numbers">Real numbers</a><a href="#market">Competitors</a><a href="#agents">Agents</a><a href="#faq">FAQ</a>
          </div>
          <div className="fill" />
          <Link href="/login" className="btn quiet sm hide-sm">Sign in</Link>
          <a href="#contact" className="btn dark sm">Book a call<span className="arr">→</span></a>
        </div>
      </NavShell>

      <main>
        <section id="hero" className="lp-wrap lp-hero" style={{ position: "relative" }}>
          <Cursor kind="analyst" name="Iris" color="#6A8FD6" style={{ left: "6%", top: 150 }} />
          <Cursor kind="catalog" name="Cleo" color="#22A46E" style={css({ right: "7%", top: 118, animationDelay: "-4s" })} />
          <Cursor kind="qa" name="Otto" color="#EB7A3C" style={css({ right: "12%", top: 330, animationDelay: "-8s" })} />

          <h1 className="lp-h1" data-reveal style={css({ "--i": 1 })}>
            Your Shopify brand’s ads, planned,{" "}
            <span className="lp-sel">made<span className="box" /><span className="hd sel-tl" /><span className="hd sel-tr" /><span className="hd sel-bl" /><span className="hd sel-br" />
              <span className="tag"><span style={{ width: 16, height: 16, borderRadius: 99, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}><AgentFace kind="builder" size={13} /></span>Remy</span>
            </span>{" "}and run from your own store data
          </h1>
          <p className="lp-lead" data-reveal style={css({ "--i": 2 })}>Kaviar reads your orders, stock and customers, works out what is worth advertising and what it should bring back, makes the ads from your real product photos and runs them on Meta. Nothing is spent until you approve it.</p>
          <div data-reveal style={css({ "--i": 3, width: "100%", display: "flex", justifyContent: "center" })}><HeroBrief /></div>
          <div className="row g8" data-reveal style={css({ "--i": 4, justifyContent: "center" })}>
            <div className="row g4">{(["analyst", "catalog", "builder", "qa"] as const).map((k) => <AgentFace key={k} kind={k} size={22} />)}</div>
            <span className="sm i3">Iris, Cleo, Remy and Otto do the work. You decide</span>
          </div>
          <div className="lp-stage" data-observe><div className="lp-stage-box"><ProductWindow /></div></div>
        </section>

        <section id="today" className="lp-section white">
          <div className="lp-wrap">
            <div className="lp-head" data-reveal>
              <span className="lp-kicker">Today</span>
              <h2 className="lp-h2">One screen says what needs you today</h2>
              <p className="lp-lead">Sales, stock, ads and competitors, read every hour and turned into a short list of things to do. Each one is a button, not a report.</p>
            </div>
            <TodayBoard />
            <div className="lp-grid" style={{ marginTop: 56 }}>
              {[
                ["A reason for every ad", "A campaign appears only when your data says it is worth running."],
                ["Profit, not clicks", "Each budget shows what should be left after costs, as a range."],
                ["You decide", "No budget is approved and no ad goes live until you say yes."],
                ["Numbers that join up", "Shopify orders and Meta spend in one place, checked against each other."],
              ].map(([t, d], i) => (
                <div key={t} className="col g6" data-reveal style={css({ "--i": i, padding: "4px 0" })}>
                  <span className="lp-num">0{i + 1}</span><span className="h3">{t}</span><span className="sm i3">{d}</span>
                </div>
              ))}
            </div>
            <p className="xs i3" data-reveal style={{ marginTop: 16 }}>Figures from an example fragrance brand</p>
          </div>
        </section>

        <section id="how" className="lp-section">
          <div className="lp-wrap">
            <div className="lp-head" data-reveal>
              <span className="lp-kicker">How it works</span>
              <h2 className="lp-h2">From a connected store to ads that are running</h2>
            </div>
            <Walkthrough steps={WALK.map(({ who, ...w }) => ({ ...w, who: who.map((k) => <AgentFace key={k} kind={k} size={20} />) }))} scenes={SCENES} />
            <p className="xs i3" data-reveal style={{ marginTop: 16 }}>Figures from an example fragrance brand</p>
          </div>
        </section>

        <section id="loop" className="lp-section white">
          <div className="lp-wrap">
            <div className="lp-head" data-reveal>
              <span className="lp-kicker">Campaigns</span>
              <h2 className="lp-h2">Every campaign follows the same steps</h2>
              <p className="lp-lead">So you always know what is running, why, what it costs and what it really earned.</p>
            </div>
            <div data-reveal><LoopTabs tabs={LOOP_TABS} panes={PANES} /></div>
          </div>
        </section>

        <section id="numbers" className="lp-section">
          <div className="lp-wrap lp-split">
            <div className="col g16" data-reveal>
              <span className="lp-kicker">Real numbers</span>
              <h2 className="lp-h2">Meta says one number. Shopify proves another</h2>
              <p className="lp-lead">Meta counts a sale if someone saw or clicked an ad in the last few days — even when the order came through Google or email. Kaviar puts both side by side and makes decisions on the proven one.</p>
              <div className="col g10" style={{ paddingTop: 4 }}>
                {[
                  "Every ad carries its own id, so each order shows the ad that sold it",
                  "See which ad sold which product, not just which campaign",
                  "Budgets move on verified results, not on the biggest number",
                ].map((t) => <span key={t} className="row g10 t i1"><Icon name="check" size={16} color="#1F8A5B" weight="bold" />{t}</span>)}
              </div>
            </div>
            <div data-reveal style={css({ "--i": 2 })}><NumbersCard /></div>
          </div>
        </section>

        <section id="market" className="lp-section white">
          <div className="lp-wrap">
            <div className="lp-head" data-reveal>
              <span className="lp-kicker">Competitors</span>
              <h2 className="lp-h2">See what your competitors kept running, and what they dropped</h2>
              <p className="lp-lead">Meta publishes every ad a brand runs and how long it ran — never what it earned. Kaviar reads six months of it, so you can see which messages they kept for months and which they stopped in days.</p>
            </div>
            <div className="col" data-reveal style={{ marginBottom: 12, padding: "8px 20px", borderRadius: 16, background: "var(--tray)", border: "1px solid var(--line)", overflowX: "auto" }}>
              {([
                ["Brand", "Running", "Stopped in a week", "Kept 30+ days", "Typical run"],
                ["You · Maison Oré", "3", "–", "–", "–"],
                ["Atelier Nord", "300", "17%", "50%", "29 days"],
                ["Sol & Sel", "294", "70%", "10%", "3 days"],
                ["Maison Lune", "155", "41%", "4%", "9 days"],
              ] as string[][]).map((r, i) => (
                <div key={r[0]} className="row" style={{ minWidth: 560, padding: "12px 0", borderTop: i ? "1px solid var(--line)" : 0 }}>
                  {r.map((c, j) => <span key={j} className={`${i ? "sm" : "xs i3"} tnum${j === 0 && i ? " w5" : ""}`} style={{ flex: j === 0 ? "1.6 1 0" : "1 1 0", textAlign: j === 0 ? "left" : "right", color: i && j === 3 && c !== "–" ? "var(--green)" : undefined }}>{c}</span>)}
                </div>
              ))}
            </div>
            <div className="row g12" data-reveal style={{ alignItems: "stretch", flexWrap: "wrap" }}>
              {([
                ["Atelier Nord", "running 190 days", "The serum 2 million people reorder. One step, every morning"],
                ["Sol & Sel", "ran 132 days", "Three scents, one box. Find yours before you commit to a bottle"],
                ["Maison Lune", "ran 41 days", "Up to 40% off the bestsellers, this week only"],
              ] as [string, string, string][]).map(([who, ran, text], i) => (
                <div key={who} className="col g12" style={css({ "--i": i, flex: "1 1 260px", padding: 16, borderRadius: 12, background: "#fff", border: "1px solid var(--line)" })}>
                  <span className="row between g8"><span className="sm w5">{who}</span><span className="xs tnum c-green">{ran}</span></span>
                  <span className="sm i2" style={{ minHeight: 60 }}>{text}</span>
                  <span className="row g8"><span className="btn dark sm" style={{ pointerEvents: "none" }}><AgentFace kind="builder" size={14} />Make our version</span><span className="xs i3">starts a campaign from the idea</span></span>
                </div>
              ))}
            </div>
            <div className="lp-grid" style={{ marginTop: 32 }}>
              {[
                ["How many ads they test", "The share they stop within a week, and the share they keep past 30 days."],
                ["What nobody is saying", "Messages and buyers no competitor speaks to. One press tests one."],
                ["Their store against yours", "Search, AI search and speed, read the same way on every site."],
                ["What it cannot see", "Their spend, clicks and sales. Nobody outside can, and Kaviar says so."],
              ].map(([t, d], i) => (
                <div key={t} className="col g6" data-reveal style={css({ "--i": i, padding: "4px 0" })}>
                  <span className="h3">{t}</span><span className="sm i3">{d}</span>
                </div>
              ))}
            </div>
            <p className="xs i3" data-reveal style={{ marginTop: 16 }}>Example cards. Competitor ads come from Meta’s Ad Library and cover ads shown in the EU or UK</p>
          </div>
        </section>

        <section id="agents" className="lp-section">
          <div className="lp-wrap">
            <div className="lp-head" data-reveal>
              <span className="lp-kicker">The team</span>
              <h2 className="lp-h2">Four agents do the work. You decide</h2>
              <p className="lp-lead">Each agent has one job and shows what it did. Anything that touches money or goes live waits for your yes.</p>
            </div>
            <AgentCards agents={AGENTS} />
            <div className="row g12" data-reveal style={{ marginTop: 16, padding: "16px 20px", background: "var(--tray)", border: "1px solid var(--line)", borderRadius: 12, flexWrap: "wrap" }}>
              <div className="stack"><div className="av l k">KR</div><div className="av l j">JN</div><div className="av l u">SC</div><div className="av l d">DV</div></div>
              <span className="t i1 fill" style={{ minWidth: 240 }}><b className="w5">The Kaviar team</b> <span className="i3">is there when you want a second pair of eyes on a plan, a batch of ads or a result</span></span>
            </div>
          </div>
        </section>

        <section className="lp-section white tight">
          <div className="lp-wrap">
            <div className="lp-grid">
              {([
                ["lock", "Reads first", "Kaviar reads your Shopify store. On Meta it changes only what you approve."],
                ["key", "Keys kept safe", "Access tokens are encrypted at rest and never shown in the app."],
                ["users", "No customer details copied", "Customers are counted, not copied — no names, emails or addresses leave Shopify."],
                ["store", "Yours, always", "The store, the ad account and the data stay in your name."],
              ] as [IconName, string, string][]).map(([ic, t, d], i) => (
                <div key={t} className="col g8" data-reveal style={css({ "--i": i })}>
                  <span className="row center" style={{ width: 36, height: 36, borderRadius: 10, alignItems: "center", background: "var(--tray)", border: "1px solid var(--line)" }}><Icon name={ic} size={17} /></span>
                  <span className="h3">{t}</span><span className="sm i3">{d}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="faq" className="lp-section">
          <div className="lp-wrap lp-split" style={{ alignItems: "flex-start" }}>
            <div className="col g12" data-reveal style={{ flex: "0 1 360px" }}>
              <span className="lp-kicker">FAQ</span>
              <h2 className="lp-h2">Questions brands ask first</h2>
              <p className="sm i3">Something else? <a className="lnk w5 i1" href="#contact">Ask us on a call.</a></p>
            </div>
            <div className="lp-faq col" data-reveal style={css({ "--i": 1 })}>
              {FAQ.map(([q, a]) => (
                <details key={q}>
                  <summary>{q}<Icon name="plus" size={16} color="#8B8883" /></summary>
                  <p>{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section id="contact" className="lp-section white lp-close">
          <div className="lp-wrap col" style={{ alignItems: "center", gap: 28, position: "relative" }}>
            <div className="col g12" data-reveal style={{ alignItems: "center", textAlign: "center", maxWidth: 620 }}>
              <span className="lp-kicker">Book a call</span>
              <h2 className="lp-h2">Let’s look at your store together</h2>
              <p className="lp-lead">Tell us a little about the brand. We’ll look at your store and numbers before the call and come with a suggested first campaign.</p>
            </div>
            <div className="card" data-reveal style={css({ "--i": 1, padding: 24, width: "100%", maxWidth: 640, boxShadow: "0 1px 2px rgba(18,18,18,0.04), 0 24px 56px rgba(18,18,18,0.08)" })}>
              <ContactForm />
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-wrap row between" style={{ flexWrap: "wrap", gap: 16 }}>
          <div className="col g8"><Wordmark href="/" /><span className="xs i3">Ads for Shopify brands, planned from their own store data · © 2026 Kaviar</span></div>
          <div className="row g20 sm i2" style={{ flexWrap: "wrap" }}>
            <a href="#how">How it works</a><a href="#loop">Campaigns</a><a href="#market">Competitors</a><a href="#faq">FAQ</a><a href="#contact">Book a call</a><Link href="/login">Sign in</Link>
          </div>
        </div>
      </footer>
      <Dock />
    </>
  );
}
