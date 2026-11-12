import { loadDraft } from "../../load";
import { ReviewStep } from "../../review-step";

export const metadata = { title: "New brand · Review" };

export default async function ReviewPage({ params }: PageProps<"/brands/new/[id]/review">) {
  const { id } = await params;
  const d = await loadDraft(id);
  return <ReviewStep id={id} reached={Math.max(5, d.reached)} name={d.name} thumb={d.thumb} subs={d.subs} profile={d.ob.profile ?? {}} analysis={d.ob.analysis ?? null} />;
}
