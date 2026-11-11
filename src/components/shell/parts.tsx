import Link from "next/link";
import { Icon } from "../icon";
import { signOut } from "@/app/login/actions";
import type { Member } from "@/lib/auth";

export function Wordmark({ href = "/brands" }: { href?: string }) {
  return (
    <Link href={href} className="wordmark">
      <div className="m">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 4v16M18 4 8 12l10 8" />
        </svg>
      </div>
      Kaviar
    </Link>
  );
}

const initials = (n: string) => n.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();

export function MemberFoot({ member }: { member: Member }) {
  return (
    <div className="side-foot">
      <div className="av l k">{initials(member.name)}</div>
      <div className="col fill">
        <span className="sm w5 i1 ell">{member.name}</span>
        <span className="xs i3 ell">{member.role === "owner" ? "Owner" : "Operations"}</span>
      </div>
      <form action={signOut}>
        <button className="btn quiet sm ic" title="Sign out" aria-label="Sign out">
          <Icon name="signout" size={15} color="#8B8883" />
        </button>
      </form>
    </div>
  );
}

export function BrandThumb({ name, imageUrl, size = 28 }: { name: string; imageUrl?: string | null; size?: number }) {
  if (imageUrl) {
    return (
      <div className="thumb" style={{ width: size, height: size, borderRadius: Math.round(size / 4) }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt="" />
      </div>
    );
  }
  return (
    <div
      className="thumb"
      style={{ width: size, height: size, borderRadius: Math.round(size / 4), display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.42, fontWeight: 600, color: "var(--ink-2)" }}
    >
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}

/** Top bar of the white sheet: breadcrumb on the left, actions on the right. */
export function Bar({ crumbs, children }: { crumbs: { label: string; href?: string }[]; children?: React.ReactNode }) {
  return (
    <header className="bar">
      <nav className="crumb" aria-label="Breadcrumb">
        {crumbs.map((c, i) => (
          <span key={i} className="row g6">
            {i > 0 && <Icon name="chev-r" size={12} color="#B5B2AC" />}
            {i === crumbs.length - 1 ? <b>{c.label}</b> : c.href ? <Link className="lnk" href={c.href}>{c.label}</Link> : <span>{c.label}</span>}
          </span>
        ))}
      </nav>
      <div className="fill" />
      {children}
    </header>
  );
}

export function SideSkeleton() {
  return (
    <aside className="side">
      <Wordmark />
      <div className="switcher boxed"><div className="skel" style={{ width: 28, height: 28 }} /><div className="skel" style={{ width: 110, height: 12 }} /></div>
      <div className="col g8" style={{ padding: "12px 8px" }}>
        {Array.from({ length: 8 }, (_, i) => <div key={i} className="skel" style={{ height: 14, width: `${60 + ((i * 17) % 35)}%` }} />)}
      </div>
    </aside>
  );
}
