import Link from "next/link";
import { getBrand, getConnections } from "@/lib/queries/brands";
import { customers, orderCount, orderLines, orders, ordersByDay, products, shopCounts, variants, type OrderStatus } from "@/lib/queries/shop";
import { OrderFilters } from "./order-filters";
import { channels, summary } from "@/lib/queries/growth";
import { CHANNEL_COLOR, CHANNEL_LABEL } from "@/lib/sync/attribution";
import type { Channel } from "@/lib/db/schema";
import { dateTime, money, num, ordinal, pct, yearsSince } from "@/lib/format";
import { Bar } from "@/components/shell/parts";
import { Icon, type IconName } from "@/components/icon";
import { MetaLogo, ShopifyLogo } from "@/components/logos";
import { NeedsSource, Stat, StatStrip } from "@/components/ui";
import { AgentFace } from "@/components/agent";

export const metadata = { title: "Shopify data" };
const PAGE = 25;
const CH: Channel[] = ["meta", "direct", "google", "email", "other"];

const FIELDS: [string, [string, string][]][] = [
  ["Order", [["id · name", "#18406"], ["created_at", "time"], ["financial_status", "paid, refunded…"]]],
  ["Money", [["total · subtotal", "money"], ["discounts · codes", "codes + amount"], ["refunds", "amount"]]],
  ["Line items", [["product · variant", "ids"], ["quantity · price", "int · money"]]],
  ["Attribution", [["utm_source / medium", "text"], ["utm_campaign · content", "→ Meta ids"], ["landing page · referrer", "url"]]],
  ["Customer", [["customer id", "id"], ["orders · spend", "int · money"]]],
];

