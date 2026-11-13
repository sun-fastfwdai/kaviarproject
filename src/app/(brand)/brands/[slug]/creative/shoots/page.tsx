import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getBrand } from "@/lib/queries/brands";
import { signalData } from "@/lib/queries/signals";
import { getNotes } from "@/lib/ai/notes";
import { buildSignals } from "@/lib/signals/build";
import { COST_PER_IMAGE, COST_PER_VIDEO_SECOND, shootsThisMonth } from "@/lib/creative/shoots";
import { ShootStudio } from "./studio";
import { TEMPLATES, defaultFlow } from "./flow";

export const metadata = { title: "Creative studio · Shoots" };
// Photos take 10–30 s each, clips 1–3 min.
export const maxDuration = 300;

const SHOOT_SIGNALS = ["lapsed", "reorder", "best-sellers", "top-customers", "repeat", "bundles", "consented"];

export default async function ShootsPage({ params, searchParams }: PageProps<"/brands/[slug]/creative/shoots">) {
  const { slug } = await params;
  const sp = await searchParams;
  const autoRun = sp.run === "1";
  // Handoff from Plan / a batch: ?batch=<id>&signal=<key>&product=<title> presets the flow for this visit (then it's saved).
  const want = { batch: typeof sp.batch === "string" && /^[0-9a-f-]{36}$/i.test(sp.batch) ? sp.batch : null, signal: typeof sp.signal === "string" ? sp.signal : null, product: typeof sp.product === "string" ? sp.product : null };
  const brand = await getBrand(slug);
  const base = `/brands/${slug}`;
  const A = schema.brandAssets;
  const [products, shots, month, batches, d, notes, [saved], refs] = await Promise.all([
    db.execute(sql`select p.title, p.image_url as url, p.total_inventory as stock,
        (select min(v.price) from shop_variants v where v.brand_id = p.brand_id and v.product_id = p.id)::float8 as price
      from shop_products p where p.brand_id = ${brand.id} and p.image_url is not null and coalesce(p.status, 'ACTIVE') = 'ACTIVE' order by p.total_inventory desc nulls last limit 40`),
    db.select({ id: A.id, mime: A.mime, meta: A.meta, createdAt: A.createdAt }).from(A)
      .where(and(eq(A.brandId, brand.id), sql`(${A.meta}->>'ai')::boolean`)).orderBy(desc(A.createdAt)).limit(60),
    shootsThisMonth(brand.id),
    db.select({ id: schema.adBatches.id, title: schema.adBatches.title, signal: schema.adBatches.signal,
      n: sql<number>`(select count(*) from ads a where a.batch_id = ${schema.adBatches.id} and a.status <> 'rejected')::int`,
      review: sql<number>`(select count(*) from ads a where a.batch_id = ${schema.adBatches.id} and a.status = 'review')::int` })
      .from(schema.adBatches).where(eq(schema.adBatches.brandId, brand.id)).orderBy(desc(schema.adBatches.createdAt)).limit(12),
    signalData(brand.id, brand.timezone), getNotes(brand.id),
    db.select().from(schema.shootFlows).where(eq(schema.shootFlows.brandId, brand.id)),
    db.select({ id: A.id, name: A.name }).from(A).where(and(eq(A.brandId, brand.id), eq(A.kind, "imagery"), sql`${A.mime} like 'image/%'`, sql`not coalesce((${A.meta}->>'ai')::boolean, false)`))
      .orderBy(desc(A.createdAt)).limit(24),
  ]);
  const signals = buildSignals(base, brand, d, notes).filter((r) => (r.status === "ready" || r.status === "in-use") && SHOOT_SIGNALS.includes(r.key))
    .sort((a, b) => SHOOT_SIGNALS.indexOf(a.key) - SHOOT_SIGNALS.indexOf(b.key))
    .map((r) => ({ key: r.key, data: r.data, value: r.value, group: r.group, evidence: r.evidence }));
  const list = products.rows as { title: string; url: string; price: number | null; stock: number | null }[];
  const ob = brand.onboarding ?? {};
  let flow = saved?.flow ?? defaultFlow(signals.find((s) => TEMPLATES[s.key])?.key ?? null, list[0]?.url ?? null);
  let allBatches = batches;
  const preset = Boolean(want.batch || want.signal || want.product);
  if (preset) {
    const [b] = want.batch ? await db.select({ id: schema.adBatches.id, title: schema.adBatches.title, signal: schema.adBatches.signal,
      n: sql<number>`(select count(*) from ads a where a.batch_id = ${schema.adBatches.id} and a.status <> 'rejected')::int`, review: sql<number>`0`,
      product: sql<string | null>`(select a.product from ads a where a.batch_id = ${schema.adBatches.id} and a.status <> 'rejected' order by a.position limit 1)` })
      .from(schema.adBatches).where(and(eq(schema.adBatches.id, want.batch), eq(schema.adBatches.brandId, brand.id))) : [];
    if (b && !batches.some((x) => x.id === b.id)) allBatches = [b, ...batches];
    const template = want.signal ?? b?.signal ?? flow.template;
    const name = (want.product ?? b?.product ?? "").toLowerCase();
    const match = name ? list.find((p) => p.title.toLowerCase() === name) ?? list.find((p) => name.includes(p.title.toLowerCase()) || p.title.toLowerCase().includes(name)) : null;
    flow = { ...flow, template, ...(template !== flow.template ? { rules: [], segments: null } : {}), ...(b ? { send: b.id, picked: null } : {}), ...(match ? { product: match.url } : {}) };
  }
  const savedBy = saved?.updatedBy ? (await db.select({ name: schema.members.name }).from(schema.members).where(eq(schema.members.id, saved.updatedBy)))[0]?.name ?? null : null;

  return (
    <ShootStudio slug={slug} base={base} brand={brand.name} currency={brand.currency} autoRun={autoRun}
      initial={flow} preset={preset} savedAt={saved?.updatedAt.toISOString() ?? null} savedBy={savedBy}
      perImage={COST_PER_IMAGE} perVideoSecond={COST_PER_VIDEO_SECOND} month={month} toReview={batches.reduce((a, b) => a + b.review, 0)}
      batches={allBatches.map(({ id, title, n, signal }) => ({ id, title, n, signal }))} signals={signals}
      palette={(ob.analysis?.palette ?? []).map((p) => p.hex)} look={ob.profile?.palette?.value ?? null} tone={ob.profile?.tone?.value ?? null}
      lessons={(notes.insights?.lessons ?? []).map((l) => ({ dimension: l.dimension, lesson: l.lesson, evidence: l.evidence, strength: l.strength }))}
      products={list} refs={refs}
      shots={shots.map((s) => ({ id: s.id, kind: s.mime.startsWith("video/") ? "video" as const : "image" as const, product: s.meta.product ?? null, prompt: s.meta.prompt ?? null,
        check: s.meta.check ?? null, edit: s.meta.edit ?? null, seconds: s.meta.seconds ?? null, at: s.createdAt.toISOString() }))} />
  );
}
