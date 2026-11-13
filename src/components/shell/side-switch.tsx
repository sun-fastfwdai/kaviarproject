"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

/** Full-canvas tools (Store build/review, Shoots, Editor) collapse the sidebar to the icon rail, as on boards 05, 06, 17b, 17c. */
export function SideSwitch({ full, rail }: { full: React.ReactNode; rail: React.ReactNode }) {
  const path = usePathname();
  const step = useSearchParams().get("step");
  const canvas = /\/creative\/(shoots|editor)(\/|$)/.test(path) || (/\/store$/.test(path) && (step === "build" || step === "review"));
  return canvas ? rail : full;
}

/** One icon on the rail; white tile when it's the current page. */
export function RailLink({ href, label, children, match }: { href: string; label: string; children: React.ReactNode; match?: string }) {
  const path = usePathname();
  const step = useSearchParams().get("step");
  const [p, q] = href.split("?");
  const on = match ? path.startsWith(match) && (!q || q === `step=${step}`) : path === p;
  return (
    <Link href={href} title={label} aria-label={label} aria-current={on ? "page" : undefined} className={on ? "" : "hv-2"}
      style={{ color: on ? "#121212" : "#8B8883", width: 36, height: 36, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", ...(on ? { background: "#fff", boxShadow: "0 0 0 1px var(--line), 0 1px 2px rgba(18,18,18,.05)" } : {}) }}>
      {children}
    </Link>
  );
}
