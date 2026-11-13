"use client";
import { useState } from "react";
import { Icon } from "@/components/icon";
import { Modal } from "@/components/modal";
import { MetaLogo, ShopifyLogo } from "@/components/logos";
import { chooseMetaAccount, disconnect } from "../actions";

const SCOPE_TEXT: Record<string, [string, string]> = {
  read_orders: ["Read orders", "Sales, refunds and where each order came from."],
  read_all_orders: ["Read order history", "Orders older than 60 days, for trends and repeat buyers."],
  read_products: ["Read products & collections", "Catalog, prices and images."],
  read_inventory: ["Read inventory", "Stock levels, so ads pause before a sell-out."],
  read_customers: ["Read customers", "Order counts and spend only — no names, emails or addresses."],
  read_themes: ["See the store’s themes", "So you can pick which theme Kaviar builds on."],
  write_themes: ["Install and edit a theme", "Kaviar adds its theme as an unpublished draft. Nothing goes live until a person publishes it."],
};
type Account = { id: string; name: string; currency: string; timezone_name: string; account_status: number };
type Kind = "shopify" | "meta" | "choose" | "disconnect-shopify" | "disconnect-meta";

const Check = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1F8A5B" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: 2, flexShrink: 0 }}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;

/** One button that opens the right modal (Connect / Reconnect / Choose account / Disconnect). */
export function ConnectAction({ kind, label, slug, dark, shop, scopes, accounts, ready, reconnect }: {
  kind: Kind; label: string; slug: string; dark?: boolean; shop?: string | null; scopes?: string[]; accounts?: Account[]; ready: boolean; reconnect?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <>
      <button type="button" className={`btn sm${dark ? " dark" : ""}`} onClick={() => setOpen(true)} style={kind.startsWith("disconnect") ? { color: "var(--ink-3)" } : undefined}>
        {/reconnect/i.test(label) && <Icon name="refresh" size={13} color={dark ? "#fff" : undefined} />}{label.replace(/^↻\s*/, "")}
      </button>
      {open && kind === "shopify" && <ShopifyModal slug={slug} shop={shop} reconnect={reconnect ?? /reconnect/i.test(label)} scopes={scopes ?? []} ready={ready} onClose={close} />}
      {open && kind === "meta" && <MetaModal slug={slug} ready={ready} onClose={close} />}
      {open && kind === "choose" && <ChooseModal slug={slug} accounts={accounts ?? []} onClose={close} />}
      {open && kind.startsWith("disconnect") && <DisconnectModal slug={slug} provider={kind === "disconnect-shopify" ? "shopify" : "meta"} onClose={close} />}
    </>
  );
}

function NotReady({ provider }: { provider: string }) {
  return <div className="notice amber"><span>{provider} isn’t set up for Kaviar yet. Once an owner adds the Kaviar {provider} app, connecting works from here.</span></div>;
}

