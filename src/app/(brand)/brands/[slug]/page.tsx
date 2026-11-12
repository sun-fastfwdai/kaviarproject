import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { brandThumb, getBrand, getConnections } from "@/lib/queries/brands";
import { campaigns, daily, summary, utmHealth } from "@/lib/queries/growth";
import { signalData } from "@/lib/queries/signals";
import { runs, webhookCount } from "@/lib/queries/sync";
import { ago, daysUntil, money, num, pct, roas } from "@/lib/format";
import { Bar, BrandThumb } from "@/components/shell/parts";
import { Icon } from "@/components/icon";
import { MetaLogo, ShopifyLogo, SourceLogo } from "@/components/logos";
import { AgentFace } from "@/components/agent";
import { ChartLegend, SalesChart } from "@/components/sales-chart";
import { ConnPill } from "@/components/ui";
import { SyncButton } from "@/components/sync-button";

export const metadata = { title: "Overview" };

const initials = (n: string) => n.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
type Agent = "analyst" | "catalog" | "builder" | "qa";

function Step({ done, label, hint, href, cta }: { done: boolean; label: string; hint: string; href: string; cta: string }) {
  return (
    <div className="row g12" style={{ padding: "10px 0", borderTop: "1px solid var(--line)" }}>
      <Icon name={done ? "check-circle" : "circle"} size={18} weight={done ? "fill" : "regular"} color={done ? "#1F8A5B" : "#B5B2AC"} />
      <div className="col fill"><span className={`sm w5 ${done ? "i3" : "i1"}`}>{label}</span><span className="xs i3">{hint}</span></div>
      {!done && <Link className="btn sm" href={href}>{cta}</Link>}
    </div>
  );
}

function Panel({ title, link, children }: { title: string; link?: [string, string]; children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: "14px 16px" }}>
      <div className="row between" style={{ paddingBottom: 8 }}>
        <span className="h3">{title}</span>
        {link && <Link className="lnk xs i2 row g4" href={link[1]}>{link[0]}<Icon name="arrow-r" size={12} /></Link>}
      </div>
      {children}
    </div>
  );
}

