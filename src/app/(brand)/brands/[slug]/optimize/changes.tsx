"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { decide } from "./actions";
import { Icon, type IconName } from "@/components/icon";
import { AgentFace } from "@/components/agent";
import { WeeklyLoopArt } from "@/components/empty";

export type Change = { id: string; kind: string; title: string; why: string; before: string; after: string; status: string; target: { signal?: string; adId?: string; campaignId?: string } };
const KIND: Record<string, [string, IconName]> = { hold: ["Hold", "blocked"], shift: ["Shift", "repeat"], refresh: ["Refresh", "image"], pause: ["Pause", "blocked"], scale: ["Scale", "trend-up"], add: ["Add", "plus"] };

export function ChangeList({ slug, changes, week }: { slug: string; changes: Change[]; week: string }) {
  const router = useRouter();
  const open = changes.filter((c) => c.status === "proposed");
  const [sel, setSel] = useState<Set<string>>(new Set(open.filter((c) => c.kind !== "add" && c.kind !== "refresh").map((c) => c.id)));
  const [busy, start] = useTransition();
  const act = (ids: string[], status: "approved" | "skipped" | "applied" | "proposed") => start(async () => { await decide(slug, ids, status); setSel(new Set()); router.refresh(); });
  const approved = changes.filter((c) => c.status === "approved");
  const sheet = () => {
    const text = [`Kaviar · changes for week of ${week}`, "", ...approved.map((c, i) => `${i + 1}. ${c.title}\n   ${c.before} → ${c.after}\n   Why: ${c.why}`)].join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a"); a.href = url; a.download = `kaviar-changes-${week}.txt`; a.click(); URL.revokeObjectURL(url);
  };
  const base = `/brands/${slug}`;
  return (
    <>
      <div className="col g8">
        {changes.map((c) => {
          const [label, icon] = KIND[c.kind] ?? [c.kind, "info"];
          const on = sel.has(c.id);
          const done = c.status !== "proposed";
          return (
            <div key={c.id} className="row g12" style={{ padding: "12px 14px", background: "#fff", border: `1px solid ${on ? "var(--ink)" : "var(--line)"}`, borderRadius: 12, opacity: c.status === "skipped" ? 0.55 : 1 }}>
              <input type="checkbox" checked={on} disabled={done} onChange={() => { const n = new Set(sel); if (on) n.delete(c.id); else n.add(c.id); setSel(n); }} style={{ width: 16, height: 16, accentColor: "#121212" }} aria-label={`Select ${c.title}`} />
              <span style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name={icon} size={14} /></span>
              <div className="col g2 fill" style={{ minWidth: 0 }}>
                <span className="row g8"><span className="pill" style={{ height: 20, fontSize: 10.5 }}>{label}</span><span className="sm w5 i1">{c.title}</span></span>
                <span className="row g6 xs i2"><AgentFace kind={c.kind === "refresh" || c.kind === "add" ? "builder" : "analyst"} size={13} /><b className="w5 i1">Why:</b> {c.why}</span>
              </div>
              <div className="col" style={{ width: 210, flexShrink: 0 }}>
                <span className="xs i3" style={{ textDecoration: "line-through" }}>{c.before}</span>
                <span className="xs c-green">→ {c.after}</span>
              </div>
              <div className="row g6" style={{ width: 190, justifyContent: "flex-end", flexShrink: 0 }}>
                {c.status === "proposed" && c.kind === "refresh" && <Link className="btn sm" href={`${base}/creative`}>Review</Link>}
                {c.status === "proposed" && c.kind === "add" && c.target.signal && <Link className="btn sm" href={`${base}/signals/${c.target.signal}`}>Set up</Link>}
                {c.status === "proposed" && <button type="button" className="btn quiet sm" disabled={busy} onClick={() => act([c.id], "skipped")}>Skip</button>}
                {c.status === "approved" && <><span className="pill blue" style={{ height: 22, fontSize: 11 }}>Approved</span><button type="button" className="btn sm" disabled={busy} onClick={() => act([c.id], "applied")}>Done in Meta</button></>}
                {c.status === "applied" && <span className="pill green" style={{ height: 22, fontSize: 11 }}>Applied</span>}
                {c.status === "skipped" && <button type="button" className="btn quiet sm" disabled={busy} onClick={() => act([c.id], "proposed")}>Undo skip</button>}
              </div>
            </div>
          );
        })}
        {changes.length === 0 && (
          <div className="row g24" style={{ padding: 20, border: "1px dashed var(--line-2)", borderRadius: 14, background: "var(--tray)", alignItems: "center", flexWrap: "wrap" }}>
            <WeeklyLoopArt />
            <div className="col g6" style={{ maxWidth: 340 }}>
              <span className="sm w5">Nothing to change this week</span>
              <span className="xs i3" style={{ lineHeight: "17px" }}>No campaign is losing money on real orders, none is clearly ready to scale, no creative has been tiring for three weeks, and no product is about to sell out under ads. Kaviar looks again next Monday — or test a new idea now.</span>
              <span className="row g6"><Link className="btn sm" href={`${base}/creative`}><Icon name="sparkle" size={12} />Plan new creatives</Link><Link className="btn sm" href={`${base}/performance`}><Icon name="chart-bar" size={12} />Performance</Link></span>
            </div>
          </div>
        )}
      </div>
      <div className="row g10" style={{ position: "sticky", bottom: 0, padding: "12px 0", background: "var(--sheet)", borderTop: "1px solid var(--line)", marginTop: 8 }}>
        <span className="row g6 xs i3 fill"><Icon name="lock" size={12} />Until Meta ads_management is on, approved changes go out as a checklist you apply in Ads Manager.</span>
        <button type="button" className="btn sm" disabled={!approved.length} onClick={sheet}><Icon name="download" size={13} />Export checklist</button>
        <button type="button" className="btn dark sm" disabled={busy || !sel.size} onClick={() => act([...sel], "approved")}><Icon name="check" size={13} color="#fff" />Approve {sel.size || ""} change{sel.size === 1 ? "" : "s"}</button>
      </div>
    </>
  );
}
