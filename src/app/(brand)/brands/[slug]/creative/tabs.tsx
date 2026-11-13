import Link from "next/link";
import { Icon, type IconName } from "@/components/icon";

export type CreativeTab = "plan" | "batches" | "editor" | "shoots" | "insights";
// The order the work happens in: plan what to make → shoot the visuals → design the ad → review the ads → learn what won (back to Plan).
const TABS: [CreativeTab, string, string, IconName][] = [
  ["plan", "Plan", "", "sparkle"], ["shoots", "Shoots", "/shoots", "image"], ["editor", "Editor", "/editor", "pen"], ["batches", "Ads", "?tab=ads", "squares"], ["insights", "Insights", "/insights", "chart-bar"],
];

/** Board 17's studio tabs, inline in the top bar. A count shows what needs a person (e.g. "8 to review"). */
export function StudioTabs({ base, on, counts = {} }: { base: string; on: CreativeTab; counts?: Partial<Record<CreativeTab, string>> }) {
  return (
    <nav className="tabs" style={{ border: 0, gap: 18, marginLeft: 8 }} aria-label="Creative studio">
      {TABS.map(([k, l, path, icon]) => (
        <Link key={k} href={`${base}/creative${path}`} className={`tab${on === k ? " on" : ""}`} style={{ height: 52, whiteSpace: "nowrap" }}>
          <Icon name={icon} size={14} color={on === k ? "#121212" : "#8B8883"} />{l}
          {counts[k] ? <span style={{ height: 18, padding: "0 6px", borderRadius: 99, fontSize: 10.5, fontWeight: 500, display: "inline-flex", alignItems: "center", ...(on === k ? { background: "var(--ink)", color: "#fff" } : { background: "var(--tray-2)", color: "var(--ink-2)" }) }}>{counts[k]}</span> : null}
        </Link>
      ))}
    </nav>
  );
}

/** The studio's one-row top bar: Brand › Growth › Creative studio · tabs · loop step (boards 17, 17a, 17b, 17d). */
export function StudioBar({ base, brand, on, counts, crumbs, children }: {
  base: string; brand: string; on: CreativeTab; counts?: Partial<Record<CreativeTab, string>>;
  crumbs?: { label: string; href?: string }[]; children?: React.ReactNode;
}) {
  const trail = crumbs ?? [{ label: brand, href: base }, { label: "Growth" }, { label: "Creative studio" }];
  return (
    <header className="bar" style={{ gap: 16 }}>
      <nav className="crumb" aria-label="Breadcrumb" style={{ whiteSpace: "nowrap" }}>
        {trail.map((c, i) => (
          <span key={i} className="row g6">
            {i > 0 && <Icon name="chev-r" size={12} color="#B5B2AC" />}
            {i === trail.length - 1 ? <b className="ell" style={{ maxWidth: 260 }}>{c.label}</b> : c.href ? <Link className="lnk" href={c.href}>{c.label}</Link> : <span>{c.label}</span>}
          </span>
        ))}
      </nav>
      <StudioTabs base={base} on={on} counts={counts} />
      <div className="fill" />
      {children}
    </header>
  );
}

/** Ads waiting for a person, for the Ads tab count. */
export function reviewCount(n: number): Partial<Record<CreativeTab, string>> {
  return n ? { batches: `${n} to review` } : {};
}
