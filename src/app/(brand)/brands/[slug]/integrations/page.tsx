import Link from "next/link";
import { getBrand, getConnections, type ConnectionView } from "@/lib/queries/brands";
import { runs } from "@/lib/queries/sync";
import { env } from "@/lib/env";
import { ago, daysUntil, shortDate } from "@/lib/format";
import { Bar } from "@/components/shell/parts";
import { Icon } from "@/components/icon";
import { SourceTile } from "@/components/logos";
import { AgentFace } from "@/components/agent";
import { ConnectAction } from "./connect-ui";

export const metadata = { title: "Integrations" };

const ERRORS: Record<string, string> = {
  shop: "That doesn’t look like a Shopify store. Use the store’s domain or its .myshopify.com address.",
  shop_lookup: "Kaviar couldn’t find a Shopify store at that domain. Check the spelling, or use the .myshopify.com address from Shopify admin → Settings → Domains.",
  state: "The connection link expired or was opened in another browser. Try again.",
  hmac: "Shopify’s reply couldn’t be verified. Try again.",
  scopes: "The store didn’t grant every permission Kaviar needs. Reconnect and approve all of them.",
  denied: "Access was not granted.",
  meta_account: "Pick one of the ad accounts listed.",
  token: "The provider rejected the request. Try again — if it keeps failing, check the app keys.",
  no_accounts: "This Facebook login can’t see any ad accounts. Use a login with access to the brand’s ad account.",
};

const SHOPIFY_SCOPES = ["read_orders", "read_all_orders", "read_products", "read_inventory", "read_customers"];
const nice = (s: string) => s.replace(/^read_/, "").replace(/_/g, " ").replace(/^all orders$/, "order history");

function Summary({ provider, conn, lastSync, action }: { provider: "shopify" | "meta"; conn: ConnectionView; lastSync: Date | null; action: React.ReactNode }) {
  const daysLeft = provider === "meta" && conn.accessExpiresAt ? daysUntil(conn.accessExpiresAt) : null;
  return (
    <div className="card row g16" style={{ flexDirection: "row", alignItems: "center", padding: "14px 16px", flexWrap: "wrap" }}>
      <div className="row g12" style={{ minWidth: 220 }}>
        <SourceTile provider={provider} size={40} />
        <div className="col" style={{ minWidth: 0 }}>
          <span className="t w5 i1 ell">{provider === "shopify" ? conn.externalId : `${conn.displayName ?? "Ad account"}`}</span>
          <span className="row g6 xs c-green"><span className="dot green" />{conn.status === "sample" ? "Sample data" : provider === "shopify" ? "Connected via Kaviar app" : `Connected · ${conn.externalId}`}</span>
        </div>
      </div>
      <div className="vr" />
      <div className="row g24" style={{ flexWrap: "wrap" }}>
        {[
          [provider === "shopify" ? "API version" : "Currency", provider === "shopify" ? String(conn.details.apiVersion ?? "2026-10") : String(conn.details.currency ?? "—")],
          ["Last sync", lastSync ? ago(lastSync) : "waiting"],
          ["Connected by", `${conn.connectedByName ?? "Kaviar"}${conn.connectedAt ? ` · ${shortDate(conn.connectedAt)}` : ""}`],
          ...(daysLeft != null ? [["Login expires", `in ${daysLeft} days`]] : []),
        ].map(([k, v]) => <div key={k} className="col g2"><span className="xs i3">{k}</span><span className={`sm i1 ${k === "Login expires" && Number(v.split(" ")[1]) < 10 ? "c-amber" : ""}`}>{v}</span></div>)}
      </div>
      <div className="col g4 fill" style={{ minWidth: 200 }}>
        <span className="xs i3">Access granted</span>
        <div className="row g4" style={{ flexWrap: "wrap" }}>{conn.scopes.map((s) => <span key={s} className="pill" style={{ height: 22, fontSize: 11.5 }}>{nice(s)}</span>)}</div>
      </div>
      {action}
    </div>
  );
}

