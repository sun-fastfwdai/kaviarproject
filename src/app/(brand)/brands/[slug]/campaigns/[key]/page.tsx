import { notFound } from "next/navigation";
import { getBrand } from "@/lib/queries/brands";
import { getPlans } from "@/lib/growth/plans";
import { Bar } from "@/components/shell/parts";
import { PlanView } from "./view";

export const metadata = { title: "Plan" };
export const maxDuration = 300; // "Make the ads" has Remy write them before Shoots opens

/** One plan: why now, what it costs and should bring back, and its own six steps — each done from here. */
export default async function PlanPage({ params }: PageProps<"/brands/[slug]/campaigns/[key]">) {
  const { slug, key } = await params;
  const brand = await getBrand(slug);
  const plans = await getPlans({ id: brand.id, currency: brand.currency ?? null, timezone: brand.timezone });
  const plan = plans.list.find((p) => p.key === decodeURIComponent(key));
  if (!plan) notFound();
  return (
    <>
      <Bar crumbs={[{ label: brand.name, href: `/brands/${slug}` }, { label: "Campaigns", href: `/brands/${slug}/campaigns` }, { label: plan.title }]} />
      <PlanView slug={slug} currency={plans.currency} plan={plan} input={plans.input} minBudget={plans.minBudget} level={plans.level} />
    </>
  );
}
