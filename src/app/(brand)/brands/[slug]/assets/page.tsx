import { after } from "next/server";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getBrand } from "@/lib/queries/brands";
import { StudioBar } from "../creative/tabs";
import { moveToStorage, storageOn } from "@/lib/assets/storage";
import { storeImages } from "@/lib/shopify/media";
import { AssetsView, type AssetRow } from "./view";

export const metadata = { title: "Brand assets" };
export const maxDuration = 300;

/** Board 07a · every file the brand has: uploads, AI photos from Shoots, ad cards, store photos, clips and full ads. */
export default async function AssetsPage({ params, searchParams }: PageProps<"/brands/[slug]/assets">) {
  const { slug } = await params;
  const sp = await searchParams;
  const brand = await getBrand(slug);
  const A = schema.brandAssets;
  const rows = await db.select({ id: A.id, kind: A.kind, name: A.name, mime: A.mime, size: A.size, meta: A.meta, createdAt: A.createdAt, by: schema.members.name })
    .from(A).leftJoin(schema.members, eq(schema.members.id, A.createdBy))
    .where(and(eq(A.brandId, brand.id), ne(A.kind, "competitor"))).orderBy(desc(A.createdAt)).limit(400);
  // Files saved before storage was switched on are moved over in the background, one at a time.
  const pending = storageOn() ? (await db.select({ n: sql<number>`count(*)::int` }).from(A).where(and(eq(A.brandId, brand.id), sql`octet_length(${A.data}) > 0`)))[0].n : 0;
  if (pending) after(() => moveToStorage(brand.id, 240_000).catch((e) => console.error("move to storage", e)));
  const assets: AssetRow[] = rows.map((r) => ({
    id: r.id, kind: r.kind, name: r.name, mime: r.mime, size: r.size, at: r.createdAt.toISOString(), by: r.by ?? null,
    ai: Boolean(r.meta.ai), engine: r.meta.engine ?? null, prompt: r.meta.prompt ?? null, product: r.meta.product ?? null, seconds: r.meta.seconds ?? null,
    cost: r.meta.cost ?? null, edit: r.meta.edit ?? null, width: r.meta.width ?? null, height: r.meta.height ?? null, url: null,
  }));
  // The store's own product pictures, straight from Shopify — shown beside Kaviar's files, not copied.
  const fromStore: AssetRow[] = (await storeImages(brand.id).catch(() => [])).map((m) => ({
    id: `shopify:${m.id}`, kind: "shopify", name: m.alt?.trim() || m.product, mime: "image/jpeg", size: 0, at: m.at ?? "", by: null, ai: false, engine: "Shopify", prompt: null, product: m.product,
    seconds: null, cost: null, edit: null, width: m.width, height: m.height, url: m.url,
  }));
  assets.push(...fromStore);
  return (
    <>
      <StudioBar base={`/brands/${slug}`} brand={brand.name} on="assets" />
      <AssetsView brand={brand.name} assets={assets} moving={pending} initial={typeof sp.open === "string" ? sp.open : null} />
    </>
  );
}