function SubNav({ base, tab, counts, top, cur }: { base: string; tab: string; counts: Awaited<ReturnType<typeof shopCounts>>; top: Awaited<ReturnType<typeof products>>; cur: string }) {
  const items: [string, IconName, string, number][] = [
    ["orders", "receipt", "Orders", counts.orders], ["products", "box", "Products", counts.products], ["variants", "layers", "Variants", counts.variants],
    ["customers", "users", "Customers", counts.customers], ["lines", "rows", "Order lines", counts.lines],
  ];
  return (
    <aside className="col g4" style={{ width: 200, flexShrink: 0, padding: "18px 10px", borderRight: "1px solid var(--line)" }}>
      <div className="row between xs i3" style={{ padding: "0 8px 6px" }}><span>Synced objects</span></div>
      {items.map(([k, icon, label, n]) => (
        <Link key={k} href={`${base}?tab=${k}`} className={`ni${tab === k ? " on" : ""}`}><Icon name={icon} />{label}<span className="ct">{num(n)}</span></Link>
      ))}
      {top.some((p) => p.units > 0) && (
        <>
          <div className="xs i3" style={{ padding: "16px 8px 6px" }}>Top products · 30 days</div>
          {top.filter((p) => p.units > 0).slice(0, 3).map((p) => (
            <div key={p.id} className="row g8" style={{ padding: "4px 8px" }}>
              <div className="thumb" style={{ width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.imageUrl ? <img src={p.imageUrl} alt="" /> : <Icon name="box" size={12} color="#B5B2AC" />}
              </div>
              <div className="col" style={{ minWidth: 0 }}><span className="xs w5 i1 ell">{p.title}</span><span className="xs i3">{num(p.units)} sold · {money(p.revenue, cur)}</span></div>
            </div>
          ))}
        </>
      )}
    </aside>
  );
}

function SourceCell({ c, campaign }: { c: Channel; campaign: string | null }) {
  if (c === "meta") return <span className="row g6 sm i1 ell"><MetaLogo size={13} /><span className="ell">{campaign ?? "Meta ads"}</span></span>;
  return <span className="row g6 sm ell"><i style={{ width: 7, height: 7, borderRadius: 2, background: CHANNEL_COLOR[c] }} />{CHANNEL_LABEL[c]}</span>;
}

export default async function ShopifyPage({ params, searchParams }: PageProps<"/brands/[slug]/shopify">) {
  const { slug } = await params;
  const sp = await searchParams;
  const TABS = ["orders", "products", "variants", "customers", "lines"] as const;
  const tab: (typeof TABS)[number] = TABS.includes(sp.tab as (typeof TABS)[number]) ? (sp.tab as (typeof TABS)[number]) : "orders";
  const page = Math.max(1, Number(sp.page) || 1);
  const ch = CH.includes(sp.source as Channel) ? (sp.source as Channel) : null;
  const days = sp.days === "all" ? null : [7, 30, 90, 365].includes(Number(sp.days)) ? Number(sp.days) : 30;
  const status = (["paid", "unfulfilled", "fulfilled", "refunded", "cancelled"] as const).find((x) => x === sp.status) ?? null;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : null;
  const view = sp.view === "day" ? "day" : "table";
  const brand = await getBrand(slug);
  const conns = await getConnections(brand.id);
  const crumbs = [{ label: brand.name, href: `/brands/${slug}` }, { label: "Growth" }, { label: "Shopify data" }];
  if (!conns.shopify) return (<><Bar crumbs={crumbs} /><div className="scroll" style={{ padding: 24 }}><NeedsSource slug={slug} provider="shopify" what="orders and products" /></div></>);

  const base = `/brands/${slug}/shopify`;
  const tz = brand.timezone, cur = brand.currency;
  const [counts, s, chs, top] = await Promise.all([shopCounts(brand.id), summary(brand.id, tz, days ?? 3650), channels(brand.id, tz, 30), products(brand.id, tz, 30, 3)]);
  const chTotal = chs.reduce((a, c) => a + c.orders, 0) || 1;
  const metaShare = (chs.find((c) => c.channel === "meta")?.orders ?? 0) / chTotal;

  return (
    <>
      <Bar crumbs={crumbs}>
        <Link className="btn sm" href={`/brands/${slug}/sync`}><Icon name="database" size={14} />Data sync</Link>
      </Bar>
      <div className="row fill stretch" style={{ minHeight: 0 }}>
        <SubNav base={base} tab={tab} counts={counts} top={top} cur={cur} />
        <section className="scroll col" style={{ padding: "22px 24px", gap: 14 }}>
          {tab === "orders" ? (
            <OrdersTab brandId={brand.id} cur={cur} tz={tz} base={base} page={page} ch={ch} s={s} chs={chs} chTotal={chTotal} metaShare={metaShare} total={counts.orders}
              days={days} status={status} q={q} view={view} firstOrder={counts.firstOrder} />
          ) : tab === "products" ? (
            <ProductsTab brandId={brand.id} cur={cur} tz={tz} />
          ) : (
            <ListTab kind={tab} brandId={brand.id} cur={cur} tz={tz} base={base} page={page} total={tab === "variants" ? counts.variants : tab === "customers" ? counts.customers : counts.lines} />
          )}
        </section>
        <aside className="col g12" style={{ width: 280, flexShrink: 0, borderLeft: "1px solid var(--line)", padding: "18px 16px", overflowY: "auto" }}>
          <div className="row between"><span className="h3">Available fields</span><span className="pill" style={{ height: 22, fontSize: 11.5 }}>{{ orders: "Orders", products: "Products", variants: "Variants", customers: "Customers", lines: "Order lines" }[tab]}</span></div>
          <span className="xs i3">What Kaviar syncs for each order</span>
          {FIELDS.map(([g, fs]) => (
            <div key={g} className="col" style={{ borderTop: "1px solid var(--line)", paddingTop: 6 }}>
              <span className="xs i3" style={{ paddingBottom: 2 }}>{g}</span>
              {fs.map(([k, v]) => <div key={k} className="row between" style={{ height: 22 }}><span className="mono i1" style={{ fontSize: 11 }}>{k}</span><span className="xs i3">{v}</span></div>)}
            </div>
          ))}
          <div className="col" style={{ borderTop: "1px solid var(--line)", paddingTop: 6 }}>
            <span className="xs i3" style={{ paddingBottom: 4 }}>How it syncs</span>
            <div className="row g4" style={{ flexWrap: "wrap" }}><span className="code" style={{ fontSize: 11 }}>orders/create</span><span className="code" style={{ fontSize: 11 }}>orders/updated</span><span className="code" style={{ fontSize: 11 }}>hourly</span></div>
          </div>
          <div className="fill" />
          <div className="row top g8" style={{ padding: "12px", background: "var(--tray)", border: "1px solid var(--line)", borderRadius: 12 }}>
            <AgentFace kind="analyst" size={18} />
            <span className="xs i2" style={{ lineHeight: "17px" }}><b className="w5 i1">Agents see aggregates;</b> customer contact details never leave Shopify. Iris reads totals, products and UTMs — never names.</span>
          </div>
        </aside>
      </div>
    </>
  );
}

async function OrdersTab({ brandId, cur, tz, base, page, ch, s, chs, chTotal, metaShare, total, days, status, q, view, firstOrder }: {
  brandId: string; cur: string; tz: string; base: string; page: number; ch: Channel | null; s: Awaited<ReturnType<typeof summary>>;
  chs: Awaited<ReturnType<typeof channels>>; chTotal: number; metaShare: number; total: number;
  days: number | null; status: OrderStatus | null; q: string | null; view: "table" | "day"; firstOrder: Date | null;
}) {
  const f = { channel: ch, days, status, q, tz };
  const [list, n, byDay] = await Promise.all([
    view === "table" ? orders(brandId, { limit: PAGE, offset: (page - 1) * PAGE, ...f }) : Promise.resolve([]),
    orderCount(brandId, f),
    view === "day" ? ordersByDay(brandId, f) : Promise.resolve([]),
  ]);
  const pages = Math.max(1, Math.ceil(n.n / PAGE));
  const params: Record<string, string> = Object.fromEntries(Object.entries({ tab: "orders", source: ch, days: days == null ? "all" : days === 30 ? null : String(days), status, q, view: view === "day" ? "day" : null }).filter(([, v]) => v != null)) as Record<string, string>;
  const qs = (p: Record<string, string | number | null>) => {
    const u = new URLSearchParams(params);
    for (const [k, v] of Object.entries({ page, ...p })) { if (v == null || (k === "page" && v === 1)) u.delete(k); else u.set(k, String(v)); }
    return `${base}?${u}`;
  };
  const span = (() => {
    const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: tz });
    const end = new Date();
    if (days == null) return [firstOrder ? `${fmt(new Date(firstOrder))} – ${fmt(end)}` : "All time", "All time"];
    return [`${fmt(new Date(end.getTime() - (days - 1) * 86_400_000))} – ${fmt(end)}`, days === 365 ? "12 months" : `${days} days`];
  })();
  const years = yearsSince(firstOrder);
  return (
    <>
      <div className="row between" style={{ alignItems: "flex-end" }}>
        <div className="col g4"><h1 className="h1">Orders</h1><p className="sm i3">Every order from Shopify, with where it came from. {num(total)} rows{years >= 1 ? ` · ${Math.floor(years)} year${years >= 2 ? "s" : ""}` : ""}.</p></div>
        <div className="seg">
          <Link href={qs({ view: null, page: 1 })} className={`o${view === "table" ? " on" : ""}`}><Icon name="rows" size={13} />Table</Link>
          <Link href={qs({ view: "day", page: 1 })} className={`o${view === "day" ? " on" : ""}`}><Icon name="chart-bar" size={13} />By day</Link>
        </div>
      </div>
      <StatStrip>
        <div className="stat"><span className="xs i3">{span[0]}</span><span className="row g6 sm w5 i1" style={{ marginTop: 4 }}><ShopifyLogo size={14} />{span[1]}</span></div>
        <Stat label="Revenue" value={money(s.revenue, cur)} />
        <Stat label="Orders" value={num(s.orders)} />
        <Stat label="Avg order" value={money(s.orders ? s.revenue / s.orders : 0, cur, true)} />
        <Stat label="New customers" value={num(s.newCustomers)} />
        <Stat label="Returning" value={pct(s.customerOrders ? s.returningOrders / s.customerOrders : 0)} />
      </StatStrip>
      <OrderFilters base={base} params={params} n={n.n}
        ranges={[["7", "Last 7 days"], ["30", span[0]], ["90", "Last 90 days"], ["365", "Last 12 months"], ["all", "All time"]].map(([v, l]) => [v, v === String(days ?? "all") ? span[0] : l]) as [string, string][]}
        statuses={[["", "All"], ["paid", "Paid"], ["unfulfilled", "Unfulfilled"], ["fulfilled", "Fulfilled"], ["refunded", "Refunded"], ["cancelled", "Cancelled"]]} />
      <div className="row g8">
        <Link href={qs({ source: null, page: 1 })} className={`chip${ch ? " dash" : ""}`}>All sources</Link>
        {CH.map((c) => (
          <Link key={c} href={qs({ source: c, page: 1 })} className={`chip${ch === c ? "" : " dash"}`}>
            {c === "meta" ? <MetaLogo size={12} /> : <i style={{ width: 7, height: 7, borderRadius: 2, background: CHANNEL_COLOR[c] }} />}{CHANNEL_LABEL[c]}
          </Link>
        ))}
        <span className="fill" />
        <span className="xs i3">{num(n.n)} orders</span>
      </div>
      {view === "day" ? (
        <div className="card" style={{ overflow: "hidden" }}>
          <div className="tr hd dense" style={{ padding: "0 14px" }}>
            <div className="td fill">Day</div><div className="td num" style={{ width: 80 }}>Orders</div><div className="td num" style={{ width: 110 }}>Revenue</div>
            <div className="td num" style={{ width: 90 }}>Avg order</div><div className="td num" style={{ width: 100 }}>From Meta</div><div className="td num" style={{ width: 110 }}>New customers</div><div className="td num" style={{ width: 90 }}>Refunded</div>
          </div>
          {byDay.map((d) => (
            <div key={d.day} className="tr compact" style={{ padding: "0 14px" }}>
              <div className="td fill sm i1">{new Date(`${d.day}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}</div>
              <div className="td num i1" style={{ width: 80 }}>{num(d.orders)}</div>
              <div className="td num i1" style={{ width: 110 }}>{money(d.revenue, cur)}</div>
              <div className="td num" style={{ width: 90 }}>{money(d.orders ? d.revenue / d.orders : 0, cur, true)}</div>
              <div className="td num" style={{ width: 100 }}>{d.meta ? <span className="row g4" style={{ justifyContent: "flex-end" }}><MetaLogo size={11} />{num(d.meta)}</span> : "—"}</div>
              <div className="td num" style={{ width: 110 }}>{num(d.newCustomers)}</div>
              <div className={`td num ${d.refunded ? "c-amber" : ""}`} style={{ width: 90 }}>{d.refunded ? money(d.refunded, cur) : "—"}</div>
            </div>
          ))}
          {byDay.length === 0 && <div className="sm i3" style={{ padding: 16 }}>No orders match these filters.</div>}
        </div>
      ) : (
      <div className="card" style={{ overflow: "hidden" }}>
        <div className="tr hd dense" style={{ padding: "0 14px" }}>
          <div className="td" style={{ width: 150 }}>Order · customer</div><div className="td fill">Items</div>
          <div className="td" style={{ width: 150 }}>Source</div><div className="td num" style={{ width: 70 }}>Total</div><div className="td" style={{ width: 92 }}>Status</div>
        </div>
        {list.map((o) => (
          <div key={o.id} className="tr compact" style={{ padding: "0 14px" }}>
            <div className="td" style={{ width: 150 }}><div className="col" style={{ minWidth: 0 }}><span className="sm w5 i1">{o.name} <span className="xs i3" style={{ fontWeight: 400 }}>· {o.priorOrders == null ? "Guest" : o.priorOrders === 0 ? "New" : `${ordinal(o.priorOrders + 1)} order`}</span></span><span className="xs i3">{dateTime(o.createdAt, tz)}</span></div></div>
            <div className="td fill"><span className="sm i1 ell">{o.items ?? "—"}</span></div>
            <div className="td" style={{ width: 150 }}><SourceCell c={o.channel} campaign={o.campaign ?? o.utmCampaign} /></div>
            <div className="td num i1" style={{ width: 70 }}>{money(o.total, cur, true)}</div>
            <div className="td" style={{ width: 92 }}>
              {o.refunded > 0 ? <span className="st sm"><span className="dot amber" />Refunded</span> : o.fulfillmentStatus === "FULFILLED" ? <span className="st sm"><span className="dot green" />Fulfilled</span> : <span className="st sm"><span className="dot blue" />Paid</span>}
            </div>
          </div>
        ))}
        {list.length === 0 && <div className="sm i3" style={{ padding: 16 }}>{q || status || ch ? "No orders match these filters." : "No orders yet."}</div>}
        <div className="row between" style={{ padding: "10px 14px" }}>
          <span className="xs i3">Page {page} of {num(pages)}</span>
          <div className="row g6">
            <Link aria-disabled={page <= 1} className="btn sm" href={qs({ page: page - 1 })}>Previous</Link>
            <Link aria-disabled={page >= pages} className="btn sm" href={qs({ page: page + 1 })}>Next</Link>
          </div>
        </div>
      </div>
      )}
      <div className="card" style={{ padding: "14px 16px", gap: 10 }}>
        <div className="row between"><span className="h3">Orders by source · 30 days</span><span className="row g6 xs i3"><MetaLogo size={12} />Meta drives {pct(metaShare)} of orders · from UTMs</span></div>
        <div className="row" style={{ height: 10, borderRadius: 99, overflow: "hidden", gap: 2 }}>
          {chs.map((c) => <span key={c.channel} style={{ width: `${(c.orders / chTotal) * 100}%`, height: 10, background: CHANNEL_COLOR[c.channel] }} />)}
        </div>
        <div className="row g16" style={{ flexWrap: "wrap" }}>
          {chs.map((c) => <span key={c.channel} className="row g6 xs i2"><i style={{ width: 8, height: 8, borderRadius: 2, background: CHANNEL_COLOR[c.channel] }} /><b className="w5 i1">{CHANNEL_LABEL[c.channel]}</b> {num(c.orders)} · {money(c.revenue, cur)}</span>)}
        </div>
      </div>
    </>
  );
}

async function ProductsTab({ brandId, cur, tz }: { brandId: string; cur: string; tz: string }) {
  const list = await products(brandId, tz, 30);
  return (
    <>
      <div className="col g4"><h1 className="h1">Products</h1><p className="sm i3">What sells, what’s left, and how long the stock lasts at the current pace.</p></div>
      <div className="card" style={{ overflow: "hidden" }}>
        <div className="tr hd dense" style={{ padding: "0 14px" }}>
          <div className="td fill">Product</div><div className="td num" style={{ width: 70 }}>Price</div><div className="td num" style={{ width: 80 }}>In stock</div>
          <div className="td num" style={{ width: 80 }}>Sold · 30d</div><div className="td num" style={{ width: 96 }}>Revenue · 30d</div>
          <div className="td num" style={{ width: 96 }}>Stock lasts</div><div className="td num" style={{ width: 70 }}>Margin</div>
        </div>
        {list.map((p) => (
          <div key={p.id} className="tr compact" style={{ padding: "0 14px" }}>
            <div className="td fill">
              <div className="thumb" style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.imageUrl ? <img src={p.imageUrl} alt="" /> : <Icon name="box" size={15} color="#B5B2AC" />}
              </div>
              <div className="col" style={{ minWidth: 0 }}><span className="sm w5 i1 ell">{p.title}</span><span className="xs i3">{p.variants} variant{p.variants === 1 ? "" : "s"}{p.status && p.status !== "ACTIVE" ? ` · ${p.status.toLowerCase()}` : ""}</span></div>
            </div>
            <div className="td num" style={{ width: 70 }}>{p.price != null ? money(p.price, cur) : "—"}</div>
            <div className="td num i1" style={{ width: 80 }}>{p.inventory != null ? num(p.inventory) : "—"}</div>
            <div className="td num" style={{ width: 80 }}>{num(p.units)}</div>
            <div className="td num i1" style={{ width: 96 }}>{money(p.revenue, cur)}</div>
            <div className={`td num ${p.daysOfStock != null && p.daysOfStock < 21 ? "c-amber w5" : ""}`} style={{ width: 96 }}>{p.daysOfStock == null ? "—" : p.daysOfStock > 365 ? "1 year +" : `${Math.round(p.daysOfStock)} days`}</div>
            <div className="td num" style={{ width: 70 }}>{p.margin != null ? pct(p.margin) : "—"}</div>
          </div>
        ))}
        {list.length === 0 && <div className="sm i3" style={{ padding: 16 }}>No products synced yet.</div>}
      </div>
    </>
  );
}

function Pager({ base, tab, page, pages }: { base: string; tab: string; page: number; pages: number }) {
  const href = (p: number) => `${base}?tab=${tab}${p > 1 ? `&page=${p}` : ""}`;
  return (
    <div className="row between" style={{ padding: "10px 14px" }}>
      <span className="xs i3">Page {page} of {num(pages)}</span>
      <div className="row g6">
        <Link aria-disabled={page <= 1} className="btn sm" href={href(Math.max(1, page - 1))}>Previous</Link>
        <Link aria-disabled={page >= pages} className="btn sm" href={href(Math.min(pages, page + 1))}>Next</Link>
      </div>
    </div>
  );
}

async function ListTab({ kind, brandId, cur, tz, base, page, total }: { kind: "variants" | "customers" | "lines"; brandId: string; cur: string; tz: string; base: string; page: number; total: number }) {
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const off = (Math.min(page, pages) - 1) * PAGE;
  if (kind === "variants") {
    const list = await variants(brandId, tz, PAGE, off);
    return (
      <>
        <div className="col g4"><h1 className="h1">Variants</h1><p className="sm i3">Every size and shade, with price, cost and stock. {num(total)} rows.</p></div>
        <div className="card" style={{ overflow: "hidden" }}>
          <div className="tr hd dense" style={{ padding: "0 14px" }}>
            <div className="td fill">Product · variant</div><div className="td" style={{ width: 130 }}>SKU</div><div className="td num" style={{ width: 80 }}>Price</div>
            <div className="td num" style={{ width: 80 }}>Cost</div><div className="td num" style={{ width: 80 }}>In stock</div><div className="td num" style={{ width: 90 }}>Sold · 30d</div>
          </div>
          {list.map((v) => (
            <div key={v.id} className="tr compact" style={{ padding: "0 14px" }}>
              <div className="td fill">
                <div className="thumb" style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {v.imageUrl ? <img src={v.imageUrl} alt="" /> : <Icon name="box" size={15} color="#B5B2AC" />}
                </div>
                <div className="col" style={{ minWidth: 0 }}><span className="sm w5 i1 ell">{v.product}</span><span className="xs i3 ell">{v.title && v.title !== "Default Title" ? v.title : "Default"}</span></div>
              </div>
              <div className="td" style={{ width: 130 }}><span className="mono xs i2 ell">{v.sku || "—"}</span></div>
              <div className="td num" style={{ width: 80 }}>{v.price != null ? money(v.price, cur) : "—"}</div>
              <div className="td num" style={{ width: 80 }}>{v.unitCost != null ? money(v.unitCost, cur) : "—"}</div>
              <div className={`td num ${v.inventory != null && v.inventory <= 0 ? "c-amber w5" : "i1"}`} style={{ width: 80 }}>{v.inventory != null ? num(v.inventory) : "—"}</div>
              <div className="td num" style={{ width: 90 }}>{num(v.units)}</div>
            </div>
          ))}
          {list.length === 0 && <div className="sm i3" style={{ padding: 16 }}>No variants synced yet.</div>}
          <Pager base={base} tab={kind} page={page} pages={pages} />
        </div>
      </>
    );
  }
  if (kind === "customers") {
    const list = await customers(brandId, PAGE, off);
    return (
      <>
        <div className="col g4"><h1 className="h1">Customers</h1><p className="sm i3">Kaviar keeps ids, order counts and spend only — never names, emails or addresses. {num(total)} rows.</p></div>
        <div className="card" style={{ overflow: "hidden" }}>
          <div className="tr hd dense" style={{ padding: "0 14px" }}>
            <div className="td fill">Customer</div><div className="td num" style={{ width: 80 }}>Orders</div><div className="td num" style={{ width: 110 }}>Spent</div>
            <div className="td" style={{ width: 130 }}>Last order</div><div className="td" style={{ width: 130 }}>Customer since</div><div className="td" style={{ width: 100 }}>Marketing</div>
          </div>
          {list.map((c) => (
            <div key={c.id} className="tr compact" style={{ padding: "0 14px" }}>
              <div className="td fill"><Icon name="user" size={14} color="#8B8883" /><span className="mono xs i1">#{String(c.id).slice(-8)}</span>{c.orders > 1 && <span className="pill" style={{ height: 20, fontSize: 11 }}>Repeat</span>}</div>
              <div className="td num i1" style={{ width: 80 }}>{num(c.orders)}</div>
              <div className="td num i1" style={{ width: 110 }}>{c.spent != null ? money(c.spent, cur) : "—"}</div>
              <div className="td" style={{ width: 130 }}>{c.lastOrder ? dateTime(c.lastOrder, tz).split(" · ")[0] : "—"}</div>
              <div className="td" style={{ width: 130 }}>{c.createdAt ? dateTime(c.createdAt, tz).split(" · ")[0] : "—"}</div>
              <div className="td" style={{ width: 100 }}>{c.consent ? <span className="st sm"><span className="dot green" />Subscribed</span> : <span className="st sm i3"><span className="dot" />No</span>}</div>
            </div>
          ))}
          {list.length === 0 && <div className="sm i3" style={{ padding: 16 }}>No customers synced yet.</div>}
          <Pager base={base} tab={kind} page={page} pages={pages} />
        </div>
      </>
    );
  }
  const list = await orderLines(brandId, PAGE, off);
  return (
    <>
      <div className="col g4"><h1 className="h1">Order lines</h1><p className="sm i3">Each product in each order — what joins ads to the products they sold. {num(total)} rows.</p></div>
      <div className="card" style={{ overflow: "hidden" }}>
        <div className="tr hd dense" style={{ padding: "0 14px" }}>
          <div className="td" style={{ width: 150 }}>Order</div><div className="td fill">Product · variant</div><div className="td" style={{ width: 120 }}>SKU</div>
          <div className="td num" style={{ width: 50 }}>Qty</div><div className="td num" style={{ width: 80 }}>Price</div><div className="td num" style={{ width: 80 }}>Total</div><div className="td" style={{ width: 120 }}>Source</div>
        </div>
        {list.map((l) => (
          <div key={l.id} className="tr compact" style={{ padding: "0 14px" }}>
            <div className="td" style={{ width: 150 }}><div className="col"><span className="sm w5 i1">{l.order}</span><span className="xs i3">{dateTime(l.createdAt, tz)}</span></div></div>
            <div className="td fill"><div className="col" style={{ minWidth: 0 }}><span className="sm i1 ell">{l.title}</span>{l.variantTitle && l.variantTitle !== "Default Title" && <span className="xs i3 ell">{l.variantTitle}</span>}</div></div>
            <div className="td" style={{ width: 120 }}><span className="mono xs i2 ell">{l.sku || "—"}</span></div>
            <div className="td num i1" style={{ width: 50 }}>{num(l.quantity)}</div>
            <div className="td num" style={{ width: 80 }}>{l.unitPrice != null ? money(l.unitPrice, cur, true) : "—"}</div>
            <div className="td num i1" style={{ width: 80 }}>{l.total != null ? money(l.total, cur, true) : "—"}</div>
            <div className="td" style={{ width: 120 }}><SourceCell c={l.channel} campaign={null} /></div>
          </div>
        ))}
        {list.length === 0 && <div className="sm i3" style={{ padding: 16 }}>No order lines synced yet.</div>}
        <Pager base={base} tab={kind} page={page} pages={pages} />
      </div>
    </>
  );
}
