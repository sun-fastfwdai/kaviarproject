import Link from "next/link";
import { getBrand, getConnections } from "@/lib/queries/brands";
import { daily, summary, utmHealth } from "@/lib/queries/growth";
import { runs } from "@/lib/queries/sync";
import { ago, money, num, roas } from "@/lib/format";
import { Bar } from "@/components/shell/parts";
import { Icon, type IconName } from "@/components/icon";
import { MetaLogo, ShopifyLogo } from "@/components/logos";
import { ChartLegend, SalesChart } from "@/components/sales-chart";
import { ConnPill, Stat, StatStrip } from "@/components/ui";
import { SyncButton } from "@/components/sync-button";

export const metadata = { title: "Overview" };

function Step({ done, label, hint, href, cta }: { done: boolean; label: string; hint: string; href: string; cta: string }) {
  return (
    <div className="row g12" style={{ padding: "10px 0", borderTop: "1px solid var(--line)" }}>
      <Icon name={done ? "check-circle" : "circle"} size={18} weight={done ? "fill" : "regular"} color={done ? "#1F8A5B" : "#B5B2AC"} />
      <div className="col fill"><span className={`sm w5 ${done ? "i3" : "i1"}`}>{label}</span><span className="xs i3">{hint}</span></div>
      {!done && <Link className="btn sm" href={href}>{cta}</Link>}
    </div>
  );
}

function Tile({ href, icon, title, body }: { href: string; icon: IconName; title: string; body: string }) {
  return (
    <Link href={href} className="card link col g6 fill" style={{ padding: 16, minWidth: 0 }}>
      <Icon name={icon} size={18} />
      <span className="sm w5 i1">{title}</span>
      <span className="xs i3" style={{ lineHeight: "16px" }}>{body}</span>
    </Link>
  );
}

export default async function OverviewPage({ params }: PageProps<"/brands/[slug]">) {
  const { slug } = await params;
  const brand = await getBrand(slug);
  const conns = await getConnections(brand.id);
  const tz = brand.timezone, cur = brand.currency;
  const [s, d, history, health] = await Promise.all([summary(brand.id, tz, 30), daily(brand.id, tz, 30), runs(brand.id, 5), utmHealth(brand.id, tz, 30)]);
  const live = (c: typeof conns.shopify) => Boolean(c && ["connected", "sample"].includes(c.status));
  const synced = history.some((r) => r.provider === "shopify" && r.status === "success");
  const tagged = health.metaOrders ? health.withAd / health.metaOrders >= 0.8 : false;
  const steps = [live(conns.shopify), synced, live(conns.meta), tagged];
  const base = `/brands/${slug}`;

  return (
    <>
      <Bar crumbs={[{ label: brand.name }, { label: "Overview" }]}>
        <span className="xs i3">Last sync {ago(history.find((r) => r.status === "success")?.finishedAt)}</span>
        <SyncButton slug={slug} running={history.some((r) => r.status === "running")} disabled={![conns.shopify, conns.meta].some((c) => c?.status === "connected")} />
      </Bar>
      <div className="scroll">
        <div className="col g16" style={{ padding: "22px 24px" }}>
          <div className="row between" style={{ alignItems: "flex-end" }}>
            <div className="col g4">
              <h1 className="h1">{brand.name}</h1>
              <p className="sm i3">{brand.category ?? "Brand"}{brand.isSample ? " · sample data for demos" : ""}</p>
            </div>
            <div className="row g8">
              <span className="row g6 sm i2"><ShopifyLogo size={14} /><ConnPill status={conns.shopify?.status} /></span>
              <span className="row g6 sm i2"><MetaLogo size={14} /><ConnPill status={conns.meta?.status} /></span>
            </div>
          </div>

          {steps.some((x) => !x) && (
            <div className="card" style={{ padding: "14px 18px 6px" }}>
              <div className="row between" style={{ paddingBottom: 8 }}><span className="h3">Get this brand ready</span><span className="xs i3">{steps.filter(Boolean).length} of {steps.length} done</span></div>
              <Step done={steps[0]} label="Connect the Shopify store" hint="Read-only access to orders, products and customers" href={`${base}/integrations`} cta="Connect" />
              <Step done={steps[1]} label="First Shopify sync" hint="Kaviar pulls order history in the background" href={`${base}/sync`} cta="Open Data sync" />
              <Step done={steps[2]} label="Connect the Meta ad account" hint="Spend, campaigns and ads, read-only" href={`${base}/integrations`} cta="Connect" />
              <Step done={steps[3]} label="Tag every Meta ad with Kaviar’s URL parameters" hint="So each order shows the ad that sold it" href={`${base}/sync#tagging`} cta="Show how" />
            </div>
          )}

          {live(conns.shopify) && (<>
          <StatStrip>
            <Stat label="Revenue · 30 days" source="shopify" value={money(s.revenue, cur)} note={`${num(s.orders)} orders`} />
            <Stat label="Ad spend · 30 days" source="meta" value={s.spend ? money(s.spend, cur) : "—"} />
            <Stat label="Verified Meta ROAS" source="both" value={s.spend ? roas(s.metaRevenue / s.spend) : "—"} note={s.spend ? `Meta says ${roas(s.metaValue / s.spend)}` : "needs Meta"} />
            <Stat label="New customers" source="shopify" value={num(s.newCustomers)} />
          </StatStrip>

          <div className="card" style={{ padding: "14px 16px 8px", gap: 8 }}>
            <div className="row between"><span className="h3">Last 30 days</span><ChartLegend /></div>
            <SalesChart data={d} currency={cur} height={180} />
          </div>
          </>)}

          <div className="row top g12">
            <Tile href={`${base}/signals`} icon="lightning" title="Ad signals" body="What the store data says: best-sellers, lapsed buyers, reorder timing, stock." />
            <Tile href={`${base}/performance`} icon="chart-bar" title="Performance" body="Sales next to ad spend, and ROAS Shopify can prove." />
            <Tile href={`${base}/meta`} icon="megaphone" title="Meta Ads" body="Campaigns and top ads with Meta’s numbers and verified ones." />
            <Tile href={`${base}/shopify`} icon="bag" title="Shopify data" body="Orders with their source, products with stock and pace." />
          </div>
        </div>
      </div>
    </>
  );
}
