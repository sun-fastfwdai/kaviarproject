import Link from "next/link";
import { getBrand, getConnections } from "@/lib/queries/brands";
import { ads, campaigns, summary } from "@/lib/queries/growth";
import { parseRange } from "@/lib/queries/common";
import { compact, money, num, pct, roas } from "@/lib/format";
import { Bar } from "@/components/shell/parts";
import { Icon } from "@/components/icon";
import { MetaLogo, SourceTile } from "@/components/logos";
import { ConnPill, IrisHeader, NeedsSource, Note, RangeTabs, roasTone, SidePanel, Stat, StatStrip } from "@/components/ui";

export const metadata = { title: "Meta Ads" };

export default async function MetaPage({ params, searchParams }: PageProps<"/brands/[slug]/meta">) {
  const { slug } = await params;
  const days = parseRange((await searchParams).days);
  const brand = await getBrand(slug);
  const conns = await getConnections(brand.id);
  const crumbs = [{ label: brand.name, href: `/brands/${slug}` }, { label: "Growth" }, { label: "Meta Ads" }];
  const conn = conns.meta;
  if (!conn || conn.status === "choose_account") return (<><Bar crumbs={crumbs} /><div className="scroll" style={{ padding: 24 }}><NeedsSource slug={slug} provider="meta" what="campaigns and spend" /></div></>);

  const tz = brand.timezone, cur = String(conn.details.currency ?? brand.currency);
  const [s, camps, top] = await Promise.all([summary(brand.id, tz, days), campaigns(brand.id, tz, days), ads(brand.id, tz, days, 8)]);
  const ctr = s.impressions ? s.clicks / s.impressions : 0;
  const totals = camps.reduce((a, c) => ({ budget: a.budget + (c.status === "ACTIVE" ? c.budget ?? 0 : 0), spend: a.spend + c.spend, impr: a.impr + c.impressions, clicks: a.clicks + c.clicks, purch: a.purch + c.purchases, value: a.value + c.value, vOrders: a.vOrders + c.verifiedOrders, vRev: a.vRev + c.verifiedRevenue }), { budget: 0, spend: 0, impr: 0, clicks: 0, purch: 0, value: 0, vOrders: 0, vRev: 0 });
  const cols = { status: 76, budget: 76, spend: 76, impr: 60, ctr: 56, purch: 74, roas: 58, ver: 66 };

  return (
    <>
      <Bar crumbs={crumbs}>
        <Link className="btn sm" href={`/brands/${slug}/sync`}><Icon name="database" size={14} />Data sync</Link>
      </Bar>
      <div className="row fill stretch" style={{ minHeight: 0 }}>
        <section className="scroll col" style={{ padding: "22px 24px", gap: 16 }}>
          <div className="row between">
            <div className="row g12">
              <SourceTile provider="meta" size={40} />
              <div className="col g2">
                <div className="row g8"><h1 className="h2">Meta Ads</h1><ConnPill status={conn.status} /></div>
                <span className="xs i3">{conn.displayName} · {conn.externalId} · {cur}</span>
              </div>
            </div>
            <RangeTabs base={`/brands/${slug}/meta`} days={days} />
          </div>

          <StatStrip>
            <Stat label="Spend" value={money(s.spend, cur)} />
            <Stat label="Impressions" value={compact(s.impressions)} />
            <Stat label="CTR (link)" value={pct(ctr, 2)} />
            <Stat label="CPC" value={money(s.clicks ? s.spend / s.clicks : 0, cur, true)} />
            <Stat label="Purchases · Meta" value={num(s.metaPurchases)} note={`${num(s.metaOrders)} in Shopify`} />
            <Stat label="ROAS · Meta" value={roas(s.spend ? s.metaValue / s.spend : null)} note={`verified ${roas(s.spend ? s.metaRevenue / s.spend : null)}`} />
          </StatStrip>

          <div className="card" style={{ overflow: "hidden" }}>
            <div className="row between" style={{ padding: "14px 16px 10px" }}>
              <span className="h3">Campaigns <span className="i3 sm" style={{ fontWeight: 400 }}>{camps.length}</span></span>
              <span className="row g6 xs i3"><Icon name="info" size={12} />Meta’s own figures, next to Shopify orders that carry the campaign’s UTM</span>
            </div>
            <div className="tr hd dense" style={{ padding: "0 16px", borderTop: "1px solid var(--line)", gap: 10 }}>
              <div className="td fill">Campaign</div><div className="td" style={{ width: cols.status }}>Status</div>
              <div className="td num" style={{ width: cols.budget }}>Budget/day</div><div className="td num" style={{ width: cols.spend }}>Spend</div>
              <div className="td num" style={{ width: cols.impr }}>Impr.</div>
              <div className="td num" style={{ width: cols.ctr }}>CTR</div><div className="td num" style={{ width: cols.purch }}>Purchases</div>
              <div className="td num" style={{ width: cols.roas }}>ROAS</div><div className="td num" style={{ width: cols.ver }}>Verified</div>
            </div>
            {camps.length === 0 && <div className="sm i3" style={{ padding: 16 }}>No campaigns with spend in this range.</div>}
            {camps.map((c) => (
              <div key={c.id} className="tr compact" style={{ padding: "0 16px", gap: 10 }}>
                <div className="td fill"><div className="col" style={{ minWidth: 0 }}><span className="sm w5 i1 ell">{c.name}</span><span className="xs i3 ell">{(c.objective ?? "").replace("OUTCOME_", "").toLowerCase() || "—"}</span></div></div>
                <div className="td" style={{ width: cols.status }}><span className={`pill ${c.status === "ACTIVE" ? "green" : ""}`}>{c.status === "ACTIVE" ? "Active" : (c.status ?? "—").charAt(0) + (c.status ?? "").slice(1).toLowerCase()}</span></div>
                <div className="td num" style={{ width: cols.budget }}>{c.budget ? money(c.budget, cur) : "—"}</div>
                <div className="td num i1" style={{ width: cols.spend }}>{money(c.spend, cur)}</div>
                <div className="td num" style={{ width: cols.impr }}>{compact(c.impressions)}</div>
                                <div className="td num" style={{ width: cols.ctr }}>{pct(c.impressions ? c.clicks / c.impressions : 0, 2)}</div>
                <div className="td num" style={{ width: cols.purch }}>{num(c.purchases)}</div>
                <div className="td num" style={{ width: cols.roas }}>{roas(c.spend ? c.value / c.spend : null)}</div>
                <div className={`td num w5 ${roasTone(c.spend ? c.verifiedRevenue / c.spend : null)}`} style={{ width: cols.ver }}>{roas(c.spend ? c.verifiedRevenue / c.spend : null)}</div>
              </div>
            ))}
            {camps.length > 1 && (
              <div className="tr compact" style={{ padding: "0 16px", gap: 10, background: "var(--tray)", borderBottom: 0 }}>
                <div className="td fill sm w5 i1">All campaigns</div><div className="td" style={{ width: cols.status }}>{camps.filter((c) => c.status === "ACTIVE").length} active</div>
                <div className="td num" style={{ width: cols.budget }}>{money(totals.budget, cur)}</div><div className="td num w5 i1" style={{ width: cols.spend }}>{money(totals.spend, cur)}</div>
                <div className="td num" style={{ width: cols.impr }}>{compact(totals.impr)}</div>
                <div className="td num" style={{ width: cols.ctr }}>{pct(totals.impr ? totals.clicks / totals.impr : 0, 2)}</div><div className="td num" style={{ width: cols.purch }}>{num(totals.purch)}</div>
                <div className="td num w5 i1" style={{ width: cols.roas }}>{roas(totals.spend ? totals.value / totals.spend : null)}</div>
                <div className={`td num w5 ${roasTone(totals.spend ? totals.vRev / totals.spend : null)}`} style={{ width: cols.ver }}>{roas(totals.spend ? totals.vRev / totals.spend : null)}</div>
              </div>
            )}
          </div>

          <div className="row between"><span className="h3">Top ads</span><span className="xs i3">by spend · last {days} days</span></div>
          <div className="row top g12" style={{ flexWrap: "wrap" }}>
            {top.map((a) => (
              <div key={a.id} className="card" style={{ width: "calc((100% - 36px) / 4)", overflow: "hidden" }}>
                <div style={{ height: 112, background: "var(--tray-2)", display: "flex", alignItems: "center", justifyContent: "center", borderBottom: "1px solid var(--line)" }}>
                  {a.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.thumbnailUrl} alt="" style={{ width: "100%", height: "100%" }} />
                  ) : <Icon name="image" size={22} color="#B5B2AC" />}
                </div>
                <div className="col g2" style={{ padding: "10px 12px" }}>
                  <span className="sm w5 i1 ell">{a.name}</span>
                  <span className="xs i3 ell">{a.campaign ?? "—"}</span>
                  <div className="row between" style={{ paddingTop: 8 }}>
                    <div className="col"><span className="xs i3">Spend</span><span className="sm i1 tnum">{money(a.spend, cur)}</span></div>
                    <div className="col" style={{ alignItems: "center" }}><span className="xs i3">ROAS</span><span className="sm tnum">{roas(a.spend ? a.value / a.spend : null)}</span></div>
                    <div className="col" style={{ alignItems: "flex-end" }}><span className="xs i3">Verified</span><span className={`sm tnum w5 ${roasTone(a.spend ? a.verifiedRevenue / a.spend : null)}`}>{roas(a.spend ? a.verifiedRevenue / a.spend : null)}</span></div>
                  </div>
                </div>
              </div>
            ))}
            {top.length === 0 && <span className="sm i3">No ads with spend in this range.</span>}
          </div>
        </section>
        <SidePanel>
          <div className="col g10" style={{ padding: "12px 14px", background: "#fff", border: "1px solid var(--line)", borderRadius: 12 }}>
            <div className="col g2"><span className="row g6 sm w5"><MetaLogo size={14} />Available from Meta</span><span className="xs i3">What the Marketing API gives Kaviar, read-only</span></div>
            <span className="xs i3">Metrics</span>
            <div className="row g4" style={{ flexWrap: "wrap" }}>{["spend", "impressions", "link_clicks", "ctr", "cpc", "purchases", "purchase_value", "roas"].map((m) => <span key={m} className="code" style={{ fontSize: 11 }}>{m}</span>)}</div>
            <div className="col" style={{ borderTop: "1px solid var(--line)", paddingTop: 6 }}>
              {[["Attribution", "Ad account default"], ["Refresh", "Hourly"], ["Re-read", "Last 7 days"]].map(([k, v]) => <div key={k} className="row between" style={{ height: 24 }}><span className="xs i3">{k}</span><span className="xs i1">{v}</span></div>)}
            </div>
          </div>
          <IrisHeader>· compares Meta with Shopify</IrisHeader>
          <Note icon="info" tone="#4C7BD9" title="Two numbers for the same sales" href={`/brands/${slug}/performance?days=${days}`} link="Compare in Performance">
            Meta reports {num(s.metaPurchases)} purchases ({money(s.metaValue, cur)}). Shopify shows {num(s.metaOrders)} orders ({money(s.metaRevenue, cur)}) tagged with Meta UTMs. Meta also counts views within a day and sales that came through other channels.
          </Note>
          <div className="col g6" style={{ padding: "12px 14px", background: "#fff", border: "1px solid var(--line)", borderRadius: 12 }}>
            <span className="sm w5 i1">Synced to Kaviar</span>
            {[["meta_campaigns", "campaigns"], ["meta_ads", "ads + thumbnails"], ["meta_insights_daily", "daily metrics per ad"]].map(([t, d]) => (
              <div key={t} className="row between" style={{ height: 26 }}><span className="mono i1">{t}</span><span className="xs i3">{d}</span></div>
            ))}
            <span className="xs i3" style={{ paddingTop: 4 }}>Attribution: the ad account’s default window. Insights refresh hourly; the last 7 days are re-read each time.</span>
          </div>
        </SidePanel>
      </div>
    </>
  );
}
