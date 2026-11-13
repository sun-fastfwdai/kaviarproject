import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { getBrand, getConnections } from "@/lib/queries/brands";
import { shopNameFree } from "@/lib/ai/site";
import { env } from "@/lib/env";
import { Bar } from "@/components/shell/parts";
import { Icon } from "@/components/icon";
import { AgentFace } from "@/components/agent";
import { ShopifyLogo } from "@/components/logos";
import { CopyButton } from "@/components/copy";
import { ConnectAction } from "../integrations/connect-ui";
import { CatalogStep } from "./catalog-step";

export const metadata = { title: "Launch on Shopify" };
export const maxDuration = 180;

function Step({ n, done, title, who, children, locked }: { n: number; done: boolean; title: string; who: React.ReactNode; children: React.ReactNode; locked?: string }) {
  return (
    <div className="row top g14" style={{ padding: "16px 18px", background: "#fff", border: `1px solid ${done ? "var(--line)" : "var(--line-2)"}`, borderRadius: 14, opacity: locked ? 0.6 : 1 }}>
      <span style={{ width: 26, height: 26, borderRadius: 99, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: done ? "var(--green)" : "var(--tray)", border: done ? 0 : "1px solid var(--line-2)", fontSize: 12, fontWeight: 600 }}>
        {done ? <Icon name="check" size={13} color="#fff" weight="bold" /> : n}
      </span>
      <div className="col g10 fill" style={{ minWidth: 0 }}>
        <div className="row between g8"><span className="h3">{title}</span><span className="row g6 xs i3">{who}</span></div>
        {locked ? <span className="xs i3">{locked}</span> : children}
      </div>
    </div>
  );
}

export default async function LaunchPage({ params }: PageProps<"/brands/[slug]/launch">) {
  const { slug } = await params;
  const brand = await getBrand(slug);
  const conns = await getConnections(brand.id);
  const base = `/brands/${slug}`;
  const ob = brand.onboarding ?? {};
  const shopName = ob.basics?.shopName || ob.scan?.shopName || slug.replace(/-\d+$/, "");
  const free = conns.shopify ? null : await shopNameFree(shopName);
  const connected = conns.shopify?.status === "connected";
  const [{ n: synced }] = (await db.execute(sql`select count(*)::int as n from shop_products where brand_id = ${brand.id}`)).rows as { n: number }[];
  const [build] = (await db.execute(sql`select finished_at from store_builds where brand_id = ${brand.id}`)).rows as { finished_at: Date | null }[];
  const platform = ob.scan?.platform ?? "its current site";
  const host = (ob.basics?.website || brand.website || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
  const scopes = env.shopifyConfigured() ? env.shopify().scopes : [];
  const done = [connected, connected, synced > 0, Boolean(build?.finished_at), conns.meta?.status === "connected"];

  return (
    <>
      <Bar crumbs={[{ label: brand.name, href: base }, { label: "Launch on Shopify" }]}>
        <span className="row g6 xs i3"><AgentFace kind="builder" size={14} />{done.filter(Boolean).length} of 5 done</span>
      </Bar>
      <div className="scroll col" style={{ padding: "24px 28px", gap: 14, maxWidth: 920 }}>
        <div className="col g6">
          <span className="eyebrow">Move to Shopify</span>
          <h1 className="h1">Launch {brand.name} on Shopify</h1>
          <p className="lead">{brand.name} sells on {platform}{host ? ` at ${host}` : ""} today. Kaviar creates the Shopify store, moves the catalog, and builds the storefront — the old site stays live until you switch.</p>
        </div>

        <Step n={1} done={connected} title="Create the Shopify store" who={<><Icon name="users" size={12} />Kaviar team · once</>}>
          <div className="row g8" style={{ flexWrap: "wrap" }}>
            <span className="input" style={{ height: 34, width: "auto" }}><ShopifyLogo size={14} /><b className="w5">{shopName}</b><span className="i3">.myshopify.com</span></span>
            {free === true && <span className="pill green" style={{ height: 22, fontSize: 11 }}>Available</span>}
            {free === false && !connected && <span className="pill amber" style={{ height: 22, fontSize: 11 }}>Taken — pick another in Shopify</span>}
            <CopyButton text={shopName} label="Copy name" />
          </div>
          <ol className="xs i2" style={{ margin: 0, paddingLeft: 18, lineHeight: "19px" }}>
            <li>Open the <a className="lnk w5 i1" href="https://dev.shopify.com/dashboard" target="_blank" rel="noreferrer">Shopify Dev Dashboard ↗</a> → <b>Stores</b> → <b>Create store</b>, and choose a <b>client transfer store</b> so it can be handed to {brand.name} later.</li>
            <li>Name it <b>{shopName}</b>. Shopify doesn’t let apps create stores, so this one step is manual.</li>
            <li>Or the brand creates it on <a className="lnk" href="https://www.shopify.com/free-trial" target="_blank" rel="noreferrer">shopify.com ↗</a> and shares the name.</li>
          </ol>
        </Step>

        <Step n={2} done={connected} title="Connect it to Kaviar" who={<><AgentFace kind="catalog" size={13} />Cleo</>}>
          {connected ? <span className="row g6 sm c-green"><Icon name="check-circle" size={14} weight="fill" color="#1F8A5B" />Connected to {conns.shopify?.externalId}</span> : (
            <div className="row g8"><ConnectAction kind="shopify" label="Connect the new store" dark slug={slug} shop={`${shopName}.myshopify.com`} scopes={scopes} ready={env.shopifyConfigured()} /><span className="xs i3">Approve the Kaviar app in the new store’s admin.</span></div>
          )}
        </Step>

        <Step n={3} done={synced > 0} title="Move the catalog" who={<><AgentFace kind="catalog" size={13} />Cleo reads {host || "the site"}</>}>
          <CatalogStep slug={slug} catalog={ob.catalog ?? null} currency={brand.currency} />
          {synced > 0 && <span className="row g6 xs c-green"><Icon name="check-circle" size={13} weight="fill" color="#1F8A5B" />{synced} products are in the Shopify store</span>}
        </Step>

        <Step n={4} done={Boolean(build?.finished_at)} title="Build the storefront" who={<><AgentFace kind="builder" size={13} />Remy · <AgentFace kind="qa" size={13} />Otto</>} locked={connected ? undefined : "After the store is connected."}>
          <span className="xs i2">Remy writes the homepage, story and FAQ from the brand profile and the real best-sellers; Otto checks it before publish.</span>
          <Link className="btn sm" href={`${base}/store`} style={{ alignSelf: "flex-start" }}><Icon name="store" size={12} />{build?.finished_at ? "Open Store builder" : "Start the build"}</Link>
        </Step>

        <Step n={5} done={conns.meta?.status === "connected"} title="Connect Meta and the store apps" who={<><Icon name="plug" size={12} />Integrations</>}>
          <span className="xs i2">The ad account for growth, plus payments, reviews, email and subscriptions — some need the merchant to approve.</span>
          <Link className="btn sm" href={`${base}/integrations`} style={{ alignSelf: "flex-start" }}><Icon name="plug" size={12} />Open Integrations</Link>
        </Step>
      </div>
    </>
  );
}
