import { and, desc, eq, getTableColumns, isNotNull, ne, sql, type AnyColumn } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getBrand } from "@/lib/queries/brands";
import { hasOwnData, videosFor } from "@/lib/audience/facts";
import { Bar } from "@/components/shell/parts";
import { LoopStrip } from "@/components/loop-strip";
import type { PanelKind } from "@/lib/audience/types";
import { AudienceView, type PanelRow, type TestRow } from "./view";

export const metadata = { title: "Audience test" };
// The panel and the tests run in the background after the action returns.
export const maxDuration = 800;

export default async function AudiencePage({ params, searchParams }: PageProps<"/brands/[slug]/audience">) {
  const { slug } = await params;
  const sp = await searchParams;
  const brand = await getBrand(slug);
  const P = schema.audiencePanels, T = schema.audienceTests;
  const stale = (s: AnyColumn, u: AnyColumn) => sql<boolean>`(${s} = 'running' and ${u} < now() - interval '15 minutes')`;
  const [own, meta, panelRows, list, batches, videos] = await Promise.all([
    hasOwnData(brand.id),
    db.select({ id: schema.connections.id }).from(schema.connections).where(and(eq(schema.connections.brandId, brand.id), eq(schema.connections.provider, "meta"), isNotNull(schema.connections.accessToken), ne(schema.connections.status, "disconnected"), ne(schema.connections.status, "sample"))).limit(1),
    db.select({ ...getTableColumns(P), stale: stale(P.status, P.updatedAt) }).from(P).where(eq(P.brandId, brand.id)),
    db.select({ id: T.id, title: T.title, status: T.status, panelId: T.panelId, createdAt: T.createdAt, result: T.result, items: T.items, stale: stale(T.status, T.updatedAt) })
      .from(T).where(and(eq(T.brandId, brand.id), eq(T.purpose, "test"))).orderBy(desc(T.createdAt)).limit(20),
    db.execute(sql`select b.id, b.title, b.audience, b.created_at as "createdAt", count(a.id) filter (where a.status <> 'rejected')::int as ads
      from ad_batches b left join ads a on a.batch_id = b.id where b.brand_id = ${brand.id} group by b.id order by b.created_at desc limit 30`).then((r) => r.rows as { id: string; title: string; audience: string; createdAt: Date; ads: number }[]),
    videosFor(brand.id),
  ]);
  const hasOwn = own.store || own.ads;
  const kind: PanelKind = sp.panel === "general" || sp.panel === "yours" ? sp.panel : hasOwn ? "yours" : "general";
  const kindOf = new Map(panelRows.map((p) => [p.id, p.kind]));
  const panels = Object.fromEntries((["yours", "general"] as const).map((k) => {
    const p = panelRows.find((x) => x.kind === k);
    return [k, p ? { id: p.id, kind: p.kind, status: p.status, stale: Boolean(p.stale), panel: p.panel, calibration: p.calibration, error: p.error, startedAt: p.startedAt?.toISOString() ?? null, finishedAt: p.finishedAt?.toISOString() ?? null } satisfies PanelRow : null];
  })) as Record<PanelKind, PanelRow | null>;

  // The test on screen: the one asked for, else the newest for this panel.
  const wanted = typeof sp.test === "string" && /^[0-9a-f-]{36}$/i.test(sp.test) ? sp.test : list.find((t) => kindOf.get(t.panelId) === kind)?.id ?? null;
  const [t] = wanted ? await db.select({ ...getTableColumns(T), stale: stale(T.status, T.updatedAt) }).from(T).where(and(eq(T.id, wanted), eq(T.brandId, brand.id))) : [];
  const test: TestRow | null = t ? {
    id: t.id, title: t.title, focus: "focus" in t.source ? t.source.focus ?? null : null, purpose: t.purpose, status: t.status, stale: Boolean(t.stale), progress: t.progress, items: t.items, personas: t.personas, reactions: t.reactions,
    result: t.result, error: t.error, kind: kindOf.get(t.panelId) ?? kind, createdAt: t.createdAt.toISOString(), startedAt: t.startedAt?.toISOString() ?? null, finishedAt: t.finishedAt?.toISOString() ?? null,
  } : null;
  const tests = list.map((x) => {
    const top = x.result?.winner ? x.result.scores.find((s) => s.key === x.result!.winner) : null;
    return { id: x.id, title: x.title, status: x.stale ? "error" as const : x.status, kind: kindOf.get(x.panelId) ?? kind, createdAt: x.createdAt.toISOString(), items: x.items.length,
      winner: top ? x.items.find((i) => i.key === top.key)?.label ?? null : null, top: top?.score ?? null };
  });
  const crumbs = [{ label: brand.name, href: `/brands/${slug}` }, { label: "Campaigns" }, { label: "Audience test" }];
  return (
    <>
      <Bar crumbs={crumbs}><LoopStrip base={`/brands/${slug}`} brandId={brand.id} step="audience" /></Bar>
      <AudienceView slug={slug} brand={brand.name} kind={kind} own={own} hasMeta={meta.length > 0} panels={panels} tests={tests} test={test}
        batches={batches.filter((b) => b.ads > 0).map((b) => ({ id: b.id, title: b.title, audience: b.audience, ads: b.ads, createdAt: new Date(b.createdAt).toISOString() }))}
        videos={videos.map((v) => ({ id: v.id, name: v.name, seconds: v.meta.seconds ?? null, final: v.meta.engine === "Kaviar · final cut", createdAt: v.createdAt.toISOString() }))}
        batch={typeof sp.batch === "string" ? sp.batch : null} />
    </>
  );
}
