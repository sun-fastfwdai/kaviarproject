import Link from "next/link";
import { getBrand, getConnections, type ConnectionView } from "@/lib/queries/brands";
import { runs, tableStats, webhookCount } from "@/lib/queries/sync";
import { utmHealth } from "@/lib/queries/growth";
import { META_URL_PARAMS } from "@/lib/sync/attribution";
import { ago, compact, dateTime, duration, num, pct } from "@/lib/format";
import { Bar } from "@/components/shell/parts";
import { Icon, type IconName } from "@/components/icon";
import { SourceLogo, SourceTile } from "@/components/logos";
import { AgentFace } from "@/components/agent";
import { ConnPill } from "@/components/ui";
import { SyncButton } from "@/components/sync-button";
import { CopyButton } from "@/components/copy";

export const metadata = { title: "Data sync" };

function Check({ ok, label, value }: { ok: boolean | null; label: string; value?: React.ReactNode }) {
  return (
    <div className="row g8" style={{ height: 26 }}>
      <Icon name={ok ? "check-circle" : ok === false ? "warning-circle" : "circle"} size={15} weight={ok ? "fill" : "regular"} color={ok ? "#1F8A5B" : ok === false ? "#B7791F" : "#B5B2AC"} />
      <span className="sm i1 fill ell">{label}</span>
      {value != null && <span className="xs i3">{value}</span>}
    </div>
  );
}

function SourceCard({ slug, provider, conn, lastSync, extra }: { slug: string; provider: "shopify" | "meta"; conn: ConnectionView | null; lastSync: Date | null; extra: React.ReactNode }) {
  const name = provider === "shopify" ? "Shopify" : "Meta Ads";
  return (
    <div className="card fill" style={{ minWidth: 0 }}>
      <div className="card-h">
        <SourceTile provider={provider} size={36} />
        <div className="col fill" style={{ minWidth: 0 }}><span className="h3">{name}</span><span className="xs i3 ell">{conn?.externalId ?? "Not connected"}</span></div>
        <ConnPill status={conn?.status} />
      </div>
      <div className="col" style={{ padding: "10px 16px", flex: 1 }}>
        {conn ? (
          <>
            <Check ok={conn.status === "connected" || conn.status === "sample"} label={conn.status === "needs_reauth" ? "Reconnect needed" : "Connected through the Kaviar app"} value={conn.connectedAt ? `since ${dateTime(conn.connectedAt).split(" · ")[0]}` : undefined} />
            <Check ok={conn.scopes.length > 0} label="Read-only access granted" value={`${conn.scopes.length} scopes`} />
            {extra}
            <Check ok={lastSync ? true : null} label="Last sync" value={ago(lastSync)} />
            <div className="row g4" style={{ flexWrap: "wrap", paddingTop: 8 }}>
              {conn.scopes.slice(0, 3).map((sc) => <span key={sc} className="code" style={{ fontSize: 11 }}>{sc}</span>)}
              {conn.scopes.length > 3 && <span className="code" style={{ fontSize: 11 }}>+{conn.scopes.length - 3} more</span>}
            </div>
          </>
        ) : (
          <>
            <Check ok={null} label="Connected through the Kaviar app" value="not yet" />
            <Check ok={null} label="Read-only access granted" value="on connect" />
            {extra}
            <Check ok={null} label="Last sync" value="never" />
            <span className="xs i3" style={{ paddingTop: 8 }}>Connect {name} and Cleo runs the first backfill.</span>
          </>
        )}
      </div>
      <div className="row between" style={{ padding: "10px 16px", borderTop: "1px solid var(--line)" }}>
        <span className="xs i3">Read-only · Kaviar never edits this source</span>
        <Link className="lnk xs w5 i1 row g4" href={conn ? `/brands/${slug}/${provider}` : `/brands/${slug}/integrations`}>{conn ? `Explore ${provider === "shopify" ? "Shopify" : "Meta"} data` : "Connect"}<Icon name="arrow-r" size={12} /></Link>
      </div>
    </div>
  );
}

type WebhookState = { registered: string[]; missing: string[]; errors: string[]; checkedAt: string };

/** Real webhook state from Shopify (checked after syncs), not just whether one arrived today. */
function WebhookCheck({ conn, received }: { conn: ConnectionView | null; received: number }) {
  if (!conn) return <Check ok={null} label="Webhooks" value="after connect" />;
  if (conn.status === "sample") return <Check ok label="Webhooks" value="sample data" />;
  const w = (conn.details as { webhooks?: WebhookState }).webhooks;
  if (!w) return <Check ok={received > 0 ? true : null} label="Webhooks" value={received ? `${received} in 24 h` : "checked on the next sync"} />;
  if (!w.missing.length) return <Check ok label="Webhooks" value={received ? `${w.registered.length} topics · ${received} in 24 h` : `${w.registered.length} topics registered`} />;
  const err = w.errors.join(" ");
  const why = /protected customer data|not approved/i.test(err) ? "orders need Shopify’s customer-data approval"
    : /https/i.test(err) ? "needs a public https address" : `${w.missing.length} not registered`;
  return <span title={err || undefined}><Check ok={false} label={`Webhooks · ${w.registered.length} of ${w.registered.length + w.missing.length}`} value={why} /></span>;
}