export default async function OverviewPage({ params }: PageProps<"/brands/[slug]">) {
  const { slug } = await params;
  const brand = await getBrand(slug);
  const conns = await getConnections(brand.id);
  const tz = brand.timezone, cur = brand.currency, base = `/brands/${slug}`;
  const [s, d, history, health, camps, sig, hooks, team, thumb, owner] = await Promise.all([
    summary(brand.id, tz, 30), daily(brand.id, tz, 30), runs(brand.id, 6), utmHealth(brand.id, tz, 30), campaigns(brand.id, tz, 30),
    conns.shopify ? signalData(brand.id, tz) : Promise.resolve(null), webhookCount(brand.id),
    db.select({ id: schema.members.id, name: schema.members.name, role: schema.members.role }).from(schema.members).orderBy(asc(schema.members.createdAt)),
    brand.imageUrl ?? brandThumb(brand.id),
    brand.createdBy ? db.select({ name: schema.members.name }).from(schema.members).where(eq(schema.members.id, brand.createdBy)).then((r) => r[0]?.name ?? null) : Promise.resolve(null),
  ]);

  const live = (c: typeof conns.shopify) => Boolean(c && ["connected", "sample"].includes(c.status));
  const synced = history.some((r) => r.provider === "shopify" && r.status === "success");
  const tagRate = health.metaOrders ? health.withAd / health.metaOrders : null;
  const steps = [live(conns.shopify), synced, live(conns.meta), (tagRate ?? 0) >= 0.8];
  const hasSales = live(conns.shopify);
  const best = camps.filter((c) => c.spend > 0).map((c) => ({ ...c, v: c.verifiedRevenue / c.spend })).sort((a, b) => b.v - a.v);

  // “Needs the team”: real follow-ups from the data, most urgent first.
  const needs: { agent: Agent | null; title: string; sub: string; cta: string; href: string }[] = [];
  if (conns.shopify?.status === "needs_reauth") needs.push({ agent: "catalog", title: "Reconnect Shopify", sub: "The store stopped accepting Kaviar’s access · Cleo", cta: "Reconnect", href: `${base}/integrations` });
  if (conns.meta?.status === "needs_reauth") needs.push({ agent: "catalog", title: "Reconnect Meta Ads", sub: "The Facebook login expired · Cleo", cta: "Reconnect", href: `${base}/integrations` });
  if (conns.meta?.status === "choose_account") needs.push({ agent: "catalog", title: "Pick the Meta ad account", sub: "Login done — choose which account is theirs", cta: "Choose", href: `${base}/integrations` });
  if (conns.meta?.status === "connected" && conns.meta.accessExpiresAt && daysUntil(conns.meta.accessExpiresAt) < 10)
    needs.push({ agent: "catalog", title: "Meta login expires soon", sub: `In ${daysUntil(conns.meta.accessExpiresAt)} days · reconnect to keep syncing`, cta: "Reconnect", href: `${base}/integrations` });
  if (tagRate != null && tagRate < 0.8) needs.push({ agent: "analyst", title: "Tag every Meta ad", sub: `Only ${pct(tagRate)} of Meta orders name their ad · Iris`, cta: "Show how", href: `${base}/sync#tagging` });
  for (const c of best.filter((x) => x.v < 1 && x.spend >= 100).slice(0, 2))
    needs.push({ agent: "analyst", title: `${c.name} is below break-even`, sub: `${roas(c.v)} verified on ${money(c.spend, cur)} · Iris suggests new creatives`, cta: "Look", href: `${base}/performance` });
  for (const x of (sig?.stock ?? []).filter((x) => x.daysOfStock < 14).slice(0, 1))
    needs.push({ agent: "qa", title: `${x.title} is running low`, sub: `${num(x.inventory)} left · about ${Math.max(0, Math.round(x.daysOfStock))} days at this pace · Otto`, cta: "Look", href: `${base}/shopify?tab=products` });

  const recent: { at: Date; agent: Agent; text: string }[] = history
    .filter((r) => r.status !== "running")
    .map((r) => ({
      at: new Date(r.finishedAt ?? r.startedAt), agent: r.status === "error" ? ("qa" as const) : ("catalog" as const),
      text: r.status === "error" ? `${r.provider === "shopify" ? "Shopify" : "Meta"} sync failed` : r.provider === "shopify" ? `Synced ${num(r.detail?.orders ?? 0)} orders from Shopify` : `Synced ${num(r.detail?.insights ?? 0)} rows of Meta insights`,
    }));

  const sub = [brand.category, conns.shopify?.externalId ?? brand.website?.replace(/^https?:\/\//, ""), tz, owner ? `owner ${owner}` : null].filter(Boolean).join(" · ");

  return (
    <>
      <Bar crumbs={[{ label: "Brands", href: "/brands" }, { label: brand.name }]}>
        <span className="row g6 xs i3"><Icon name="lock" size={12} />Kaviar team only · {brand.name} doesn’t log in</span>
      </Bar>
      <div className="row fill stretch" style={{ minHeight: 0 }}>
        <section className="scroll col" style={{ padding: "22px 24px", gap: 16 }}>
          <div className="row g14" style={{ gap: 14 }}>
            <BrandThumb name={brand.name} imageUrl={thumb} size={52} />
            <div className="col g4 fill" style={{ minWidth: 0 }}>
              <div className="row g8" style={{ flexWrap: "wrap" }}>
                <h1 className="h1">{brand.name}</h1>
                <span className="row g4"><ShopifyLogo size={13} /><ConnPill status={conns.shopify?.status} /></span>
                <span className="row g4"><MetaLogo size={13} /><ConnPill status={conns.meta?.status} /></span>
              </div>
              <span className="sm i3 ell">{sub || "Brand"}</span>
            </div>
            <SyncButton slug={slug} running={history.some((r) => r.status === "running")} disabled={![conns.shopify, conns.meta].some((c) => c?.status === "connected")} />
            <Link href={`${base}/performance`} className="btn dark sm">Open performance <span>→</span></Link>
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

          {hasSales && (
            <div className="card" style={{ padding: "14px 16px 8px", gap: 10 }}>
              <div className="row between">
                <span className="row g8"><Icon name="chart-bar" size={16} /><span className="h3">Growth · last 30 days</span></span>
                <span className="row g6 xs i3"><ShopifyLogo size={12} /><MetaLogo size={12} />synced {ago(history.find((r) => r.status === "success")?.finishedAt)}</span>
              </div>
              <div className="row g24" style={{ flexWrap: "wrap" }}>
                {[
                  [<ShopifyLogo key="s" size={12} />, "Revenue", money(s.revenue, cur), `${num(s.orders)} orders`],
                  [<MetaLogo key="m" size={12} />, "Ad spend", s.spend ? money(s.spend, cur) : "—", `${camps.filter((c) => c.status === "ACTIVE").length} campaigns active`],
                  [<span key="b" className="row g2"><ShopifyLogo size={12} /><MetaLogo size={12} /></span>, "Verified ROAS", s.spend ? roas(s.metaRevenue / s.spend) : "—", s.spend ? `blended ${roas(s.revenue / s.spend)}` : "needs Meta"],
                ].map(([logo, k, v, n]) => (
                  <div key={k as string} className="col g2">
                    <span className="row g6 xs i3">{logo}{k}</span>
                    <span style={{ fontSize: 24, lineHeight: "30px", fontWeight: 500, letterSpacing: "-0.025em" }} className="tnum">{v}</span>
                    <span className="xs i3">{n}</span>
                  </div>
                ))}
              </div>
              <div className="row between"><ChartLegend /></div>
              <SalesChart data={d} currency={cur} height={170} />
              {best[0] && (
                <div className="row g8" style={{ padding: "10px 0 6px", borderTop: "1px solid var(--line)" }}>
                  <AgentFace kind="analyst" size={18} mood="up" />
                  <span className="xs i2 fill">Iris: {best[0].name} returns the most ({roas(best[0].v)} verified){best.some((c) => c.v < 1 && c.spend >= 100) ? "; one campaign is below break-even" : ""}.</span>
                  <Link className="lnk xs i2 row g4" href={`${base}/performance`}>Performance<Icon name="arrow-r" size={12} /></Link>
                </div>
              )}
            </div>
          )}

          <Panel title="Needs the team" link={["Data sync", `${base}/sync`]}>
            {needs.length === 0 ? (
              <div className="row g10" style={{ padding: "10px 0" }}><AgentFace kind="catalog" size={20} mood="happy" /><span className="sm i3">Nothing waiting. Both sources are in sync.</span></div>
            ) : needs.map((n, i) => (
              <div key={i} className="row g12" style={{ padding: "10px 0", borderTop: i ? "1px solid var(--line)" : 0 }}>
                {n.agent ? <AgentFace kind={n.agent} size={22} /> : <Icon name="clock" size={18} />}
                <div className="col fill" style={{ minWidth: 0 }}><span className="sm w5 i1 ell">{n.title}</span><span className="xs i3 ell">{n.sub}</span></div>
                <Link href={n.href} className="btn sm">{n.cta}</Link>
              </div>
            ))}
          </Panel>
        </section>

        <aside className="col" style={{ width: 320, flexShrink: 0, borderLeft: "1px solid var(--line)", background: "var(--tray)", padding: "18px 16px", gap: 12, overflowY: "auto" }}>
          <Panel title="Connections" link={["Data sync", `${base}/sync`]}>
            {(["shopify", "meta"] as const).map((p, i) => {
              const c = conns[p];
              const last = history.find((r) => r.provider === p && r.status === "success")?.finishedAt;
              const tone = !c ? "" : c.status === "connected" || c.status === "sample" ? "green" : c.status === "needs_reauth" || c.status === "choose_account" ? "amber" : "";
              return (
                <Link key={p} href={`${base}/integrations`} className="row g10 hv" style={{ padding: "9px 6px", margin: "0 -6px", borderRadius: 8, borderTop: i ? "1px solid var(--line)" : 0 }}>
                  <span style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid var(--line)", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}><SourceLogo provider={p} size={15} /></span>
                  <div className="col fill" style={{ minWidth: 0 }}><span className="sm w5 i1">{p === "shopify" ? "Shopify" : "Meta Ads"}</span><span className="xs i3 ell">{c?.externalId ?? "not connected"}</span></div>
                  <span className="row g6 xs i2"><span className={`dot ${tone}`} />{!c ? "connect" : c.status === "needs_reauth" ? "reconnect" : c.status === "choose_account" ? "choose account" : last ? `synced ${ago(last)}` : "waiting"}</span>
                </Link>
              );
            })}
            {hooks.n > 0 && <span className="xs i3" style={{ paddingTop: 6 }}>{hooks.n} Shopify webhooks in the last 24 h</span>}
          </Panel>

          <Panel title="On this brand" link={["Team", "/team"]}>
            {team.slice(0, 5).map((m, i) => (
              <div key={m.id} className="row g10" style={{ padding: "6px 0" }}>
                <div className={`av l ${["k", "j", "u", "d"][i % 4]}`}>{initials(m.name)}</div>
                <div className="col"><span className="sm w5 i1">{m.name}</span><span className="xs i3">{m.role === "owner" ? "Owner" : "Operator"}</span></div>
              </div>
            ))}
            <div className="row g8" style={{ paddingTop: 8, borderTop: "1px solid var(--line)", marginTop: 4 }}>
              <div className="row g2">{(["builder", "catalog", "qa", "analyst"] as Agent[]).map((k) => <AgentFace key={k} kind={k} size={18} />)}</div>
              <span className="xs i3">Remy, Cleo, Otto & Iris</span>
            </div>
          </Panel>

          <Panel title="Recent" link={["Data sync", `${base}/sync`]}>
            {recent.length === 0 ? <span className="sm i3">Nothing yet. Activity shows up after the first sync.</span> : recent.map((r, i) => (
              <div key={i} className="row g10" style={{ padding: "6px 0" }}>
                <span className="xs i3 tnum" style={{ width: 42 }}>{ago(r.at).replace(" ago", "")}</span>
                <AgentFace kind={r.agent} size={16} />
                <span className="xs i2 fill ell">{r.text}</span>
              </div>
            ))}
          </Panel>
        </aside>
      </div>
    </>
  );
}
