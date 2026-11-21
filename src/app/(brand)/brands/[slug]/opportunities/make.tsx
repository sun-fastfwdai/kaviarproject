"use client";
import { useState, useTransition } from "react";
import { Icon } from "@/components/icon";
import { makeAds } from "../plan/actions";

/** One button: Remy writes the ads for this audience and the studio opens with them. */
export function MakeAds({ slug, k, primary }: { slug: string; k: string; primary?: boolean }) {
  const [busy, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="col g4" style={{ alignItems: "flex-end", flexShrink: 0 }}>
      <button type="button" className={`btn${primary ? " dark" : ""}`} disabled={busy} onClick={() => start(async () => { const r = await makeAds(slug, k); if (r?.error) setErr(r.error); })}>
        {busy ? <><Icon name="spinner" size={13} className="spin" color={primary ? "#fff" : undefined} />Remy is writing…</> : <>Make the ads<Icon name="arrow-r" size={12} color={primary ? "#fff" : undefined} /></>}
      </button>
      {err && <span className="xs c-amber" style={{ maxWidth: 220, textAlign: "right" }}>{err}</span>}
    </span>
  );
}
