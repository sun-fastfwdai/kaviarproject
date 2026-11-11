import Link from "next/link";
import { getBrand, getConnections, type ConnectionView } from "@/lib/queries/brands";
import { env } from "@/lib/env";
import { daysUntil, shortDate } from "@/lib/format";
import { Bar } from "@/components/shell/parts";
import { Icon } from "@/components/icon";
import { SourceTile } from "@/components/logos";
import { ConnPill } from "@/components/ui";
import { chooseMetaAccount, disconnect } from "../actions";

export const metadata = { title: "Integrations" };

const ERRORS: Record<string, string> = {
  shop: "That doesn’t look like a Shopify store. Use the store’s .myshopify.com address.",
  state: "The connection link expired or was opened in another browser. Try again.",
  hmac: "Shopify’s reply couldn’t be verified. Try again.",
  scopes: "The store didn’t grant every permission Kaviar needs. Reconnect and approve all of them.",
  denied: "Access was not granted.",
  meta_account: "Pick one of the ad accounts listed.",
  token: "The provider rejected the request. Try again — if it keeps failing, check the app keys.",
  no_accounts: "This Facebook login can’t see any ad accounts. Use a login with access to the brand’s ad account.",
};

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="row between" style={{ padding: "7px 0", borderTop: "1px solid var(--line)" }}>
      <span className="sm i3">{k}</span>
      <span className="sm i1 ell" style={{ maxWidth: "62%" }}>{v}</span>
    </div>
  );
}

function SetupNeeded({ provider }: { provider: "Shopify" | "Meta" }) {
  return (
    <div className="notice amber">
      <Icon name="key" size={14} />
      <span>{provider} isn’t set up for Kaviar yet. Once an owner adds the Kaviar {provider} app, you can connect here.</span>
    </div>
  );
}

function ShopifyCard({ slug, conn }: { slug: string; conn: ConnectionView | null }) {
  const configured = env.shopifyConfigured();
  const live = conn && ["connected", "sample"].includes(conn.status);
  return (
    <div className="card fill" style={{ minWidth: 0 }}>
      <div className="card-h">
        <SourceTile provider="shopify" size={36} />
        <div className="col fill" style={{ minWidth: 0 }}>
          <span className="h3">Shopify</span>
          <span className="xs i3 ell">{conn?.externalId ?? "Orders, products, customers, inventory"}</span>
        </div>
        <ConnPill status={conn?.status} />
      </div>
      <div className="card-b">
        {live && conn ? (
          <div className="col">
            <Row k="Store" v={conn.displayName ?? conn.externalId} />
            <Row k="Connected" v={conn.connectedAt ? `${shortDate(conn.connectedAt)}${conn.connectedByName ? ` · ${conn.connectedByName}` : ""}` : "—"} />
            <Row k="API version" v={String(conn.details.apiVersion ?? "—")} />
            <Row k="Access" v={<span className="row g4" style={{ flexWrap: "wrap", justifyContent: "flex-end" }}>{conn.scopes.map((s) => <span key={s} className="code">{s}</span>)}</span>} />
            {conn.refreshExpiresAt && <Row k="Token" v="Expiring token · refreshed automatically" />}
            {conn.lastError && <div className="notice amber" style={{ marginTop: 8 }}><Icon name="warning" size={14} /><span>{conn.lastError}</span></div>}
          </div>
        ) : null}
        {conn?.status === "sample" ? (
          <p className="sm i3">This brand shows sample data. Create a new brand to connect a real store.</p>
        ) : !configured ? (
          <SetupNeeded provider="Shopify" />
        ) : (
          <form action="/api/shopify/install" method="get" className="col g8">
            <input type="hidden" name="brand" value={slug} />
            <label className="col g6">
              <span className="label">{live ? "Reconnect store" : "Store address"}</span>
              <div className="row g8">
                <div className="input fill"><input name="shop" defaultValue={conn?.externalId ?? ""} placeholder="brand.myshopify.com" required /></div>
                <button className="btn dark">{live ? "Reconnect" : "Connect Shopify"}</button>
              </div>
            </label>
            <span className="hint">You’ll approve read-only access in Shopify. Kaviar never edits the store from here.</span>
          </form>
        )}
        {conn?.status === "connected" && (
          <form action={disconnect.bind(null, slug, "shopify")}>
            <button className="btn quiet sm"><Icon name="unlink" size={13} />Disconnect</button>
          </form>
        )}
      </div>
    </div>
  );
}

