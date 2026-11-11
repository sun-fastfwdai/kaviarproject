import Link from "next/link";
import { getBrand, getConnections } from "@/lib/queries/brands";
import { adProducts, campaigns, channels, daily, summary, utmHealth } from "@/lib/queries/growth";
import { parseRange } from "@/lib/queries/common";
import { CHANNEL_COLOR, CHANNEL_LABEL } from "@/lib/sync/attribution";
import { money, num, pct, roas } from "@/lib/format";
import { Bar } from "@/components/shell/parts";
import { Icon } from "@/components/icon";
import { ShopifyLogo } from "@/components/logos";
import { ChartLegend, SalesChart } from "@/components/sales-chart";
import { IrisHeader, NeedsSource, Note, RangeTabs, roasTone, SidePanel, Stat, StatStrip } from "@/components/ui";

export const metadata = { title: "Performance" };

export default async function PerformancePage({ params, searchParams }: PageProps<"/brands/[slug]/performance">) {
  const { slug } = await params;
  const days = parseRange((await searchParams).days);
  const brand = await getBrand(slug);
  const conns = await getConnections(brand.id);
  const crumbs = [{ label: brand.name, href: `/brands/${slug}` }, { label: "Growth" }, { label: "Performance" }];
  if (!conns.shopify) return (<><Bar crumbs={crumbs} /><div className="scroll" style={{ padding: 24 }}><NeedsSource slug={slug} provider="shopify" what="sales next to ad spend" /></div></>);

  const tz = brand.timezone, cur = brand.currency;
  const [s, d, ch, camps, health, sold] = await Promise.all([
    summary(brand.id, tz, days), daily(brand.id, tz, days), channels(brand.id, tz, days),
    campaigns(brand.id, tz, days), utmHealth(brand.id, tz, days), adProducts(brand.id, tz, days, 6),
  ]);
  const hasMeta = Boolean(conns.meta && s.spend > 0);
  const verified = s.spend ? s.metaRevenue / s.spend : null;
  const metaSays = s.spend ? s.metaValue / s.spend : null;
  const delta = s.prevRevenue ? (s.revenue - s.prevRevenue) / s.prevRevenue : null;
  const chTotal = ch.reduce((a, c) => a + c.revenue, 0) || 1;
  const best = camps.filter((c) => c.spend > 0).map((c) => ({ ...c, v: c.verifiedRevenue / c.spend })).sort((a, b) => b.v - a.v);
  const weak = best.filter((c) => c.v < 1 && c.spend >= 100);
  const tagged = health.metaOrders ? health.withAd / health.metaOrders : 0;

  return (
    <>
      <Bar crumbs={crumbs}>
        <span className="row g6 xs i3"><ShopifyLogo size={12} />{num(s.orders)} orders in range</span>
        <Link className="btn sm" href={`/brands/${slug}/sync`}><Icon name="database" size={14} />Data sync</Link>
      </Bar>
      <div className="row fill stretch" style={{ minHeight: 0 }}>
        <section className="scroll col" style={{ padding: "22px 24px", gap: 16 }}>
          <div className="row between" style={{ alignItems: "flex-end" }}>
            <div className="col g4"><h1 className="h1">Performance</h1><p className="sm i3">Shopify sales and Meta Ads side by side, joined in one place.</p></div>
            <RangeTabs base={`/brands/${slug}/performance`} days={days} />
          </div>

          <StatStrip>
            <Stat label="Revenue" source="shopify" value={money(s.revenue, cur)} note={delta == null ? `last ${days} days` : `${delta >= 0 ? "+" : ""}${pct(delta)} vs prior ${days}d`} tone={delta != null && delta >= 0 ? "up" : undefined} />
            <Stat label="Orders" source="shopify" value={num(s.orders)} note={`AOV ${money(s.orders ? s.revenue / s.orders : 0, cur, true)}`} />
            <Stat label="Ad spend" source="meta" value={hasMeta ? money(s.spend, cur) : "—"} note={hasMeta ? `${camps.filter((c) => c.status === "ACTIVE").length} campaigns active` : "Meta not connected"} />
            <Stat label="Blended ROAS" source="both" value={hasMeta ? roas(s.revenue / s.spend) : "—"} note="all revenue ÷ ad spend" />
            <Stat label="Verified Meta ROAS" source="both" value={hasMeta ? roas(verified) : "—"} note={hasMeta ? `Meta says ${roas(metaSays)}` : "needs Meta"} />
          </StatStrip>

          <div className="card" style={{ padding: "14px 16px 8px", gap: 8 }}>
            <div className="row between top">
              <div className="col g2"><span className="h3">Sales vs ad spend · per day</span>
                <span className="xs i3">When the blue part clears the line, Meta ads paid for themselves that day</span></div>
              <ChartLegend />
            </div>
            <SalesChart data={d} currency={cur} />
          </div>

          <div className="row top g16">
            <div className="card" style={{ width: 290, flexShrink: 0, padding: "16px 16px 8px" }}>
              <div className="row between" style={{ paddingBottom: 10 }}><span className="h3">Revenue by channel</span><span className="row g4 xs i3"><ShopifyLogo size={12} />UTMs</span></div>
              {ch.length === 0 && <span className="sm i3" style={{ padding: "8px 0 12px" }}>No orders in this range.</span>}
              {ch.map((c) => (
                <div key={c.channel} className="col g6" style={{ padding: "9px 0", borderTop: "1px solid var(--line)" }}>
                  <div className="row between">
                    <span className="row g8 sm i1"><i style={{ width: 8, height: 8, borderRadius: 2, background: CHANNEL_COLOR[c.channel] }} />{CHANNEL_LABEL[c.channel]}</span>
                    <span className="sm i1 tnum">{money(c.revenue, cur)}<span className="xs i3"> · {num(c.orders)}</span></span>
                  </div>
                  <div className="prog"><div className="v" style={{ width: `${(c.revenue / chTotal) * 100}%`, background: CHANNEL_COLOR[c.channel] }} /></div>
                </div>
              ))}
            </div>

            <div className="card fill" style={{ overflow: "hidden" }}>
              <div className="row between" style={{ padding: "14px 16px 10px" }}>
                <span className="h3">Campaigns</span>
                <Link className="lnk xs i2 row g4" href={`/brands/${slug}/meta?days=${days}`}>All Meta data<Icon name="arrow-r" size={12} /></Link>
              </div>
              <div className="tr hd dense" style={{ padding: "0 16px", borderTop: "1px solid var(--line)" }}>
                <div className="td fill">Campaign</div><div className="td num" style={{ width: 70 }}>Spend</div>
                <div className="td num" style={{ width: 76 }}>Meta ROAS</div><div className="td num" style={{ width: 76 }}>Verified</div>
              </div>
              {!hasMeta && <div className="sm i3" style={{ padding: 16 }}>Connect Meta Ads to compare spend with real Shopify orders. <Link className="lnk w5 i1" href={`/brands/${slug}/integrations`}>Connect</Link></div>}
              {camps.filter((c) => c.spend > 0).slice(0, 6).map((c) => {
                const v = c.verifiedRevenue / c.spend;
                return (
                  <div key={c.id} className="tr compact" style={{ padding: "0 16px" }}>
                    <div className="td fill"><span className={`dot ${c.status === "ACTIVE" ? "green" : ""}`} />
                      <div className="col" style={{ minWidth: 0 }}><span className="sm i1 w5 ell">{c.name}</span><span className="xs i3">{num(c.verifiedOrders)} Shopify orders · {c.status === "ACTIVE" ? "active" : (c.status ?? "").toLowerCase()}</span></div></div>
                    <div className="td num sm i1" style={{ width: 70 }}>{money(c.spend, cur)}</div>
                    <div className="td num sm" style={{ width: 76 }}>{roas(c.value / c.spend)}</div>
                    <div className={`td num sm w5 ${roasTone(v)}`} style={{ width: 76 }}>{roas(v)}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card" style={{ overflow: "hidden" }}>
            <div className="row between" style={{ padding: "14px 16px 10px" }}>
              <div className="col g2"><span className="h3">Which ad sold what</span><span className="xs i3">Shopify orders carrying the ad’s id in utm_content, with the products in them</span></div>
              <span className="xs i3">{health.metaOrders ? `${pct(tagged)} of Meta orders carry an ad id` : ""}</span>
            </div>
            {sold.length === 0 ? (
              <div className="notice" style={{ margin: "0 16px 16px" }}>
                <Icon name="info" size={14} />
                <span>No orders carry an ad id yet. Add Kaviar’s URL parameters to every Meta ad — <Link className="lnk w5 i1" href={`/brands/${slug}/sync#tagging`}>see how</Link>. New orders show up here within the hour.</span>
              </div>
            ) : (
              <>
                <div className="tr hd dense" style={{ padding: "0 16px", borderTop: "1px solid var(--line)" }}>
                  <div className="td fill">Ad</div><div className="td fill">Product</div>
                  <div className="td num" style={{ width: 70 }}>Orders</div><div className="td num" style={{ width: 60 }}>Units</div><div className="td num" style={{ width: 90 }}>Revenue</div>
                </div>
                {sold.map((r) => (
                  <div key={r.adId + r.product} className="tr dense" style={{ padding: "0 16px" }}>
                    <div className="td fill sm i1 ell">{r.ad}</div><div className="td fill sm ell">{r.product}</div>
                    <div className="td num sm" style={{ width: 70 }}>{num(r.orders)}</div><div className="td num sm" style={{ width: 60 }}>{num(r.units)}</div>
                    <div className="td num sm i1" style={{ width: 90 }}>{money(r.revenue, cur)}</div>
                  </div>
                ))}
              </>
            )}
          </div>
        </section>

        <SidePanel>
          <IrisHeader>· reads orders and Meta insights</IrisHeader>
          {hasMeta && s.metaPurchases > s.metaOrders && (
            <Note icon="info" tone="#4C7BD9" title="Meta counts more sales than Shopify sees" href={`/brands/${slug}/meta?days=${days}`}>
              Meta reports {num(s.metaPurchases)} purchases; Shopify has {num(s.metaOrders)} orders tagged with Meta UTMs. Meta also counts views and sales that came through other channels — decide on the verified number.
            </Note>
          )}
          {best[0] && best[0].v > 0 && (
            <Note icon="trend-up" tone="#1F8A5B" title={`${best[0].name} returns the most`}>
              {roas(best[0].v)} verified on {money(best[0].spend, cur)} spend — {num(best[0].verifiedOrders)} real orders.
            </Note>
          )}
          {weak.slice(0, 2).map((c) => (
            <Note key={c.id} icon="trend-down" tone="#B7791F" title={`${c.name} is below break-even`}>
              {roas(c.v)} verified on {money(c.spend, cur)}. Worth new creatives or a smaller budget.
            </Note>
          ))}
          {hasMeta && health.metaOrders > 0 && tagged < 0.8 && (
            <Note icon="warning" tone="#B7791F" title="Some ads aren’t tagged" href={`/brands/${slug}/sync#tagging`} link="Set up tagging">
              Only {pct(tagged)} of Meta orders carry an ad id, so ad-level results are partial.
            </Note>
          )}
          {!hasMeta && (
            <Note icon="plug" title="Connect Meta Ads" href={`/brands/${slug}/integrations`} link="Connect">
              With spend from Meta, Kaviar can show what each dollar really returned in Shopify sales.
            </Note>
          )}
        </SidePanel>
      </div>
    </>
  );
}
