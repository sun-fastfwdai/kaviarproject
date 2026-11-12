import { requireMember } from "@/lib/auth";
import { brandIndex, listBrands } from "@/lib/queries/brands";
import { SearchBox } from "./search";
import { searchItems } from "./search-items";
import { newLeadCount } from "@/lib/queries/leads";
import { Icon } from "../icon";
import { NavLink } from "./nav-link";
import { BrandThumb, MemberFoot, Wordmark } from "./parts";

export async function WorkspaceSide() {
  const member = await requireMember();
  const [brands, leads, index] = await Promise.all([listBrands(), newLeadCount(), brandIndex()]);
  return (
    <aside className="side">
      <Wordmark />
      <div className="switcher boxed">
        <div className="av l" style={{ borderRadius: 7, background: "var(--ink)" }}>K</div>
        <div className="col fill">
          <span className="nm">Operations</span>
          <span className="sb">{brands.length} brand{brands.length === 1 ? "" : "s"}</span>
        </div>
      </div>
      <SearchBox items={searchItems(index)} />
      <nav className="nav">
        <NavLink href="/brands" exact icon={<Icon name="store" />} label="Brands" count={brands.length} />
        {brands.length > 0 && <div className="nav-h">Brands</div>}
        {brands.slice(0, 8).map((b) => (
          <NavLink
            key={b.id}
            href={`/brands/${b.slug}`}
            icon={<BrandThumb name={b.name} imageUrl={b.thumb} size={18} />}
            label={b.name}
            count={<span className={`dot ${b.syncing ? "blue" : b.shopStatus === "connected" ? "green" : b.lastError ? "amber" : ""}`} style={{ display: "inline-block" }} />}
          />
        ))}
        <div className="nav-h">Workspace</div>
        <NavLink href="/leads" icon={<Icon name="receipt" />} label="Leads" count={leads || undefined} />
        <NavLink href="/team" icon={<Icon name="users" />} label="Team" />
      </nav>
      <MemberFoot member={member} />
    </aside>
  );
}
