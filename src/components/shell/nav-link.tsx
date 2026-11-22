"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** Sidebar item; highlights itself from the URL so the sidebar can stay a server component. */
export function NavLink({
  href, icon, label, count, exact = false, muted = false, also = [],
}: { href: string; icon?: React.ReactNode; label: string; count?: React.ReactNode; exact?: boolean; muted?: boolean; also?: string[] }) {
  const path = usePathname();
  const on = exact ? path === href : [href, ...also].some((h) => path === h || path.startsWith(`${h}/`)); // "also": screens that belong to this step
  return (
    <Link href={href} className={on ? "ni on" : "ni"} style={muted ? { color: "var(--ink-3)" } : undefined} aria-current={on ? "page" : undefined}>
      {icon}
      {label}
      {count != null && <span className="ct">{count}</span>}
    </Link>
  );
}

/**
 * One of the few tabs in the sidebar. Its pages are listed under it only while one of them is open, so the sidebar stays short:
 * the tabs, plus the pages of the tab you are in.
 */
export function NavGroup({ href, icon, label, count, match, children }: { href: string; icon?: React.ReactNode; label: string; count?: React.ReactNode; match: string[]; children?: React.ReactNode }) {
  const path = usePathname();
  const open = match.some((h) => path === h || path.startsWith(`${h}/`));
  return (
    <>
      <Link href={href} className={open && !children ? "ni on" : "ni"} style={open ? { color: "var(--ink)", fontWeight: 500 } : undefined} aria-expanded={children ? open : undefined} aria-current={open && !children ? "page" : undefined}>
        {icon}
        {label}
        {count != null && !open && <span className="ct">{count}</span>}
      </Link>
      {open && children && <div className="nav-sub">{children}</div>}
    </>
  );
}
