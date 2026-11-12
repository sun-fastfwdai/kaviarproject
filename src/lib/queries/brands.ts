import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { requireMember } from "../auth";
import { rows } from "./common";

export type Brand = typeof schema.brands.$inferSelect;

/** Safe connection view: never includes tokens. */
export type ConnectionView = {
  id: string; provider: "shopify" | "meta"; status: string; externalId: string | null; displayName: string | null;
  scopes: string[]; details: Record<string, unknown>; lastError: string | null; connectedAt: Date | null;
  accessExpiresAt: Date | null; refreshExpiresAt: Date | null; connectedByName: string | null;
};

export const getBrand = cache(async (slug: string): Promise<Brand> => {
  await requireMember();
  const [b] = await db.select().from(schema.brands).where(eq(schema.brands.slug, slug)).limit(1);
  if (!b) notFound();
  return b;
});

export const getConnections = cache(async (brandId: string) => {
  const list = await rows<ConnectionView>(sql`
    select c.id, c.provider, c.status, c.external_id as "externalId", c.display_name as "displayName", c.scopes, c.details,
           c.last_error as "lastError", c.connected_at as "connectedAt", c.access_expires_at as "accessExpiresAt",
           c.refresh_expires_at as "refreshExpiresAt", m.name as "connectedByName"
    from connections c left join members m on m.id = c.connected_by
    where c.brand_id = ${brandId}`);
  return { shopify: list.find((c) => c.provider === "shopify") ?? null, meta: list.find((c) => c.provider === "meta") ?? null };
});

export type BrandRow = Brand & {
  shopDomain: string | null; shopStatus: string | null; metaStatus: string | null; metaName: string | null;
  revenue30: number; orders30: number; lastSync: Date | null; syncing: boolean; lastError: string | null; thumb: string | null;
  ownerName: string | null; metaAccounts: number;
};

export async function listBrands(): Promise<BrandRow[]> {
  await requireMember();
  return rows<BrandRow>(sql`
    select b.id, b.slug, b.name, b.category, b.currency, b.timezone, b.image_url as "imageUrl", b.is_sample as "isSample", b.created_at as "createdAt",
      s.external_id as "shopDomain", s.status as "shopStatus", m.status as "metaStatus", m.display_name as "metaName",
      coalesce(r.revenue, 0)::float8 as "revenue30", coalesce(r.orders, 0)::int as "orders30",
      (select max(finished_at) from sync_runs x where x.brand_id = b.id and x.status = 'success') as "lastSync",
      exists(select 1 from sync_runs x where x.brand_id = b.id and x.status = 'running') as "syncing",
      coalesce(s.last_error, m.last_error) as "lastError",
      (select name from members o where o.id = b.created_by) as "ownerName",
      0 as "metaAccounts",
      coalesce(b.image_url, (select p.image_url from shop_products p where p.brand_id = b.id and p.image_url is not null order by p.total_inventory desc nulls last limit 1)) as "thumb"
    from brands b
    left join connections s on s.brand_id = b.id and s.provider = 'shopify'
    left join connections m on m.brand_id = b.id and m.provider = 'meta'
    left join lateral (
      select sum(o.total - o.refunded) as revenue, count(*) as orders from shop_orders o
      where o.brand_id = b.id and not o.test and o.cancelled_at is null
        and o.created_at >= (((now() at time zone b.timezone)::date - 29)::timestamp at time zone b.timezone)
    ) r on true
    order by b.is_sample, b.created_at desc`);
}

export async function brandThumb(brandId: string): Promise<string | null> {
  const r = await rows<{ u: string }>(sql`select image_url as u from shop_products where brand_id = ${brandId} and image_url is not null order by total_inventory desc nulls last limit 1`);
  return r[0]?.u ?? null;
}

export type BrandIndexItem = { slug: string; name: string; category: string | null; thumb: string | null };

/** Light list for the brand switcher and ⌘K search. */
export const brandIndex = cache(async (): Promise<BrandIndexItem[]> => {
  await requireMember();
  return rows<BrandIndexItem>(sql`
    select b.slug, b.name, b.category,
      coalesce(b.image_url, (select p.image_url from shop_products p where p.brand_id = b.id and p.image_url is not null order by p.total_inventory desc nulls last limit 1)) as "thumb"
    from brands b order by b.name`);
});
