import { requireMember } from "@/lib/auth";
import { env } from "@/lib/env";
import { SourceStep } from "./source-step";

export const metadata = { title: "New brand" };
const DEFAULT_SCOPES = ["read_orders", "read_all_orders", "read_products", "read_inventory", "read_customers"];

export default async function NewBrandPage() {
  await requireMember();
  const ready = env.shopifyConfigured();
  return <SourceStep draft={null} scopes={ready ? env.shopify().scopes : DEFAULT_SCOPES} shopifyReady={ready} connected={null} initial="shopify" />;
}