function ShopifyModal({ slug, shop, reconnect, scopes, ready, onClose }: { slug: string; shop?: string | null; reconnect: boolean; scopes: string[]; ready: boolean; onClose: () => void }) {
  const [v, setV] = useState((shop ?? "").replace(/\.myshopify\.com$/, ""));
  // The store's own domain (percentscience.com), its Shopify name (brand-name / brand-name.myshopify.com),
  // or the admin link copied from the browser (admin.shopify.com/store/brand-name).
  const adminHandle = v.match(/admin\.shopify\.com\/store\/([a-z0-9][a-z0-9-]*)/i)?.[1];
  const raw = adminHandle ? adminHandle.toLowerCase() : v.trim().toLowerCase().replace(/^https?:\/\//, "").split(/[/?#]/)[0];
  const isDomain = raw.includes(".") && !raw.endsWith(".myshopify.com");
  const name = isDomain ? raw : raw.replace(/\.myshopify\.com$/, "").replace(/[^a-z0-9-]/g, "");
  const shopValue = !name ? "" : isDomain ? name : `${name}.myshopify.com`;
  return (
    <Modal icon={<ShopifyLogo size={18} />} title={reconnect ? "Reconnect Shopify" : "Connect Shopify store"} sub="The store owner approves access in Shopify. Takes about 2 minutes." onClose={onClose} width={560}
      footer={<><span className="xs i3 fill">Never edits orders, products or the live theme</span><button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button form="shopify-connect" className="btn dark" disabled={!ready || name.length < 2}>Continue to Shopify →</button></>}>
      <form id="shopify-connect" action="/api/shopify/install" method="get" className="col g14">
        <input type="hidden" name="brand" value={slug} />
        <input type="hidden" name="shop" value={shopValue} />
        <label className="col g6">
          <span className="label">Store domain</span>
          <div className="row" style={{ border: "1px solid var(--line-2)", borderRadius: 8, overflow: "hidden", height: 38, background: "#fff" }}>
            <span className="row g8 fill" style={{ padding: "0 10px" }}><ShopifyLogo size={15} />
              <input value={v} onChange={(e) => setV(e.target.value)} placeholder="brand.com or brand-name" autoFocus style={{ border: 0, outline: 0, flex: 1, minWidth: 0, fontSize: 13, background: "transparent" }} /></span>
            {!isDomain && <span className="sm i3" style={{ padding: "0 12px", height: "100%", display: "flex", alignItems: "center", background: "var(--tray)", borderLeft: "1px solid var(--line)" }}>.myshopify.com</span>}
          </div>
          <span className="xs i3">Paste the store’s admin link (admin.shopify.com/store/…), its website (brand.com), or the name before .myshopify.com.</span>
        </label>
        <div className="col g6" style={{ padding: 12, borderRadius: 10, background: "var(--tray)", border: "1px solid var(--line)" }}>
          <span className="sm w5">Permissions requested</span>
          {scopes.filter((s) => SCOPE_TEXT[s]).map((s) => (
            <div key={s} className="row top g8"><Check /><span className="xs"><b className="w5 i1">{SCOPE_TEXT[s][0]}</b> <span className="i3">— {SCOPE_TEXT[s][1]}</span></span></div>
          ))}
        </div>
        {!ready && <NotReady provider="Shopify" />}
      </form>
    </Modal>
  );
}

function MetaModal({ slug, ready, onClose }: { slug: string; ready: boolean; onClose: () => void }) {
  return (
    <Modal icon={<MetaLogo size={18} />} title="Connect Meta Ads" sub="Log in with Facebook as someone who can see the brand’s ad account." onClose={onClose}
      footer={<><span className="xs i3 fill">Read-only · ads_read</span><button type="button" className="btn" onClick={onClose}>Cancel</button>
        {ready ? <a className="btn dark" href={`/api/meta/connect?brand=${slug}`}>Continue with Facebook →</a> : <button className="btn dark" disabled>Continue with Facebook →</button>}</>}>
      <div className="col g8">
        {["Campaigns, ads and their thumbnails", "Daily spend, impressions, clicks and purchases per ad", "Refreshed every hour; the last 7 days are re-read as Meta updates them"].map((t) => (
          <div key={t} className="row top g8"><Check /><span className="sm i2">{t}</span></div>
        ))}
        <span className="xs i3" style={{ paddingTop: 4 }}>Kaviar can’t create, edit or pause ads with this access. The login lasts about 60 days — Kaviar reminds you before it runs out.</span>
      </div>
      {!ready && <NotReady provider="Meta" />}
    </Modal>
  );
}

function ChooseModal({ slug, accounts, onClose }: { slug: string; accounts: Account[]; onClose: () => void }) {
  const [pick, setPick] = useState(accounts[0]?.id ?? "");
  return (
    <Modal icon={<MetaLogo size={18} />} title="Choose the ad account" sub="This Facebook login can see several ad accounts. Pick the brand’s." onClose={onClose}
      footer={<><span className="fill" /><button type="button" className="btn" onClick={onClose}>Cancel</button><button form="choose-acct" className="btn dark" disabled={!pick}>Use this account</button></>}>
      <form id="choose-acct" action={chooseMetaAccount.bind(null, slug)} className="col g8">
        <input type="hidden" name="account" value={pick} />
        {accounts.map((a) => (
          <button key={a.id} type="button" onClick={() => setPick(a.id)} className="row g10" style={{ padding: "10px 12px", borderRadius: 10, textAlign: "left", background: "#fff", border: `1px solid ${pick === a.id ? "var(--ink)" : "var(--line)"}`, boxShadow: pick === a.id ? "0 0 0 1px var(--ink)" : undefined }}>
            <span className={`radio${pick === a.id ? " on" : ""}`} />
            <span className="col fill"><span className="sm w5 i1">{a.name}</span><span className="xs i3">{a.id} · {a.currency} · {a.timezone_name}</span></span>
            {a.account_status !== 1 && <span className="pill amber">Not active</span>}
          </button>
        ))}
      </form>
    </Modal>
  );
}

function DisconnectModal({ slug, provider, onClose }: { slug: string; provider: "shopify" | "meta"; onClose: () => void }) {
  const name = provider === "shopify" ? "Shopify" : "Meta Ads";
  return (
    <Modal icon={provider === "shopify" ? <ShopifyLogo size={18} /> : <MetaLogo size={18} />} title={`Disconnect ${name}?`} sub="Syncing stops and Kaviar forgets the access token." onClose={onClose}
      footer={<><span className="fill" /><button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button form="disc" className="btn" style={{ color: "var(--red)", borderColor: "#F3D3CF" }}>Disconnect</button></>}>
      <form id="disc" action={disconnect.bind(null, slug, provider)}>
        <span className="sm i2">Data already synced stays, so history and reports keep working. You can reconnect any time.</span>
      </form>
    </Modal>
  );
}
