"use client";
import { useActionState, useState } from "react";
import { startBrand, continueFromSource, type ActionState } from "./actions";
import { OnboardingShell, IrisSays } from "./shell";
import { AgentFace } from "@/components/agent";
import { ShopifyLogo } from "@/components/logos";
import { Icon } from "@/components/icon";
import { Modal } from "@/components/modal";
import type { Source } from "@/lib/onboarding/types";

const SCOPE_TEXT: Record<string, [string, string]> = {
  read_orders: ["Read orders", "Sales, refunds and where each order came from. Never edits orders."],
  read_all_orders: ["Read order history", "Orders older than 60 days, for trends and repeat buyers."],
  read_products: ["Read products & collections", "Catalog, prices and images for the store and ads."],
  read_inventory: ["Read inventory", "Stock levels, so ads pause before a sell-out."],
  read_customers: ["Read customers", "Order counts and spend only — no names, emails or addresses."],
};

export type Connected = { name: string; shop: string; host: string | null; products: number; currency: string | null; at: string | null } | null;

export function KaviarOrb({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-label="Kaviar AI">
      <circle cx="20" cy="20" r="18.5" fill="#F4F3F0" stroke="#55534F" strokeWidth="1" />
      <ellipse cx="20" cy="20" rx="8" ry="18.5" stroke="#55534F" strokeWidth="0.9" />
      <ellipse cx="20" cy="20" rx="18.5" ry="7" stroke="#55534F" strokeWidth="0.9" />
      <path d="M4 12.5h32M4 27.5h32M20 1.5v37" stroke="#55534F" strokeWidth="0.6" strokeDasharray="1.5 2" />
    </svg>
  );
}

function Choice({ on, onClick, icon, title, body, foot }: { on: boolean; onClick: () => void; icon: React.ReactNode; title: string; body: string; foot: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="card col g10 fill" aria-pressed={on}
      style={{ padding: 16, textAlign: "left", minWidth: 0, cursor: "pointer", borderColor: on ? "var(--ink)" : undefined, boxShadow: on ? "0 0 0 1px var(--ink)" : undefined, transition: "border-color .15s ease, box-shadow .15s ease" }}>
      <div className="row between top">
        <span style={{ width: 38, height: 38, borderRadius: 10, border: "1px solid var(--line)", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</span>
        <span className={`radio${on ? " on" : ""}`} />
      </div>
      <span className="h3" style={{ marginTop: 4 }}>{title}</span>
      <span className="sm i3" style={{ lineHeight: "19px" }}>{body}</span>
      <div className="row g6" style={{ flexWrap: "wrap", marginTop: "auto" }}>{foot}</div>
    </button>
  );
}
const tag = (t: string) => <span key={t} className="pill" style={{ height: 22, fontSize: 11.5 }}>{t}</span>;

function NeverModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal icon={<Icon name="shield" size={18} />} title="What Kaviar never does" sub="Read-only, and the store owner stays in control." onClose={onClose}
      footer={<button className="btn dark" type="button" onClick={onClose}>Got it</button>}>
      <div className="col g10">
        {["Edit, cancel or refund orders", "Change products, prices or stock", "Read customer names, emails or addresses", "Touch the live theme or checkout", "Keep access after the owner removes the app"].map((t) => (
          <span key={t} className="row g8 sm i2"><Icon name="x" size={14} color="#C8423B" />{t}</span>
        ))}
      </div>
    </Modal>
  );
}

