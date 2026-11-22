import { requireMember } from "@/lib/auth";
import { brandIndex, brandThumb, getBrand } from "@/lib/queries/brands";
import { BrandSwitcher } from "./brand-switcher";
import { SearchBox } from "./search";
import { searchItems } from "./search-items";
import { Icon } from "../icon";
import { NavGroup, NavLink } from "./nav-link";
import { waiting } from "@/lib/growth/flow";
import { storeWaiting } from "@/lib/seo/run";
import { BrandThumb, MemberFoot, Wordmark } from "./parts";
import { RailLink, SideSwitch } from "./side-switch";
import Link from "next/link";

export async function BrandSide({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const member = await requireMember();
  const brand = await getBrand(slug);
  const [thumb, all, wait, store] = await Promise.all([brand.imageUrl ?? brandThumb(brand.id), brandIndex(), waiting(brand.id).catch(() => ({ review: 0, changes: 0 })), storeWaiting(brand.id).catch(() => null)]);
  const builder = Boolean(brand.features?.storeBuilder); // switched on per brand by the Kaviar team, from the Brands list
  const base = `/brands/${slug}`;
  // Four tabs. Today: the store's status and everything to do. Ads and Store: where the brand acts. Market: the reference both are judged against.
  const ADS = ["opportunities", "signals", "plan", "creative", "audience", "run", "performance", "optimize", "meta"].map((p) => `${base}/${p}`);
  const STORE = ["seo", "shopify", "assets", "integrations", "store", "launch", "sync"].map((p) => `${base}/${p}`);
  const MARKET = ["competitors", "research"].map((p) => `${base}/${p}`);
  const railItems: [string, string, Parameters<typeof Icon>[0]["name"], string[]?][] = [
    [`${base}/today`, "Today", "lightning", [`${base}/today`]], [`${base}/opportunities`, "Ads", "megaphone", ADS], [`${base}/seo`, "Store", "store", STORE.filter((p) => !p.endsWith("/store"))],
    ...(builder ? [[`${base}/store?step=build`, "Store builder", "layers", [`${base}/store`]], [`${base}/store?step=review`, "Store preview", "eye", [`${base}/store`]]] as typeof railItems : []),
    [`${base}/competitors`, "Market", "globe", MARKET], [base, "Overview", "home"],
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
      <SearchBox items={searchItems(all, { slug: brand.slug, name: brand.name, storeBuilder: builder })} />
      <nav className="nav">
        {all.length > 1 && <NavLink href="/brands" exact muted icon={<Icon name="chev-l" />} label="All brands" />}
        <Link href={base} className="nav-h ell lnk" title={`${brand.name} · overview`}>{brand.name}</Link>
        <NavLink href={`${base}/today`} icon={<Icon name="lightning" />} label="Today" count={(wait.review + wait.changes + (store?.open ?? 0)) || undefined} />
        {/* A number always means "this many things are waiting for you" — never a step number. */}
        <NavGroup href={`${base}/opportunities`} match={ADS} icon={<Icon name="megaphone" />} label="Ads" count={(wait.review + wait.changes) || undefined}>
          <NavLink href={`${base}/opportunities`} also={[`${base}/signals`]} label="Opportunities" />
          <NavLink href={`${base}/plan`} label="Spend plan" />
          <NavLink href={`${base}/creative`} label="Creative studio" count={wait.review || undefined} />
          <NavLink href={`${base}/audience`} label="Audience test" />
          <NavLink href={`${base}/run`} label="Run ads" />
          <NavLink href={`${base}/performance`} also={[`${base}/optimize`]} label="Results" count={wait.changes || undefined} />
          <NavLink href={`${base}/meta`} label="Meta Ads data" />
        </NavGroup>
        <NavGroup href={`${base}/seo`} match={STORE} icon={<Icon name="store" />} label="Store" count={store?.open || undefined}>
          <NavLink href={`${base}/seo`} label="Health · SEO, AI, speed" count={store?.open || undefined} />
          <NavLink href={`${base}/shopify`} label="Orders & products" />
          <NavLink href={`${base}/assets`} label="Brand assets" />
          {builder && <NavLink href={`${base}/store`} also={[`${base}/launch`]} label="Store builder" />}
          <NavLink href={`${base}/integrations`} label="Integrations" />
          {!member.brands && <NavLink href={`${base}/sync`} label="Data sync" />}
        </NavGroup>
        <NavGroup href={`${base}/competitors`} match={MARKET} icon={<Icon name="globe" />} label="Market">
          <NavLink href={`${base}/competitors`} label="Competitors" />
          <NavLink href={`${base}/research`} label="Market research" />
        </NavGroup>
        <div className="nav-h">Workspace</div>
        <NavLink href="/team" icon={<Icon name="users" />} label={member.brands ? "Account" : "Team"} />
      </nav>
      <MemberFoot member={member} />
    </aside>
  )} />;
}
