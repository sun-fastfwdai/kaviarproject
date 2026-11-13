import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getBrand } from "@/lib/queries/brands";
import { COST_PER_IMAGE, shootsThisMonth } from "@/lib/creative/shoots";
import { Bar } from "@/components/shell/parts";
import { LoopStrip } from "@/components/loop-strip";
import { CreativeTabs } from "../tabs";
import { ShootStudio } from "./studio";

export const metadata = { title: "Creative studio · Shoots" };
// Image models take 10–30 seconds per image.
export const maxDuration = 180;

export default async function ShootsPage({ params }: PageProps<"/brands/[slug]/creative/shoots">) {
  const { slug } = await params;
  const brand = await getBrand(slug);
  const base = `/brands/${slug}`;
  const [products, shots, month, batches] = await Promise.all([
    db.execute(sql`select p.title, p.image_url as url, (select min(v.price) from shop_variants v where v.brand_id = p.brand_id and v.product_id = p.id)::float8 as price
      from shop_products p where p.brand_id = ${brand.id} and p.image_url is not null and coalesce(p.status, 'ACTIVE') = 'ACTIVE' order by p.total_inventory desc nulls last limit 30`),
    db.select({ id: schema.brandAssets.id, meta: schema.brandAssets.meta, createdAt: schema.brandAssets.createdAt }).from(schema.brandAssets)
      .where(and(eq(schema.brandAssets.brandId, brand.id), sql`(${schema.brandAssets.meta}->>'ai')::boolean`)).orderBy(desc(schema.brandAssets.createdAt)).limit(40),
    shootsThisMonth(brand.id),
    db.select({ title: schema.adBatches.title }).from(schema.adBatches).where(eq(schema.adBatches.brandId, brand.id)).orderBy(desc(schema.adBatches.createdAt)).limit(3),
  ]);
  return (
    <>
      <Bar crumbs={[{ label: brand.name, href: base }, { label: "Creative studio", href: `${base}/creative` }, { label: "Shoots" }]}><LoopStrip base={base} step={2} /></Bar>
      <CreativeTabs base={base} on="shoots" />
      <ShootStudio slug={slug} perImage={COST_PER_IMAGE} month={month} signals={batches.map((b) => b.title)}
        products={(products.rows as { title: string; url: string; price: number | null }[])}
        shots={shots.map((s) => ({ id: s.id, product: s.meta.product ?? null, prompt: s.meta.prompt ?? null, createdAt: s.createdAt.toISOString() }))} />
    </>
  );
}
