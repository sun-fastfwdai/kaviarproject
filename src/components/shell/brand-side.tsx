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
  // Five tabs. Today: the store's status and what is ready. Campaigns: every plan with its own steps, the ads running now, and the
  // budget. Store: its health and stock. Creative studio: one place — make ads, the ads made, the brand's own pictures. Market: reference.
  const ADS = ["campaigns", "opportunities", "signals", "plan", "audience", "run", "performance", "optimize", "meta"].map((p) => `${base}/${p}`);
  const STORE = ["seo", "inventory", "shopify"].map((p) => `${base}/${p}`);
  const STUDIO = ["creative", "assets"].map((p) => `${base}/${p}`);
  const MARKET = ["competitors", "research"].map((p) => `${base}/${p}`);
  const SET = ["integrations", "sync", "store", "launch"].map((p) => `${base}/${p}`);
  const railItems: [string, string, Parameters<typeof Icon>[0]["name"], string[]?][] = [
    [base, "Overview", "home"], [`${base}/today`, "Today", "lightning", [`${base}/today`]], [`${base}/campaigns`, "Campaigns", "megaphone", ADS], [`${base}/seo`, "Store", "store", STORE],
    [`${base}/creative`, "Creative studio", "palette", STUDIO],
    ...(builder ? [[`${base}/store?step=build`, "Store builder", "layers", [`${base}/store`]], [`${base}/store?step=review`, "Store preview", "eye", [`${base}/store`]]] as typeof railItems : []),
    [`${base}/competitors`, "Market", "globe", MARKET], [`${base}/integrations`, "Settings", "settings", SET.filter((p) => !p.endsWith("/store"))],
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
        <div className="nav-h ell">{brand.name}</div>
        {/* The page a brand opens on: it has its own item, so there is always a way back to it. */}
        <NavLink href={base} exact icon={<Icon name="home" />} label="Overview" />
        <NavLink href={`${base}/today`} icon={<Icon name="lightning" />} label="Today" />
        {/* A number always means "this many things are waiting for you" — never a step number. */}
        <NavGroup href={`${base}/campaigns`} match={ADS} icon={<Icon name="megaphone" />} label="Campaigns" count={wait.changes || undefined}>
          <NavLink href={`${base}/campaigns`} also={[`${base}/opportunities`, `${base}/signals`, `${base}/audience`, `${base}/run`]} label="All campaigns" />
          <NavLink href={`${base}/performance`} also={[`${base}/optimize`, `${base}/meta`]} label="Running ads" count={wait.changes || undefined} />
          <NavLink href={`${base}/plan`} label="Budget" />
        </NavGroup>
        <NavGroup href={`${base}/seo`} match={STORE} icon={<Icon name="store" />} label="Store" count={store?.open || undefined}>
          <NavLink href={`${base}/seo`} label="Health" count={store?.open || undefined} />
          <NavLink href={`${base}/inventory`} label="Inventory" />
          <NavLink href={`${base}/shopify`} label="Orders & products" />
        </NavGroup>
        <NavLink href={`${base}/creative`} also={[`${base}/assets`]} icon={<Icon name="palette" />} label="Creative studio" />
        <NavGroup href={`${base}/competitors`} match={MARKET} icon={<Icon name="globe" />} label="Market">
          <NavLink href={`${base}/competitors`} label="Competitors" />
          <NavLink href={`${base}/research`} label="Market research" />
        </NavGroup>
        <NavGroup href={`${base}/integrations`} match={SET} icon={<Icon name="settings" />} label="Settings">
          <NavLink href={`${base}/integrations`} label="Integrations" />
          {!member.brands && <NavLink href={`${base}/sync`} label="Data sync" />}
          {builder && <NavLink href={`${base}/store`} also={[`${base}/launch`]} label="Store builder" />}
        </NavGroup>
        <div className="nav-h">Workspace</div>
        <NavLink href="/team" icon={<Icon name="users" />} label={member.brands ? "Account" : "Team"} />
      </nav>
      <MemberFoot member={member} />
    </aside>
  )} />;
}
