import Link from "next/link";
import { listBrands } from "@/lib/queries/brands";
import { ago, money, num } from "@/lib/format";
import { Bar, BrandThumb } from "@/components/shell/parts";
import { Icon } from "@/components/icon";
import { MetaLogo, ShopifyLogo } from "@/components/logos";
import { AddBrand } from "./add-brand";

export const metadata = { title: "Brands" };

function Source({ status, label, logo }: { status: string | null; label: string | null; logo: React.ReactNode }) {
  if (!status) return <span className="xs i4">Not connected</span>;
  const tone = status === "connected" ? "green" : status === "needs_reauth" ? "amber" : status === "sample" ? "blue" : "";
  return (
    <span className="row g6 sm i2 ell">
      {logo}
      <span className="ell">{label}</span>
      <span className={`dot ${tone}`} />
    </span>
  );
}

export default async function BrandsPage() {
  const brands = await listBrands();
  const live = brands.filter((b) => b.shopStatus === "connected").length;
  const total30 = brands.reduce((a, b) => a + b.revenue30, 0);
  return (
    <>
      <Bar crumbs={[{ label: "Brands" }]}>
        <AddBrand />
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
              <div className="kpi"><span className="v">{live}</span><span className="xs i3">Shopify connected</span></div>
              <div className="kpi"><span className="v">{money(total30)}</span><span className="xs i3">Sales · 30 days</span></div>
            </div>
          </div>

          {brands.length === 0 ? (
            <div className="card col g12" style={{ padding: 40, alignItems: "center", textAlign: "center" }}>
              <Icon name="store" size={28} color="#8B8883" />
              <span className="h3">Add your first brand</span>
              <p className="sm i3" style={{ maxWidth: 380 }}>Create a brand, connect its Shopify store and Meta ad account, and Kaviar keeps both in sync.</p>
              <AddBrand />
            </div>
          ) : (
            <div className="card" style={{ overflow: "visible" }}>
              <div className="tr hd" style={{ padding: "0 16px" }}>
                <div className="td" style={{ flex: 2.2 }}>Brand</div>
                <div className="td" style={{ flex: 2 }}>Shopify</div>
                <div className="td" style={{ flex: 1.6 }}>Meta Ads</div>
                <div className="td num" style={{ flex: 1.1 }}>Sales · 30d</div>
                <div className="td num" style={{ flex: 0.8 }}>Orders</div>
                <div className="td" style={{ flex: 1.2 }}>Last sync</div>
                <div className="td" style={{ width: 80 }} />
              </div>
              {brands.map((b) => (
                <Link key={b.id} href={`/brands/${b.slug}`} className="tr" style={{ padding: "0 16px" }}>
                  <div className="td" style={{ flex: 2.2 }}>
                    <BrandThumb name={b.name} imageUrl={b.thumb} size={36} />
                    <div className="col" style={{ minWidth: 0 }}>
                      <span className="t w5 i1 ell">{b.name}</span>
                      <span className="xs i3 ell">{b.isSample ? "Sample data" : b.category ?? "—"}</span>
                    </div>
                  </div>
                  <div className="td" style={{ flex: 2 }}><Source status={b.shopStatus} label={b.shopDomain} logo={<ShopifyLogo size={14} />} /></div>
                  <div className="td" style={{ flex: 1.6 }}><Source status={b.metaStatus} label={b.metaName ?? "Ad account"} logo={<MetaLogo size={14} />} /></div>
                  <div className="td num i1" style={{ flex: 1.1 }}>{money(b.revenue30, b.currency)}</div>
                  <div className="td num" style={{ flex: 0.8 }}>{num(b.orders30)}</div>
                  <div className="td" style={{ flex: 1.2 }}>
                    {b.syncing ? <span className="st"><span className="dot blue" />Syncing</span> : b.lastError ? <span className="st c-amber"><span className="dot amber" />Needs a look</span> : <span className="sm i3">{ago(b.lastSync)}</span>}
                  </div>
                  <div className="td" style={{ width: 80, justifyContent: "flex-end" }}><span className="btn sm">Open<Icon name="arrow-r" size={13} /></span></div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
