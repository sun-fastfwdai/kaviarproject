import { redirect } from "next/navigation";

/** "Optimize & repeat" lives on the Results screen now, as Autopilot. Old links land there. */
export default async function OptimizePage({ params }: PageProps<"/brands/[slug]/optimize">) {
  const { slug } = await params;
  redirect(`/brands/${slug}/performance#autopilot`);
}
