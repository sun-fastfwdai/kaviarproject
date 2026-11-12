"use client";
import { useActionState, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveBasics, scanBasics, type ActionState } from "./actions";
import { BackLink, FromTag, IrisSays, OnboardingShell } from "./shell";
import { AgentFace } from "@/components/agent";
import { Icon } from "@/components/icon";
import { Modal } from "@/components/modal";
import { ShopifyLogo } from "@/components/logos";
import type { Onboarding } from "@/lib/onboarding/types";

const CURRENCIES: [string, string][] = [["USD", "US dollar"], ["KRW", "Korean won"], ["EUR", "Euro"], ["GBP", "British pound"], ["JPY", "Japanese yen"], ["CAD", "Canadian dollar"], ["AUD", "Australian dollar"], ["SGD", "Singapore dollar"], ["INR", "Indian rupee"], ["CNY", "Chinese yuan"], ["HKD", "Hong Kong dollar"], ["TWD", "Taiwan dollar"]];
const LANGUAGES = ["English", "Korean", "Japanese", "Chinese", "French", "German", "Spanish", "Italian", "Portuguese", "Vietnamese", "Thai", "Indonesian"];
const MARKETS = ["United States", "Canada", "United Kingdom", "Australia", "South Korea", "Japan", "Singapore", "Hong Kong", "Taiwan", "Germany", "France", "Netherlands", "India", "United Arab Emirates", "Vietnam", "Thailand", "Malaysia", "Philippines", "New Zealand"];
const money = (v: number | null, c: string | null) => (v == null ? "" : new Intl.NumberFormat("en-US", { style: "currency", currency: c || "USD", maximumFractionDigits: v < 10 ? 2 : 0 }).format(v));

function AddMarket({ have, onAdd, onClose }: { have: string[]; onAdd: (m: string) => void; onClose: () => void }) {
  const [v, setV] = useState(MARKETS.find((m) => !have.includes(m)) ?? "");
  return (
    <Modal icon={<Icon name="globe" size={18} />} title="Add a market" sub="Shopify Markets sets prices, currency and language per country." onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn dark" disabled={!v} onClick={() => { onAdd(v); onClose(); }}>Add market</button></>}>
      <label className="col g6"><span className="label">Country</span>
        <div className="input"><select value={v} onChange={(e) => setV(e.target.value)} style={{ border: 0, outline: 0, flex: 1, background: "transparent", font: "inherit" }}>{MARKETS.filter((m) => !have.includes(m)).map((m) => <option key={m}>{m}</option>)}</select></div></label>
    </Modal>
  );
}

