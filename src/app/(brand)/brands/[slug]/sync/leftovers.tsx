"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { clearLeftovers } from "./leftovers-actions";

/** Stored files with no record left — shown only when there are some, with the one button that removes them. */
export function Leftovers({ slug, count, size }: { slug: string; count: number; size: string }) {
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  if (!count && !msg) return null;
  return (
    <div className="row g12" style={{ padding: "12px 16px", borderRadius: 14, background: count ? "var(--amber-bg)" : "var(--green-bg)" }}>
      <Icon name={count ? "folder" : "check-circle"} size={16} color={count ? "#B7791F" : "#1F8A5B"} />
      <span className="sm fill">{msg ?? `${count.toLocaleString("en-US")} stored file${count === 1 ? "" : "s"} (${size}) no longer belong${count === 1 ? "s" : ""} to anything in Kaviar`}</span>
      {count > 0 && !msg && <button type="button" className="btn dark sm" disabled={busy} title="Permanent" onClick={() => start(async () => { const r = await clearLeftovers(slug); setMsg(r.error ?? `Removed ${r.removed} file${r.removed === 1 ? "" : "s"} from storage`); router.refresh(); })}>{busy ? <Icon name="spinner" size={12} className="spin" color="#fff" /> : null}Remove them</button>}
    </div>
  );
}
