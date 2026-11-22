import { getBrand, getConnections } from "@/lib/queries/brands";
import { getPlans } from "@/lib/growth/plans";
import { library } from "@/lib/growth/campaigns";
import { summary } from "@/lib/queries/growth";
import { pctDelta, type Tile } from "@/lib/growth/trend";
import { ago, money } from "@/lib/format";
import { getPilot } from "@/lib/growth/autopilot";
import { Bar } from "@/components/shell/parts";
import { CampaignsView } from "./view";

export const metadata = { title: "Campaigns" };

/** Campaigns: the plans Kaviar suggests — each with the reason behind it — the ones under way, and what is running on Meta. */
export default async function CampaignsPage({ params }: PageProps<"/brands/[slug]/campaigns">) {
  const { slug } = await params;
  const brand = await getBrand(slug), conns = await getConnections(brand.id), ref = { id: brand.id, currency: brand.currency ?? null, timezone: brand.timezone }, base = `/brands/${slug}`;
  const [plans, lib, s, pilot] = await Promise.all([getPlans(ref), library(ref, slug), summary(brand.id, brand.timezone, 30), getPilot(brand.id)]);
  const cur = brand.currency ?? "USD", meta = lib.rows.filter((r) => r.where === "Meta");
  const tiles: Tile[] = [
    { label: "Live campaigns", icon: "megaphone", value: String(lib.live), sub: "running on Meta now", href: `${base}/performance` },
    ...(s.spend > 0 ? [
      { label: "Ad spend", icon: "receipt", value: money(s.spend, cur), sub: "last 30 days", href: `${base}/performance` } as Tile,
      { label: "Back per $1", icon: "trend-up", value: `${(s.metaRevenue / s.spend).toFixed(2)}×`, sub: "Shopify sales from ads ÷ spend", href: `${base}/performance` } as Tile,
    ] : []),
  ];
  return (
    <>
      <Bar crumbs={[{ label: brand.name, href: base }, { label: "Campaigns" }]} />
      <CampaignsView slug={slug} currency={cur} plans={plans.list} meta={meta} tiles={tiles} loose={plans.loose} hasMeta={Boolean(conns.meta)} options={plans.options} minBudget={plans.minBudget}
        pilot={{ mode: pilot.mode, last: pilot.runs[0] ? ago(new Date(pilot.runs[0].at)) : null }}
        sales={{ value: money(plans.sales.cur, cur), delta: pctDelta(plans.sales.cur, plans.sales.prev) ?? null, target: plans.target, share: plans.target ? Math.round((plans.sales.cur / plans.target) * 100) : null }} />
    </>
  );
}
