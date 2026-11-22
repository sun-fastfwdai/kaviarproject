import { getBrand, getConnections } from "@/lib/queries/brands";
import { today } from "@/lib/growth/today";
import { library } from "@/lib/growth/campaigns";
import { Bar } from "@/components/shell/parts";
import { CampaignsView } from "./view";

export const metadata = { title: "Campaigns" };
export const maxDuration = 300; // "Make the ads" has Remy write a batch

/** Campaigns: what is live, what is waiting for the brand, and every campaign with its next step — all in one place. */
export default async function CampaignsPage({ params }: PageProps<"/brands/[slug]/campaigns">) {
  const { slug } = await params;
  const brand = await getBrand(slug), conns = await getConnections(brand.id);
  const [t, lib] = await Promise.all([
    today({ id: brand.id, currency: brand.currency ?? null, timezone: brand.timezone }, slug, conns),
    library({ id: brand.id, currency: brand.currency ?? null, timezone: brand.timezone }, slug),
  ]);
  const ADS = ["Review", "Test", "Launch", "Decide", "Create", "Improve"], mine = [...t.actions, ...t.later].filter((a) => ADS.includes(a.group));
  const money = t.status.filter((k) => ["Ad spend", "Back per $1", "Profit after ads"].includes(k.label));
  return (
    <>
      <Bar crumbs={[{ label: brand.name, href: `/brands/${slug}` }, { label: "Campaigns" }]} />
      <CampaignsView slug={slug} currency={brand.currency ?? "USD"} lib={lib} actions={mine.slice(0, 2)} more={Math.max(0, mine.length - 2)} tiles={money} hasMeta={Boolean(conns.meta)} />
    </>
  );
}
