"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import type { SignalRow, Status } from "@/lib/signals/build";

const STATUS: Record<Status, [string, string]> = {
  "in-use": ["In use", "green"], ready: ["Ready", "blue"], "needs-data": ["Needs data", ""], "needs-app": ["Needs app access", "amber"],
};

export function StatusPill({ s }: { s: Status }) {
  const [t, tone] = STATUS[s];
  return <span className={`pill ${tone}`} style={{ height: 22, fontSize: 11.5 }}>{tone && <span className={`dot ${tone}`} />}{t}</span>;
}

/** Every row opens that signal's page; the "Where in Kaviar" chip jumps straight to the related screen. */
export function SignalsTable({ slug, rows }: { slug: string; rows: SignalRow[] }) {
  const router = useRouter();
  const href = (k: string) => `/brands/${slug}/signals/${k}`;
  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div className="tr hd dense" style={{ padding: "0 14px" }}>
        <div className="td" style={{ width: 100 }}>Group</div><div className="td fill">Shopify data · what it tells us</div>
        <div className="td" style={{ width: 200 }}>How ads use it</div><div className="td" style={{ width: 140 }}>Where in Kaviar</div><div className="td" style={{ width: 132 }}>Status</div>
      </div>
      {rows.map((s, i) => {
        const first = rows[i - 1]?.group !== s.group;
        const lastInGroup = rows[i + 1]?.group !== s.group;
        return (
          <div key={s.key} className="tr sig-row" role="link" tabIndex={0} onClick={() => router.push(href(s.key))} onKeyDown={(e) => { if (e.key === "Enter") router.push(href(s.key)); }}
            onMouseEnter={() => router.prefetch(href(s.key))}
            style={{ padding: "8px 14px", minHeight: 52, cursor: "pointer", borderBottom: lastInGroup ? "1px solid var(--line-2)" : undefined }}>
            <div className="td" style={{ width: 100 }}>{first && <span className="row g6 sm w5 i1"><Icon name={s.icon} size={14} />{s.group}</span>}</div>
            <div className="td fill"><div className="col" style={{ minWidth: 0 }}>
              <Link href={href(s.key)} className="sm w5 i1" onClick={(e) => e.stopPropagation()}>{s.data}</Link>
              <span className="xs i3" style={{ lineHeight: "16px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{s.value ?? "Not enough data yet"}</span>
            </div></div>
            <div className="td sm" style={{ width: 200, lineHeight: "17px" }}>{s.use}</div>
            <div className="td" style={{ width: 140 }} onClick={(e) => e.stopPropagation()}>
              <Link className="chip" style={{ height: 26, fontSize: 12, fontWeight: 400, ...(s.status === "needs-app" ? { borderColor: "#F1E1C4", color: "var(--amber)" } : {}) }} href={s.where[1]}>
                <Icon name={s.where[2]} size={12} />{s.where[0]}</Link>
            </div>
            <div className="td row between" style={{ width: 132 }}><StatusPill s={s.status} /><Icon name="chev-r" size={13} color="#B5B2AC" /></div>
          </div>
        );
      })}
    </div>
  );
}
