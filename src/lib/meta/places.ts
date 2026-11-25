import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { shopifyGraphql } from "../shopify/client";
import { metaGet } from "./client";
import { metaConn } from "./apply";
import { COUNTRIES, countryFor } from "./place-rules";
import { choosePlaces, type PlaceAdvice, type PlaceFacts } from "./places-rules";

/**
 * The facts a campaign's countries are chosen from, read where each one lives: orders and shipping from Shopify (live), competitors'
 * targeted countries from the Ad Library read Iris already made, the brand's own ad sales from Meta (live). A source that can't be
 * read is left out — the choice is then made from the rest, and the screen shows only the facts that were found.
 */
type Shop = { orders: Map<string, number>; ships: Set<string> | null };
const kept = new Map<string, { at: number; shop: Shop }>();

type OrdersPage = { orders: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: { test: boolean; cancelledAt: string | null; shippingAddress: { countryCodeV2: string | null } | null }[] } };
const ORDERS = `query Places($q: String, $after: String) { orders(first: 250, after: $after, query: $q, sortKey: CREATED_AT, reverse: true) { pageInfo { hasNextPage endCursor }
  nodes { test cancelledAt shippingAddress { countryCodeV2 } } } }`;

/** Where the last 90 days' orders were shipped (the newest 1,000 at most) and where the store ships at all. Kept ten minutes. */
async function shopFacts(brandId: string): Promise<Shop> {
  const hit = kept.get(brandId);
  if (hit && Date.now() - hit.at < 600_000) return hit.shop;
  const C = schema.connections;
  const [conn] = await db.select({ id: C.id, status: C.status }).from(C).where(and(eq(C.brandId, brandId), eq(C.provider, "shopify"))).limit(1);
  const shop: Shop = { orders: new Map(), ships: null };
  if (conn?.status !== "connected") return shop;
  const since = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
  await Promise.all([
    shopifyGraphql<{ shop: { shipsToCountries: string[] } }>(conn.id, `{ shop { shipsToCountries } }`).then((r) => { if (r.shop?.shipsToCountries?.length) shop.ships = new Set(r.shop.shipsToCountries); }).catch((e) => console.error("shopify ships", (e as Error).message.slice(0, 160))),
    (async () => {
      let after: string | null = null;
      for (let page = 0; page < 4; page++) {
        const r: OrdersPage = await shopifyGraphql<OrdersPage>(conn.id, ORDERS, { q: `created_at:>=${since}`, after });
        for (const o of r.orders.nodes) { const c = o.shippingAddress?.countryCodeV2; if (c && !o.test && !o.cancelledAt) shop.orders.set(c, (shop.orders.get(c) ?? 0) + 1); }
        if (!r.orders.pageInfo.hasNextPage) break;
        after = r.orders.pageInfo.endCursor;
      }
    })().catch((e) => console.error("shopify order countries", (e as Error).message.slice(0, 160))),
  ]);
  kept.set(brandId, { at: Date.now(), shop });
  return shop;
}

/** Countries competitors' ads targeted, from the Ad Library ads already stored: how many ads and how many of the competitors. */
async function rivalFacts(brandId: string): Promise<{ by: Map<string, { ads: number; brands: number }>; rivals: number }> {
  const byName = new Map(COUNTRIES.map(([k, n]) => [n.toLowerCase(), k]));
  const rows = (await db.execute(sql`
    select p as place, count(*)::int as ads, count(distinct x->>'name')::int as brands
    from market_research m, jsonb_array_elements(m.rivals) x, jsonb_array_elements(coalesce(x->'ads', '[]'::jsonb)) a, jsonb_array_elements_text(coalesce(a->'target'->'places', '[]'::jsonb)) p
    where m.brand_id = ${brandId} and m.id = (select id from market_research where brand_id = ${brandId} and jsonb_array_length(rivals) > 0 order by updated_at desc limit 1)
    group by 1`).catch(() => ({ rows: [] }))).rows as { place: string; ads: number; brands: number }[];
  const [n] = (await db.execute(sql`
    select count(distinct x->>'name')::int as n
    from market_research m, jsonb_array_elements(m.rivals) x, jsonb_array_elements(coalesce(x->'ads', '[]'::jsonb)) a
    where m.id = (select id from market_research where brand_id = ${brandId} and jsonb_array_length(rivals) > 0 order by updated_at desc limit 1) and jsonb_array_length(coalesce(a->'target'->'places', '[]'::jsonb)) > 0`).catch(() => ({ rows: [] }))).rows as { n: number }[];
  const by = new Map<string, { ads: number; brands: number }>();
  for (const r of rows) { const code = byName.get(r.place.trim().toLowerCase()); if (code) by.set(code, { ads: r.ads, brands: r.brands }); }
  return { by, rivals: n?.n ?? 0 };
}

type Insight = { country?: string; spend?: string; actions?: { action_type: string; value: string }[] };
/** What the brand's own ads spent and sold in each country over the last 90 days. */
async function ownFacts(brandId: string): Promise<Map<string, { spend: number; purchases: number }>> {
  const out = new Map<string, { spend: number; purchases: number }>();
  const c = await metaConn(brandId).catch(() => null);
  if (!c) return out;
  const r = await metaGet<{ data: Insight[] }>(`${c.account}/insights`, { breakdowns: "country", fields: "spend,actions", date_preset: "last_90d", limit: "200" }, c.token).catch(() => ({ data: [] as Insight[] }));
  for (const x of r.data) {
    if (!x.country) continue;
    const buy = x.actions?.find((a) => a.action_type === "purchase") ?? x.actions?.find((a) => a.action_type === "omni_purchase") ?? x.actions?.find((a) => a.action_type === "offsite_conversion.fb_pixel_purchase");
    out.set(x.country.toUpperCase(), { spend: Number(x.spend) || 0, purchases: Math.round(Number(buy?.value) || 0) });
  }
  return out;
}

/** Iris's choice of countries for a campaign with this much a day, with the facts behind each. */
export async function placeAdvice(brand: { id: string; currency: string | null }, market: string | null, daily: number): Promise<PlaceAdvice> {
  const [shop, rival, own] = await Promise.all([shopFacts(brand.id), rivalFacts(brand.id), ownFacts(brand.id)]);
  const codes = new Set([...shop.orders.keys(), ...rival.by.keys(), ...own.keys()]);
  const facts: PlaceFacts[] = [...codes].map((code) => ({
    code, orders: shop.orders.get(code) ?? 0, ships: shop.ships ? shop.ships.has(code) : null,
    rivalAds: rival.by.get(code)?.ads ?? 0, rivalBrands: rival.by.get(code)?.brands ?? 0, purchases: own.get(code)?.purchases ?? 0, spend: own.get(code)?.spend ?? 0,
  }));
  const home = countryFor(null, brand.currency), m = (market ?? "").trim().toUpperCase();
  // The researched market and the home country have no row of their own when nothing was sold or advertised there yet: say whether the store ships there.
  for (const code of [m, home]) if (COUNTRIES.some(([k]) => k === code) && !codes.has(code)) { codes.add(code); facts.push({ code, orders: 0, ships: shop.ships ? shop.ships.has(code) : null, rivalAds: 0, rivalBrands: 0, purchases: 0, spend: 0 }); }
  return choosePlaces({ facts, market, home, daily, rivals: rival.rivals });
}
