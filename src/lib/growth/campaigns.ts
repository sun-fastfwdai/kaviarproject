import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { campaigns } from "../queries/growth";
import { planData } from "./plan-data";
import { planFor } from "./today";
import type { LibRow, LibStatus } from "./library";

/**
 * Every campaign in one list, wherever it is on its way: what the plan funds and nobody has made yet, the ads Kaviar wrote that are
 * waiting for review, a test or a launch, and what is live or paused on Meta — each with its budget, what it brought back, and the next step.
 */
const ORDER: LibStatus[] = ["live", "ready", "test", "review", "planned", "paused"];

export async function library(brand: { id: string; currency: string | null; timezone: string }, slug: string): Promise<{ rows: LibRow[]; live: number; toReview: number; drafts: number }> {
  const base = `/brands/${slug}`, B = schema.adBatches;
  const [meta, d, batches, tested, pics] = await Promise.all([
    campaigns(brand.id, brand.timezone, 30).catch(() => []), planData(brand.id, brand.currency ?? "USD"),
    db.select({ id: B.id, title: B.title, signal: B.signal,
      review: sql<number>`(select count(*) from ads a where a.batch_id = "ad_batches"."id" and a.status = 'review')::int`,
      approved: sql<number>`(select count(*) from ads a where a.batch_id = "ad_batches"."id" and a.status = 'approved')::int` }).from(B).where(eq(B.brandId, brand.id)).orderBy(desc(B.createdAt)).limit(40),
    db.execute(sql`select distinct source->>'batchId' as id from audience_tests where brand_id = ${brand.id} and status = 'done' and source->>'type' = 'batch'`).then((r) => new Set((r.rows as { id: string | null }[]).map((x) => x.id).filter(Boolean) as string[])).catch(() => new Set<string>()),
    db.execute(sql`select distinct on (a.batch_id) a.batch_id as batch, a.image_url as url from ads a join ad_batches b on b.id = a.batch_id where b.brand_id = ${brand.id} and a.image_url is not null and a.status in ('review', 'approved') order by a.batch_id, a.position`)
      .then((r) => new Map((r.rows as { batch: string; url: string }[]).map((x) => [x.batch, x.url]))).catch(() => new Map<string, string>()),
  ]);
  const { p, days } = planFor(d), approved = Boolean(d.saved?.approvedAt), n = (k: number, one: string) => `${k} ${one}${k === 1 ? "" : "s"}`;
  const fund = (signal: string | null) => (signal ? p.rows.find((r) => r.c.signal === signal) : undefined);
  const rows: LibRow[] = [];
  for (const c of meta) rows.push({ key: `m:${c.id}`, name: c.name, sub: c.objective ? c.objective.replace(/^OUTCOME_/, "").toLowerCase().replace(/^./, (x) => x.toUpperCase()) : "Meta campaign", thumb: null, where: "Meta",
    status: c.status === "ACTIVE" ? "live" : "paused", perDay: c.budget, spend: c.spend, back: c.spend > 0 ? c.verifiedRevenue / c.spend : null, next: { label: "See results", href: `${base}/performance` } });
  for (const b of batches) {
    const status: LibStatus | null = b.review > 0 ? "review" : b.approved > 0 ? (tested.has(b.id) ? "ready" : "test") : null;
    if (!status) continue;
    const f = fund(b.signal);
    rows.push({ key: `b:${b.id}`, name: b.title, sub: status === "review" ? `${n(b.review, "ad")} to review${b.approved ? ` · ${b.approved} approved` : ""}` : `${n(b.approved, "ad")} approved`, thumb: pics.get(b.id) ?? null, where: "Kaviar", status,
      perDay: f ? f.spend / days : null, spend: null, back: null,
      next: status === "review" ? { label: `Review ${b.review}`, href: `${base}/creative/${b.id}` } : status === "test" ? { label: "Test", href: `${base}/audience?batch=${b.id}` } : { label: "Put live", href: `${base}/run` } });
  }
  for (const r of p.rows) if (!batches.some((b) => b.signal && b.signal === r.c.signal))
    rows.push({ key: `p:${r.c.key}`, name: r.c.name, sub: r.c.product, thumb: d.products.find((x) => x.title === r.c.product)?.image ?? null, where: "Kaviar", status: "planned",
      perDay: r.spend / days, spend: null, back: null, next: approved ? { label: "Make the ads", make: r.c.key } : { label: "Approve plan", href: `${base}/plan` } });
  rows.sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || (b.spend ?? 0) - (a.spend ?? 0));
  return { rows, live: rows.filter((r) => r.status === "live").length, toReview: batches.reduce((k, b) => k + b.review, 0), drafts: rows.filter((r) => r.where === "Kaviar").length };
}
