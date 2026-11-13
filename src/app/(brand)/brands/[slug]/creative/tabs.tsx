import Link from "next/link";
import { Icon, type IconName } from "@/components/icon";

export type CreativeTab = "plan" | "batches" | "editor" | "shoots" | "insights";
const TABS: [CreativeTab, string, string, IconName][] = [
  ["plan", "Plan", "", "lightning"], ["batches", "Ads", "?tab=ads", "rows"], ["editor", "Editor", "/editor", "pencil"], ["shoots", "Shoots", "/shoots", "image"], ["insights", "Insights", "/insights", "chart-bar"],
];

/** Board 17's Creative studio tabs. */
export function CreativeTabs({ base, on, toReview }: { base: string; on: CreativeTab; toReview?: number }) {
  return (
    <div className="row g4" style={{ padding: "0 24px", borderBottom: "1px solid var(--line)", height: 42, flexShrink: 0 }}>
      {TABS.map(([k, l, path, icon]) => (
        <Link key={k} href={`${base}/creative${path}`} className="row g6 sm" style={{ height: 42, padding: "0 10px", borderBottom: on === k ? "2px solid var(--ink)" : "2px solid transparent", color: on === k ? "var(--ink)" : "var(--ink-3)", fontWeight: on === k ? 500 : 400 }}>
          <Icon name={icon} size={14} />{l}{k === "batches" && toReview ? <span className="pill" style={{ height: 18, fontSize: 10.5, background: "var(--ink)", color: "#fff", borderColor: "var(--ink)" }}>{toReview} to review</span> : null}
        </Link>
      ))}
    </div>
  );
}
