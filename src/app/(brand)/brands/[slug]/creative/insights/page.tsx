/* eslint-disable @next/next/no-img-element -- Meta ad thumbnails */
import Link from "next/link";
import { after } from "next/server";
import { sql } from "drizzle-orm";
import { getBrand, getConnections } from "@/lib/queries/brands";
import { rows } from "@/lib/queries/common";
import { getNotes, refreshNotes } from "@/lib/ai/notes";
import { money, pct } from "@/lib/format";
import { Icon } from "@/components/icon";
import { AgentFace } from "@/components/agent";
import { LoopStrip } from "@/components/loop-strip";
import { SidePanel } from "@/components/ui";
import { StudioBar } from "../tabs";
import { InsightActions } from "./actions-ui";
import { EmptyState, InsightsArt } from "@/components/empty";

export const metadata = { title: "Creative studio · Insights" };
export const maxDuration = 120;
const TARGET = { roas: 1.5, ctr: 0.014 };

type Live = { id: string; name: string; campaign: string | null; status: string | null; thumb: string | null; spend: number; rev: number; orders: number; impr: number; clicks: number; w: number[] };

export default async function InsightsPage({ params, searchParams }: PageProps<"/brands/[slug]/creative/insights">) {
  const { slug } = await params;
  const days = (await searchParams).days === "7" ? 7 : (await searchParams).days === "90" ? 90 : 30;
  const brand = await getBrand(slug);
  const conns = await getConnections(brand.id);
  const base = `/brands/${slug}`;
  if (!conns.meta) return (<><StudioBar base={base} brand={brand.name} on="insights"><LoopStrip base={base} step={2} /></StudioBar><div className="scroll" style={{ padding: "20px 24px" }}>
    <EmptyState eyebrow="Creative studio · Insights" title="Connect Meta Ads to see which ads really sell"
      body="Insights puts every live ad next to the Shopify orders it brought in, flags creatives that are getting tired, and turns the pattern into rules Remy follows in the next batch."
      steps={[{ icon: "plug", title: "Connect the brand’s ad account", body: "Read-only — Kaviar never changes an ad." }, { agent: "catalog", title: "Cleo pulls 90 days of results", body: "Spend, clicks and daily results per ad." }, { agent: "analyst", title: "Iris writes what wins", body: "Hooks, formats and angles that make money for this brand." }]}
      art={<InsightsArt />} actions={<Link className="btn dark" href={`${base}/integrations`}><Icon name="plug" size={14} color="#fff" />Connect Meta Ads</Link>} />
  </div></>);

  const live = await rows<Live>(sql`
    with ins as (
      select ad_id, sum(spend)::float8 s, sum(impressions)::float8 i, sum(clicks)::float8 c,
        array[
          coalesce(sum(clicks) filter (where date < current_date - 21)::float8 / nullif(sum(impressions) filter (where date < current_date - 21), 0), 0),
          coalesce(sum(clicks) filter (where date >= current_date - 21 and date < current_date - 14)::float8 / nullif(sum(impressions) filter (where date >= current_date - 21 and date < current_date - 14), 0), 0),
          coalesce(sum(clicks) filter (where date >= current_date - 14 and date < current_date - 7)::float8 / nullif(sum(impressions) filter (where date >= current_date - 14 and date < current_date - 7), 0), 0),
          coalesce(sum(clicks) filter (where date >= current_date - 7)::float8 / nullif(sum(impressions) filter (where date >= current_date - 7), 0), 0)
        ] as w
      from meta_insights_daily where brand_id = ${brand.id} and date >= current_date - ${Math.max(days, 28)}::int group by 1
    ),
    v as (select meta_ad_id, sum(total - refunded)::float8 r, count(*)::int n from shop_orders where brand_id = ${brand.id} and not test and cancelled_at is null and created_at >= now() - make_interval(days => ${days}) and meta_ad_id is not null group by 1)
    select a.id, a.name, c.name as campaign, a.effective_status as status, a.thumbnail_url as thumb, ins.s as spend, coalesce(v.r, 0) as rev, coalesce(v.n, 0) as orders, ins.i as impr, ins.c as clicks, ins.w
    from ins join meta_ads a on a.brand_id = ${brand.id} and a.id = ins.ad_id left join meta_campaigns c on c.brand_id = a.brand_id and c.id = a.campaign_id
    left join v on v.meta_ad_id = a.id where ins.s > 0 order by ins.s desc limit 30`);
  const notes = await getNotes(brand.id);
  after(() => refreshNotes(brand.id, ["insights"]));

  const health = (a: Live): [string, string, "Variations" | "Refresh" | "Hold" | "New hook" | null] => {
    const v = a.spend ? a.rev / a.spend : 0;
    const [w0, , , w3] = a.w;
    const tiring = w0 > 0 && w3 < w0 * 0.85 && a.w[1] > a.w[2];
    if (a.status && a.status !== "ACTIVE") return ["Paused", "", null];
    if (v < 1 && a.spend >= 50) return ["Losing", "red", "Hold"];
    if (tiring) return ["Tiring", "amber", "Refresh"];
    if (v >= TARGET.roas) return ["Winning", "green", "Variations"];
    return ["Steady", "", "New hook"];
  };
  const lessons = notes.insights?.lessons ?? [];
  const spark = (w: number[]) => {
    const max = Math.max(...w, 0.0001);
    const pts = w.map((x, i) => `${i * 20},${18 - (x / max) * 16}`).join(" ");
    const down = w[3] < w[0];
    return <svg width="62" height="20"><polyline points={pts} fill="none" stroke={down ? "#B7791F" : "#1F8A5B"} strokeWidth="1.6" strokeLinejoin="round" /></svg>;
  };

  return (
    <>
      <StudioBar base={base} brand={brand.name} on="insights"><LoopStrip base={base} step={2} /></StudioBar>
      <div className="row fill stretch" style={{ minHeight: 0 }}>
        <section className="scroll col" style={{ padding: "20px 24px", gap: 16 }}>
          <div className="col g4"><h1 className="h1">Why ads win — and when they get tired</h1><p className="sm i3">Every live ad, judged on real Shopify orders. Iris turns the pattern into rules Remy follows in the next batch.</p></div>
          <div className="card" style={{ overflow: "hidden" }}>
            <div className="row between" style={{ padding: "12px 16px" }}>
              <span className="row g8"><span className="sm w5">Every live ad vs your targets</span>
                <span className="seg">{[7, 30, 90].map((d) => <Link key={d} href={`?days=${d}`} className={`o${days === d ? " on" : ""}`}>{d} days</Link>)}</span></span>
              <span className="xs i3">Targets · real return ≥ {TARGET.roas}× · CTR ≥ {(TARGET.ctr * 100).toFixed(1)}%</span>
            </div>
            <div className="tr hd dense" style={{ padding: "0 16px", borderTop: "1px solid var(--line)" }}>
              <div className="td fill">Creative</div><div className="td num" style={{ width: 80 }}>Spend</div><div className="td num" style={{ width: 90 }}>Real return</div>
              <div className="td num" style={{ width: 70 }}>CTR</div><div className="td" style={{ width: 80 }}>CTR · 4 wks</div><div className="td" style={{ width: 90 }}>Health</div><div className="td" style={{ width: 120 }} />
            </div>
            {live.map((a) => {
              const [h, tone, act] = health(a);
              const v = a.spend ? a.rev / a.spend : 0;
              const ctr = a.impr ? a.clicks / a.impr : 0;
              return (
                <div key={a.id} className="tr compact" style={{ padding: "0 16px" }}>
                  <div className="td fill">
                    <div className="thumb" style={{ width: 34, height: 34, borderRadius: 7, overflow: "hidden" }}>{a.thumb ? <img src={a.thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Icon name="image" size={14} color="#B5B2AC" />}</div>
                    <div className="col" style={{ minWidth: 0 }}><span className="sm w5 i1 ell">{a.name}</span><span className="xs i3 ell">{a.campaign ?? "—"} · {a.orders} orders</span></div>
                  </div>
                  <div className="td num" style={{ width: 80 }}>{money(a.spend, brand.currency)}</div>
                  <div className={`td num w5 ${v >= TARGET.roas ? "c-green" : v < 1 ? "c-amber" : "i1"}`} style={{ width: 90 }}>{v.toFixed(2)}×</div>
                  <div className={`td num ${ctr >= TARGET.ctr ? "i1" : "c-amber"}`} style={{ width: 70 }}>{pct(ctr, 2)}</div>
                  <div className="td" style={{ width: 80 }}>{spark(a.w)}</div>
                  <div className="td" style={{ width: 90 }}><span className={`pill ${tone}`} style={{ height: 20, fontSize: 10.5 }}>{h}</span></div>
                  <div className="td" style={{ width: 120, justifyContent: "flex-end" }}>{act && <InsightActions slug={slug} action={act} ad={{ name: a.name, campaign: a.campaign, roas: v, ctr }} />}</div>
                </div>
              );
            })}
            {live.length === 0 && (
              <div className="row g24" style={{ padding: 20, alignItems: "center", flexWrap: "wrap", borderTop: "1px solid var(--line)" }}>
                <InsightsArt />
                <div className="col g6" style={{ maxWidth: 320 }}><span className="sm w5">No ad spent anything in the last {days} days</span><span className="xs i3" style={{ lineHeight: "17px" }}>As soon as ads run on this account, each one shows up here with its real return, CTR trend and health. Try a longer range, or launch a test from approved ads.</span>
                  <span className="row g6"><Link className="btn sm" href="?days=90">Last 90 days</Link><Link className="btn sm" href={`${base}/run`}><Icon name="target" size={12} />Run ads</Link></span></div>
              </div>
            )}
          </div>

          <div className="row between"><span className="row g6 sm w5"><AgentFace kind="analyst" size={16} />What wins for {brand.name}</span><span className="xs i3">Remy reads these before every batch</span></div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
            {lessons.map((l) => (
              <div key={l.dimension} className="card" style={{ padding: 14, gap: 6 }}>
                <span className="row between"><span className="xs i3">{l.dimension}</span><span className={`pill ${l.strength === "Strong" ? "green" : l.strength === "Early" ? "blue" : ""}`} style={{ height: 20, fontSize: 10.5 }}>{l.strength}</span></span>
                <span className="sm w5 i1">{l.lesson}</span>
                <span className="xs i3">{l.evidence}</span>
              </div>
            ))}
            {lessons.length === 0 && <span className="xs i3">Iris is reading the ads — lessons appear here within a minute of the first visit, and refresh after every sync.</span>}
          </div>
        </section>
        <SidePanel>
          <div className="col g8" style={{ padding: "12px 14px", background: "#fff", border: "1px solid var(--line)", borderRadius: 12 }}>
            <span className="row g8"><AgentFace kind="analyst" size={18} /><span className="sm w5">Next batch · planned by Iris</span></span>
            <span className="xs i2" style={{ lineHeight: "17px" }}>Winning ads get variations, tiring ones a new hook, and losers are held — using the rules on the left.</span>
            <Link className="btn dark sm" href={`${base}/creative`}><Icon name="sparkle" size={13} color="#fff" />Plan next batch</Link>
          </div>
          <div className="col g6" style={{ padding: "12px 14px", background: "#fff", border: "1px solid var(--line)", borderRadius: 12 }}>
            <span className="row g8"><AgentFace kind="qa" size={18} /><span className="sm w5">Otto watches every morning</span></span>
            {[["CTR down 3 weeks", "make a new hook"], ["Real return under 1.0× by day 4", "pause"], ["Product under 20 in stock", "hold its ads"], ["Real return ≥ 1.5× for 7 days", "scale 20%"]].map(([k, v]) => (
              <div key={k} className="row between xs" style={{ paddingTop: 4, borderTop: "1px solid var(--line)" }}><span className="i2">{k}</span><span className="i3">→ {v}</span></div>
            ))}
            <Link className="lnk xs i2 row g4" href={`${base}/optimize`}>See this week’s changes<Icon name="arrow-r" size={11} /></Link>
          </div>
        </SidePanel>
      </div>
    </>
  );
}
