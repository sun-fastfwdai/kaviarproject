import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getBrand } from "@/lib/queries/brands";
import { getCompete, rivalAds } from "@/lib/seo/bench";
import { compare } from "@/lib/seo/bench-rules";
import { adLibraryUrl, type AdsRead } from "@/lib/research/types";
import { ago } from "@/lib/format";
import { Bar } from "@/components/shell/parts";
import { CompetitorsView } from "./view";

export const metadata = { title: "Competitors" };
export const maxDuration = 300; // "Read again" opens every competitor's site, a few seconds apart

/**
 * Market · Competitors: the baseline. Where the brand stands against its competitors on what Kaviar can measure from outside — each
 * site read the same way — and what each runs on Meta. Reference only: the fixes are made in Store, the ads in Ads.
 */
export default async function CompetitorsPage({ params }: PageProps<"/brands/[slug]/competitors">) {
  const { slug } = await params;
  const brand = await getBrand(slug), R = schema.marketResearch;
  const [c, ads, own, read] = await Promise.all([
    getCompete(brand.id), rivalAds(brand.id),
    db.execute(sql`select count(*) filter (where effective_status = 'ACTIVE')::int as ads, count(*) filter (where effective_status = 'ACTIVE' and created_time >= now() - interval '30 days')::int as new30 from meta_ads where brand_id = ${brand.id}`)
      .then((r) => (r.rows as { ads: number; new30: number }[])[0] ?? { ads: 0, new30: 0 }),
    db.select({ adsRead: R.adsRead }).from(R).where(and(eq(R.brandId, brand.id), sql`${R.adsRead} is not null`)).orderBy(desc(R.updatedAt)).limit(1).then((r) => (r[0]?.adsRead as AdsRead | undefined) ?? null),
  ]);
  const cmp = c.bench ? compare(c.bench) : null, site = (x: { name: string; url: string; audit: unknown; note?: string }) => ({ name: x.name, url: x.url, read: Boolean(x.audit), note: x.note ?? null });
  const research = `/brands/${slug}/research?tab=ads${ads.subject != null ? `&product=${encodeURIComponent(ads.subject)}&market=${ads.market}` : ""}`;
  return (
    <>
      <Bar crumbs={[{ label: brand.name, href: `/brands/${slug}` }, { label: "Market" }, { label: "Competitors" }]} />
      <CompetitorsView slug={slug} brand={brand.name} own={c.own} rivals={c.rivals} checked={c.bench ? ago(new Date(c.bench.at)) : null}
        you={cmp?.you ? site(cmp.you) : null} sites={(cmp?.rivals ?? []).map(site)}
        rows={(cmp?.rows ?? []).map((r) => ({ ...r.m, you: r.s.you, each: r.each }))}
        ads={ads.rows.map((a) => ({ ...a, library: adLibraryUrl({ q: a.name, country: ads.market ?? "US" }) }))} ownAds={own} adsHref={research}
        angles={(read?.angles ?? []).slice(0, 5).map((a) => ({ name: a.name, share: Math.round(a.share), example: a.example }))} />
    </>
  );
}
