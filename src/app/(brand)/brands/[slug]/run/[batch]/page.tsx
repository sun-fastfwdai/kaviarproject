import { notFound } from "next/navigation";
import { getBrand, getConnections } from "@/lib/queries/brands";
import { batchWithAds, brandCodes } from "@/lib/creative/remy";
import { Bar } from "@/components/shell/parts";
import { LoopStrip } from "@/components/loop-strip";
import { AgentFace } from "@/components/agent";
import { TestSetup } from "../setup";
import { metaAccess } from "@/lib/meta/apply";
import { getPlans, planAds, planMarket, productLink } from "@/lib/growth/plans";
import { metaReady } from "@/lib/meta/place";
import { countryFor } from "@/lib/meta/place-rules";
import { META_URL_PARAMS } from "@/lib/sync/attribution";
import { PlanSheet } from "../plan-sheet";

export const metadata = { title: "Run ads · New test" };

export const maxDuration = 120;

export default async function NewTestPage({ params }: PageProps<"/brands/[slug]/run/[batch]">) {
  const { slug, batch: id } = await params;
  const brand = await getBrand(slug);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await batchWithAds(id, brand.id);
  if (!data) notFound();
  const conns = await getConnections(brand.id);
  const base = `/brands/${slug}`;
  // A campaign's ads: the sheet is that campaign's own set-up — its budget, countries, link and tags, as Kaviar sends them to Meta —
  // not a new test with settings of its own.
  const plan = data.batch.signal ? (await getPlans({ id: brand.id, currency: brand.currency ?? null, timezone: brand.timezone }).catch(() => null))?.list.find((x) => x.key === data.batch.signal && x.ads?.batchId === id) ?? null : null;
  if (plan) {
    const country = plan.meta?.country ?? countryFor(await planMarket(brand.id), brand.currency);
    const [ads, link, ready] = await Promise.all([planAds(id).then((l) => l.filter((a) => a.status === "approved")), productLink(brand.id, plan.c.product), metaReady(brand.id, null, country).catch(() => null)]);
    const named = (list: { id: string; name: string }[] | undefined, want?: string) => list?.find((x) => x.id === want)?.name ?? (want ? null : list?.[0]?.name ?? null);
    return (
      <>
        <Bar crumbs={[{ label: brand.name, href: base }, { label: "Campaigns", href: `${base}/campaigns` }, { label: plan.title, href: `${base}/campaigns/${encodeURIComponent(plan.key)}` }, { label: "Set-up sheet" }]} />
        <div className="col g4" style={{ padding: "18px 24px 0" }}><h1 className="h1">Set-up sheet · {plan.title}</h1></div>
        <PlanSheet base={base} brand={brand.name} p={plan} ads={ads} link={link} tags={META_URL_PARAMS} page={named(ready?.pages, plan.meta?.page)} pixel={named(ready?.pixels, plan.meta?.pixel)} country={country} />
      </>
    );
  }
  const approved = data.ads.filter((a) => a.status === "approved");
  // The audience size is the first number in the signal's evidence (e.g. "Lapsed · 60–180 days: 2,986").
  const size = data.batch.evidence.map(([, v]) => Number(String(v).replace(/[^\d]/g, ""))).find((n) => n > 0) ?? null;
  const exclude = data.batch.evidence.find(([k]) => /last 30 days|exclude/i.test(k));

  return (
    <>
      <Bar crumbs={[{ label: brand.name, href: base }, { label: "Run ads", href: `${base}/run` }, { label: "New test" }]}>
        <LoopStrip base={base} brandId={brand.id} step="run" />
      </Bar>
      <div className="row between" style={{ padding: "18px 24px 4px", alignItems: "flex-end" }}>
        <div className="col g4"><h1 className="h1">New test · {data.batch.title}</h1><p className="sm i3">Approved creatives, a Shopify audience, a small budget, a clear rule</p></div>
        <span className="row g6 xs i3"><AgentFace kind="analyst" size={16} />Iris set this up from {data.batch.signal ? (data.batch.signal.startsWith("seg:") ? "a buyer group from market research" : `the ${data.batch.signal.replace(/-/g, " ")} signal`) : "your idea"}</span>
      </div>
      {approved.length === 0 ? (
        <div className="notice amber" style={{ margin: 24 }}><span>No approved ads in this batch yet. Approve at least two in Creative studio first.</span></div>
      ) : (
        <TestSetup brand={brand.name} currency={brand.currency} title={data.batch.title} audience={data.batch.audience} audienceSize={size}
          exclude={exclude ? `${exclude[0]} (${exclude[1]})` : null} ads={approved} codes={await brandCodes(brand.id)} site={brand.website ?? (conns.shopify?.externalId ? `https://${conns.shopify.externalId}` : null)}
          slug={slug} batchId={id} canAct={(await metaAccess(brand.id)).canAct}
          metaAccount={conns.meta?.status === "connected" ? conns.meta.externalId : null} />
      )}
    </>
  );
}
