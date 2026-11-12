import Link from "next/link";
import { asc } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { listBrands, type BrandRow } from "@/lib/queries/brands";
import { requireMember } from "@/lib/auth";
import { ago, money } from "@/lib/format";
import { Bar, BrandThumb } from "@/components/shell/parts";
import { Icon } from "@/components/icon";
import { ShopifyLogo } from "@/components/logos";
import { AgentFace } from "@/components/agent";
import { BrandsTable, type BrandItem } from "./brands-table";

export const metadata = { title: "Brands" };

const initials = (n: string) => n.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();

function status(b: BrandRow): [BrandItem["status"], string] {
  if (b.syncing) return ["syncing", "Syncing"];
  if (b.shopStatus === "needs_reauth" || b.metaStatus === "needs_reauth") return ["attention", "Reconnect needed"];
  if (b.metaStatus === "choose_account") return ["attention", "Pick ad account"];
  if (b.lastError) return ["attention", "Sync failed"];
  if (b.isSample) return ["sample", "Sample data"];
  if (b.shopStatus === "connected") return ["live", "Live data"];
  return ["setup", "Setting up"];
}

/** What needs a person, most urgent first (board 01 “Needs attention”). */
function attention(b: BrandRow): { title: string; sub: string; cta: string; href: string } | null {
  const base = `/brands/${b.slug}`;
  if (b.shopStatus === "needs_reauth") return { title: "Reconnect Shopify", sub: "The store stopped accepting Kaviar’s access", cta: "Reconnect", href: `${base}/integrations` };
  if (b.metaStatus === "needs_reauth") return { title: "Reconnect Meta Ads", sub: "The Facebook login expired", cta: "Reconnect", href: `${base}/integrations` };
  if (b.metaStatus === "choose_account") return { title: "Pick the Meta ad account", sub: "Login done — choose which account is theirs", cta: "Choose", href: `${base}/integrations` };
  if (b.lastError) return { title: "Last sync failed", sub: b.lastError.slice(0, 60), cta: "Open", href: `${base}/sync` };
  if (!b.shopStatus || b.shopStatus === "disconnected") return { title: "Connect Shopify", sub: "No store data yet", cta: "Connect", href: `${base}/integrations` };
  if (!b.metaStatus && !b.isSample) return { title: "Connect Meta Ads", sub: "Spend and ROAS need the ad account", cta: "Connect", href: `${base}/integrations` };
  return null;
}

export default async function BrandsPage() {
  const me = await requireMember();
  const [brands, team] = await Promise.all([
    listBrands(),
    db.select({ name: schema.members.name }).from(schema.members).orderBy(asc(schema.members.createdAt)),
  ]);
  const shop = brands.filter((b) => b.shopStatus === "connected").length;
  const meta = brands.filter((b) => b.metaStatus === "connected").length;
  const total30 = brands.reduce((a, b) => a + b.revenue30, 0);
  const todo = brands.map((b) => ({ b, a: attention(b) })).filter((x) => x.a).slice(0, 3);
  const items: BrandItem[] = brands.map((b) => {
    const [st, text] = status(b);
    return {
      slug: b.slug, name: b.name, category: b.category, isSample: b.isSample, thumb: b.thumb, shopDomain: b.shopDomain,
      shopStatus: b.shopStatus, metaStatus: b.metaStatus, metaName: b.metaName, revenue: money(b.revenue30, b.currency), orders: b.orders30,
      status: st, statusText: text, owner: b.ownerName,
      activity: b.syncing ? "Syncing now" : b.lastSync ? "Data synced" : "Brand created", activityAt: ago(b.lastSync ?? b.createdAt),
    };
  });

  return (
    <>
      <Bar crumbs={[{ label: "Brands" }]}>
        <div className="stack">{team.slice(0, 4).map((m, i) => <div key={i} className={`av ${["k", "j", "u", "d"][i % 4]}`} title={m.name}>{initials(m.name)}</div>)}</div>
        <Link href="/brands/new" className="btn dark sm"><Icon name="plus" size={14} color="#fff" />Add brand</Link>
      </Bar>
      <div className="scroll">
        <div className="col g24" style={{ padding: "28px 32px" }}>
          <div className="row between" style={{ alignItems: "flex-end" }}>
            <div className="col g4">
              <h1 className="h1">Brands</h1>
              <p className="lead">Every brand’s Shopify and Meta data, synced into Kaviar.</p>
            </div>
            <div className="row">
              <div className="kpi"><span className="v">{brands.length}</span><span className="xs i3">Brands</span></div>
              <div className="kpi"><span className="v">{shop}</span><span className="xs i3">Shopify live</span></div>
              <div className="kpi"><span className="v">{meta}</span><span className="xs i3">Meta live</span></div>
              <div className="kpi"><span className="v">{money(total30)}</span><span className="xs i3">Sales · 30 days</span></div>
            </div>
          </div>

          {brands.length === 0 ? (
            <div className="col g16" style={{ padding: "56px 24px", alignItems: "center", textAlign: "center", background: "var(--tray)", border: "1px solid var(--line)", borderRadius: 14 }}>
              <div className="row g12" style={{ alignItems: "flex-end" }}>
                <AgentFace kind="analyst" size={40} /><AgentFace kind="builder" size={48} mood="happy" /><AgentFace kind="catalog" size={44} /><AgentFace kind="qa" size={42} />
              </div>
              <div className="col g6" style={{ alignItems: "center" }}>
                <span className="h2">No brands yet</span>
                <p className="t i3" style={{ maxWidth: 380 }}>Add a brand by connecting its Shopify store, or set it up now and connect the store later.</p>
              </div>
              <div className="row g8">
                <Link href="/brands/new" className="btn dark"><Icon name="plus" size={14} color="#fff" />Add brand</Link>
                <Link href="/brands/new" className="btn"><ShopifyLogo size={14} />Connect Shopify store</Link>
              </div>
              <span className="xs i3">Remy, Cleo, Otto and Iris are ready when you are.</span>
            </div>
          ) : (
            <>
              {todo.length > 0 && (
                <div className="col g10">
                  <div className="row between"><span className="row g8"><span className="h3">Needs attention</span><span className="pill" style={{ height: 20, fontSize: 11 }}>{todo.length}</span></span></div>
                  <div className="row g12 stretch">
                    {todo.map(({ b, a }) => (
                      <Link key={b.slug} href={a!.href} className="card link row" style={{ flexDirection: "row", flex: "1 1 0", minWidth: 0, overflow: "hidden", alignItems: "stretch" }}>
                        <div style={{ width: 64, flexShrink: 0, background: "var(--tray-2)", display: "flex", alignItems: "center", justifyContent: "center" }}><BrandThumb name={b.name} imageUrl={b.thumb} size={40} /></div>
                        <div className="col g2 fill" style={{ padding: "12px 14px", minWidth: 0 }}>
                          <span className="row g6 xs i3"><span className="dot amber" />{b.name}</span>
                          <span className="sm w5 i1 ell">{a!.title}</span>
                          <span className="xs i3 ell">{a!.sub}</span>
                        </div>
                        <div className="row" style={{ paddingRight: 14 }}><span className="btn sm">{a!.cta}</span></div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              <BrandsTable brands={items} canRemove={me.role === "owner"} />
            </>
          )}
        </div>
      </div>
    </>
  );
}