const TRIGGER: Record<string, string> = { connect: "First backfill", manual: "Manual sync", schedule: "Hourly sync", webhook: "Webhook" };

export default async function SyncPage({ params, searchParams }: PageProps<"/brands/[slug]/sync">) {
  const { slug } = await params;
  const sp = await searchParams;
  const connected = sp.connected;
  const src = sp.src === "shopify" || sp.src === "meta" ? sp.src : "all";
  const brand = await getBrand(slug);
  const conns = await getConnections(brand.id);
  const [tables, history, hooks, health] = await Promise.all([tableStats(brand.id), runs(brand.id, 10), webhookCount(brand.id), utmHealth(brand.id, brand.timezone, 30)]);
  const running = history.some((r) => r.status === "running");
  const last = (p: string) => history.find((r) => r.provider === p && r.status === "success")?.finishedAt ?? null;
  const totalRows = tables.reduce((a, t) => a + t.rows, 0);
  const lastChange = history.find((r) => r.status === "success")?.finishedAt ?? null;
  const canSync = [conns.shopify, conns.meta].some((c) => c?.status === "connected");
  const tagged = health.metaOrders ? health.withAd / health.metaOrders : null;

  return (
    <>
      <Bar crumbs={[{ label: brand.name, href: `/brands/${slug}` }, { label: "Growth" }, { label: "Data sync" }]}>
        <span className="row g6 xs i3"><AgentFace kind="catalog" size={16} />Cleo keeps both sources in sync, hourly</span>
        <SyncButton slug={slug} running={running} disabled={!canSync} />
        <Link className="btn dark sm" href={`/brands/${slug}/performance`}><Icon name="chart-bar" size={14} color="#fff" />View performance</Link>
      </Bar>
      <div className="scroll">
        <div className="col g16" style={{ padding: "22px 24px" }}>
          <div className="row between" style={{ alignItems: "flex-end" }}>
            <div className="col g4"><h1 className="h1">Data sync</h1><p className="sm i3">Shopify and Meta Ads data, kept in Kaviar’s database and ready for the agents.</p></div>
            <div className="row">
              <div className="kpi"><span className="v">{[conns.shopify, conns.meta].filter(Boolean).length}</span><span className="xs i3">Sources</span></div>
              <div className="kpi"><span className="v">{tables.length}</span><span className="xs i3">Tables</span></div>
              <div className="kpi"><span className="v">{compact(totalRows)}</span><span className="xs i3">Rows</span></div>
              <div className="kpi"><span className="v">{ago(lastChange)}</span><span className="xs i3">Last change</span></div>
            </div>
          </div>

          {connected && (
            <div className="notice green"><Icon name="check-circle" size={14} weight="fill" /><span>{connected === "meta" ? "Meta Ads" : "Shopify"} is connected. The first sync is running — history fills in over the next few minutes.</span></div>
          )}

          <div className="row g16" style={{ alignItems: "stretch" }}>
            <SourceCard slug={slug} provider="shopify" conn={conns.shopify} lastSync={last("shopify")}
              extra={<WebhookCheck conn={conns.shopify} received={hooks.n} />} />
            <SourceCard slug={slug} provider="meta" conn={conns.meta} lastSync={last("meta")}
              extra={<Check ok={conns.meta ? true : null} label="Insights pulled every hour" value={conns.meta ? "last 7 days restated" : "after connect"} />} />
          </div>

          <div className="row g16" style={{ alignItems: "stretch" }}>
            <div className="card fill" style={{ overflow: "hidden" }}>
              <div className="row between" style={{ padding: "14px 16px 10px" }}>
                <div className="col g2"><span className="h3">In the database</span><span className="xs i3">{tables.length} tables · {num(totalRows)} rows · ready for the agents</span></div>
                <div className="seg">
                  {([["all", "All"], ["shopify", "Shopify"], ["meta", "Meta"]] as const).map(([k, l]) => (
                    <Link key={k} href={`/brands/${slug}/sync${k === "all" ? "" : `?src=${k}`}`} scroll={false} className={`o${src === k ? " on" : ""}`}>
                      {k !== "all" && <SourceLogo provider={k} size={12} />}{l}
                    </Link>
                  ))}
                </div>
              </div>
              <div className="tr hd dense" style={{ padding: "0 16px", borderTop: "1px solid var(--line)" }}>
                <div className="td fill">Table</div><div className="td" style={{ width: 54 }}>Source</div><div className="td num" style={{ width: 80 }}>Rows</div>
                <div className="td" style={{ width: 100 }}>Freshness</div><div className="td" style={{ width: 170 }}>How it syncs</div><div className="td" style={{ width: 96 }}>Status</div>
              </div>
              {tables.filter((t) => src === "all" || t.source === src).map((t) => (
                <div key={t.table} className="tr dense" style={{ padding: "0 16px" }}>
                  <div className="td fill"><Icon name={t.icon as IconName} size={14} color="#8B8883" /><span className="mono i1">{t.table}</span></div>
                  <div className="td" style={{ width: 54 }}><SourceLogo provider={t.source} size={13} /></div>
                  <div className="td num i1" style={{ width: 80 }}>{num(t.rows)}</div>
                  <div className="td" style={{ width: 100 }}>{ago(t.freshness)}</div>
                  <div className="td" style={{ width: 170 }}>{t.how}</div>
                  <div className="td" style={{ width: 96 }}>
                    {t.freshness ? <span className="st sm"><span className="dot green" />Up to date</span> : <span className="st sm i3"><span className="dot" />Waiting</span>}
                  </div>
                </div>
              ))}
            </div>

            <div className="card" style={{ width: 300, flexShrink: 0 }}>
              <div className="row between" style={{ padding: "14px 16px 6px" }}><span className="h3">Sync history</span>{running && <span className="pill blue">Running</span>}</div>
              <div className="col" style={{ padding: "4px 16px 12px" }}>
                {history.length === 0 && <span className="sm i3" style={{ padding: "8px 0" }}>Nothing yet. Connect a source and Kaviar runs the first backfill.</span>}
                {history.slice(0, 8).map((r) => {
                  const tone = r.status === "success" ? "#1F8A5B" : r.status === "running" ? "#2563EB" : "#B7791F";
                  const d = r.detail ?? {};
                  const what = r.provider === "shopify" ? `${num(d.orders ?? 0)} orders · ${num(d.products ?? 0)} products` : `${num(d.insights ?? 0)} insight rows · ${num(d.ads ?? 0)} ads`;
                  return (
                    <div key={r.id} className="row top g10" style={{ padding: "8px 0" }}>
                      <span style={{ width: 9, height: 9, borderRadius: 99, marginTop: 5, flexShrink: 0, background: tone }} />
                      <div className="col fill" style={{ minWidth: 0 }}>
                        <span className="row g6 sm w5 i1"><SourceLogo provider={r.provider} size={12} />{TRIGGER[r.trigger] ?? r.trigger}{r.mode === "backfill" && r.trigger !== "connect" ? " · backfill" : ""}</span>
                        <span className={`xs ${r.status === "error" ? "c-amber" : "i3"} ell`} title={r.error ?? undefined}>{r.status === "error" ? r.error : r.status === "running" ? "in progress…" : what}</span>
                      </div>
                      <div className="col" style={{ alignItems: "flex-end" }}>
                        <span className="xs i3">{ago(r.startedAt)}</span>
                        {r.finishedAt && <span className="xs i4">{duration(new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime())}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="row top g8" style={{ marginTop: "auto", marginInline: 12, marginBottom: 12, padding: "10px 12px", background: "var(--tray)", border: "1px solid var(--line)", borderRadius: 10 }}>
                <AgentFace kind="catalog" size={18} />
                <span className="xs i2" style={{ lineHeight: "17px" }}><b className="w5 i1">Cleo:</b> {history.some((r) => r.status === "error") ? "“One sync hit a problem — I’ll retry on the next hourly run. Details are in the history above.”" : history.length ? "“Both sources are current. I check them every hour and re-read Meta’s last 7 days each time.”" : "“Connect a source and I’ll run the first backfill.”"}</span>
              </div>
            </div>
          </div>

          <div id="tagging" className="card" style={{ padding: "16px 18px", gap: 10 }}>
            <div className="row between">
              <div className="col g2">
                <span className="h3">Tag every Meta ad</span>
                <span className="sm i3">Paste these URL parameters into each ad (Ad → Destination → URL parameters). Shopify then records which ad, ad set and campaign every order came from.</span>
              </div>
              {tagged != null && <span className={`pill ${tagged >= 0.8 ? "green" : "amber"}`}>{pct(tagged)} of Meta orders tagged</span>}
            </div>
            <div className="row g8">
              <div className="input fill" style={{ background: "var(--tray)" }}><span className="mono i1 ell">{META_URL_PARAMS}</span></div>
              <CopyButton text={META_URL_PARAMS} />
            </div>
            <span className="xs i3">Meta fills in the ids when the ad is served. Without them Kaviar still counts Meta orders, but can’t say which ad sold which product.</span>
          </div>
        </div>
      </div>
    </>
  );
}
