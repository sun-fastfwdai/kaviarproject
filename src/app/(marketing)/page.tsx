import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Icon, type IconName } from "@/components/icon";
import { AgentFace } from "@/components/agent";
import { MetaLogo, ShopifyLogo } from "@/components/logos";
import { SalesChart } from "@/components/sales-chart";
import { Wordmark } from "@/components/shell/parts";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = {
  title: { absolute: "Kaviar — your Shopify store, built and grown for you" },
  description:
    "Kaviar moves your brand to Shopify, builds the store and runs a weekly growth loop on Meta ads. AI agents do the work; people approve every step.",
  robots: { index: true, follow: true },
};

/* ---------------------------------------------------------------- demo data for the product window (fictional brand) */
const DAYS = Array.from({ length: 30 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 9, 9 + i));
  const wk = 1 + 0.18 * Math.sin((i / 7) * 2 * Math.PI + 1.1);
  const rev = Math.round(1630 * wk * (0.9 + 0.2 * (i / 30)) * (1 + 0.12 * Math.sin(i * 2.3 + 3) * Math.cos(i * 0.7)));
  const meta = Math.round(rev * (0.27 + 0.05 * Math.sin(i * 0.9 + 0.4) + 0.03 * (i / 30)));
  const spend = Math.round(328 * (0.92 + 0.12 * (i / 30)) * (1 + 0.06 * Math.sin(i * 1.7)));
  return { day: d.toISOString().slice(0, 10), revenue: rev, meta, spend };
});

function NavItem({ icon, label, on }: { icon: IconName; label: string; on?: boolean }) {
  return <div className={`ni${on ? " on" : ""}`}><Icon name={icon} />{label}</div>;
}

function StepPill() {
  return (
    <div className="row g10" style={{ height: 30, padding: "0 6px 0 10px", border: "1px solid var(--line)", borderRadius: 99, background: "var(--tray)", whiteSpace: "nowrap" }}>
      <div className="row g4">
        {[0, 1, 2, 3, 4].map((j) => <span key={j} style={{ width: j === 3 ? 14 : 6, height: 6, borderRadius: 99, background: j === 3 ? "#121212" : j < 3 ? "#1F8A5B" : "#D9D6D1" }} />)}
      </div>
      <span className="xs i3">Step 4 of 5</span><span className="xs w5 i1">See what really sold</span>
      <span className="row g4" style={{ height: 22, padding: "0 9px", borderRadius: 99, background: "#fff", border: "1px solid var(--line)", fontSize: 11.5, color: "var(--ink-2)" }}>Next: Optimize<Icon name="arrow-r" size={11} /></span>
    </div>
  );
}

