import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Fragment } from "react";
import { Icon, type IconName } from "@/components/icon";
import { AgentFace } from "@/components/agent";
import { MetaLogo, ShopifyLogo } from "@/components/logos";
import { SalesChart } from "@/components/sales-chart";
import { Wordmark } from "@/components/shell/parts";
import { ContactForm } from "./contact-form";
import { CountUp, Dock, NavShell, RevealObserver } from "./motion";
import { HeroBrief } from "./hero-brief";
import { Walkthrough } from "./walkthrough";
import { ApproveList, LoopTabs } from "./loop-tabs";
import { NumbersCard } from "./numbers";
import { AgentCards } from "./agent-cards";

export const metadata: Metadata = {
  title: { absolute: "Kaviar — your Shopify store, built and grown for you" },
  description:
    "Kaviar moves your brand to Shopify, builds the store and runs a weekly growth loop on Meta ads. AI agents do the work; people approve every step.",
  robots: { index: true, follow: true },
};

const css = (o: Record<string, unknown>) => o as React.CSSProperties;

/* ---------------------------------------------------------------- demo data for the product window (fictional brand) */
const DAYS = Array.from({ length: 30 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 9, 9 + i));
  const wk = 1 + 0.18 * Math.sin((i / 7) * 2 * Math.PI + 1.1);
  const rev = Math.round(1630 * wk * (0.9 + 0.2 * (i / 30)) * (1 + 0.12 * Math.sin(i * 2.3 + 3) * Math.cos(i * 0.7)));
  const meta = Math.round(rev * (0.27 + 0.05 * Math.sin(i * 0.9 + 0.4) + 0.03 * (i / 30)));
  const spend = Math.round(328 * (0.92 + 0.12 * (i / 30)) * (1 + 0.06 * Math.sin(i * 1.7)));
  return { day: d.toISOString().slice(0, 10), revenue: rev, meta, spend };
});

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
  const stat = (label: string, value: React.ReactNode, note: string, src: "shopify" | "meta" | "both", d: number, tone?: string) => (
    <div className="stat anim-up" style={css({ "--d": d })}>
      <span className="row g6 xs i3" style={{ whiteSpace: "nowrap" }}>{src !== "meta" && <ShopifyLogo size={12} />}{src !== "shopify" && <MetaLogo size={12} />}{label}</span>
      <span className="v">{value}</span>
      <span className={`xs ${tone ?? "i3"}`}>{note}</span>
    </div>
  );
  return (
    <div className="lp-window" aria-label="Kaviar console showing a brand’s performance">
      <div style={{ width: 1120, height: 640, display: "flex", background: "var(--page)", borderRadius: 18, overflow: "hidden", boxShadow: "0 0 0 1px rgba(18,18,18,0.08), 0 2px 4px rgba(18,18,18,0.04), 0 32px 72px -16px rgba(18,18,18,0.22)" }}>
        <aside className="side" style={{ width: 204, overflow: "hidden" }}>
          <Wordmark href="/" />
          <div className="switcher boxed">
            <div className="thumb" style={{ width: 28, height: 28, borderRadius: 7, position: "relative" }}><Image src="/landing/amber-eau-de-parfum.jpg" alt="" fill sizes="28px" /></div>
            <div className="col fill"><span className="nm">Maison Oré</span><span className="sb">Fine fragrance</span></div>
          </div>
          <nav className="nav">
            <NavItem icon="home" label="Overview" />
            <NavItem icon="plug" label="Integrations" />
            <div className="nav-h">Growth loop</div>
            <NavItem icon="lightning" label="Ad signals" />
            <NavItem icon="image" label="Creative studio" />
            <NavItem icon="target" label="Run ads" />
            <NavItem icon="chart-bar" label="Performance" on />
            <NavItem icon="repeat" label="Optimize & repeat" />
            <div style={{ height: 1, background: "var(--line)", margin: "6px 8px" }} />
            <NavItem icon="megaphone" label="Meta Ads" />
            <NavItem icon="bag" label="Shopify data" />
            <NavItem icon="database" label="Data sync" />
          </nav>
        </aside>
        <div className="sheet" style={{ margin: "8px 8px 8px 0" }}>
          <header className="bar">
            <div className="crumb"><span>Maison Oré</span><Icon name="chev-r" size={12} color="#B5B2AC" /><span>Growth</span><Icon name="chev-r" size={12} color="#B5B2AC" /><b>Performance</b></div>
            <div className="row g10" style={{ height: 30, padding: "0 6px 0 10px", border: "1px solid var(--line)", borderRadius: 99, background: "var(--tray)", whiteSpace: "nowrap" }}>
              <div className="row g4">{[0, 1, 2, 3, 4].map((j) => <span key={j} style={{ width: j === 3 ? 14 : 6, height: 6, borderRadius: 99, background: j === 3 ? "#121212" : j < 3 ? "#1F8A5B" : "#D9D6D1" }} />)}</div>
              <span className="xs i3">Step 4 of 5</span><span className="xs w5 i1">See what really sold</span>
              <span className="row g4" style={{ height: 22, padding: "0 9px", borderRadius: 99, background: "#fff", border: "1px solid var(--line)", fontSize: 11.5, color: "var(--ink-2)" }}>Next: Optimize<Icon name="arrow-r" size={11} /></span>
            </div>
            <div className="fill" />
            <span className="row g6 xs i3"><span className="lp-live" />synced just now</span>
          </header>
          <div className="col" style={{ padding: "18px 20px", gap: 14 }}>
            <div className="row between anim-up" style={css({ alignItems: "flex-end", "--d": 100 })}>
              <div className="col g2"><span className="h2">Performance</span><span className="xs i3">Shopify sales and Meta Ads side by side.</span></div>
              <div className="seg"><span className="o">7 days</span><span className="o on">30 days</span><span className="o">90 days</span></div>
            </div>
            <div className="card" style={{ flexDirection: "row", alignItems: "stretch" }}>
              {stat("Revenue", <CountUp to={48920} prefix="$" />, "+12% vs prior 30d", "shopify", 200, "c-green")}<div className="vr" />
              {stat("Orders", <CountUp to={1032} />, "AOV $47.40", "shopify", 280)}<div className="vr" />
              {stat("Ad spend", <CountUp to={9840} prefix="$" />, "3 campaigns active", "meta", 360)}<div className="vr" />
              {stat("Verified Meta ROAS", <CountUp to={1.46} decimals={2} suffix="×" />, "Meta says 2.20×", "both", 440)}
            </div>
            <div className="card anim-up" style={css({ padding: "12px 14px 6px", gap: 6, "--d": 300 })}>
              <div className="row between"><span className="h3">Sales vs ad spend · per day</span>
                <span className="row g12 xs i3"><span className="row g6"><i style={{ width: 9, height: 9, borderRadius: 2, background: "#DEDBD5" }} />All sales</span><span className="row g6"><i style={{ width: 9, height: 9, borderRadius: 2, background: "#0866FF", opacity: 0.75 }} />From Meta ads</span><span className="row g6"><i style={{ width: 14, height: 2, background: "#121212" }} />Meta spend</span></span>
              </div>
              <SalesChart data={DAYS} currency="USD" height={250} animate />
            </div>
          </div>
        </div>
      </div>

      <div className="lp-float hide-md lp-pop" style={css({ right: -12, top: 262, width: 214, "--delay": "2.4s" })}>
        <div className="card" style={{ overflow: "visible", boxShadow: "0 18px 40px rgba(18,18,18,0.14)", padding: 8, gap: 8 }}>
          <div style={{ position: "relative", height: 220, outline: "1.5px solid var(--select)", outlineOffset: -1, borderRadius: 6 }}>
            <div className="thumb" style={{ position: "absolute", inset: 0, borderRadius: 6 }}><Image src="/landing/duo-perfume.jpg" alt="Product photo on a store page" fill sizes="214px" style={{ objectFit: "cover" }} /></div>
            <span className="sel-label" style={{ top: -21 }}>Product hero</span>
            <SelHandles />
          </div>
          <div className="col g2" style={{ padding: "2px 4px 4px" }}><span className="sm w5">Peony Duo · 2 × 30 ml</span><span className="xs i3">$72 · 12 left</span></div>
        </div>
        <div className="row g6 lp-remy" style={{ position: "absolute", left: -46, top: 168 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#1AA7C8" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round"><path d="M4 3l16 7-7 2.2L10 20z" /></svg>
          <span className="row g4" style={{ height: 22, padding: "0 8px 0 4px", borderRadius: 6, background: "#1AA7C8", color: "#fff", fontSize: 11.5, fontWeight: 500, marginTop: 14 }}>
            <span style={{ width: 17, height: 17, borderRadius: 99, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}><AgentFace kind="builder" size={14} /></span>Remy
          </span>
        </div>
      </div>

      <div className="lp-float hide-md lp-pop" style={css({ left: -12, bottom: 26, width: 268, "--delay": "3s" })}>
        <div className="col g6" style={{ padding: "12px 14px", background: "#fff", border: "1px solid var(--line)", borderRadius: 12, boxShadow: "0 18px 40px rgba(18,18,18,0.14)" }}>
          <div className="row g8"><AgentFace kind="analyst" size={20} mood="up" /><span className="sm w5">Iris</span><span className="xs i3">· read 1,032 orders</span></div>
          <span className="sm w5 i1">Retargeting returns the most</span>
          <span className="xs i2" style={{ lineHeight: "17px" }}>2.11× verified on $2,380 — the only campaign above 2×. Worth more budget next week.</span>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- content */
const SIGNALS: [IconName, string, string][] = [
  ["users", "Lapsed buyers", "2,140 · win-back ready"],
  ["clock", "Reorder timing", "second order ~day 40"],
  ["box", "Peony Duo", "12 left · pause ads soon"],
  ["trend-up", "Retargeting", "2.11× verified"],
  ["tag", "WELCOME10", "on 21% of first orders"],
  ["layers", "Bought together", "Amber No. 3 + Discovery set"],
  ["seal-check", "Top 10% of buyers", "38% of revenue"],
  ["lightning", "Best-seller", "Amber No. 3 · 312 sold"],
];

const WALK = [
  { num: "01", title: "Onboard.", muted: "We read the brand first.", body: "Iris studies your site, brand deck and past orders. Cleo brings the catalog over from Cafe24, WooCommerce or wherever it lives. You only fill in what we can’t find." },
  { num: "02", title: "Build.", muted: "On Shopify, checked twice.", body: "Remy builds the store in your brand’s look, Otto checks every page — prices, links, labels — and you approve on a live preview before anything goes public." },
  { num: "03", title: "Grow.", muted: "Every week, on real numbers.", body: "The team runs the growth loop on Meta: a signal from your data, ads made for it, a small safe test, and decisions on the orders Shopify can prove." },
];

const AGENTS: { kind: Kind; name: string; role: string; does: string; asks: string }[] = [
  { kind: "analyst", name: "Iris", role: "Studies the brand", does: "Reads your site, brand deck, orders and ad results, and says what they mean — with the numbers behind it.", asks: "Shows the source for every insight" },
  { kind: "catalog", name: "Cleo", role: "Manages the catalog", does: "Moves products to Shopify, keeps Shopify and Meta in sync, and builds audiences from your customers.", asks: "Never copies customer contact details" },
  { kind: "builder", name: "Remy", role: "Builds pages and ads", does: "Builds the store and new ad creatives in your brand’s look, from the products you actually sell.", asks: "Waits for approval before anything goes live" },
  { kind: "qa", name: "Otto", role: "Checks quality", does: "Checks every page and every ad — labels, prices, links, brand rules — before a person sees it.", asks: "Flags problems instead of guessing" },
];

const FAQ: [string, string][] = [
  ["Do we need to be on Shopify already?", "No. Kaviar moves brands from Cafe24, WooCommerce and other platforms, and keeps the old store running until the new one is live. If you’re already on Shopify, we start from your store."],
  ["Does Kaviar change our ads or store on its own?", "No. Agents prepare the work and show what they did. A person on the Kaviar team approves every launch, budget change and publish — and anything that touches payments goes through you."],
  ["Why do Meta and Shopify show different sales numbers?", "Meta counts a sale if someone saw or clicked an ad in the last few days, even when the order came through Google or email. Shopify only counts orders that arrived through tagged Meta links. Kaviar shows both and decides on the number Shopify can prove."],
  ["Which channels does Kaviar work with?", "Shopify for the store and Meta (Facebook and Instagram) for ads. We keep it focused so every number joins up."],
  ["Who owns the store and the data?", "You do. The Shopify store and the ad account stay in your name. Kaviar connects with read-only access you can remove at any time."],
  ["How do we start?", "Book a call. We look at your store and your numbers together and suggest where to begin — a new store, a move to Shopify, or the growth loop on the store you have."],
];

function ScenePanel({ children }: { children: React.ReactNode }) {
  return <div className="col g10" style={{ width: "100%", maxWidth: 460, margin: "0 auto" }}>{children}</div>;
}

const pill = { height: 30, padding: "0 12px 0 8px", borderRadius: 99, background: "#fff", border: "1px solid var(--line)", fontSize: 12.5, fontWeight: 500 };

const SCENES = [
  <ScenePanel key="onboard">
    {([
      ["analyst", "Iris read maison-ore.com and the brand deck", "12 pages · 1 deck", true],
      ["catalog", "Cleo moved 38 products from Cafe24", "96 variants · 212 images", true],
      ["qa", "Otto checked prices against the old store", "0 differences", true],
      [null, "You confirm brand basics", "2 fields left", false],
    ] as [Kind | null, string, string, boolean][]).map(([k, t, s, done], i) => (
      <div key={t} className="row g10 row-in" style={css({ "--i": i, padding: "12px 14px", background: "#fff", border: "1px solid var(--line)", borderRadius: 12 })}>
        {k ? <AgentFace kind={k} size={22} /> : <div className="av j">JN</div>}
        <div className="col fill"><span className="sm i1 w5">{t}</span><span className="xs i3">{s}</span></div>
        <Icon name={done ? "check-circle" : "circle"} size={18} weight={done ? "fill" : "regular"} color={done ? "#1F8A5B" : "#B7791F"} />
      </div>
    ))}
  </ScenePanel>,
  <ScenePanel key="build">
    <div className="row-in" style={css({ "--i": 0, position: "relative", height: 250, outline: "1.5px solid var(--select)", outlineOffset: -1, borderRadius: 10 })}>
      <div className="thumb" style={{ position: "absolute", inset: 0, borderRadius: 10 }}><Image src="/landing/perfume-lineup.jpg" alt="Store hero section being built" fill sizes="460px" style={{ objectFit: "cover" }} /></div>
      <span className="sel-label">Homepage · Hero</span>
      <SelHandles />
      <div style={{ position: "absolute", left: 24, bottom: 24, color: "#fff" }}><div style={{ fontSize: 24, fontWeight: 500, letterSpacing: "-0.02em", lineHeight: "28px" }}>Scents for slow mornings</div><div className="xs" style={{ opacity: 0.85 }}>Shop the collection →</div></div>
    </div>
    <div className="row g8 row-in" style={css({ "--i": 1, flexWrap: "wrap" })}>
      <span className="row g6" style={pill}><AgentFace kind="qa" size={18} />24 checks passed</span>
      <span className="row g6" style={pill}><AgentFace kind="builder" size={18} />3 of 7 pages built</span>
      <span className="pill amber">Your review</span>
    </div>
  </ScenePanel>,
  <ScenePanel key="grow">
    <div className="row g6 row-in" style={css({ "--i": 0 })}>
      {(["lightning", "image", "target", "chart-bar", "repeat"] as IconName[]).map((ic, j) => (
        <span key={ic} className="row center" style={{ width: 40, height: 40, borderRadius: 12, alignItems: "center", background: j === 0 ? "var(--ink)" : "#fff", border: "1px solid var(--line)" }}><Icon name={ic} size={17} color={j === 0 ? "#fff" : "#55534F"} /></span>
      ))}
    </div>
    <div className="col g4 row-in" style={css({ "--i": 1, padding: "14px 16px", background: "#fff", border: "1px solid var(--line)", borderRadius: 12 })}>
      <span className="xs i3">This week · from Shopify</span>
      <span className="t w5 i1">Win-back ads for 2,140 customers who haven’t ordered in 60 days</span>
      <span className="xs i3">9 ads to review · $40/day test · results in 7 days</span>
    </div>
    <div className="row g8 row-in" style={css({ "--i": 2 })}>
      {["amber-eau-de-parfum", "gold-bottles", "duo-perfume"].map((p) => (
        <div key={p} className="lp-thumb-ad" style={{ width: 96, height: 120 }}><Image src={`/landing/${p}.jpg`} alt="" fill sizes="96px" style={{ objectFit: "cover" }} /></div>
      ))}
      <div className="col center" style={{ width: 96, height: 120, borderRadius: 10, border: "1px dashed var(--line-2)", alignItems: "center" }}><span className="xs i3">+6 more</span></div>
    </div>
  </ScenePanel>,
];

const LOOP_TABS = [
  { icon: <Icon name="lightning" size={15} />, title: "Ad signals", sub: "What the store data says" },
  { icon: <Icon name="image" size={15} />, title: "Creative studio", sub: "Ads made for the signal" },
  { icon: <Icon name="target" size={15} />, title: "Run ads", sub: "A small, safe test" },
  { icon: <Icon name="chart-bar" size={15} />, title: "Performance", sub: "What really sold" },
  { icon: <Icon name="repeat" size={15} />, title: "Optimize & repeat", sub: "Keep, fix, go again" },
];

function PaneText({ k, title, body }: { k: string; title: string; body: string }) {
  return (
    <div className="col g8 it" style={css({ "--i": 0, flex: "0 1 300px", minWidth: 0 })}>
      <span className="lp-kicker">{k}</span><span className="h2">{title}</span><p className="sm i2" style={{ lineHeight: "21px" }}>{body}</p>
    </div>
  );
}

const PANES = [
  <Fragment key="pane-0">
    <PaneText k="Step 1" title="Find what your store data says." body="Iris reads orders, products and customers every hour and turns them into signals an ad can use." />
    <div className="col g8 fill" style={{ minWidth: 0 }}>
      {([
        ["users", "Lapsed buyers", "2,140 bought 60–180 days ago, not since", "Ready"],
        ["clock", "Reorder timing", "Second order comes around day 40", "Ready"],
        ["box", "Low stock", "Peony Duo: 12 left (~4 days)", "Watch"],
        ["lightning", "Best-seller", "Amber No. 3: 312 sold in 30 days", "Ready"],
      ] as [IconName, string, string, string][]).map(([ic, t, v, s], i) => (
        <div key={t} className="row g12 it" style={css({ "--i": i + 1, padding: "11px 14px", border: "1px solid var(--line)", borderRadius: 12 })}>
          <span className="row center" style={{ width: 32, height: 32, borderRadius: 9, alignItems: "center", background: "var(--tray)", border: "1px solid var(--line)" }}><Icon name={ic} size={15} /></span>
          <div className="col fill" style={{ minWidth: 0 }}><span className="sm w5 i1">{t}</span><span className="xs i3 ell">{v}</span></div>
          <span className={`pill ${s === "Ready" ? "green" : "amber"}`}>{s}</span>
        </div>
      ))}
    </div>
  </Fragment>,
  <Fragment key="pane-1">
    <PaneText k="Step 2" title="Turn a signal into a batch of ads." body="Remy makes ads in your brand’s look from your real products; Otto checks every one. You approve what runs." />
    <div className="row g10 fill" style={{ flexWrap: "wrap", minWidth: 0 }}>
      {["amber-eau-de-parfum", "duo-perfume", "gold-bottles", "cream-jars", "perfume-lineup", "dropper-pedestal"].map((p, i) => (
        <div key={p} className="lp-thumb-ad it" style={css({ "--i": i + 1, width: "calc((100% - 20px) / 3)", height: 132 })}>
          <Image src={`/landing/${p}.jpg`} alt="" fill sizes="160px" style={{ objectFit: "cover" }} />
          <span className="row g4" style={{ position: "absolute", left: 8, bottom: 8, height: 22, padding: "0 8px", borderRadius: 99, background: "#fff", fontSize: 11, fontWeight: 500, color: i < 2 ? "var(--green)" : "var(--ink-2)" }}>{i < 2 ? "✓ Approved" : "To review"}</span>
        </div>
      ))}
    </div>
  </Fragment>,
  <Fragment key="pane-2">
    <PaneText k="Step 3" title="Launch a small, safe test." body="A set budget, a clear question and a fixed end date. Meta picks the best ad inside the test; you see why." />
    <div className="col g10 fill" style={{ minWidth: 0 }}>
      <div className="col g10 it" style={css({ "--i": 1, padding: 16, border: "1px solid var(--line)", borderRadius: 12 })}>
        <div className="row between"><span className="t w5 i1">Win-back test</span><span className="pill blue"><span className="dot blue" />Ready to launch</span></div>
        <div className="row g16" style={{ flexWrap: "wrap" }}>
          {[["Budget", "$40 / day"], ["Length", "7 days"], ["Ads", "4 approved"], ["Audience", "2,140 lapsed"]].map(([k, v]) => <div key={k} className="col"><span className="xs i3">{k}</span><span className="sm w5 i1">{v}</span></div>)}
        </div>
      </div>
      {["Spend capped — never more than $280 in total", "Stops on its own at day 7", "A person launches it — not an agent"].map((t, i) => (
        <span key={t} className="row g8 sm i1 it" style={css({ "--i": i + 2 })}><Icon name="check-circle" size={16} weight="fill" color="#1F8A5B" />{t}</span>
      ))}
    </div>
  </Fragment>,
  <Fragment key="pane-3">
    <PaneText k="Step 4" title="See what really sold." body="Meta’s count next to the orders Shopify can prove, per campaign and per ad — down to which product each ad sold." />
    <div className="col g10 fill" style={{ minWidth: 0 }}>
      {([["Meta reports", "2.20×", 100, "#0866FF"], ["Shopify verified", "1.46×", 66, "#1F8A5B"]] as [string, string, number, string][]).map(([k, v, w, c], i) => (
        <div key={k} className="col g8 it" style={css({ "--i": i + 1, padding: "12px 14px", border: "1px solid var(--line)", borderRadius: 12 })}>
          <div className="row between"><span className="sm w5 i1">{k}</span><span className="h3 tnum">{v}</span></div>
          <div className="lp-bar"><i style={{ width: `${w}%`, background: c }} /></div>
        </div>
      ))}
      <div className="row g10 it" style={css({ "--i": 3, padding: "10px 14px", background: "var(--tray)", borderRadius: 12 })}><AgentFace kind="analyst" size={18} mood="up" /><span className="xs i2">Retargeting returns the most: 2.11× verified on $2,380.</span></div>
    </div>
  </Fragment>,
  <Fragment key="pane-4">
    <PaneText k="Step 5" title="Keep, fix, go again." body="Each week Kaviar proposes a few changes with the reason behind each. Nothing moves until a person approves it — try it." />
    <div className="fill" style={{ minWidth: 0 }}>
      <ApproveList items={[
        ["Hold the Peony Duo ads", "12 left — ads would sell out stock in 4 days"],
        ["Shift $20/day to Retargeting", "2.11× verified, the best campaign"],
        ["Refresh Lookalike creatives", "Hook rate fell from 31% to 22%"],
        ["Next: reorder ads at day 40", "Signal from 3,980 repeat buyers"],
      ]} />
    </div>
  </Fragment>,
];

const FLOATIES: [Kind, React.CSSProperties, number][] = [
  ["analyst", { left: "7%", top: 120 }, -8], ["catalog", { left: "13%", top: 420 }, 6],
  ["builder", { right: "8%", top: 150 }, 8], ["qa", { right: "13%", top: 450 }, -6],
];

export default function LandingPage() {
  return (
    <>
      <RevealObserver />
      <NavShell>
        <div className="lp-wrap">
          <Wordmark href="/" />
          <div className="lp-links">
            <a href="#how">How it works</a><a href="#loop">Growth loop</a><a href="#numbers">Real numbers</a><a href="#agents">Agents</a><a href="#faq">FAQ</a>
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

          <span className="lp-eyebrow" data-reveal>
            <span className="lp-live" />
            <span className="lp-rot"><span>
              <span style={{ display: "block" }}>Shopify + Meta, joined in one place</span>
              <span style={{ display: "block" }}>Decisions on orders Shopify can prove</span>
              <span style={{ display: "block" }}>People approve every step</span>
            </span></span>
          </span>
          <h1 className="lp-h1" data-reveal style={css({ "--i": 1 })}>
            Your Shopify store, built and{" "}
            <span className="lp-sel">grown<span className="box" /><span className="hd sel-tl" /><span className="hd sel-tr" /><span className="hd sel-bl" /><span className="hd sel-br" />
              <span className="tag"><span style={{ width: 16, height: 16, borderRadius: 99, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}><AgentFace kind="builder" size={13} /></span>Remy</span>
            </span>{" "}for you.
          </h1>
          <p className="lp-lead" data-reveal style={css({ "--i": 2 })}>Kaviar moves your brand to Shopify, builds the store, and runs a weekly growth loop on Meta ads. AI agents do the work. People approve every step.</p>
          <div data-reveal style={css({ "--i": 3, width: "100%", display: "flex", justifyContent: "center" })}><HeroBrief /></div>
          <div className="row g8" data-reveal style={css({ "--i": 4, justifyContent: "center" })}>
            <div className="row g4">{(["analyst", "catalog", "builder", "qa"] as const).map((k) => <AgentFace key={k} kind={k} size={22} />)}</div>
            <span className="sm i3">Iris, Cleo, Remy and Otto work alongside the Kaviar team</span>
          </div>
          <div className="lp-stage" data-observe><div className="lp-stage-box"><ProductWindow /></div></div>
        </section>

        <section className="lp-section tight" style={{ paddingTop: 40 }}>
          <div className="lp-wrap">
            <div className="row between" data-reveal style={{ flexWrap: "wrap", gap: 8 }}>
              <span className="sm i3">What Kaviar watches for a brand, every hour</span>
              <span className="row g6 xs i3"><ShopifyLogo size={12} /><MetaLogo size={12} />examples from a fragrance brand</span>
            </div>
          </div>
          <div className="lp-marquee" style={{ marginTop: 14 }} data-reveal>
            <div className="track">
              {[...SIGNALS, ...SIGNALS].map(([ic, t, v], i) => (
                <span key={i} className="lp-sig" aria-hidden={i >= SIGNALS.length}><Icon name={ic} size={15} color="#55534F" /><b>{t}</b>{v}</span>
              ))}
            </div>
          </div>
          <div className="lp-wrap" style={{ marginTop: 56 }}>
            <div className="lp-grid">
              {[
                ["Calm, not noisy", "One screen per job. Color only when something needs you."],
                ["Show the work", "Every agent shows what it did, with inputs, outputs and reasons."],
                ["People decide", "Approvals, payments and publishing stay with a person."],
                ["Numbers that join up", "Shopify orders and Meta spend in one place, checked against each other."],
              ].map(([t, d], i) => (
                <div key={t} className="col g6" data-reveal style={css({ "--i": i, padding: "4px 0" })}>
                  <span className="lp-num">0{i + 1}</span><span className="h3">{t}</span><span className="sm i3">{d}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="how" className="lp-section white">
          <div className="lp-wrap">
            <div className="lp-head" data-reveal>
              <span className="lp-kicker">How it works</span>
              <h2 className="lp-h2">From your current store to a growing Shopify brand.</h2>
            </div>
            <Walkthrough steps={WALK} scenes={SCENES} />
          </div>
        </section>

        <section id="loop" className="lp-section">
          <div className="lp-wrap">
            <div className="lp-head" data-reveal>
              <span className="lp-kicker">The growth loop</span>
              <h2 className="lp-h2">Five steps, every week.</h2>
              <p className="lp-lead">The same simple loop each week, so you always know what’s running, why, and what it really earned.</p>
            </div>
            <div data-reveal><LoopTabs tabs={LOOP_TABS} panes={PANES} /></div>
          </div>
        </section>

        <section id="numbers" className="lp-section white">
          <div className="lp-wrap lp-split">
            <div className="col g16" data-reveal>
              <span className="lp-kicker">Real numbers</span>
              <h2 className="lp-h2">Meta says one number. Shopify proves another.</h2>
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

        <section id="agents" className="lp-section">
          <div className="lp-wrap">
            <div className="lp-head" data-reveal>
              <span className="lp-kicker">The team</span>
              <h2 className="lp-h2">Four agents do the work. People decide.</h2>
              <p className="lp-lead">Each agent has one job and shows what it did. The Kaviar team approves, and anything that touches money or goes live comes to you first.</p>
            </div>
            <AgentCards agents={AGENTS} />
            <div className="row g12" data-reveal style={{ marginTop: 16, padding: "16px 18px", background: "#fff", border: "1px solid var(--line)", borderRadius: 14, flexWrap: "wrap" }}>
              <div className="stack"><div className="av l k">KR</div><div className="av l j">JN</div><div className="av l u">SC</div><div className="av l d">DV</div></div>
              <span className="t i1 fill" style={{ minWidth: 240 }}><b className="w5">The Kaviar team</b> <span className="i3">reviews every batch, every launch and every budget change before it happens.</span></span>
            </div>
          </div>
        </section>

        <section className="lp-section white tight">
          <div className="lp-wrap">
            <div className="lp-grid">
              {([
                ["lock", "Read-only by default", "Kaviar reads Shopify and Meta with read-only access you can remove any time."],
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
              <h2 className="lp-h2">Questions brands ask first.</h2>
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
          {FLOATIES.map(([k, pos, r], i) => (
            <div key={k} className="lp-floaty lp-float hide-md" style={css({ ...pos, "--i": i, "--r": `${r}deg` })} aria-hidden><AgentFace kind={k} size={44} mood="happy" /></div>
          ))}
          {([["cream-jars", { left: "3%", top: 250 }, -6], ["gold-bottles", { right: "3%", top: 290 }, 5]] as [string, React.CSSProperties, number][]).map(([p, pos, r], i) => (
            <div key={p} className="lp-floaty lp-float hide-md thumb" style={css({ ...pos, "--i": i + 4, "--r": `${r}deg`, width: 92, height: 116, borderRadius: 14 })} aria-hidden>
              <Image src={`/landing/${p}.jpg`} alt="" fill sizes="92px" style={{ objectFit: "cover" }} />
            </div>
          ))}
          <div className="lp-wrap col" style={{ alignItems: "center", gap: 28, position: "relative" }}>
            <div className="col g12" data-reveal style={{ alignItems: "center", textAlign: "center", maxWidth: 620 }}>
              <span className="lp-kicker">Book a call</span>
              <h2 className="lp-h2">Let’s look at your store together.</h2>
              <p className="lp-lead">Tell us a little about the brand. We’ll look at your store and numbers before the call and come with a suggested first step.</p>
            </div>
            <div className="card" data-reveal style={css({ "--i": 1, padding: 24, width: "100%", maxWidth: 640, boxShadow: "0 1px 2px rgba(18,18,18,0.04), 0 24px 56px rgba(18,18,18,0.08)" })}>
              <ContactForm />
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-wrap row between" style={{ flexWrap: "wrap", gap: 16 }}>
          <div className="col g8"><Wordmark href="/" /><span className="xs i3">Shopify stores, built and grown for brands. © 2026 Kaviar</span></div>
          <div className="row g20 sm i2" style={{ flexWrap: "wrap" }}>
            <a href="#how">How it works</a><a href="#loop">Growth loop</a><a href="#faq">FAQ</a><a href="#contact">Book a call</a><Link href="/login">Sign in</Link>
          </div>
        </div>
      </footer>
      <Dock />
    </>
  );
}
