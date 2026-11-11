import { requireMember } from "@/lib/auth";
import { env } from "@/lib/env";
import { NewBrandFlow } from "./flow";

export const metadata = { title: "New brand" };

export default async function NewBrandPage() {
  await requireMember();
  return <NewBrandFlow shopifyReady={env.shopifyConfigured()} scopes={env.shopifyConfigured() ? env.shopify().scopes : ["read_orders", "read_all_orders", "read_products", "read_inventory", "read_customers"]} />;
}