function ProductWindow() {
  const stat = (label: string, value: string, note: string, src: "shopify" | "meta" | "both", tone?: string) => (
    <div className="stat">
      <span className="row g6 xs i3" style={{ whiteSpace: "nowrap" }}>{src !== "meta" && <ShopifyLogo size={12} />}{src !== "shopify" && <MetaLogo size={12} />}{label}</span>
      <span className="v">{value}</span>
      <span className={`xs ${tone ?? "i3"}`}>{note}</span>
    </div>
  );
  return (
    <div className="lp-window" aria-label="Kaviar console showing a brand’s performance">
      <div style={{ width: 1120, height: 640, display: "flex", background: "var(--page)", borderRadius: 18, overflow: "hidden", boxShadow: "0 0 0 1px rgba(18,18,18,0.08), 0 2px 4px rgba(18,18,18,0.04), 0 32px 72px -16px rgba(18,18,18,0.22)", textAlign: "left" }}>
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
            <StepPill />
            <div className="fill" />
            <span className="row g6 xs i3"><ShopifyLogo size={12} />synced 1 min ago</span>
          </header>
          <div className="col g14" style={{ padding: "18px 20px", gap: 14 }}>
            <div className="row between" style={{ alignItems: "flex-end" }}>
              <div className="col g2"><span className="h2">Performance</span><span className="xs i3">Shopify sales and Meta Ads side by side.</span></div>
              <div className="seg"><span className="o">7 days</span><span className="o on">30 days</span><span className="o">90 days</span></div>
            </div>
            <div className="card" style={{ flexDirection: "row", alignItems: "stretch" }}>
              {stat("Revenue", "$48,920", "+12% vs prior 30d", "shopify", "c-green")}<div className="vr" />
              {stat("Orders", "1,032", "AOV $47.40", "shopify")}<div className="vr" />
              {stat("Ad spend", "$9,840", "3 campaigns active", "meta")}<div className="vr" />
              {stat("Verified Meta ROAS", "1.46×", "Meta says 2.20×", "both")}
            </div>
            <div className="card" style={{ padding: "12px 14px 6px", gap: 6 }}>
              <div className="row between"><span className="h3">Sales vs ad spend · per day</span>
                <span className="row g12 xs i3"><span className="row g6"><i style={{ width: 9, height: 9, borderRadius: 2, background: "#DEDBD5" }} />All sales</span><span className="row g6"><i style={{ width: 9, height: 9, borderRadius: 2, background: "#0866FF", opacity: 0.75 }} />From Meta ads</span><span className="row g6"><i style={{ width: 14, height: 2, background: "#121212" }} />Meta spend</span></span>
              </div>
              <SalesChart data={DAYS} currency="USD" height={250} />
            </div>
          </div>
        </div>
      </div>

      <div className="lp-float hide-md" style={{ right: -12, top: 262, width: 214 }}>
        <div className="card" style={{ overflow: "visible", boxShadow: "0 18px 40px rgba(18,18,18,0.14)", padding: 8, gap: 8 }}>
          <div style={{ position: "relative", height: 220, outline: "1.5px solid var(--select)", outlineOffset: -1, borderRadius: 6 }}>
            <div className="thumb" style={{ position: "absolute", inset: 0, borderRadius: 6 }}><Image src="/landing/duo-perfume.jpg" alt="Product photo on a store page" fill sizes="214px" style={{ objectFit: "cover" }} /></div>
            <span className="sel-label" style={{ top: -21 }}>Product hero</span>
            {[["h-tl"], ["h-tr"], ["h-bl"], ["h-br"]].map(([c]) => <span key={c} className={`handle ${c}`} />)}
          </div>
          <div className="col g2" style={{ padding: "2px 4px 4px" }}><span className="sm w5">Peony Duo · 2 × 30 ml</span><span className="xs i3">$72 · 12 left</span></div>
        </div>
        <div className="row g6" style={{ position: "absolute", left: -46, top: 168 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#1AA7C8" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round"><path d="M4 3l16 7-7 2.2L10 20z" /></svg>
          <span className="row g4" style={{ height: 22, padding: "0 8px 0 4px", borderRadius: 6, background: "#1AA7C8", color: "#fff", fontSize: 11.5, fontWeight: 500, marginTop: 14 }}>
            <span style={{ width: 17, height: 17, borderRadius: 99, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}><AgentFace kind="builder" size={14} /></span>Remy
          </span>
        </div>
      </div>

      <div className="lp-float hide-md" style={{ left: -12, bottom: 26, width: 268 }}>
        <div className="col g6" style={{ padding: "12px 14px", background: "#fff", border: "1px solid var(--line)", borderRadius: 12, boxShadow: "0 18px 40px rgba(18,18,18,0.14)" }}>
          <div className="row g8"><AgentFace kind="analyst" size={20} mood="up" /><span className="sm w5">Iris</span><span className="xs i3">· read 1,032 orders</span></div>
          <span className="sm w5 i1">Retargeting returns the most</span>
          <span className="xs i2" style={{ lineHeight: "17px" }}>2.11× verified on $2,380 — the only campaign above 2×. Worth more budget next week.</span>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- sections */
const LOOP: [IconName, string, string][] = [
  ["lightning", "Ad signals", "Find what your store data says: best-sellers, lapsed buyers, reorder timing, stock running low."],
  ["image", "Creative studio", "Turn a signal into a batch of ads in your brand’s look. Every ad is approved before it runs."],
  ["target", "Run ads", "Launch a small, safe test on Meta with a set budget and a clear question."],
  ["chart-bar", "Performance", "See what really sold — Shopify orders, not only Meta’s count."],
  ["repeat", "Optimize & repeat", "Keep the winners, fix what isn’t working, and go again next week."],
];

const AGENTS: { kind: "analyst" | "catalog" | "builder" | "qa"; name: string; role: string; does: string }[] = [
  { kind: "analyst", name: "Iris", role: "Studies the brand", does: "Reads your site, brand deck, orders and ad results, and says what they mean — with the numbers behind it." },
  { kind: "catalog", name: "Cleo", role: "Manages the catalog", does: "Moves products to Shopify, keeps Shopify and Meta in sync, and builds audiences from your customers." },
  { kind: "builder", name: "Remy", role: "Builds pages and ads", does: "Builds the store and new ad creatives in your brand’s look, from the products you actually sell." },
  { kind: "qa", name: "Otto", role: "Checks quality", does: "Checks every page and every ad — labels, prices, links, brand rules — before a person sees it." },
];

const FAQ: [string, string][] = [
  ["Do we need to be on Shopify already?", "No. Kaviar moves brands from Cafe24, WooCommerce and other platforms, and keeps the old store running until the new one is live. If you’re already on Shopify, we start from your store."],
  ["Does Kaviar change our ads or store on its own?", "No. Agents prepare the work and show what they did. A person on the Kaviar team approves every launch, budget change and publish — and anything that touches payments goes through you."],
  ["Why do Meta and Shopify show different sales numbers?", "Meta counts a sale if someone saw or clicked an ad in the last few days, even when the order came through Google or email. Shopify only counts orders that arrived through tagged Meta links. Kaviar shows both and decides on the number Shopify can prove."],
  ["Which channels does Kaviar work with?", "Shopify for the store and Meta (Facebook and Instagram) for ads. We keep it focused so every number joins up."],
  ["Who owns the store and the data?", "You do. The Shopify store and the ad account stay in your name. Kaviar connects with read-only access you can remove at any time."],
  ["How do we start?", "Book a call. We look at your store and your numbers together and suggest where to begin — a new store, a move to Shopify, or the growth loop on the store you have."],
];

export default function LandingPage() {
  return (
    <>
      <nav className="lp-nav lined">
        <div className="lp-wrap">
          <Wordmark href="/" />
          <div className="lp-links">
            <a href="#how">How it works</a><a href="#loop">Growth loop</a><a href="#numbers">Real numbers</a><a href="#agents">Agents</a><a href="#faq">FAQ</a>
          </div>
          <div className="fill" />
          <Link href="/login" className="btn quiet sm hide-sm">Sign in</Link>
          <a href="#contact" className="btn dark sm">Book a call</a>
        </div>
      </nav>

      <main>
        <section className="lp-wrap lp-hero">
          <span className="lp-eyebrow"><ShopifyLogo size={14} />Shopify commerce, run for you<span className="i4">·</span><MetaLogo size={14} />Meta ads</span>
          <h1 className="lp-h1">Your Shopify store, built and grown for you.</h1>
          <p className="lp-lead">Kaviar moves your brand to Shopify, builds the store, and runs a weekly growth loop on Meta ads. AI agents do the work. People approve every step.</p>
          <div className="lp-ctas">
            <a href="#contact" className="btn dark lg">Book a call<Icon name="arrow-r" size={15} color="#fff" /></a>
            <a href="#how" className="btn lg">See how it works</a>
          </div>
          <div className="row g8" style={{ justifyContent: "center", marginTop: 4 }}>
            <div className="row g4">{(["analyst", "catalog", "builder", "qa"] as const).map((k) => <AgentFace key={k} kind={k} size={22} />)}</div>
            <span className="sm i3">Iris, Cleo, Remy and Otto work alongside the Kaviar team</span>
          </div>
          <div className="lp-stage"><div className="lp-stage-box"><ProductWindow /></div></div>
        </section>

        <section className="lp-section tight">
          <div className="lp-wrap">
            <div className="lp-grid">
              {[
                ["Calm, not noisy", "One screen per job. Color only when something needs you."],
                ["Show the work", "Every agent shows what it did, with inputs, outputs and reasons."],
                ["People decide", "Approvals, payments and publishing stay with a person."],
                ["Numbers that join up", "Shopify orders and Meta spend in one place, checked against each other."],
              ].map(([t, d], i) => (
                <div key={t} className="col g6" style={{ padding: "4px 0" }}>
                  <span className="lp-num">0{i + 1}</span><span className="h3">{t}</span><span className="sm i3">{d}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="how" className="lp-section white">
          <div className="lp-wrap">
            <div className="lp-head">
              <span className="lp-kicker">How it works</span>
              <h2 className="lp-h2">From your current store to a growing Shopify brand.</h2>
              <p className="lp-lead">Three phases, one team. You see every step and approve the ones that matter.</p>
            </div>
            <div className="lp-grid">
              <div className="lp-card">
                <div className="col g8" style={{ padding: 18, background: "var(--tray)", borderBottom: "1px solid var(--line)", minHeight: 210, justifyContent: "center" }}>
                  {[
                    ["analyst", "Iris read maison-ore.com and the brand deck", "check-circle", "#1F8A5B"],
                    ["catalog", "Cleo moved 38 products from Cafe24", "check-circle", "#1F8A5B"],
                    [null, "You confirm brand basics", "circle", "#B7791F"],
                  ].map(([k, t, ic, c]) => (
                    <div key={t as string} className="row g10" style={{ padding: "10px 12px", background: "#fff", border: "1px solid var(--line)", borderRadius: 10 }}>
                      {k ? <AgentFace kind={k as "analyst" | "catalog"} size={18} /> : <div className="av s j">JN</div>}
                      <span className="sm i1 fill">{t}</span><Icon name={ic as IconName} size={16} weight={ic === "check-circle" ? "fill" : "regular"} color={c as string} />
                    </div>
                  ))}
                </div>
                <div className="in"><span className="lp-num">01</span><span className="h3">Onboard</span><span className="sm i2">Iris studies the brand. Cleo brings the catalog over from wherever it lives today. You fill in only what we can’t find.</span></div>
              </div>
              <div className="lp-card">
                <div style={{ position: "relative", minHeight: 210, background: "var(--tray)", borderBottom: "1px solid var(--line)", padding: 18 }}>
                  <div style={{ position: "relative", height: 174, outline: "1.5px solid var(--select)", outlineOffset: -1, borderRadius: 8 }}>
                    <div className="thumb" style={{ position: "absolute", inset: 0 }}><Image src="/landing/perfume-lineup.jpg" alt="Store hero section being built" fill sizes="(max-width: 860px) 100vw, 380px" style={{ objectFit: "cover" }} /></div>
                    <span className="sel-label">Homepage · Hero</span>
                    <span className="row g6" style={{ position: "absolute", right: 10, bottom: 10, height: 26, padding: "0 10px 0 6px", borderRadius: 99, background: "#fff", fontSize: 12, fontWeight: 500, boxShadow: "0 4px 12px rgba(18,18,18,0.12)" }}><AgentFace kind="qa" size={16} />24 checks passed</span>
                  </div>
                </div>
                <div className="in"><span className="lp-num">02</span><span className="h3">Build</span><span className="sm i2">Remy builds the store on Shopify and Otto checks every page. You review it on a live preview and approve before launch.</span></div>
              </div>
              <div className="lp-card">
                <div className="col g10" style={{ padding: 18, background: "var(--tray)", borderBottom: "1px solid var(--line)", minHeight: 210, justifyContent: "center" }}>
                  <div className="row g6">{LOOP.map(([ic], j) => <span key={j} className="row center" style={{ width: 34, height: 34, borderRadius: 10, alignItems: "center", background: j === 0 ? "var(--ink)" : "#fff", border: "1px solid var(--line)" }}><Icon name={ic} size={15} color={j === 0 ? "#fff" : "#55534F"} /></span>)}</div>
                  <div className="col g4" style={{ padding: "12px 14px", background: "#fff", border: "1px solid var(--line)", borderRadius: 10 }}>
                    <span className="xs i3">This week</span>
                    <span className="sm w5 i1">Win-back ads for 2,140 customers who haven’t ordered in 60 days</span>
                    <span className="xs i3">Signal from Shopify · 9 ads to review</span>
                  </div>
                </div>
                <div className="in"><span className="lp-num">03</span><span className="h3">Grow</span><span className="sm i2">Every week the team runs the growth loop on Meta: signal, ads, a safe test, real results, and the next move.</span></div>
              </div>
            </div>
          </div>
        </section>

        <section id="loop" className="lp-section">
          <div className="lp-wrap">
            <div className="lp-head">
              <span className="lp-kicker">The growth loop</span>
              <h2 className="lp-h2">Five steps, every week.</h2>
              <p className="lp-lead">The same simple loop each week, so you always know what’s running, why, and what it really earned.</p>
            </div>
            <div className="lp-loop">
              {LOOP.map(([ic, t, d], i) => (
                <div key={t} className="step">
                  <div className="row between"><span className="ic"><Icon name={ic} size={17} /></span><span className="lp-num">Step {i + 1}</span></div>
                  <span className="h3">{t}</span>
                  <span className="sm i2" style={{ lineHeight: "19px" }}>{d}</span>
                </div>
              ))}
            </div>
            <div className="row g8" style={{ marginTop: 18, justifyContent: "center" }}>
              <Icon name="repeat" size={14} color="#8B8883" /><span className="sm i3">Then back to step 1 with what you learned.</span>
            </div>
          </div>
        </section>

        <section id="numbers" className="lp-section white">
          <div className="lp-wrap lp-split">
            <div className="col g16">
              <span className="lp-kicker">Real numbers</span>
              <h2 className="lp-h2">Meta says one number. Shopify proves another.</h2>
              <p className="lp-lead">Meta counts a sale if someone saw or clicked an ad in the last few days — even when the order came through Google or email. Kaviar puts Meta’s count next to the orders Shopify can prove, and makes decisions on the proven one.</p>
              <div className="col g10" style={{ paddingTop: 4 }}>
                {[
                  "Every ad carries its own id, so each order shows the ad that sold it",
                  "See which ad sold which product, not just which campaign",
                  "Budgets move on verified results, not on the biggest number",
                ].map((t) => <span key={t} className="row g10 t i1"><Icon name="check" size={16} color="#1F8A5B" weight="bold" />{t}</span>)}
              </div>
            </div>
            <div className="card" style={{ padding: 20, gap: 14, boxShadow: "0 1px 2px rgba(18,18,18,0.04), 0 16px 40px rgba(18,18,18,0.06)" }}>
              <div className="row between"><span className="h3">Last 30 days</span><span className="xs i3">Maison Oré · example</span></div>
              {[
                [<MetaLogo key="m" size={16} />, "Meta reports", "412 purchases", "2.20×", 100, "#0866FF"],
                [<ShopifyLogo key="s" size={16} />, "Shopify verified", "298 orders", "1.46×", 72, "#1F8A5B"],
              ].map(([logo, label, count, r, w, c]) => (
                <div key={label as string} className="col g8" style={{ padding: "12px 14px", border: "1px solid var(--line)", borderRadius: 12 }}>
                  <div className="row between"><span className="row g8 sm w5 i1">{logo}{label}</span><span className="row g12"><span className="sm i3 tnum">{count}</span><span className="h3 tnum">{r}</span></span></div>
                  <div className="prog" style={{ height: 6 }}><div className="v" style={{ height: 6, width: `${w}%`, background: c as string }} /></div>
                </div>
              ))}
              <div className="col">
                <div className="row between xs i3" style={{ padding: "4px 0 6px" }}><span>Which ad sold what</span><span>Shopify orders</span></div>
                {[
                  ["Peony duo · ‘still thinking?’", "Peony Duo", 84],
                  ["Amber No. 3 · ritual video", "Amber No. 3 · 50 ml", 96],
                  ["Discovery set · 6 scents", "Discovery Set", 58],
                ].map(([ad, p, n]) => (
                  <div key={ad as string} className="row g10" style={{ padding: "9px 0", borderTop: "1px solid var(--line)" }}>
                    <span className="sm i1 ell" style={{ flex: 1.2 }}>{ad}</span><Icon name="arrow-r" size={12} color="#B5B2AC" />
                    <span className="sm i2 ell fill">{p}</span><span className="sm w5 tnum">{n}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="agents" className="lp-section">
          <div className="lp-wrap">
            <div className="lp-head">
              <span className="lp-kicker">The team</span>
              <h2 className="lp-h2">Four agents do the work. People decide.</h2>
              <p className="lp-lead">Each agent has one job and shows what it did. The Kaviar team approves, and anything that touches money or goes live comes to you first.</p>
            </div>
            <div className="lp-grid">
              {AGENTS.map((a) => (
                <div key={a.name} className="lp-card">
                  <div className="in" style={{ gap: 10 }}>
                    <AgentFace kind={a.kind} size={52} mood="happy" />
                    <div className="col g2"><span className="h3">{a.name}</span><span className="xs i3">{a.role}</span></div>
                    <span className="sm i2" style={{ lineHeight: "20px" }}>{a.does}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="row g12" style={{ marginTop: 16, padding: "16px 18px", background: "#fff", border: "1px solid var(--line)", borderRadius: 14, flexWrap: "wrap" }}>
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
              ] as [IconName, string, string][]).map(([ic, t, d]) => (
                <div key={t} className="col g8">
                  <span className="row center" style={{ width: 36, height: 36, borderRadius: 10, alignItems: "center", background: "var(--tray)", border: "1px solid var(--line)" }}><Icon name={ic} size={17} /></span>
                  <span className="h3">{t}</span><span className="sm i3">{d}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="faq" className="lp-section">
          <div className="lp-wrap lp-split" style={{ alignItems: "flex-start" }}>
            <div className="col g12" style={{ flex: "0 1 360px" }}>
              <span className="lp-kicker">FAQ</span>
              <h2 className="lp-h2">Questions brands ask first.</h2>
              <p className="sm i3">Something else? <a className="lnk w5 i1" href="#contact">Ask us on a call.</a></p>
            </div>
            <div className="lp-faq col">
              {FAQ.map(([q, a]) => (
                <details key={q}>
                  <summary>{q}<Icon name="plus" size={16} color="#8B8883" /></summary>
                  <p>{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section id="contact" className="lp-section white">
          <div className="lp-wrap lp-split" style={{ alignItems: "flex-start" }}>
            <div className="col g16">
              <span className="lp-kicker">Book a call</span>
              <h2 className="lp-h2">Let’s look at your store together.</h2>
              <p className="lp-lead">Tell us a little about the brand. We’ll look at your store and numbers before the call and come with a suggested first step.</p>
              <div className="row g12" style={{ paddingTop: 8 }}>
                <div className="thumb" style={{ width: 96, height: 120, borderRadius: 12, position: "relative" }}><Image src="/landing/cream-jars.jpg" alt="" fill sizes="96px" style={{ objectFit: "cover" }} /></div>
                <div className="thumb" style={{ width: 96, height: 120, borderRadius: 12, position: "relative" }}><Image src="/landing/gold-bottles.jpg" alt="" fill sizes="96px" style={{ objectFit: "cover" }} /></div>
                <div className="thumb" style={{ width: 96, height: 120, borderRadius: 12, position: "relative" }}><Image src="/landing/dropper-pedestal.jpg" alt="" fill sizes="96px" style={{ objectFit: "cover" }} /></div>
              </div>
            </div>
            <div className="card" style={{ padding: 24, boxShadow: "0 1px 2px rgba(18,18,18,0.04), 0 16px 40px rgba(18,18,18,0.06)" }}>
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
    </>
  );
}
