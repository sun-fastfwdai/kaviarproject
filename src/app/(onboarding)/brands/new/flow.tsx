"use client";
import { useActionState, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { createBrand, type NewBrandState } from "./actions";
import { AgentFace } from "@/components/agent";
import { ShopifyLogo } from "@/components/logos";

const CURRENCIES: [string, string][] = [["USD", "US dollar"], ["KRW", "Korean won"], ["EUR", "Euro"], ["GBP", "British pound"], ["JPY", "Japanese yen"], ["CAD", "Canadian dollar"], ["AUD", "Australian dollar"], ["SGD", "Singapore dollar"]];
const SCOPE_TEXT: Record<string, [string, string]> = {
  read_orders: ["Read orders", "Sales, refunds and where each order came from."],
  read_all_orders: ["Read order history", "Orders older than 60 days, for trends and repeat buyers."],
  read_products: ["Read products & collections", "Catalog, prices and images for ads and signals."],
  read_inventory: ["Read inventory", "Stock levels, so ads pause before a sell-out."],
  read_customers: ["Read customers", "Order counts and spend only — no names, emails or addresses."],
};

function Step({ n, title, sub, state }: { n: number; title: string; sub: string; state: "done" | "now" | "next" }) {
  return (
    <div className="row top g12" style={{ position: "relative" }}>
      <div className="col" style={{ alignItems: "center", paddingTop: 12 }}>
        <span style={{ width: 16, height: 16, borderRadius: 99, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
          background: state === "done" ? "var(--green)" : "#fff", border: state === "done" ? 0 : `1.5px solid ${state === "now" ? "var(--ink)" : "var(--line-2)"}` }}>
          {state === "done" ? <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            : state === "now" ? <span style={{ width: 7, height: 7, borderRadius: 99, background: "var(--ink)" }} /> : null}
        </span>
      </div>
      <div className="col fill" style={{ padding: "8px 10px", borderRadius: 8, background: state === "now" ? "var(--tray-2)" : "transparent" }}>
        <span className="row between"><span className={`sm w5 ${state === "next" ? "i3" : "i1"}`}>{title}</span><span className="xs i3">{n}/2</span></span>
        <span className="xs i3">{sub}</span>
      </div>
    </div>
  );
}

function Choice({ on, onClick, icon, title, body, tags }: { on: boolean; onClick: () => void; icon: React.ReactNode; title: string; body: string; tags: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="card col g10 fill" aria-pressed={on}
      style={{ padding: 16, textAlign: "left", minWidth: 0, cursor: "pointer", borderColor: on ? "var(--ink)" : undefined, boxShadow: on ? "0 0 0 1px var(--ink)" : undefined, transition: "border-color .15s ease, box-shadow .15s ease" }}>
      <div className="row between top">
        <span style={{ width: 36, height: 36, borderRadius: 10, border: "1px solid var(--line)", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</span>
        <span className={`radio${on ? " on" : ""}`} />
      </div>
      <span className="h3">{title}</span>
      <span className="sm i3" style={{ lineHeight: "19px" }}>{body}</span>
      <div className="row g6" style={{ flexWrap: "wrap" }}>{tags}</div>
    </button>
  );
}

const tag = (t: string) => <span key={t} className="pill" style={{ height: 22, fontSize: 11.5 }}>{t}</span>;

export function NewBrandFlow({ shopifyReady, scopes }: { shopifyReady: boolean; scopes: string[] }) {
  const [step, setStep] = useState(1);
  const [source, setSource] = useState<"shopify" | "later">("shopify");
  const [shop, setShop] = useState("");
  const [name, setName] = useState("");
  // Browser time zone on the client, UTC during server render (no hydration mismatch).
  const tz = useSyncExternalStore(() => () => {}, () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", () => "UTC");
  const [state, action, pending] = useActionState<NewBrandState, FormData>(createBrand, undefined);

  const shopName = shop.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\.myshopify\.com.*$/, "").replace(/[^a-z0-9-]/g, "");
  const canContinue = source === "later" || shopName.length > 1;
  const iris = step === 1
    ? (source === "shopify" ? "“As soon as the store is connected I’ll start reading orders and products — the first sync takes a few minutes.”" : "“No problem — create the brand now and connect Shopify from Integrations when it’s ready.”")
    : "“Name and currency are all I need. Everything else can change later.”";

  return (
    <form action={action} className="sheet" style={{ margin: 0 }}>
      <input type="hidden" name="source" value={source} />
      <input type="hidden" name="shop" value={shopName ? `${shopName}.myshopify.com` : ""} />
      <input type="hidden" name="timezone" value={tz} />
      <header className="bar">
        <div className="wordmark" style={{ padding: 0 }}><div className="m"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4v16M18 4 8 12l10 8" /></svg></div>Kaviar</div>
        <div className="vr" style={{ margin: "14px 4px" }} />
        <nav className="crumb"><Link className="lnk" href="/brands">Brands</Link><span className="i4">›</span><span>New brand</span>{name && <><span className="i4">›</span><b>{name}</b></>}</nav>
        <div className="fill" />
        <Link href="/brands" className="btn quiet sm">✕ Exit</Link>
      </header>

      <div className="row fill stretch" style={{ minHeight: 0 }}>
        <aside className="col" style={{ width: 300, flexShrink: 0, borderRight: "1px solid var(--line)", background: "var(--tray)", padding: "22px 18px", gap: 18 }}>
          <div className="col g10">
            <span className="eyebrow">New brand</span>
            <div className="row between"><span className="h3">Onboarding</span><span className="xs i3">Step {step} of 2</span></div>
            <div className="steps"><span className={`s ${step > 1 ? "done" : "now"}`} /><span className={`s ${step > 1 ? "now" : ""}`} /></div>
          </div>
          <div className="col g4">
            <Step n={1} title="Source" sub={step > 1 ? (source === "shopify" ? `${shopName}.myshopify.com` : "Connect Shopify later") : "Shopify store, or later"} state={step > 1 ? "done" : "now"} />
            <Step n={2} title="Brand basics" sub="Name, category, currency" state={step === 2 ? "now" : "next"} />
          </div>
          <div className="fill" />
          <div className="col g6" style={{ padding: "12px 14px", background: "#fff", border: "1px solid var(--line)", borderRadius: 12 }}>
            <div className="row g8"><AgentFace kind="analyst" size={18} /><span className="sm w5">Iris</span><span className="xs i3">· studies the brand</span></div>
            <span className="xs i2" style={{ lineHeight: "17px" }}>Everything here can be changed later. Connecting Shopify is read-only — Kaviar never edits the store from here.</span>
          </div>
        </aside>

        <section className="scroll">
          <div className="col g20" style={{ maxWidth: 900, margin: "0 auto", padding: "36px 40px" }}>
            {step === 1 ? (
              <>
                <div className="col g8">
                  <span className="eyebrow">Step 1 · Source</span>
                  <h1 className="h1">Where does this brand sell today?</h1>
                  <p className="lead">Connect the Shopify store to sync orders and products, or create the brand now and connect it later.</p>
                </div>
                <div className="row g12 stretch">
                  <Choice on={source === "shopify"} onClick={() => setSource("shopify")} icon={<ShopifyLogo size={20} />} title="Connect Shopify store"
                    body="The brand already runs on Shopify. Connect through the Kaviar app with read-only permissions." tags={[tag("About 2 min"), tag("Keeps orders & customers")]} />
                  <Choice on={source === "later"} onClick={() => setSource("later")}
                    icon={<svg width="18" height="18" viewBox="0 0 256 256" fill="#55534F"><path d="M128 24a104 104 0 1 0 104 104A104.11 104.11 0 0 0 128 24m0 192a88 88 0 1 1 88-88 88.1 88.1 0 0 1-88 88m64-88a8 8 0 0 1-8 8h-56a8 8 0 0 1-8-8V72a8 8 0 0 1 16 0v48h48a8 8 0 0 1 8 8" /></svg>}
                    title="Connect later" body="Not on Shopify yet, or waiting for access from the store owner. Set up the brand now, connect from Integrations." tags={[tag("Under a minute")]} />
                </div>
                {source === "shopify" && (
                  <div className="card" style={{ flexDirection: "row", alignItems: "stretch" }}>
                    <div className="col g12 fill" style={{ padding: 18, minWidth: 0 }}>
                      <label className="col g6">
                        <span className="label">Store domain</span>
                        <div className="row" style={{ border: "1px solid var(--line-2)", borderRadius: 8, overflow: "hidden", height: 38, background: "#fff" }}>
                          <span className="row g8 fill" style={{ padding: "0 10px" }}><ShopifyLogo size={15} />
                            <input value={shop} onChange={(e) => setShop(e.target.value)} placeholder="brand-name" autoFocus style={{ border: 0, outline: 0, flex: 1, minWidth: 0, fontSize: 13, background: "transparent" }} /></span>
                          <span className="sm i3" style={{ padding: "0 12px", height: "100%", display: "flex", alignItems: "center", background: "var(--tray)", borderLeft: "1px solid var(--line)" }}>.myshopify.com</span>
                        </div>
                      </label>
                      <span className="xs i3">Find it in Shopify admin → Settings → Domains. It’s the address ending in .myshopify.com.</span>
                      {!shopifyReady && <div className="notice amber"><span>Shopify isn’t set up on this server yet, so the brand will be created and you can connect the store from Integrations once it is.</span></div>}
                    </div>
                    <div className="col g8" style={{ width: 300, flexShrink: 0, borderLeft: "1px solid var(--line)", padding: 18, background: "var(--tray)" }}>
                      <span className="sm w5">Permissions requested</span>
                      <span className="xs i3">What the store owner approves in Shopify.</span>
                      {scopes.filter((s) => SCOPE_TEXT[s]).map((s) => (
                        <div key={s} className="row top g8" style={{ paddingTop: 6, borderTop: "1px solid var(--line)" }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1F8A5B" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: 2 }}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                          <div className="col"><span className="xs w5 i1">{SCOPE_TEXT[s][0]}</span><span className="xs i3">{SCOPE_TEXT[s][1]}</span></div>
                        </div>
                      ))}
                      <span className="xs i3" style={{ paddingTop: 4 }}>Read-only. Kaviar never edits the store, products or orders.</span>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="col g8">
                  <span className="eyebrow">Step 2 · Brand basics</span>
                  <h1 className="h1">Confirm the basics</h1>
                  <p className="lead">{source === "shopify" ? "Currency and time zone update from Shopify once the store connects." : "You can change any of this later."}</p>
                </div>
                <div className="col g16" style={{ maxWidth: 560 }}>
                  <div className="row g12">
                    <label className="col g6 fill"><span className="label">Brand name</span><div className="input"><input name="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jmella" required autoFocus /></div></label>
                    <label className="col g6 fill"><span className="label">Category <span className="i3" style={{ fontWeight: 400 }}>· optional</span></span><div className="input"><input name="category" placeholder="Fragrance & body care" /></div></label>
                  </div>
                  <label className="col g6"><span className="label">Website <span className="i3" style={{ fontWeight: 400 }}>· optional</span></span>
                    <div className="input"><svg width="15" height="15" viewBox="0 0 256 256" fill="#8B8883"><path d="M128 24a104 104 0 1 0 104 104A104.12 104.12 0 0 0 128 24m88 104a87.6 87.6 0 0 1-3.33 24h-38.51a157.4 157.4 0 0 0 0-48h38.51a87.6 87.6 0 0 1 3.33 24m-114 40h52a115.1 115.1 0 0 1-26 45 115.3 115.3 0 0 1-26-45m-3.9-16a140.8 140.8 0 0 1 0-48h59.88a140.8 140.8 0 0 1 0 48ZM40 128a87.6 87.6 0 0 1 3.33-24h38.51a157.4 157.4 0 0 0 0 48H43.33A87.6 87.6 0 0 1 40 128m114-40h-52a115.1 115.1 0 0 1 26-45 115.3 115.3 0 0 1 26 45m52.33 0h-35.62a135.3 135.3 0 0 0-22.3-45.6A88.29 88.29 0 0 1 206.37 88Zm-98.74-45.6A135.3 135.3 0 0 0 85.29 88H49.63a88.29 88.29 0 0 1 57.96-45.6M49.63 168h35.66a135.3 135.3 0 0 0 22.3 45.6A88.29 88.29 0 0 1 49.63 168m98.78 45.6a135.3 135.3 0 0 0 22.3-45.6h35.66a88.29 88.29 0 0 1-57.96 45.6" /></svg>
                      <input name="website" placeholder="https://brand.com" /></div></label>
                  <div className="row g12">
                    <label className="col g6 fill"><span className="label">Currency</span>
                      <div className="input"><select name="currency" defaultValue="USD">{CURRENCIES.map(([c, n]) => <option key={c} value={c}>{c} · {n}</option>)}</select></div></label>
                    <label className="col g6 fill"><span className="label">Time zone</span><div className="input" style={{ background: "var(--tray)" }}><span className="sm i2 ell">{tz}</span></div></label>
                  </div>
                  {state?.error && <div key={state.at} className="notice red" role="alert">{state.error}</div>}
                </div>
              </>
            )}
          </div>
        </section>
      </div>

      <footer className="row g12" style={{ height: 64, flexShrink: 0, padding: "0 20px", borderTop: "1px solid var(--line)" }}>
        {step === 2 && <button type="button" className="btn" onClick={() => setStep(1)}>‹ Back</button>}
        <AgentFace kind="analyst" size={20} />
        <span className="sm i2 fill ell"><b className="w5 i1">Iris:</b> {iris}</span>
        {step === 1 ? (
          <button type="button" className="btn dark" disabled={!canContinue} onClick={() => setStep(2)}>Continue →</button>
        ) : (
          <button className="btn dark" disabled={pending || !name.trim()}>{pending ? "Creating…" : source === "shopify" && shopifyReady ? "Create and connect Shopify →" : "Create brand →"}</button>
        )}
      </footer>
    </form>
  );
}
