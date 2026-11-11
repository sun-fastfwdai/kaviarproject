"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** Sidebar item; highlights itself from the URL so the sidebar can stay a server component. */
export function NavLink({
  href, icon, label, count, exact = false, muted = false,
}: { href: string; icon?: React.ReactNode; label: string; count?: React.ReactNode; exact?: boolean; muted?: boolean }) {
  const path = usePathname();
  const on = exact ? path === href : path === href || path.startsWith(`${href}/`);
  return (
    <Link href={href} className={on ? "ni on" : "ni"} style={muted ? { color: "var(--ink-3)" } : undefined} aria-current={on ? "page" : undefined}>
      {icon}
      {label}
      {count != null && <span className="ct">{count}</span>}
    </Link>
  );
}
