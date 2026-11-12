import { env } from "@/lib/env";
import { loadDraft } from "../../load";
import { AnalysisStep } from "../../analysis-step";

export const metadata = { title: "New brand · Analysis" };
// Iris keeps working after the response (after()), so give the function room to finish.
export const maxDuration = 300;

export default async function AnalysisPage({ params }: PageProps<"/brands/new/[id]/analysis">) {
  const { id } = await params;
  const d = await loadDraft(id);
  return <AnalysisStep id={id} reached={Math.max(4, d.reached)} name={d.name} thumb={d.thumb} subs={d.subs} analysis={d.ob.analysis ?? null} hasProfile={Boolean(d.ob.profile)} aiReady={env.aiConfigured()} />;
}
