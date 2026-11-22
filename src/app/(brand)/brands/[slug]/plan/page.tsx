import { getBrand } from "@/lib/queries/brands";
import { planData } from "@/lib/growth/plan-data";
import { getPlans } from "@/lib/growth/plans";
import { Bar } from "@/components/shell/parts";
import { Budget } from "./view";

export const metadata = { title: "Budget" };

/** Campaigns · Budget: the brand's ad money, campaign by campaign — what is approved, what it should bring back, and each budget changed in place. */
export default async function PlanPage({ params }: PageProps<"/brands/[slug]/plan">) {
  const { slug } = await params;
  const brand = await getBrand(slug), cur = brand.currency ?? "USD";
  const [plans, d] = await Promise.all([getPlans({ id: brand.id, currency: brand.currency ?? null, timezone: brand.timezone }), planData(brand.id, cur)]);
  const s = d.saved ?? {};
  return (
    <>
      <Bar crumbs={[{ label: brand.name, href: `/brands/${slug}` }, { label: "Campaigns", href: `/brands/${slug}/campaigns` }, { label: "Budget" }]} />
      <Budget slug={slug} currency={plans.currency} plans={plans.list} input={plans.input} level={plans.level} minBudget={plans.minBudget}
        figures={{ margin: plans.input.margin, marginFrom: d.margin.from, withCost: d.margin.withCost, variants: d.margin.variants, discount: plans.input.discount, goal: plans.input.goal, order: s.order ?? null,
          avg: d.orders.count >= 10 && d.orders.aov ? Math.round(d.orders.aov) : null, adDays: d.history?.days ?? 0 }} />
    </>
  );
}
