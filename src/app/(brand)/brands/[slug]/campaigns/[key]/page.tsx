import { notFound } from "next/navigation";
import { getBrand } from "@/lib/queries/brands";
import { getPlans, planExtras } from "@/lib/growth/plans";
import { ago } from "@/lib/format";
import { Bar } from "@/components/shell/parts";
import { PlanView } from "./view";

export const metadata = { title: "Campaign" };
export const maxDuration = 300; // "Make the ads" has Remy write them while the brand waits on this page

/** One campaign, whole: why now, its budget and what should come back, its ads, its launch, its results and what Autopilot is doing — all here. */
export default async function PlanPage({ params }: PageProps<"/brands/[slug]/campaigns/[key]">) {
  const { slug, key } = await params;
  const brand = await getBrand(slug);
  const plans = await getPlans({ id: brand.id, currency: brand.currency ?? null, timezone: brand.timezone });
  const plan = plans.list.find((p) => p.key === decodeURIComponent(key));
  if (!plan) notFound();
  const x = await planExtras({ id: brand.id, timezone: brand.timezone }, plan);
  return (
    <>
      <Bar crumbs={[{ label: brand.name, href: `/brands/${slug}` }, { label: "Campaigns", href: `/brands/${slug}/campaigns` }, { label: plan.title }]} />
      <PlanView slug={slug} currency={plans.currency} plan={plan} input={plans.input} minBudget={plans.minBudget} level={plans.level}
        ads={x.ads} facts={x.facts} shop={plans.shop} results={x.results} brief={x.brief} productPhoto={x.productPhoto} unitPrice={plans.options.products.find((q) => q.title === plan.c.product)?.price ?? null} pilot={{ mode: x.pilot.mode, last: x.pilot.last ? ago(new Date(x.pilot.last)) : null, canAct: x.pilot.canAct, changes: x.pilot.changes }} />
    </>
  );
}
