import Link from "next/link";
import { Icon, type IconName } from "./icon";
import { MetaLogo, ShopifyLogo, SourceTile } from "./logos";
import { AgentFace } from "./agent";

export function Stat({ label, value, note, source, tone }: { label: string; value: React.ReactNode; note?: React.ReactNode; source?: "shopify" | "meta" | "both"; tone?: "up" | "down" }) {
  return (
    <div className="stat">
      <span className="row g6 xs i3" style={{ whiteSpace: "nowrap" }}>
        {(source === "shopify" || source === "both") && <ShopifyLogo size={12} />}
        {(source === "meta" || source === "both") && <MetaLogo size={12} />}
        {label}
      </span>
      <span className="v">{value}</span>
      {note != null && <span className={`xs ell ${tone === "up" ? "c-green" : tone === "down" ? "c-amber" : "i3"}`}>{note}</span>}
    </div>
  );
}

export function StatStrip({ children }: { children: React.ReactNode[] }) {
  return (
    <div className="card" style={{ flexDirection: "row", alignItems: "stretch" }}>
      {children.flatMap((c, i) => (i ? [<div key={`v${i}`} className="vr" />, c] : [c]))}
    </div>
  );
}

export function RangeTabs({ base, days }: { base: string; days: number }) {
  return (
    <div className="seg" role="tablist" aria-label="Date range">
      {[7, 30, 90].map((d) => (
        <Link key={d} href={`${base}?days=${d}`} className={`o${d === days ? " on" : ""}`} role="tab" aria-selected={d === days} scroll={false}>
          {d} days
        </Link>
      ))}
    </div>
  );
}

export function Note({ icon, title, children, href, link = "See data", tone = "#121212" }: { icon: IconName; title: string; children: React.ReactNode; href?: string; link?: string; tone?: string }) {
  return (
    <div className="col g6" style={{ padding: "12px 14px", background: "#fff", border: "1px solid var(--line)", borderRadius: 12 }}>
      <div className="row g8"><Icon name={icon} size={14} color={tone} /><span className="sm w5 i1 fill">{title}</span></div>
      <span className="xs i2" style={{ lineHeight: "17px" }}>{children}</span>
      {href && <Link className="lnk xs i2 row g4" href={href}>{link}<Icon name="arrow-r" size={12} color="#55534F" /></Link>}
    </div>
  );
}

export function IrisHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="row g8">
      <AgentFace kind="analyst" size={24} mood="up" />
      <span className="sm w5">Iris</span>
      <span className="xs i3 ell">{children}</span>
    </div>
  );
}

export function SidePanel({ children }: { children: React.ReactNode }) {
  return (
    <aside className="col" style={{ width: 320, flexShrink: 0, borderLeft: "1px solid var(--line)", background: "var(--tray)", padding: "18px 16px", gap: 12, overflowY: "auto" }}>
      {children}
    </aside>
  );
}

const STATUS: Record<string, [string, string]> = {
  connected: ["green", "Connected"],
  needs_reauth: ["amber", "Reconnect needed"],
  choose_account: ["amber", "Choose an ad account"],
  disconnected: ["", "Disconnected"],
  sample: ["blue", "Sample data"],
};
export function ConnPill({ status }: { status: string | null | undefined }) {
  const [tone, label] = STATUS[status ?? ""] ?? ["", "Not connected"];
  return <span className={`pill ${tone}`}><span className={`dot ${tone}`} />{label}</span>;
}

export function NeedsSource({ slug, provider, what }: { slug: string; provider: "shopify" | "meta"; what: string }) {
  return (
    <div className="card col g12" style={{ padding: 36, alignItems: "center", textAlign: "center" }}>
      <SourceTile provider={provider} size={44} />
      <span className="h3">Connect {provider === "shopify" ? "Shopify" : "Meta Ads"} to see {what}</span>
      <p className="sm i3" style={{ maxWidth: 420 }}>
        Kaviar reads {provider === "shopify" ? "orders, products and customers" : "campaigns, ads and daily insights"} with read-only access and keeps them in sync.
      </p>
      <Link className="btn dark" href={`/brands/${slug}/integrations`}>Go to Integrations<Icon name="arrow-r" size={14} /></Link>
    </div>
  );
}

export function roasTone(v: number | null | undefined) {
  if (v == null || !isFinite(v)) return "i3";
  return v >= 2 ? "c-green" : v >= 1 ? "i1" : "c-amber";
}
