import { env } from "@/lib/env";
import { loadDraft, productCount } from "../../load";
import { SourceStep } from "../../source-step";
import { ChatStep } from "../../chat";

export const metadata = { title: "New brand · Source" };
const DEFAULT_SCOPES = ["read_orders", "read_all_orders", "read_products", "read_inventory", "read_customers"];
const ERRORS: Record<string, string> = {
  state: "The Shopify approval expired or was opened in another browser. Try again.",
  hmac: "Shopify’s reply couldn’t be verified. Try again.",
  scopes: "The store didn’t grant every permission Kaviar needs. Approve all of them.",
  denied: "The store owner didn’t approve the Kaviar app.",
  token: "Shopify rejected the request. Try again in a minute.",
  shop: "That store didn’t match. Check the store domain.",
};

function slots(): string[] {
  const now = new Date();
  const out: string[] = [];
  if (now.getUTCHours() < 15) out.push("Today 4:30");
  const d = new Date(now);
  while (out.length < 3) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    const day = d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
    out.push(`${day} 10:00`);
    if (out.length < 3) out.push(`${day} 14:00`);
  }
  return out;
}

export default async function SourcePage({ params, searchParams }: PageProps<"/brands/new/[id]/source">) {
  const { id } = await params;
  const sp = await searchParams;
  const d = await loadDraft(id);
  const pick = typeof sp.pick === "string" ? sp.pick : null;
  if (d.ob.source === "ai" && !pick) {
    return <ChatStep id={id} name={d.name} reached={d.reached} ob={d.ob} slots={slots()} aiReady={env.aiConfigured()} />;
  }
  const c = d.shopConnected;
  const ready = env.shopifyConfigured();
  return (
    <SourceStep
      draft={{ id, name: d.name, website: d.b.website, shop: d.ob.shop ?? null, reached: d.reached }}
      scopes={ready ? env.shopify().scopes : DEFAULT_SCOPES} shopifyReady={ready}
      connected={c ? { name: c.displayName ?? c.externalId ?? "the store", shop: c.externalId ?? "", host: String((c.details as Record<string, unknown>).primaryHost ?? "") || null, products: await productCount(id), currency: String((c.details as Record<string, unknown>).currency ?? "") || null, at: c.connectedAt ? c.connectedAt.toISOString().slice(11, 16) : null } : null}
      error={typeof sp.error === "string" ? ERRORS[sp.error] ?? null : null}
      initial={pick === "shopify" || pick === "website" || pick === "ai" ? pick : d.ob.source === "ai" ? "ai" : d.ob.source ?? "shopify"}
    />
  );
}
