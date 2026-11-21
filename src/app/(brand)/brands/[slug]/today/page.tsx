import { getBrand, getConnections } from "@/lib/queries/brands";
import { today } from "@/lib/growth/today";
import { Bar } from "@/components/shell/parts";
import { TodayView } from "./view";

export const metadata = { title: "Today" };
export const maxDuration = 300; // "Make the ads" has Remy write a batch before Shoots opens

/** Growth · Today: the few decisions that need the brand, each with its reason and one button. Everything else is running. */
export default async function TodayPage({ params }: PageProps<"/brands/[slug]/today">) {
  const { slug } = await params;
  const brand = await getBrand(slug);
  const conns = await getConnections(brand.id);
  const t = await today({ id: brand.id, currency: brand.currency ?? null }, slug, conns);
  return (
    <>
      <Bar crumbs={[{ label: brand.name, href: `/brands/${slug}` }, { label: "Growth" }, { label: "Today" }]} />
      <TodayView slug={slug} t={t} />
    </>
  );
}
