import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getBrand } from "@/lib/queries/brands";
import { getStore, storeLine } from "@/lib/seo/run";
import { ago } from "@/lib/format";
import { Bar } from "@/components/shell/parts";
import { NeedsSource } from "@/components/ui";
import { StoreView } from "./view";
import type { Fix } from "@/lib/seo/types";

export const metadata = { title: "SEO & AI search" };
export const maxDuration = 300; // "Check again" reads the whole store and Cleo writes the replacements

/** What stops Google and AI assistants from finding and describing this store, each with its fix — and a switch to let Kaviar fix it. */
export default async function SeoPage({ params }: PageProps<"/brands/[slug]/seo">) {
  const { slug } = await params;
  const brand = await getBrand(slug);
  const base = `/brands/${slug}`, crumbs = [{ label: brand.name, href: base }, { label: "SEO & AI search" }];
  const store = await getStore(brand.id);
  if (!store.access.connected) return (<><Bar crumbs={crumbs} /><div className="scroll" style={{ padding: 24 }}><NeedsSource slug={slug} provider="shopify" what="the products, pictures and pages Kaviar checks" /></div></>);
  const F = schema.storeFixes;
  const rows = await db.select().from(F).where(eq(F.brandId, brand.id)).orderBy(asc(F.productTitle), asc(F.kind), asc(F.key)).limit(2000);
  const fixes: Fix[] = rows.map((r) => ({ id: r.id, kind: r.kind, productGid: r.productGid, productTitle: r.productTitle, handle: r.handle, image: r.image, problem: r.problem, before: r.before, after: r.after,
    status: r.status, by: r.by, appliedAt: r.appliedAt ? ago(r.appliedAt) : null, error: r.error }));
  const shop = store.access.shop ?? "";
  return (
    <>
      <Bar crumbs={crumbs} />
      <StoreView slug={slug} brand={brand.name} audit={store.audit} checked={store.audit ? ago(new Date(store.audit.at)) : null} auto={store.auto} canFix={store.access.canFix}
        allow={`/api/shopify/install?brand=${slug}&shop=${encodeURIComponent(shop)}&write=1`} admin={shop ? `https://admin.shopify.com/store/${shop.replace(".myshopify.com", "")}` : null}
        fixes={fixes} runs={store.runs.slice(0, 8).map((r) => ({ when: ago(new Date(r.at)), line: storeLine(r), auto: r.by === "schedule" }))} />
    </>
  );
}
