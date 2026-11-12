import { redirect } from "next/navigation";
import { getDraft } from "@/lib/onboarding/draft";
import { requireMember } from "@/lib/auth";
import { STEP_PATHS } from "@/lib/onboarding/types";

/** Resume a draft at the furthest step it reached. */
export default async function ResumeDraft({ params }: PageProps<"/brands/new/[id]">) {
  await requireMember();
  const { id } = await params;
  const b = await getDraft(id);
  redirect(`/brands/new/${id}/${STEP_PATHS[Math.min(5, Math.max(1, b.onboardingStep ?? 1)) - 1]}`);
}