export default async function IntegrationsPage({ params, searchParams }: PageProps<"/brands/[slug]/integrations">) {
  const { slug } = await params;
  const sp = await searchParams;
  const brand = await getBrand(slug);
  const conns = await getConnections(brand.id);
  const history = await runs(brand.id, 20);
  const err = typeof sp.error === "string" ? ERRORS[sp.error] ?? sp.error : null;
  const last = (p: string) => history.find((r) => r.provider === p && r.status === "success")?.finishedAt ?? null;
  const shopifyReady = env.shopifyConfigured(), metaReady = env.metaConfigured();
  const scopes = shopifyReady ? env.shopify().scopes : SHOPIFY_SCOPES;
  const live = (c: ConnectionView | null) => Boolean(c && ["connected", "sample"].includes(c.status));
  const waiting = [conns.shopify, conns.meta].filter((c) => !c || ["needs_reauth", "choose_account", "disconnected"].includes(c.status)).length;
  const accounts = (conns.meta?.details.accounts ?? []) as { id: string; name: string; currency: string; timezone_name: string; account_status: number }[];

  const rows: { provider: "shopify" | "meta"; name: string; what: string; conn: ConnectionView | null; who: string; ready: boolean }[] = [
    { provider: "shopify", name: "Shopify", what: "Orders, products, customers, stock", conn: conns.shopify, who: "Store owner approves", ready: shopifyReady },
    { provider: "meta", name: "Meta Ads", what: "Campaigns, ads, spend, daily insights", conn: conns.meta, who: "Ad account login", ready: metaReady },
  ];
  const statusOf = (c: ConnectionView | null): [string, string] =>
    !c || c.status === "disconnected" ? ["", "Not connected"] :
    c.status === "needs_reauth" ? ["amber", "Reconnect needed"] :
    c.status === "choose_account" ? ["amber", "Choose an ad account"] :
    c.status === "sample" ? ["blue", "Sample data"] : ["green", "Connected"];

  return (
    <>
      <Bar crumbs={[{ label: brand.name, href: `/brands/${slug}` }, { label: "Integrations" }]}>
        <span className="row g6 xs i3"><AgentFace kind="catalog" size={16} />Cleo checks connections every hour</span>
        <Link className="btn sm" href={`/brands/${slug}/sync`}><Icon name="database" size={14} />Data sync</Link>
      </Bar>
      <div className="scroll">
        <div className="col g20" style={{ padding: "28px 32px" }}>
          <div className="row between" style={{ alignItems: "flex-end" }}>
            <div className="col g4">
              <h1 className="h1">Integrations</h1>
              <p className="lead">What the brand connects to Kaviar. Both are read-only — Kaviar never edits the store or the ads.</p>
            </div>
            <div className="row">
              <div className="kpi"><span className="v">{rows.filter((r) => live(r.conn)).length}</span><span className="xs i3">Connected</span></div>
              <div className="kpi"><span className={`v ${waiting ? "c-amber" : ""}`}>{waiting}</span><span className="xs i3">Waiting on you</span></div>
            </div>
          </div>
          {err && <div className="notice red" role="alert"><Icon name="warning-circle" size={14} /><span>{err}</span></div>}

          {rows.filter((r) => live(r.conn)).map((r) => (
            <Summary key={r.provider} provider={r.provider} conn={r.conn!} lastSync={last(r.provider)}
              action={r.conn!.status === "sample" ? null : <ConnectAction kind={r.provider} label="Reconnect" slug={slug} shop={r.conn!.externalId} scopes={scopes} ready={r.ready} />} />
          ))}

          <div className="card" style={{ overflow: "visible" }}>
            <div className="tr hd" style={{ padding: "0 16px" }}>
              <div className="td" style={{ flex: 1.4 }}>App</div><div className="td" style={{ flex: 2 }}>What Kaviar reads</div>
              <div className="td" style={{ flex: 1.4 }}>Status</div><div className="td" style={{ flex: 1.2 }}>Who acts</div><div className="td" style={{ width: 230 }} />
            </div>
            <div className="row" style={{ height: 30, padding: "0 16px", background: "var(--tray)", borderBottom: "1px solid var(--line)" }}><span className="xs w5 i2">Required for growth</span><span className="xs i3" style={{ marginLeft: 6 }}>2</span></div>
            {rows.map((r) => {
              const [tone, text] = statusOf(r.conn);
              const c = r.conn;
              return (
                <div key={r.provider} className="tr compact" style={{ padding: "0 16px" }}>
                  <div className="td" style={{ flex: 1.4 }}><SourceTile provider={r.provider} size={28} /><span className="sm w5 i1">{r.name}</span></div>
                  <div className="td sm" style={{ flex: 2 }}>{r.what}</div>
                  <div className="td" style={{ flex: 1.4 }}><span className={`st sm ${tone === "amber" ? "c-amber" : ""}`}><span className={`dot ${tone}`} />{text}</span></div>
                  <div className="td sm" style={{ flex: 1.2 }}>{c?.status === "sample" ? "—" : r.who}</div>
                  <div className="td" style={{ width: 230, justifyContent: "flex-end", gap: 6 }}>
                    {c?.status === "sample" ? <span className="xs i3">Sample brand</span> :
                     c?.status === "choose_account" ? <ConnectAction kind="choose" label="Choose account" dark slug={slug} accounts={accounts} ready={r.ready} /> :
                     !c || c.status === "disconnected" ? <ConnectAction kind={r.provider} label={`Connect ${r.name}`} dark slug={slug} scopes={scopes} ready={r.ready} /> :
                     c.status === "needs_reauth" ? <ConnectAction kind={r.provider} label="Reconnect" dark slug={slug} shop={c.externalId} scopes={scopes} ready={r.ready} /> :
                     <ConnectAction kind={r.provider === "shopify" ? "disconnect-shopify" : "disconnect-meta"} label="Disconnect" slug={slug} ready={r.ready} />}
                  </div>
                </div>
              );
            })}
            {[conns.shopify, conns.meta].some((c) => c?.lastError) && (
              <div className="notice amber" style={{ margin: 12 }}><Icon name="warning" size={14} /><span>{conns.shopify?.lastError ?? conns.meta?.lastError}</span></div>
            )}
          </div>
          <p className="xs i3">Kaviar copies orders with their line items, totals, refunds and UTMs; products, stock and cost; customers as ids, order counts and spend — never names, emails or addresses. From Meta it reads campaigns, ads and daily results, and can’t change any ad.</p>
        </div>
      </div>
    </>
  );
}
