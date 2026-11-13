import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getBrand } from "@/lib/queries/brands";
import { signalData } from "@/lib/queries/signals";
import { getNotes } from "@/lib/ai/notes";
import { buildSignals } from "@/lib/signals/build";
import { COST_PER_IMAGE, COST_PER_VIDEO_SECOND, shootsThisMonth } from "@/lib/creative/shoots";
import { Bar } from "@/components/shell/parts";
import { LoopStrip } from "@/components/loop-strip";
import { CreativeTabs } from "../tabs";
import { ShootStudio } from "./studio";

export const metadata = { title: "Creative studio · Shoots" };
// Photos take 10–30 s each, clips 1–3 min.
export const maxDuration = 300;

export default async function ShootsPage({ params }: PageProps<"/brands/[slug]/creative/shoots">) {
  const { slug } = await params;
  const brand = await getBrand(slug);
  const base = `/brands/${slug}`;
  const [products, shots, month, batches, d, notes] = await Promise.all([
    db.execute(sql`select p.title, p.image_url as url, (select min(v.price) from shop_variants v where v.brand_id = p.brand_id and v.product_id = p.id)::float8 as price
      from shop_products p where p.brand_id = ${brand.id} and p.image_url is not null and coalesce(p.status, 'ACTIVE') = 'ACTIVE' order by p.total_inventory desc nulls last limit 30`),
    db.select({ id: schema.brandAssets.id, mime: schema.brandAssets.mime, meta: schema.brandAssets.meta }).from(schema.brandAssets)
      .where(and(eq(schema.brandAssets.brandId, brand.id), sql`(${schema.brandAssets.meta}->>'ai')::boolean`)).orderBy(desc(schema.brandAssets.createdAt)).limit(40),
    shootsThisMonth(brand.id),
    db.select({ id: schema.adBatches.id, title: schema.adBatches.title, n: sql<number>`(select count(*) from ads a where a.batch_id = ${schema.adBatches.id})::int` })
      .from(schema.adBatches).where(eq(schema.adBatches.brandId, brand.id)).orderBy(desc(schema.adBatches.createdAt)).limit(5),
    signalData(brand.id, brand.timezone), getNotes(brand.id),
  ]);
  const signals = buildSignals(base, brand, d, notes).filter((r) => (r.status === "ready" || r.status === "in-use") && ["lapsed", "reorder", "top-customers", "repeat", "best-sellers", "bundles", "consented"].includes(r.key))
    .map((r) => ({ key: r.key, data: r.data, value: r.value, evidence: r.evidence }));
  const ob = brand.onboarding ?? {};
  return (
    <>
      <Bar crumbs={[{ label: brand.name, href: base }, { label: "Creative studio", href: `${base}/creative` }, { label: "Shoots" }]}><LoopStrip base={base} step={2} /></Bar>
      <CreativeTabs base={base} on="shoots" />
      <ShootStudio slug={slug} perImage={COST_PER_IMAGE} perVideoSecond={COST_PER_VIDEO_SECOND} month={month} batches={batches} signals={signals}
        palette={(ob.analysis?.palette ?? []).map((p) => p.hex)} tone={ob.profile?.tone?.value ?? null}
        lessons={(notes.insights?.lessons ?? []).map((l) => `${l.dimension}: ${l.lesson}`)}
        products={(products.rows as { title: string; url: string; price: number | null }[])}
        shots={shots.map((s) => ({ id: s.id, kind: s.mime.startsWith("video/") ? "video" : "image", product: s.meta.product ?? null, prompt: s.meta.prompt ?? null, check: s.meta.check ?? null }))} />
    </>
  );
}
