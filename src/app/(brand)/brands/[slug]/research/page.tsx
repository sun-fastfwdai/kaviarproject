import { and, eq, getTableColumns, isNotNull, ne, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getBrand } from "@/lib/queries/brands";
import { productsFor, researchList } from "@/lib/research/run";
import { Bar } from "@/components/shell/parts";
import { ResearchView, type ResearchRow } from "./view";

export const metadata = { title: "Market research" };
// Research runs in the background after the action returns; it can take several minutes.
export const maxDuration = 800;

export default async function ResearchPage({ params, searchParams }: PageProps<"/brands/[slug]/research">) {
  const { slug } = await params;
  const sp = await searchParams;
  const brand = await getBrand(slug);
  const R = schema.marketResearch;
  const [products, list, meta] = await Promise.all([
    productsFor(brand.id),
    researchList(brand.id),
    db.select({ id: schema.connections.id }).from(schema.connections).where(and(eq(schema.connections.provider, "meta"), isNotNull(schema.connections.accessToken), ne(schema.connections.status, "disconnected"))).limit(1),
  ]);
  const subject = typeof sp.product === "string" ? sp.product.slice(0, 200) : list[0]?.subject ?? "";
  const market = typeof sp.market === "string" ? sp.market : list.find((l) => l.subject === subject)?.market ?? "US";
  const tab = sp.tab === "ads" || sp.tab === "plan" || sp.tab === "market" || sp.tab === "position" ? sp.tab : "position";
  // A run that hasn't saved anything for 15 minutes was cut off (deploy, timeout): offer to run it again.
  const [r] = await db.select({ ...getTableColumns(R), stale: sql<boolean>`(${R.status} = 'running' and ${R.updatedAt} < now() - interval '15 minutes')` })
    .from(R).where(and(eq(R.brandId, brand.id), eq(R.subject, subject), eq(R.market, market)));
  const row: ResearchRow | null = r ? {
    id: r.id, status: r.status, stale: Boolean(r.stale), steps: r.steps, report: r.report, rivals: r.rivals, manual: r.manual,
    adsRead: r.adsRead, plan: r.plan, positioning: r.positioning, error: r.error, updatedAt: r.updatedAt.toISOString(), startedAt: r.startedAt?.toISOString() ?? null, finishedAt: r.finishedAt?.toISOString() ?? null,
  } : null;
  const crumbs = [{ label: brand.name, href: `/brands/${slug}` }, { label: "Growth" }, { label: "Market research" }];
  return (
    <>
      <Bar crumbs={crumbs} />
      <ResearchView slug={slug} brand={brand.name} currency={brand.currency ?? "USD"} subject={subject} market={market} tab={tab} row={row} hasMeta={meta.length > 0}
        products={products.slice(0, 200).map((p) => ({ title: p.title, price: p.price, image: p.image }))} researched={list.map((l) => ({ subject: l.subject, market: l.market, status: l.status }))} />
    </>
  );
}
