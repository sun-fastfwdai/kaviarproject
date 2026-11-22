import { getBrand, getConnections } from "@/lib/queries/brands";
import { getStock, stockAccess } from "@/lib/store/stock";
import { storeAccess } from "@/lib/seo/apply";
import { Bar } from "@/components/shell/parts";
import { NeedsSource } from "@/components/ui";
import { InventoryView } from "./view";

export const metadata = { title: "Inventory" };

/** Store · Inventory: when each product runs out at the pace it is selling, what to reorder and by when, and where stock is sitting. */
export default async function InventoryPage({ params, searchParams }: PageProps<"/brands/[slug]/inventory">) {
  const { slug } = await params, sp = await searchParams;
  const brand = await getBrand(slug), crumbs = [{ label: brand.name, href: `/brands/${slug}` }, { label: "Store" }, { label: "Inventory" }];
  const conns = await getConnections(brand.id);
  if (!conns.shopify) return (<><Bar crumbs={crumbs} /><div className="scroll" style={{ padding: 24 }}><NeedsSource slug={slug} provider="shopify" what="stock and what sells" /></div></>);
  const [stock, access, sa] = await Promise.all([getStock(brand.id, brand.timezone), storeAccess(brand.id), stockAccess(brand.id)]);
  const admin = access.connected && access.shop ? `https://admin.shopify.com/store/${access.shop.replace(".myshopify.com", "")}` : null;
  return (
    <>
      <Bar crumbs={crumbs} />
      <InventoryView slug={slug} brand={brand.name} currency={brand.currency ?? "USD"} stock={stock} admin={admin} canAdd={sa.canAdd}
        allow={access.connected && access.shop ? `/api/shopify/install?brand=${slug}&shop=${encodeURIComponent(access.shop)}&stock=1` : null} open={typeof sp.restock === "string" ? sp.restock : null} />
    </>
  );
}
