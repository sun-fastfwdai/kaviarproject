import { getBrand, getConnections } from "@/lib/queries/brands";
import { requireMember } from "@/lib/auth";
import { after } from "next/server";
import { refreshNotes } from "@/lib/ai/notes";
import { today } from "@/lib/growth/today";
import { Bar } from "@/components/shell/parts";
import { TodayView } from "./view";

export const metadata = { title: "Today" };
export const maxDuration = 300; // "Make the ads" has Remy write a batch before Shoots opens

/** Growth · Today: the few decisions that need the brand, each with its reason and one button. Everything else is running. */
export default async function TodayPage({ params }: PageProps<"/brands/[slug]/today">) {
  const { slug } = await params;
  const [brand] = await Promise.all([getBrand(slug), requireMember()]);
  const conns = await getConnections(brand.id);
  // The date where the brand is: the page is titled by its day.
  const now = new Date(), tz = brand.timezone;
  const day = new Intl.DateTimeFormat("en-US", { weekday: "long", day: "numeric", month: "long", timeZone: tz }).format(now);
  after(() => refreshNotes(brand.id, ["overview"])); // Iris rewrites her one-line reading when the numbers have changed
  const t = await today({ id: brand.id, currency: brand.currency ?? null, timezone: brand.timezone }, slug, conns);
  return (
    <>
      <Bar crumbs={[{ label: brand.name, href: `/brands/${slug}` }, { label: "Today" }]} />
      <TodayView slug={slug} t={t} day={day} />
    </>
  );
}
