"use client";
import { useActionState } from "react";
import { writeAdsFromSignal, type State } from "../../creative/actions";
import { Icon } from "@/components/icon";

/** "Write the ads": Remy writes a batch from this signal and it opens in Creative studio. */
export function WriteAdsForm({ slug, signal, disabled }: { slug: string; signal: string; disabled?: boolean }) {
  const [state, action, pending] = useActionState<State, FormData>(writeAdsFromSignal.bind(null, slug, signal), undefined);
  return (
    <form action={action} className="col g8">
      <div className="row g8">
        <label className="chip" style={{ height: 34, position: "relative" }}>
          <span className="i3">Ads</span>
          <select name="count" defaultValue="6" style={{ border: 0, outline: 0, background: "transparent", font: "inherit" }} aria-label="How many ads">
            {[3, 6, 9].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <button className="btn dark" disabled={pending || disabled} style={{ height: 34 }}>
          {pending ? <Icon name="spinner" size={14} className="spin" color="#fff" /> : <Icon name="sparkle" size={14} color="#fff" />}
          {pending ? "Remy is writing the ads…" : "Write the ads"}
        </button>
      </div>
      {pending && <span className="xs i3">Usually 20–40 seconds. They open in Creative studio for review.</span>}
      {state?.error && <div key={state.at} className="notice red" role="alert">{state.error}</div>}
    </form>
  );
}