function MetaCard({ slug, conn }: { slug: string; conn: ConnectionView | null }) {
  const configured = env.metaConfigured();
  const live = conn && ["connected", "sample"].includes(conn.status);
  const accounts = (conn?.details.accounts ?? []) as { id: string; name: string; currency: string; timezone_name: string; account_status: number }[];
  const daysLeft = conn?.accessExpiresAt ? daysUntil(conn.accessExpiresAt) : null;
  return (
    <div className="card fill" style={{ minWidth: 0 }}>
      <div className="card-h">
        <SourceTile provider="meta" size={36} />
        <div className="col fill" style={{ minWidth: 0 }}>
          <span className="h3">Meta Ads</span>
          <span className="xs i3 ell">{conn?.displayName ?? "Campaigns, ads, spend, daily insights"}</span>
        </div>
        <ConnPill status={conn?.status} />
      </div>
      <div className="card-b">
        {conn?.status === "choose_account" && (
          <form action={chooseMetaAccount.bind(null, slug)} className="col g8">
            <span className="label">Which ad account is {conn.displayName ?? "this brand"}’s?</span>
            <div className="col" style={{ border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden" }}>
              {accounts.map((a, i) => (
                <label key={a.id} className="row g10" style={{ padding: "10px 12px", borderTop: i ? "1px solid var(--line)" : 0, cursor: "pointer" }}>
                  <input type="radio" name="account" value={a.id} defaultChecked={i === 0} />
                  <div className="col fill"><span className="sm w5 i1">{a.name}</span><span className="xs i3">{a.id} · {a.currency} · {a.timezone_name}</span></div>
                  {a.account_status !== 1 && <span className="pill amber">Not active</span>}
                </label>
              ))}
            </div>
            <button className="btn dark">Use this account</button>
          </form>
        )}
        {live && conn && (
          <div className="col">
            <Row k="Ad account" v={`${conn.displayName} · ${conn.externalId}`} />
            <Row k="Currency" v={String(conn.details.currency ?? "—")} />
            <Row k="Connected" v={conn.connectedAt ? `${shortDate(conn.connectedAt)}${conn.connectedByName ? ` · ${conn.connectedByName}` : ""}` : "—"} />
            <Row k="Access" v={<span className="row g4">{conn.scopes.map((s) => <span key={s} className="code">{s}</span>)}</span>} />
            {daysLeft != null && <Row k="Login expires" v={<span className={daysLeft < 10 ? "c-amber" : ""}>in {daysLeft} days · reconnect before then</span>} />}
            {conn.lastError && <div className="notice amber" style={{ marginTop: 8 }}><Icon name="warning" size={14} /><span>{conn.lastError}</span></div>}
          </div>
        )}
        {conn?.status === "sample" ? null : !configured ? (
          <SetupNeeded provider="Meta" />
        ) : conn?.status !== "choose_account" ? (
          <div className="row g8">
            <a className="btn dark" href={`/api/meta/connect?brand=${slug}`}>{live || conn?.status === "needs_reauth" ? "Reconnect Meta" : "Connect Meta Ads"}</a>
            <span className="hint">Read-only: ads_read. Log in with someone who can see the brand’s ad account.</span>
          </div>
        ) : null}
        {conn?.status === "connected" && (
          <form action={disconnect.bind(null, slug, "meta")}>
            <button className="btn quiet sm"><Icon name="unlink" size={13} />Disconnect</button>
          </form>
        )}
      </div>
    </div>
  );
}

export default async function IntegrationsPage({ params, searchParams }: PageProps<"/brands/[slug]/integrations">) {
  const { slug } = await params;
  const sp = await searchParams;
  const brand = await getBrand(slug);
  const conns = await getConnections(brand.id);
  const err = typeof sp.error === "string" ? ERRORS[sp.error] ?? sp.error : null;
  return (
    <>
      <Bar crumbs={[{ label: brand.name, href: `/brands/${slug}` }, { label: "Integrations" }]}>
        <Link className="btn sm" href={`/brands/${slug}/sync`}><Icon name="database" size={14} />Data sync</Link>
      </Bar>
      <div className="scroll">
        <div className="col g20" style={{ padding: "28px 32px", maxWidth: 1180 }}>
          <div className="col g4">
            <h1 className="h1">Integrations</h1>
            <p className="lead">Connect the brand’s Shopify store and Meta ad account. Both are read-only; Kaviar syncs them every hour.</p>
          </div>
          {err && <div className="notice red" role="alert"><Icon name="warning-circle" size={14} /><span>{err}</span></div>}
          <div className="row top g16">
            <ShopifyCard slug={slug} conn={conns.shopify} />
            <MetaCard slug={slug} conn={conns.meta} />
          </div>
          <div className="card" style={{ padding: "16px 18px" }}>
            <span className="h3">What Kaviar reads</span>
            <div className="row top g24" style={{ paddingTop: 10 }}>
              <p className="sm i2 fill">From <b>Shopify</b>: orders with line items, totals, refunds, discount codes and UTMs; products, variants, stock and cost; customers as ids, order counts and spend. Names, emails and addresses are not copied.</p>
              <p className="sm i2 fill">From <b>Meta</b>: campaigns, ads with thumbnails, and daily spend, impressions, link clicks and purchases per ad. Kaviar can’t create or change ads with this access.</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
