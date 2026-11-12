"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/icon";

type Opt = [string, string];

function Pick({ label, icon, opts, value, onPick }: { label?: string; icon?: IconName; opts: Opt[]; value: string; onPick: (v: string) => void }) {
  return (
    <label className="chip" style={{ position: "relative", height: 34, cursor: "pointer" }}>
      {icon && <Icon name={icon} size={14} />}
      {label ? <>{label}<span className="v">· {opts.find(([v]) => v === value)?.[1] ?? "All"}</span></> : <span>{opts.find(([v]) => v === value)?.[1]}</span>}
      <Icon name="chev-d" size={12} />
      <select aria-label={label ?? "Date range"} value={value} onChange={(e) => onPick(e.target.value)}
        style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}>
        {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

/** Board 13 filter row: search, date range, source and status. Every change is a URL, so views can be shared. */
export function OrderFilters({ base, params, n, ranges, sources, statuses }: {
  base: string; params: Record<string, string>; n: number; ranges: Opt[]; sources: Opt[]; statuses: Opt[];
}) {
  const router = useRouter();
  const [q, setQ] = useState(params.q ?? "");
  const go = (patch: Record<string, string | null>) => {
    const u = new URLSearchParams({ ...params, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v != null)) as Record<string, string> });
    for (const [k, v] of Object.entries(patch)) if (v == null || v === "") u.delete(k);
    u.delete("page");
    router.push(`${base}?${u}`, { scroll: false });
  };
  return (
    <div className="row g8" style={{ flexWrap: "wrap" }}>
      <form className="input" style={{ width: 230, height: 34 }} onSubmit={(e) => { e.preventDefault(); go({ q: q.trim() || null }); }}>
        <Icon name="search" size={14} color="#8B8883" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search orders" aria-label="Search orders" style={{ border: 0, outline: 0, flex: 1, minWidth: 0, fontSize: 13 }} />
        {params.q && <button type="button" aria-label="Clear search" onClick={() => { setQ(""); go({ q: null }); }} style={{ display: "flex" }}><Icon name="x" size={12} /></button>}
      </form>
      <Pick icon="calendar" opts={ranges} value={params.days ?? "30"} onPick={(v) => go({ days: v === "30" ? null : v })} />
      <Pick label="Source" opts={sources} value={params.source ?? ""} onPick={(v) => go({ source: v || null })} />
      <Pick label="Status" opts={statuses} value={params.status ?? ""} onPick={(v) => go({ status: v || null })} />
      <span className="fill" />
      <span className="xs i3">{n.toLocaleString("en-US")} in range</span>
    </div>
  );
}
