"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveSetup, startBuild } from "./actions";
import { Icon } from "@/components/icon";
import { AgentFace } from "@/components/agent";

const THEMES = [
  { key: "kaviar-starter", name: "Kaviar Starter", note: "Reusable · built for these agents", tag: "Best fit", tone: "green" },
  { key: "dawn", name: "Dawn", note: "Shopify’s free theme · most blocks built from scratch", tag: "Free", tone: "" },
  { key: "prestige", name: "Prestige", note: "Paid theme · the merchant must buy the licence", tag: "$350", tone: "amber" },
];
const PAGES: [string, string, boolean][] = [["home", "Homepage", false], ["products", "Products", false], ["collections", "Collections", false], ["story", "Our story", false], ["journal", "Journal", true], ["contact", "Contact", false], ["faq", "FAQ", true], ["policies", "Policies", false]];
const APPS: [string, string, string, string][] = [
  ["subscriptions", "Subscriptions", "Recharge", "Merchant must authorize"], ["reviews", "Reviews", "Judge.me", "Paid plan billed to merchant"],
  ["email", "Email marketing", "Klaviyo", "Merchant must authorize"], ["analytics", "Analytics", "Shopify Analytics", "Built into Shopify"],
  ["search", "Search & filter", "Search & Discovery", "Kaviar configures after install"], ["loyalty", "Loyalty", "Smile.io", "Paid plan billed to merchant"],
];

export function StoreSetup({ slug, initial, products, profile, hasBuild }: { slug: string; initial: { theme: string; pages: string[]; apps: Record<string, boolean> }; products: number; profile: boolean; hasBuild: boolean }) {
  const router = useRouter();
  const [theme, setTheme] = useState(initial.theme);
  const [pages, setPages] = useState<string[]>(initial.pages);
  const [apps, setApps] = useState<Record<string, boolean>>(Object.keys(initial.apps).length ? initial.apps : { subscriptions: true, reviews: true, email: true, analytics: true, search: true });
  const [busy, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const needs = APPS.filter(([k, , , n]) => apps[k] && /merchant/i.test(n));
  const go = () => start(async () => {
    await saveSetup(slug, { theme, pages, apps });
    const r = await startBuild(slug);
    if (r.error) setErr(r.error); else router.push(`/brands/${slug}/store?step=build`);
  });
  return (
    <div className="row fill stretch" style={{ minHeight: 0 }}>
      <section className="scroll col" style={{ padding: "22px 28px", gap: 18 }}>
        <div className="col g4"><h1 className="h1">Store setup</h1><p className="sm i3">Choose the base and what goes in. Remy builds from these choices.</p></div>
        <div className="col g10">
          <span className="row between"><span className="h3">Theme</span><span className="xs i3">Chosen by you, never bought by agents</span></span>
          <div className="row g12 stretch">
            {THEMES.map((t) => (
              <button key={t.key} type="button" onClick={() => setTheme(t.key)} className="card col g8 fill" style={{ padding: 12, textAlign: "left", cursor: "pointer", borderColor: theme === t.key ? "var(--ink)" : undefined, boxShadow: theme === t.key ? "0 0 0 1px var(--ink)" : undefined }}>
                <div style={{ height: 70, borderRadius: 8, background: t.key === "prestige" ? "linear-gradient(135deg,#2B241E,#6E5A45)" : t.key === "dawn" ? "linear-gradient(135deg,#F2EFEA,#D8D2C8)" : "linear-gradient(135deg,#F6F1EA,#C9B49B)" }} />
                <span className="row between"><span className="row g6 sm w5"><span className={`radio${theme === t.key ? " on" : ""}`} />{t.name}</span><span className={`pill ${t.tone}`} style={{ height: 20, fontSize: 10.5 }}>{t.tag}</span></span>
                <span className="xs i3">{t.note}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="col g8">
          <span className="row between"><span className="h3">Pages</span><span className="xs i3">{pages.length} selected</span></span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
            {PAGES.map(([k, l, opt]) => (
              <label key={k} className="row g8 sm" style={{ padding: "9px 12px", border: "1px solid var(--line)", borderRadius: 10, cursor: "pointer", background: pages.includes(k) ? "#fff" : "var(--tray)" }}>
                <input type="checkbox" checked={pages.includes(k)} onChange={() => setPages(pages.includes(k) ? pages.filter((x) => x !== k) : [...pages, k])} style={{ accentColor: "#121212" }} />{l}{opt && <span className="xs i3">Optional</span>}
              </label>
            ))}
          </div>
        </div>
        <div className="col g8">
          <span className="row between"><span className="h3">Apps & integrations</span><span className="xs c-amber">{needs.length} need the merchant</span></span>
          <div className="card">
            {APPS.map(([k, l, app, note], i) => (
              <label key={k} className="row g10 sm" style={{ padding: "10px 14px", borderTop: i ? "1px solid var(--line)" : 0, cursor: "pointer" }}>
                <input type="checkbox" checked={Boolean(apps[k])} onChange={() => setApps({ ...apps, [k]: !apps[k] })} style={{ accentColor: "#121212" }} />
                <span style={{ width: 150 }}>{l}</span><span className="chip" style={{ height: 26 }}>{app}</span><span className="fill" />
                <span className={`xs ${/merchant|billed/i.test(note) ? "c-amber" : "c-green"}`}>{note}</span>
              </label>
            ))}
          </div>
        </div>
      </section>
      <aside className="col g10" style={{ width: 300, flexShrink: 0, borderLeft: "1px solid var(--line)", background: "var(--tray)", padding: 16 }}>
        <span className="sm w5">Build plan</span><span className="xs i3">Updates as you change setup</span>
        <div className="card" style={{ padding: "4px 12px" }}>
          {[["Theme", THEMES.find((t) => t.key === theme)?.name], ["Pages", String(pages.length)], ["Products", String(products)], ["Apps", String(Object.values(apps).filter(Boolean).length)], ["Brand profile", profile ? "From onboarding" : "Store data only"]].map(([k, v]) => (
            <div key={k} className="row between xs" style={{ minHeight: 30, borderTop: k === "Theme" ? 0 : "1px solid var(--line)" }}><span className="i3">{k}</span><span className="i1">{v}</span></div>
          ))}
        </div>
        <span className="row g4 xs i3">Agents on this build {(["analyst", "catalog", "builder", "qa"] as const).map((a) => <AgentFace key={a} kind={a} size={16} />)}</span>
        {needs.length > 0 && (
          <div className="col g4" style={{ padding: "10px 12px", background: "var(--amber-bg)", border: "1px solid #F1E1C4", borderRadius: 10 }}>
            <span className="xs w5" style={{ color: "#7A5414" }}>Needs the merchant</span>
            {needs.map(([k, , app]) => <span key={k} className="row g6 xs" style={{ color: "#7A5414" }}><Icon name="clock" size={11} />Authorize {app}</span>)}
          </div>
        )}
        {!profile && <span className="xs i3" style={{ lineHeight: "16px" }}>No brand profile yet — Remy writes from the store’s products only. Brands added through New brand onboarding get much better copy.</span>}
        <div className="fill" />
        {err && <span className="xs c-amber">{err}</span>}
        <button type="button" className="btn dark" disabled={busy || pages.length === 0} onClick={go}>{busy ? <Icon name="spinner" size={14} className="spin" color="#fff" /> : <Icon name="sparkle" size={14} color="#fff" />}{hasBuild ? "Rebuild store" : "Start build"}</button>
      </aside>
    </div>
  );
}
