"use client";
import { useActionState } from "react";
import { writeAdsFromIdea, type State } from "../actions";
import { Icon } from "@/components/icon";

/** Variations / Refresh / New hook ask Remy for a batch built on this live ad; Hold goes to Optimize. */
export function InsightActions({ slug, action, ad }: { slug: string; action: "Variations" | "Refresh" | "Hold" | "New hook"; ad: { name: string; campaign: string | null; roas: number; ctr: number } }) {
  const [state, run, pending] = useActionState<State, FormData>(writeAdsFromIdea.bind(null, slug), undefined);
  if (action === "Hold") return <a className="btn sm" href={`/brands/${slug}/optimize`}>Hold</a>;
  const idea = action === "Variations"
    ? `Variations of the live ad “${ad.name}” (${ad.campaign ?? "campaign"}), which returns ${ad.roas.toFixed(2)}× on real orders. Keep what works, try new hooks.`
    : `A fresh hook for the live ad “${ad.name}” (${ad.campaign ?? "campaign"}) — its CTR is ${(ad.ctr * 100).toFixed(2)}% and falling. Same offer and audience, new opening.`;
  return (
    <form action={run} title={state?.error}>
      <input type="hidden" name="idea" value={idea} /><input type="hidden" name="count" value="3" />
      <button className="btn sm" disabled={pending}>{pending ? <Icon name="spinner" size={12} className="spin" /> : <Icon name={action === "Variations" ? "layers" : "refresh"} size={12} />}{pending ? "Writing…" : action}</button>
    </form>
  );
}