export function SourceStep({ draft, scopes, shopifyReady, connected, error, initial }: {
  draft: { id: string; name: string; website: string | null; shop: string | null; reached: number } | null;
  scopes: string[]; shopifyReady: boolean; connected: Connected; error?: string | null; initial: Source;
}) {
  const [source, setSource] = useState<Source>(initial);
  const [shop, setShop] = useState((draft?.shop ?? "").replace(/\.myshopify\.com$/, ""));
  const [site, setSite] = useState(draft?.website ?? "");
  const [name, setName] = useState(draft && !draft.name.startsWith("draft-") && draft.name !== "New brand" ? draft.name : "");
  const [never, setNever] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(startBrand, undefined);

  const raw = shop.trim().toLowerCase().replace(/^https?:\/\//, "").split(/[/?#]/)[0];
  const isDomain = raw.includes(".") && !raw.endsWith(".myshopify.com");
  const shopName = isDomain ? raw : raw.replace(/\.myshopify\.com$/, "").replace(/[^a-z0-9-]/g, "");
  const shopValue = !shopName ? "" : isDomain ? shopName : `${shopName}.myshopify.com`;
  const done = source === "shopify" && connected;
  const can = source === "shopify" ? Boolean(done || shopName.length > 1) : source === "website" ? site.trim().includes(".") : name.trim().length > 0;
  const err = state?.error ?? error;

  const iris =
    source === "shopify" ? (done ? "“Connected. I’ll read the store’s catalog and pages when you continue — usually 3 to 4 minutes.”" : "“I’ll analyse the store as soon as you continue — usually 3 to 4 minutes.”")
    : source === "website" ? "“Give me the address and I’ll read the site — products, pages, colours and copy.”"
    : "“Kaviar AI asks three quick questions. I’ll read the site the moment someone shares it.”";

  return (
    <form action={action} style={{ display: "contents" }}>
      <input type="hidden" name="source" value={source} />
      <input type="hidden" name="shop" value={shopValue} />
      {draft && <input type="hidden" name="draft" value={draft.id} />}
      <OnboardingShell id={draft?.id ?? null} step={1} reached={draft?.reached ?? 1} name={draft ? name || draft.name : name || null}
        footer={<>
          <IrisSays>{iris}</IrisSays>
          {done ? <button type="button" className="btn dark" onClick={() => continueFromSource(draft!.id)}>Continue<Icon name="arrow-r" size={13} color="#fff" /></button>
            : <button className="btn dark" disabled={!can || pending}>{pending ? (source === "shopify" ? "Finding the store…" : "Saving…") : source === "shopify" && shopifyReady ? "Connect Shopify" : "Continue"}<Icon name="arrow-r" size={13} color="#fff" /></button>}
        </>}>
        <div className="col g20" style={{ maxWidth: 940, margin: "0 auto", padding: "32px 40px" }}>
          <div className="col g8">
            <span className="eyebrow">Step 1 · Source</span>
            <h1 className="h1">Where does this brand sell today?</h1>
            <p className="lead">Pick one. Connected stores keep their data, imported sites are rebuilt on Shopify, and undecided brands start with Kaviar AI.</p>
          </div>
          <div className="row g12 stretch">
            <Choice on={source === "shopify"} onClick={() => setSource("shopify")} icon={<ShopifyLogo size={20} />} title="Connect Shopify store"
              body="The brand already runs on Shopify. Connect through the Kaviar app with scoped permissions." foot={[tag("About 2 min"), tag("Keeps orders & customers")]} />
            <Choice on={source === "website"} onClick={() => setSource("website")} icon={<Icon name="globe" size={19} color="#55534F" />} title="Import from website"
              body="Cafe24, WooCommerce or any storefront. Iris crawls the site and Cleo rebuilds the catalog on Shopify." foot={[tag("About 6 min"), tag("Cafe24 · Woo · Custom")]} />
            <Choice on={source === "ai"} onClick={() => setSource("ai")} icon={<KaviarOrb size={24} />} title="Kaviar AI"
              body="Not sure where to start? Kaviar AI asks a few questions and recommends a path — or brings in a specialist."
              foot={<span className="row g4 xs i3"><span className="row" style={{ gap: -4 }}>{(["builder", "catalog", "qa", "analyst"] as const).map((k) => <AgentFace key={k} kind={k} size={16} />)}</span>Remy, Cleo, Otto & Iris</span>} />
          </div>

          <div className="card" style={{ flexDirection: "row", alignItems: "stretch" }}>
            <div className="col g12 fill" style={{ padding: 18, minWidth: 0 }}>
              {source === "shopify" && <>
                <label className="col g6">
                  <span className="label">Store domain</span>
                  <div className="row" style={{ border: "1px solid var(--line-2)", borderRadius: 8, overflow: "hidden", height: 38, background: done ? "var(--tray)" : "#fff" }}>
                    <span className="row g8 fill" style={{ padding: "0 10px" }}><ShopifyLogo size={15} />
                      <input value={done ? connected.shop.replace(/\.myshopify\.com$/, "") : shop} readOnly={Boolean(done)} onChange={(e) => setShop(e.target.value)} placeholder="brand.com or brand-name" autoFocus={!done}
                        style={{ border: 0, outline: 0, flex: 1, minWidth: 0, fontSize: 13, background: "transparent" }} /></span>
                    {(!isDomain || done) && <span className="sm i3" style={{ padding: "0 12px", height: "100%", display: "flex", alignItems: "center", background: "var(--tray)", borderLeft: "1px solid var(--line)" }}>.myshopify.com</span>}
                  </div>
                </label>
                {done ? <>
                  <div className="col g4" style={{ padding: "12px 14px", borderRadius: 10, background: "var(--green-bg)", border: "1px solid #D3EBDD" }}>
                    <span className="row between"><span className="row g8 sm w5 c-green"><Icon name="check-circle" size={15} weight="fill" color="#1F8A5B" />Connected to {connected.name} on Shopify</span>{connected.at && <span className="xs c-green">Verified {connected.at}</span>}</span>
                    <span className="xs i2" style={{ paddingLeft: 23 }}>Kaviar app installed by the store owner — they can revoke access anytime in Shopify admin.</span>
                  </div>
                  <div className="col">
                    {[["Store", connected.name], ["Domain", connected.host ?? connected.shop], ["Products", connected.products ? `${connected.products} synced so far` : "Syncing now"], ["Currency", connected.currency ?? "—"]].map(([k, v]) => (
                      <div key={k} className="row between sm" style={{ height: 34, borderTop: "1px solid var(--line)" }}><span className="i3">{k}</span><span className="i1">{v}</span></div>
                    ))}
                  </div>
                </> : <>
                  <span className="xs i3">Type the store’s website (brand.com) and Kaviar finds it, or the name before .myshopify.com from Shopify admin → Settings → Domains.</span>
                  <label className="col g6"><span className="label">Website <span className="i3" style={{ fontWeight: 400 }}>· optional, if it isn’t the store domain</span></span>
                    <div className="input"><Icon name="globe" size={14} color="#8B8883" /><input name="website" value={site} onChange={(e) => setSite(e.target.value)} placeholder="https://brand.com" /></div></label>
                  {!shopifyReady && <div className="notice amber"><span>Shopify isn’t set up on this server yet. Kaviar will save the brand and you can connect the store from Integrations later.</span></div>}
                </>}
              </>}
              {source === "website" && <>
                <label className="col g6"><span className="label">Website</span>
                  <div className="input" style={{ height: 38 }}><Icon name="globe" size={15} color="#8B8883" /><input name="website" value={site} onChange={(e) => setSite(e.target.value)} placeholder="https://en.brand.com" autoFocus /></div></label>
                <span className="xs i3">Any storefront works — Cafe24, WooCommerce, Wix or custom. Iris reads up to 24 pages, then you confirm what she found.</span>
                <label className="col g6"><span className="label">Brand name <span className="i3" style={{ fontWeight: 400 }}>· optional, Iris finds it</span></span>
                  <div className="input"><input name="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Joodoc" /></div></label>
              </>}
              {source === "ai" && <>
                <label className="col g6"><span className="label">Brand name</span>
                  <div className="input" style={{ height: 38 }}><input name="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Joodoc" autoFocus /></div></label>
                <label className="col g6"><span className="label">Website <span className="i3" style={{ fontWeight: 400 }}>· optional</span></span>
                  <div className="input"><Icon name="globe" size={14} color="#8B8883" /><input name="website" value={site} onChange={(e) => setSite(e.target.value)} placeholder="https://brand.com" /></div></label>
                <span className="xs i3">Kaviar AI asks three questions — where the brand sells, what happens to customer data, and what matters first — then recommends a path.</span>
              </>}
              {err && <div key={state?.at} className="notice red" role="alert">{err}</div>}
            </div>

            <div className="col g8" style={{ width: 320, flexShrink: 0, borderLeft: "1px solid var(--line)", padding: 18, background: "var(--tray)" }}>
              {source === "shopify" ? <>
                <span className="row between"><span className="sm w5">Permissions requested</span><Icon name="shield" size={15} color="#8B8883" /></span>
                <span className="xs i3">Plain-language reasons the merchant sees on approval.</span>
                {scopes.filter((s) => SCOPE_TEXT[s]).map((s) => (
                  <div key={s} className="row top g8" style={{ paddingTop: 8, borderTop: "1px solid var(--line)" }}>
                    <Icon name="check" size={14} color="#1F8A5B" weight="bold" style={{ marginTop: 2 }} />
                    <div className="col"><span className="xs w5 i1">{SCOPE_TEXT[s][0]}</span><span className="xs i3">{SCOPE_TEXT[s][1]}</span></div>
                  </div>
                ))}
                <button type="button" className="lnk xs i2 row g6" style={{ marginTop: 4 }} onClick={() => setNever(true)}><Icon name="external" size={12} />What Kaviar never does</button>
              </> : source === "website" ? <>
                <span className="sm w5">What happens next</span>
                {([["analyst", "Iris", "Reads the site and brand deck"], ["catalog", "Cleo", "Rebuilds the catalog on Shopify"], ["builder", "Remy", "Builds on Kaviar Starter"], ["qa", "Otto", "Checks everything before launch"]] as const).map(([k, n, t]) => (
                  <div key={k} className="row g10" style={{ paddingTop: 8, borderTop: "1px solid var(--line)" }}><AgentFace kind={k} size={20} /><div className="col"><span className="xs w5 i1">{n}</span><span className="xs i3">{t}</span></div></div>
                ))}
              </> : <>
                <span className="sm w5">How Kaviar AI helps</span>
                {["Three quick questions, nothing is final", "Iris reads the site if you paste a link", "Recommends a path — or books a specialist", "You can change the path later in setup"].map((t) => (
                  <div key={t} className="row g8 xs i2" style={{ paddingTop: 8, borderTop: "1px solid var(--line)" }}><Icon name="check" size={13} color="#1F8A5B" weight="bold" />{t}</div>
                ))}
              </>}
            </div>
          </div>
        </div>
      </OnboardingShell>
      {never && <NeverModal onClose={() => setNever(false)} />}
    </form>
  );
}
