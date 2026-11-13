import Link from "next/link";
import { Icon } from "@/components/icon";

/** Board 17's Creative studio tabs. Editor, Shoots and Insights come later. */
export function CreativeTabs({ base, on, toReview }: { base: string; on: "plan" | "batches"; toReview?: number }) {
  return (
    <div className="row g4" style={{ padding: "0 24px", borderBottom: "1px solid var(--line)", height: 42, flexShrink: 0 }}>
      {([["plan", "Plan", `${base}/creative`, "lightning"], ["batches", "Ads", `${base}/creative?tab=ads`, "rows"]] as const).map(([k, l, href, icon]) => (
        <Link key={k} href={href} className="row g6 sm" style={{ height: 42, padding: "0 10px", borderBottom: on === k ? "2px solid var(--ink)" : "2px solid transparent", color: on === k ? "var(--ink)" : "var(--ink-3)", fontWeight: on === k ? 500 : 400 }}>
          <Icon name={icon} size={14} />{l}{k === "batches" && toReview ? <span className="pill" style={{ height: 18, fontSize: 10.5, background: "var(--ink)", color: "#fff", borderColor: "var(--ink)" }}>{toReview} to review</span> : null}
        </Link>
      ))}
    </div>
  );
}
