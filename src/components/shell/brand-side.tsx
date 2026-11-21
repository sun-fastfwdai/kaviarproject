import { requireMember } from "@/lib/auth";
import { brandIndex, brandThumb, getBrand } from "@/lib/queries/brands";
import { BrandSwitcher } from "./brand-switcher";
import { SearchBox } from "./search";
import { searchItems } from "./search-items";
import { Icon } from "../icon";
import { NavLink } from "./nav-link";
import { BrandThumb, MemberFoot, Wordmark } from "./parts";
import { RailLink, SideSwitch } from "./side-switch";
import Link from "next/link";

export async function BrandSide({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const member = await requireMember();
  const brand = await getBrand(slug);
  const [thumb, all] = await Promise.all([brand.imageUrl ?? brandThumb(brand.id), brandIndex()]);
  const base = `/brands/${slug}`;
  const railItems: [string, string, Parameters<typeof Icon>[0]["name"], string?][] = [
    [base, "Overview", "home"], [`${base}/store?step=build`, "Store builder", "layers", `${base}/store`], [`${base}/store?step=review`, "Store preview", "eye", `${base}/store`],
    [`${base}/assets`, "Brand assets", "image", `${base}/assets`], [`${base}/integrations`, "Integrations", "plug"], [`${base}/today`, "Today", "lightning", `${base}/today`], [`${base}/opportunities`, "Opportunities", "globe", `${base}/opportunities`], [`${base}/plan`, "Spend plan", "chart-bar", `${base}/plan`], [`${base}/creative`, "Creative studio", "image", `${base}/creative`], [`${base}/audience`, "Audience test", "users-three", `${base}/audience`],
    [`${base}/run`, "Run ads", "target", `${base}/run`], [`${base}/performance`, "Results", "chart-bar", `${base}/performance`],
  ];
  const rail = (
    <aside className="col" style={{ width: 60, flexShrink: 0, alignItems: "center", padding: "14px 0 12px", gap: 12 }} aria-label="Navigation">
      <Link href="/brands" className="wordmark" style={{ padding: 0 }} title="All brands" aria-label="All brands">
        <div className="m" style={{ width: 22, height: 22, borderRadius: 6 }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4v16M18 4 8 12l10 8" /></svg>
        </div>
      </Link>
      <Link href={base} title={brand.name} style={{ marginTop: 4 }}><BrandThumb name={brand.name} imageUrl={thumb} size={30} /></Link>
      <div className="hr" style={{ width: 24, alignSelf: "center" }} />
      <div className="col g4" style={{ alignItems: "center" }}>
        {railItems.map(([href, label, icon, match], i) => (
          <RailLink key={i} href={href} label={label} match={match}><Icon name={icon} size={17} /></RailLink>
        ))}
      </div>
      <div style={{ marginTop: "auto" }} className="av l k" title={member.name}>{member.name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase()}</div>
    </aside>
  );
  return <SideSwitch rail={rail} full={(
    <aside className="side">
      <Wordmark />
      <BrandSwitcher current={{ slug: brand.slug, name: brand.name, category: brand.category ?? (brand.isSample ? "Sample data" : null), thumb }} brands={all} />
      <SearchBox items={searchItems(all, brand)} />
      <nav className="nav">
        <NavLink href="/brands" exact muted icon={<Icon name="chev-l" />} label="All brands" />
        <div className="nav-h ell">{brand.name}</div>
        <NavLink href={base} exact icon={<Icon name="home" />} label="Overview" />
        <NavLink href={`${base}/store`} icon={<Icon name="store" />} label="Store builder" />
        <NavLink href={`${base}/assets`} icon={<Icon name="image" />} label="Brand assets" />
        <NavLink href={`${base}/integrations`} icon={<Icon name="plug" />} label="Integrations" />
        <div className="nav-h">Growth</div>
        <NavLink href={`${base}/today`} icon={<Icon name="lightning" />} label="Today" />
        {/* The six steps, numbered: the order is the product. Research and signals live inside Opportunities; Optimize inside Results. */}
        {([["opportunities", "Opportunities", ["research", "signals"]], ["plan", "Spend plan", []], ["creative", "Creative studio", []], ["audience", "Audience test", []], ["run", "Run ads", []], ["performance", "Results", ["optimize"]]] as [string, string, string[]][]).map(([path, label, also], i) => (
          <NavLink key={path} href={`${base}/${path}`} also={also.map((x) => `${base}/${x}`)} label={label}
            icon={<span key="n" aria-hidden style={{ width: 18, height: 18, borderRadius: 99, boxShadow: "inset 0 0 0 1.2px currentColor", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10.5, fontWeight: 600, opacity: 0.75 }}>{i + 1}</span>} />
        ))}
        <div style={{ height: 1, background: "var(--line)", margin: "6px 8px" }} />
        <NavLink href={`${base}/meta`} icon={<Icon name="megaphone" />} label="Meta Ads" />
        <NavLink href={`${base}/shopify`} icon={<Icon name="bag" />} label="Shopify data" />
        <NavLink href={`${base}/sync`} icon={<Icon name="database" />} label="Data sync" />
        <div className="nav-h">Workspace</div>
        <NavLink href="/team" icon={<Icon name="users" />} label="Team" />
      </nav>
      <MemberFoot member={member} />
    </aside>
  )} />;
}
