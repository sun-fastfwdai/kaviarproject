import Link from "next/link";
import { Icon } from "@/components/icon";
import { StudioTabs, type CreativeTab } from "../tabs";

/** Board 17c header: Creative studio › Shoots › the shoot · studio tabs · what Shoots spent this month · the main action. */
export function ShootBar({ base, name, spend, counts, children }: { base: string; name: string; spend: number; counts?: Partial<Record<CreativeTab, string>>; children: React.ReactNode }) {
  return (
    <header className="bar" style={{ gap: 14, padding: "0 14px 0 18px" }}>
      <nav className="crumb" aria-label="Breadcrumb" style={{ whiteSpace: "nowrap", minWidth: 0 }}>
        <Link className="lnk" href={`${base}/creative`}>Creative studio</Link><Icon name="chev-r" size={12} color="#B5B2AC" />
        <Link className="lnk" href={`${base}/creative/shoots`}>Shoots</Link><Icon name="chev-r" size={12} color="#B5B2AC" />
        <b className="ell" style={{ maxWidth: 240 }} title={name}>{name}</b>
      </nav>
      <StudioTabs base={base} on="shoots" counts={counts} />
      <div className="fill" />
      <span className="xs i3 tnum" style={{ whiteSpace: "nowrap" }} title="Photos and clips made in Shoots this month, billed through AI Gateway">${spend.toFixed(2)} this month</span>
      {children}
    </header>
  );
}
