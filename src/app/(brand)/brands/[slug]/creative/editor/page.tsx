import Link from "next/link";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getBrand } from "@/lib/queries/brands";
import { Bar } from "@/components/shell/parts";
import { Icon } from "@/components/icon";
import { LoopStrip } from "@/components/loop-strip";
import { CreativeTabs } from "../tabs";
import { EditorArt, EmptyState } from "@/components/empty";
import { Editor } from "./editor";

export const metadata = { title: "Creative studio · Editor" };

export default async function EditorPage({ params, searchParams }: PageProps<"/brands/[slug]/creative/editor">) {
  const { slug } = await params;
  const want = (await searchParams).ad;
  const brand = await getBrand(slug);
  const base = `/brands/${slug}`;
  const A = schema.ads;
  const [ad] = typeof want === "string" && /^[0-9a-f-]{36}$/i.test(want)
    ? await db.select().from(A).where(and(eq(A.id, want), eq(A.brandId, brand.id))).limit(1)
    : await db.select().from(A).where(and(eq(A.brandId, brand.id), sql`${A.status} <> 'rejected'`)).orderBy(desc(A.updatedAt)).limit(1);
  const head = (<><Bar crumbs={[{ label: brand.name, href: base }, { label: "Creative studio", href: `${base}/creative` }, { label: "Editor" }]}><LoopStrip base={base} step={2} /></Bar><CreativeTabs base={base} on="editor" /></>);
  if (!ad) return (<>{head}<div className="scroll" style={{ padding: "20px 24px" }}>
    <EmptyState eyebrow="Creative studio · Editor" title="Design an ad, then download it for Meta"
      body="The Editor opens any ad Remy wrote. Move the headline, swap in a product photo or a Shoots image, add the logo, an offer badge and a button — and download all three Meta sizes as PNGs."
      steps={[
        { agent: "builder", title: "Have Remy write a batch", body: "From a plan or any ad signal." },
        { icon: "pencil", title: "Open an ad and design it", body: "Drag layers; brand colours and fonts are one click away. Otto flags text in Reels’ unsafe zones." },
        { icon: "download", title: "Download PNGs", body: "9:16, 4:5 and 1:1 at 1080 px — ready to upload in Ads Manager." },
      ]}
      art={<EditorArt />}
      actions={<Link className="btn dark" href={`${base}/creative`}><Icon name="sparkle" size={14} color="#fff" />Plan a batch</Link>} />
  </div></>);

  const [siblings, products, assets] = await Promise.all([
    db.select({ id: A.id, hook: A.hook }).from(A).where(eq(A.batchId, ad.batchId)).orderBy(asc(A.position)),
    db.execute(sql`select title, image_url as url from shop_products where brand_id = ${brand.id} and image_url is not null and coalesce(status, 'ACTIVE') = 'ACTIVE' order by total_inventory desc nulls last limit 24`),
    db.select({ id: schema.brandAssets.id, kind: schema.brandAssets.kind, name: schema.brandAssets.name, mime: schema.brandAssets.mime, meta: schema.brandAssets.meta }).from(schema.brandAssets)
      .where(and(eq(schema.brandAssets.brandId, brand.id), sql`${schema.brandAssets.mime} like 'image/%'`)).orderBy(desc(schema.brandAssets.createdAt)).limit(40),
  ]);
  const palette = (brand.onboarding?.analysis?.palette ?? []).map((p) => p.hex);
  const url = (id: string) => `/api/assets/${id}`;

  return (
    <>
      {head}
      <Editor key={ad.id} slug={slug} brand={brand.name}
        ad={{ id: ad.id, batchId: ad.batchId, hook: ad.hook, primaryText: ad.primaryText, headline: ad.headline, cta: ad.cta, offer: ad.offer, imageUrl: ad.imageUrl, status: ad.status, design: ad.design }}
        ads={siblings} palette={palette} products={(products.rows as { title: string; url: string }[])}
        media={assets.filter((a) => a.kind === "imagery").map((a) => ({ name: a.name, url: url(a.id), ai: Boolean((a.meta as { ai?: boolean }).ai) }))}
        logos={assets.filter((a) => a.kind === "logo").map((a) => ({ name: a.name, url: url(a.id) }))}
        otherHooks={siblings.filter((s) => s.id !== ad.id).map((s) => s.hook)} />
    </>
  );
}