export function BasicsStep({ id, reached, ob, brand, subs, shopConnected }: {
  id: string; reached: number; ob: Onboarding; subs: (string | undefined)[];
  brand: { name: string; category: string | null; website: string | null; currency: string; timezone: string };
  shopConnected: string | null;
}) {
  const router = useRouter();
  const scan = ob.scan;
  const b = ob.basics;
  const [scanning, startScan] = useTransition();
  const [scanErr, setScanErr] = useState<string | null>(null);
  const asked = useRef(false);
  const site = brand.website ?? (ob.shop ? `https://${ob.shop}` : null);
  const tz = useSyncExternalStore(() => () => {}, () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", () => "UTC");

  useEffect(() => {
    if (asked.current || !site || (scan && scan.scannedAt && (scan.ok || scan.error))) return;
    asked.current = true;
    startScan(async () => { const r = await scanBasics(id); setScanErr(r?.error ?? null); router.refresh(); });
  });

  const pre = (v: string | null | undefined, fallback = "") => v ?? fallback;
  const [name, setName] = useState(pre(b?.name, brand.name.startsWith("draft-") ? "" : brand.name));
  const [category, setCategory] = useState(pre(b?.category, brand.category ?? ""));
  const [website, setWebsite] = useState(pre(b?.website, brand.website ?? ""));
  const [shopName, setShopName] = useState(pre(b?.shopName));
  const [markets, setMarkets] = useState<string[]>(b?.markets ?? []);
  const [language, setLanguage] = useState(pre(b?.language, "English"));
  const [currency, setCurrency] = useState(pre(b?.currency, brand.currency));
  const [adding, setAdding] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(saveBasics.bind(null, id), undefined);

  // When Iris finishes, fill anything the team hasn't typed yet.
  const filled = useRef(Boolean(b));
  useEffect(() => {
    if (!scan?.ok || filled.current) return;
    filled.current = true;
    /* eslint-disable react-hooks/set-state-in-effect -- one-time prefill from Iris's scan */
    if (!name && scan.brandName) setName(scan.brandName);
    if (!category && scan.category) setCategory(scan.category);
    if (!website) setWebsite(scan.url);
    if (!shopName && scan.shopName) setShopName(scan.shopName);
    if (!markets.length && scan.markets.length) setMarkets(scan.markets.slice(0, 3));
    if (scan.defaultLanguage && LANGUAGES.includes(scan.defaultLanguage)) setLanguage(scan.defaultLanguage);
    if (scan.currency && CURRENCIES.some(([c]) => c === scan.currency)) setCurrency(scan.currency);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [scan, name, category, website, shopName, markets.length]);

  const tagged = (v: string, from: string | null | undefined) => (scan?.ok && from && v && v === from ? <FromTag from="website" /> : null);
  const host = scan?.host ?? (site ? site.replace(/^https?:\/\//, "").split("/")[0] : null);

  return (
    <form action={action} style={{ display: "contents" }}>
      <input type="hidden" name="markets" value={markets.join("|")} />
      <input type="hidden" name="timezone" value={tz} />
      <input type="hidden" name="shopName" value={shopName} />
      <OnboardingShell id={id} step={2} reached={reached} name={name || brand.name} thumb={scan?.image} subs={subs}
        footer={<>
          <BackLink href={`/brands/new/${id}/source?pick=1`} />
          <IrisSays>{scanning ? `Reading ${host ?? "the site"}…` : scan?.ok ? "“I prefilled what I could. Change anything that looks wrong.”" : "“Name and currency are all I need. Everything else can change later.”"}</IrisSays>
          <button className="btn dark" disabled={pending || !name.trim()}>{pending ? "Saving…" : "Continue"}<Icon name="arrow-r" size={13} color="#fff" /></button>
        </>}>
        <div className="row top g24" style={{ maxWidth: 1080, margin: "0 auto", padding: "32px 40px" }}>
          <div className="col g16 fill" style={{ minWidth: 0 }}>
            <div className="col g8">
              <span className="eyebrow">Step 2 · Brand basics</span>
              <h1 className="h1">Confirm the basics</h1>
              <p className="lead">{scan?.ok ? "Iris prefilled these from the website. Change anything that looks wrong." : site ? "Iris is reading the website to prefill these." : "Add the basics. Iris fills in more once she can read a website."}</p>
            </div>
            <div className="row g12">
              <label className="col g6 fill"><span className="row between"><span className="label">Brand name</span>{tagged(name, scan?.brandName)}</span>
                <div className="input"><input name="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Joodoc" required /></div></label>
              <label className="col g6 fill"><span className="row between"><span className="label">Category</span>{tagged(category, scan?.category)}</span>
                <div className="input"><Icon name="tag" size={14} color="#8B8883" /><input name="category" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Skincare · dermatologist-led" list="cats" /></div>
                <datalist id="cats">{["Skincare", "Haircare", "Fragrance & body care", "Makeup", "Supplements", "Fashion", "Home"].map((c) => <option key={c} value={c} />)}</datalist></label>
            </div>
            <label className="col g6"><span className="label">Website</span>
              <div className="input"><Icon name="globe" size={14} color="#8B8883" /><input name="website" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://brand.com" /></div>
              {scan?.ok && <span className="row g6 xs c-green"><Icon name="check-circle" size={13} weight="fill" color="#1F8A5B" />Detected {scan.platform ?? "a"} storefront{scan.languages.length ? ` · ${scan.languages.join(" and ")} version${scan.languages.length > 1 ? "s" : ""}` : ""}</span>}
              {(scanErr || (scan && !scan.ok && scan.error)) && !scanning && <span className="xs c-amber">{scanErr ?? scan?.error}</span>}
            </label>
            {shopConnected ? (
              <div className="col g6"><span className="label">Shopify store</span>
                <div className="input" style={{ background: "var(--tray)" }}><ShopifyLogo size={14} /><span className="sm i1">{shopConnected}</span><span className="fill" /><span className="pill green" style={{ height: 20, fontSize: 11 }}>Connected</span></div></div>
            ) : (
              <label className="col g6"><span className="row between"><span className="label">Shopify store name</span>{scan?.shopName && shopName === scan.shopName && <FromTag from="suggested" />}</span>
                <div className="row" style={{ border: "1px solid var(--line-2)", borderRadius: 8, overflow: "hidden", height: 34, background: "#fff" }}>
                  <span className="row g8 fill" style={{ padding: "0 10px" }}><ShopifyLogo size={14} /><input value={shopName} onChange={(e) => setShopName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} placeholder="brand-global" style={{ border: 0, outline: 0, flex: 1, fontSize: 13 }} /></span>
                  <span className="sm i3" style={{ padding: "0 12px", height: "100%", display: "flex", alignItems: "center", background: "var(--tray)", borderLeft: "1px solid var(--line)" }}>.myshopify.com</span>
                </div>
                {scan?.shopNameNote && shopName === scan.shopName && <span className="xs i3">{scan.shopNameNote}</span>}
              </label>
            )}
            <div className="col g8">
              <span className="row between"><span className="label">Target market</span><span className="xs i3">Where the Shopify store will sell first</span></span>
              <div className="row g6" style={{ flexWrap: "wrap" }}>
                {markets.map((m) => (
                  <button key={m} type="button" className="chip" style={{ borderColor: "var(--ink)" }} onClick={() => setMarkets(markets.filter((x) => x !== m))} title="Remove">
                    <Icon name="check" size={12} color="#121212" weight="bold" />{m}
                  </button>
                ))}
                <button type="button" className="chip dash" onClick={() => setAdding(true)}><Icon name="plus" size={12} />Add market</button>
              </div>
            </div>
            <div className="row g12">
              <label className="col g6 fill"><span className="row between"><span className="label">Default language</span>{tagged(language, scan?.defaultLanguage)}</span>
                <div className="input"><Icon name="globe" size={14} color="#8B8883" /><select name="language" value={language} onChange={(e) => setLanguage(e.target.value)} style={{ border: 0, outline: 0, flex: 1, background: "transparent", font: "inherit" }}>{LANGUAGES.map((l) => <option key={l}>{l}</option>)}</select></div></label>
              <label className="col g6 fill"><span className="row between"><span className="label">Currency</span>{tagged(currency, scan?.currency)}</span>
                <div className="input"><span className="sm i3">¤</span><select name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)} style={{ border: 0, outline: 0, flex: 1, background: "transparent", font: "inherit" }}>{CURRENCIES.map(([c, n]) => <option key={c} value={c}>{c} · {n}</option>)}</select></div></label>
            </div>
            {scan?.note && <div className="notice"><Icon name="info" size={14} /><span>{scan.note}</span></div>}
            {state?.error && <div key={state.at} className="notice red" role="alert">{state.error}</div>}
          </div>

          <aside className="col" style={{ width: 300, flexShrink: 0, border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
            <div className="row g10" style={{ padding: "12px 14px" }}>
              <AgentFace kind="analyst" size={24} mood={scanning ? "focus" : "happy"} />
              <div className="col fill"><span className="sm w5">What Iris found so far</span><span className="xs i3">{host ? `Quick scan of ${host}` : "Waiting for a website"}</span></div>
              {scanning ? <span className="row g4 xs i3"><Icon name="spinner" size={12} className="spin" />Reading</span> : scan?.ok && <span className="row g4 xs" style={{ color: "var(--blue)" }}><span className="dot blue" />Live</span>}
            </div>
            {scanning && !scan ? (
              <div className="col g8" style={{ padding: "0 14px 16px" }}>{[180, 14, 14, 14, 14].map((h, i) => <div key={i} className="skel" style={{ height: h, borderRadius: 8 }} />)}</div>
            ) : scan?.ok ? <>
              {scan.image && <div style={{ position: "relative", margin: "0 14px", borderRadius: 10, overflow: "hidden", height: 170, background: "var(--tray)" }}>
                <img src={scan.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                <span className="row g4 xs" style={{ position: "absolute", left: 8, bottom: 8, background: "rgba(255,255,255,.92)", padding: "3px 7px", borderRadius: 6 }}><Icon name="globe" size={11} />{scan.host} · home hero</span>
              </div>}
              <div className="col" style={{ padding: "10px 14px 14px" }}>
                {scan.tagline && <div className="col g2" style={{ paddingBottom: 8 }}><span className="xs i3">Tagline</span><span style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 16, lineHeight: "22px" }}>“{scan.tagline}”</span></div>}
                {([["Platform", scan.platform], ["Products", scan.productCount ? `${scan.productCount}${scan.priceMin != null ? ` · ${money(scan.priceMin, scan.currency)} – ${money(scan.priceMax, scan.currency)}` : ""}` : null], ["Hero product", scan.heroProduct], ["Languages", scan.languages.join(", ") || null]] as const)
                  .filter(([, v]) => v).map(([k, v]) => <div key={k} className="row between g8 xs" style={{ minHeight: 30, borderTop: "1px solid var(--line)" }}><span className="i3">{k}</span><span className="i1 ell" style={{ textAlign: "right" }}>{v}</span></div>)}
                {scan.nav.length > 0 && <div className="col g6" style={{ paddingTop: 8, borderTop: "1px solid var(--line)" }}><span className="xs i3">Navigation</span><div className="row g4" style={{ flexWrap: "wrap" }}>{scan.nav.map((n) => <span key={n} className="pill" style={{ height: 20, fontSize: 11 }}>{n}</span>)}</div></div>}
              </div>
            </> : (
              <div className="col g6" style={{ padding: "4px 14px 16px" }}><span className="xs i3">{site ? "Iris couldn’t read the site. Fill the basics yourself — she’ll try again during analysis." : "Add the website on the left and Iris reads it during analysis."}</span></div>
            )}
          </aside>
        </div>
      </OnboardingShell>
      {adding && <AddMarket have={markets} onAdd={(m) => setMarkets([...markets, m])} onClose={() => setAdding(false)} />}
    </form>
  );
}
