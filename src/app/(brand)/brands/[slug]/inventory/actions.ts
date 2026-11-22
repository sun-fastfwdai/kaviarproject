"use server";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth";
import { getBrand } from "@/lib/queries/brands";
import { addStock, clearOrder, markOrdered, setLead, stockAccess, stockTarget, type StockTarget } from "@/lib/store/stock";

/** How many days a restock takes for this brand — every "reorder by" date is worked out from it. */
export async function saveLead(slug: string, days: number): Promise<void> {
  await requireMember();
  if (!Number.isFinite(days) || days < 1) return;
  await setLead((await getBrand(slug)).id, days);
  revalidatePath(`/brands/${slug}/inventory`);
  revalidatePath(`/brands/${slug}/today`);
}

const fresh = (slug: string) => { for (const p of ["inventory", "today", "campaigns"]) revalidatePath(`/brands/${slug}/${p}`); };

/** The brand has placed the order with its supplier. */
export async function orderPlaced(slug: string, productId: string, qty: number): Promise<void> {
  await requireMember();
  if (!Number.isFinite(qty) || qty < 1) return;
  await markOrdered((await getBrand(slug)).id, productId, qty);
  fresh(slug);
}
export async function orderCancelled(slug: string, productId: string): Promise<void> {
  await requireMember();
  await clearOrder((await getBrand(slug)).id, productId);
  fresh(slug);
}
/** Where Shopify counts this product, read fresh — so the brand sees today's count before adding to it. */
export async function stockWhere(slug: string, productId: string): Promise<StockTarget> {
  await requireMember();
  const a = await stockAccess((await getBrand(slug)).id);
  if (!a.connectionId) return { ok: false, why: "The Shopify store isn’t connected" };
  try { return await stockTarget(a.connectionId, productId); }
  catch (e) { console.error("stock target", (e as Error).message.slice(0, 200)); return { ok: false, why: "Shopify didn’t answer just now" }; }
}
/** The restock arrived: add the units to Shopify's count. */
export async function stockArrived(slug: string, productId: string, qty: number): Promise<{ ok: true; available: number } | { ok: false; error: string }> {
  await requireMember();
  try { const r = await addStock((await getBrand(slug)).id, productId, qty); fresh(slug); return r; }
  catch (e) { console.error("stock add", (e as Error).message.slice(0, 200)); return { ok: false, error: (e as Error).name === "ShopifyAuthError" ? "Shopify refused Kaviar’s access — reconnect the store" : "Shopify didn’t take the change — nothing was added" }; }
}
