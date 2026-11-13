"use client";
import { useActionState } from "react";
import { writeAdsFromIdea, writeAdsFromSignal, type State } from "./actions";
import { Icon } from "@/components/icon";

export function BuildPlanButton({ slug, signal, count, dark }: { slug: string; signal: string; count: number; dark?: boolean }) {
  const [state, action, pending] = useActionState<State, FormData>(writeAdsFromSignal.bind(null, slug, signal), undefined);
  return (
    <form action={action} className="col g4">
      <input type="hidden" name="count" value={count} />
      <button className={`btn sm${dark ? " dark" : ""}`} disabled={pending}>
        {pending ? <Icon name="spinner" size={13} className="spin" color={dark ? "#fff" : undefined} /> : <Icon name="sparkle" size={13} color={dark ? "#fff" : undefined} />}
        {pending ? "Remy is writing…" : `Build ${count} ads`}</button>
      {state?.error && <span className="xs c-amber">{state.error}</span>}
    </form>
  );
}

export function IdeaForm({ slug, placeholder }: { slug: string; placeholder: string }) {
  const [state, action, pending] = useActionState<State, FormData>(writeAdsFromIdea.bind(null, slug), undefined);
  return (
    <form action={action} className="col g10" style={{ padding: 14, background: "#fff", border: "1px solid var(--line)", borderRadius: 12 }}>
      <span className="row g6 xs i3"><Icon name="pencil" size={12} />Or start your own batch from an idea</span>
      <textarea name="idea" rows={2} placeholder={placeholder} required minLength={8}
        style={{ border: 0, outline: 0, resize: "none", font: "inherit", fontSize: 15, lineHeight: "22px", width: "100%" }} />
      <div className="row g8">
        <label className="chip" style={{ height: 30 }}><span className="i3">Ads</span>
          <select name="count" defaultValue="6" style={{ border: 0, outline: 0, background: "transparent", font: "inherit" }}>{[3, 6, 9].map((n) => <option key={n}>{n}</option>)}</select></label>
        <span className="fill xs i3">{pending ? "Usually 20–40 seconds." : "Remy builds the batch on the brand’s real products."}</span>
        <button className="btn dark sm" disabled={pending}>{pending ? <Icon name="spinner" size={13} className="spin" color="#fff" /> : <Icon name="sparkle" size={13} color="#fff" />}{pending ? "Building…" : "Build ads"}</button>
      </div>
      {state?.error && <span className="xs c-amber">{state.error}</span>}
    </form>
  );
}
