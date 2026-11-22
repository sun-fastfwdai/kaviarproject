import { getBrand } from "@/lib/queries/brands";
import { planData } from "@/lib/growth/plan-data";
import { Bar } from "@/components/shell/parts";
import { LoopStrip } from "@/components/loop-strip";
import { SpendPlan } from "./view";

export const metadata = { title: "Spend plan" };
export const maxDuration = 300; // "Make the ads" has Remy write a batch before Shoots opens

/** Growth · Spend plan: a budget, where it should go, and what should come back — worked out from the brand's own data. */
export default async function PlanPage({ params }: PageProps<"/brands/[slug]/plan">) {
  const { slug } = await params;
  const brand = await getBrand(slug);
  const data = await planData(brand.id, brand.currency ?? "USD");
  return (
    <>
      <Bar crumbs={[{ label: brand.name, href: `/brands/${slug}` }, { label: "Campaigns" }, { label: "Spend plan" }]}><LoopStrip base={`/brands/${slug}`} brandId={brand.id} step="plan" /></Bar>
      <SpendPlan slug={slug} data={data} />
    </>
  );
}
