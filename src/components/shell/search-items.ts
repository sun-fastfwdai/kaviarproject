import type { SearchItem } from "./search";

const PAGES: [string, string][] = [["Overview", ""], ["SEO & AI search", "/seo"], ["Brand assets", "/assets"], ["Integrations", "/integrations"], ["Today", "/today"], ["Opportunities", "/opportunities"], ["Spend plan", "/plan"], ["Creative studio", "/creative"], ["Audience test", "/audience"], ["Run ads", "/run"], ["Results", "/performance"], ["Meta Ads", "/meta"], ["Shopify data", "/shopify"], ["Data sync", "/sync"]];

export function searchItems(brands: { slug: string; name: string; category: string | null }[], current?: { slug: string; name: string; storeBuilder?: boolean }): SearchItem[] {
  const out: SearchItem[] = [];
  if (current) for (const [label, path] of [...PAGES, ...(current.storeBuilder ? [["Store builder", "/store"] as [string, string]] : [])]) out.push({ group: current.name, label, href: `/brands/${current.slug}${path}` });
  for (const b of brands) out.push({ group: "Brands", label: b.name, sub: b.category ?? undefined, href: `/brands/${b.slug}` });
  // Every brand's pages too, so “perf” finds “Jmella · Performance” from anywhere.
  for (const b of brands) if (b.slug !== current?.slug) for (const [label, path] of PAGES.slice(1)) out.push({ group: "Pages", label: `${b.name} · ${label}`, href: `/brands/${b.slug}${path}` });
  out.push({ group: "Workspace", label: "All brands", href: "/brands" }, { group: "Workspace", label: "Add a brand", href: "/brands/new" }, { group: "Workspace", label: "Leads", href: "/leads" }, { group: "Workspace", label: "Team", href: "/team" });
  return out;
}
