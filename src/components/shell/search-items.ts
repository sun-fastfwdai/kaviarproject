import type { SearchItem } from "./search";

const PAGES: [string, string][] = [["Overview", ""], ["Store builder", "/store"], ["Integrations", "/integrations"], ["Ad signals", "/signals"], ["Creative studio", "/creative"], ["Run ads", "/run"], ["Performance", "/performance"], ["Optimize & repeat", "/optimize"], ["Meta Ads", "/meta"], ["Shopify data", "/shopify"], ["Data sync", "/sync"]];

export function searchItems(brands: { slug: string; name: string; category: string | null }[], current?: { slug: string; name: string }): SearchItem[] {
  const out: SearchItem[] = [];
  if (current) for (const [label, path] of PAGES) out.push({ group: current.name, label, href: `/brands/${current.slug}${path}` });
  for (const b of brands) out.push({ group: "Brands", label: b.name, sub: b.category ?? undefined, href: `/brands/${b.slug}` });
  // Every brand's pages too, so “perf” finds “Jmella · Performance” from anywhere.
  for (const b of brands) if (b.slug !== current?.slug) for (const [label, path] of PAGES.slice(1)) out.push({ group: "Pages", label: `${b.name} · ${label}`, href: `/brands/${b.slug}${path}` });
  out.push({ group: "Workspace", label: "All brands", href: "/brands" }, { group: "Workspace", label: "Add a brand", href: "/brands/new" }, { group: "Workspace", label: "Leads", href: "/leads" }, { group: "Workspace", label: "Team", href: "/team" });
  return out;
}
