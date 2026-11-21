import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { shopifyGraphql } from "./client";

/** Every picture on the store's products — all of each product's images, not only the first. Read live from Shopify, kept ten minutes. */
export type StoreImage = { id: string; url: string; product: string; alt: string | null; width: number | null; height: number | null; at: string | null };
type Page = { products: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: { title: string; updatedAt: string; media: { nodes: { id?: string; image?: { url: string; width: number | null; height: number | null; altText: string | null } | null }[] } }[] } };
const Q = `query Media($after: String) { products(first: 50, after: $after, sortKey: UPDATED_AT, reverse: true) { pageInfo { hasNextPage endCursor }
  nodes { title updatedAt media(first: 12) { nodes { ... on MediaImage { id image { url width height altText } } } } } } }`;
const kept = new Map<string, { at: number; list: StoreImage[] }>();

export async function storeImages(brandId: string): Promise<StoreImage[]> {
  const hit = kept.get(brandId);
  if (hit && Date.now() - hit.at < 600_000) return hit.list;
  const C = schema.connections;
  const [conn] = await db.select({ id: C.id, status: C.status }).from(C).where(and(eq(C.brandId, brandId), eq(C.provider, "shopify"))).limit(1);
  let list: StoreImage[] = [];
  if (conn?.status === "connected") {
    try {
      let after: string | null = null;
      for (let page = 0; page < 5; page++) {
        const r: Page = await shopifyGraphql<Page>(conn.id, Q, { after });
        for (const p of r.products.nodes) for (const m of p.media.nodes) if (m.id && m.image?.url) list.push({ id: m.id, url: m.image.url, product: p.title, alt: m.image.altText, width: m.image.width, height: m.image.height, at: p.updatedAt });
        if (!r.products.pageInfo.hasNextPage) break;
        after = r.products.pageInfo.endCursor;
      }
    } catch (e) { console.error("shopify media", e); list = []; }
  }
  // No live store (or the call failed): the one picture per product Kaviar already keeps.
  if (!list.length) {
    const rows = (await db.execute(sql`select id, title, image_url as url, updated_at as at from shop_products where brand_id = ${brandId} and image_url is not null order by updated_at desc nulls last limit 300`)).rows as { id: string; title: string; url: string; at: Date | string | null }[];
    list = rows.map((r) => ({ id: r.id, url: r.url, product: r.title, alt: null, width: null, height: null, at: r.at ? new Date(r.at).toISOString() : null }));
  }
  kept.set(brandId, { at: Date.now(), list });
  return list;
}
