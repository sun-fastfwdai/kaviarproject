import type { SearchItem } from "./search";

const PAGES: [string, string][] = [["Overview", ""], ["Today", "/today"],
  ["Ads · Opportunities", "/opportunities"], ["Ads · Spend plan", "/plan"], ["Ads · Creative studio", "/creative"], ["Ads · Audience test", "/audience"], ["Ads · Run ads", "/run"], ["Ads · Results", "/performance"], ["Ads · Meta Ads data", "/meta"],
  ["Store · Health: SEO, AI search, speed", "/seo"], ["Store · Orders & products", "/shopify"], ["Store · Brand assets", "/assets"], ["Store · Integrations", "/integrations"], ["Store · Data sync", "/sync"],
  ["Market · Competitors", "/competitors"], ["Market · Market research", "/research"]];

export function searchItems(brands: { slug: string; name: string; category: string | null }[], current?: { slug: string; name: string; storeBuilder?: boolean }): SearchItem[] {
  const out: SearchItem[] = [];
  if (current) for (const [label, path] of [...PAGES, ...(current.storeBuilder ? [["Store builder", "/store"] as [string, string]] : [])]) out.push({ group: current.name, label, href: `/brands/${current.slug}${path}` });
  for (const b of brands) out.push({ group: "Brands", label: b.name, sub: b.category ?? undefined, href: `/brands/${b.slug}` });
  // Every brand's pages too, so “perf” finds “Jmella · Performance” from anywhere.
  for (const b of brands) if (b.slug !== current?.slug) for (const [label, path] of PAGES.slice(1)) out.push({ group: "Pages", label: `${b.name} · ${label}`, href: `/brands/${b.slug}${path}` });
  out.push({ group: "Workspace", label: "All brands", href: "/brands" }, { group: "Workspace", label: "Add a brand", href: "/brands/new" }, { group: "Workspace", label: "Leads", href: "/leads" }, { group: "Workspace", label: "Team", href: "/team" });
  return out;
}
