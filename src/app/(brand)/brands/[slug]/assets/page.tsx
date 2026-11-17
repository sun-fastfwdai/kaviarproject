import { and, desc, eq, ne } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getBrand } from "@/lib/queries/brands";
import { Bar } from "@/components/shell/parts";
import { AssetsView, type AssetRow } from "./view";

export const metadata = { title: "Brand assets" };

/** Board 07a · every file the brand has: uploads, AI photos from Shoots, ad cards, store photos, clips and full ads. */
export default async function AssetsPage({ params, searchParams }: PageProps<"/brands/[slug]/assets">) {
  const { slug } = await params;
  const sp = await searchParams;
  const brand = await getBrand(slug);
  const A = schema.brandAssets;
  const rows = await db.select({ id: A.id, kind: A.kind, name: A.name, mime: A.mime, size: A.size, meta: A.meta, createdAt: A.createdAt, by: schema.members.name })
    .from(A).leftJoin(schema.members, eq(schema.members.id, A.createdBy))
    .where(and(eq(A.brandId, brand.id), ne(A.kind, "competitor"))).orderBy(desc(A.createdAt)).limit(400);
  const assets: AssetRow[] = rows.map((r) => ({
    id: r.id, kind: r.kind, name: r.name, mime: r.mime, size: r.size, at: r.createdAt.toISOString(), by: r.by ?? null,
    ai: Boolean(r.meta.ai), engine: r.meta.engine ?? null, prompt: r.meta.prompt ?? null, product: r.meta.product ?? null, seconds: r.meta.seconds ?? null,
    cost: r.meta.cost ?? null, edit: r.meta.edit ?? null, width: r.meta.width ?? null, height: r.meta.height ?? null,
  }));
  return (
    <>
      <Bar crumbs={[{ label: brand.name, href: `/brands/${slug}` }, { label: "Brand assets" }]} />
      <AssetsView brand={brand.name} assets={assets} initial={typeof sp.open === "string" ? sp.open : null} />
    </>
  );
}
