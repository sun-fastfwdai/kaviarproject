import { requireMember } from "@/lib/auth";
import { brandIndex, brandThumb, getBrand } from "@/lib/queries/brands";
import { BrandSwitcher } from "./brand-switcher";
import { SearchBox } from "./search";
import { searchItems } from "./search-items";
import { Icon } from "../icon";
import { NavLink } from "./nav-link";
import { MemberFoot, Wordmark } from "./parts";

export async function BrandSide({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const member = await requireMember();
  const brand = await getBrand(slug);
  const [thumb, all] = await Promise.all([brand.imageUrl ?? brandThumb(brand.id), brandIndex()]);
  const base = `/brands/${slug}`;
  return (
    <aside className="side">
      <Wordmark />
      <BrandSwitcher current={{ slug: brand.slug, name: brand.name, category: brand.category ?? (brand.isSample ? "Sample data" : null), thumb }} brands={all} />
      <SearchBox items={searchItems(all, brand)} />
      <nav className="nav">
        <NavLink href="/brands" exact muted icon={<Icon name="chev-l" />} label="All brands" />
        <div className="nav-h ell">{brand.name}</div>
        <NavLink href={base} exact icon={<Icon name="home" />} label="Overview" />
        <NavLink href={`${base}/integrations`} icon={<Icon name="plug" />} label="Integrations" />
        <div className="nav-h">Growth</div>
        <NavLink href={`${base}/signals`} icon={<Icon name="lightning" />} label="Ad signals" />
        <NavLink href={`${base}/creative`} icon={<Icon name="sparkle" />} label="Creative studio" />
        <NavLink href={`${base}/run`} icon={<Icon name="target" />} label="Run ads" />
        <NavLink href={`${base}/performance`} icon={<Icon name="chart-bar" />} label="Performance" />
        <div style={{ height: 1, background: "var(--line)", margin: "6px 8px" }} />
        <NavLink href={`${base}/meta`} icon={<Icon name="megaphone" />} label="Meta Ads" />
        <NavLink href={`${base}/shopify`} icon={<Icon name="bag" />} label="Shopify data" />
        <NavLink href={`${base}/sync`} icon={<Icon name="database" />} label="Data sync" />
        <div className="nav-h">Workspace</div>
        <NavLink href="/team" icon={<Icon name="users" />} label="Team" />
      </nav>
      <MemberFoot member={member} />
    </aside>
  );
}
