import "server-only";
import { desc, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { getDraft } from "@/lib/onboarding/draft";
import type { Onboarding } from "@/lib/onboarding/types";

const SHORT: Record<string, string> = { "United States": "US", Canada: "CA", "United Kingdom": "UK", Australia: "AU", "South Korea": "KR", Japan: "JP", Singapore: "SG", "Hong Kong": "HK", Taiwan: "TW", Germany: "DE", France: "FR", India: "IN" };

/** Everything the onboarding frame needs for a draft: data, the rail's done-step summaries, and a thumbnail. */
export async function loadDraft(id: string) {
  await requireMember();
  const b = await getDraft(id);
  const ob: Onboarding = b.onboarding ?? {};
  const counts = (await db.execute(sql`select kind, count(*)::int as n from brand_assets where brand_id = ${id} group by kind`)).rows as { kind: string; n: number }[];
  const n = (k: string) => counts.find((c) => c.kind === k)?.n ?? 0;
  const [logo] = await db.select({ id: schema.brandAssets.id }).from(schema.brandAssets).where(sql`${schema.brandAssets.brandId} = ${id} and ${schema.brandAssets.kind} = 'logo' and ${schema.brandAssets.mime} <> 'image/svg+xml'`).orderBy(desc(schema.brandAssets.createdAt)).limit(1);
  const host = (u: string | null | undefined) => (u ? u.replace(/^https?:\/\//, "").split("/")[0] : null);
  const subs: (string | undefined)[] = [
    ob.source === "shopify" ? `Shopify · ${ob.shop ?? "store"}` : ob.source === "website" ? `Import · ${host(b.website) ?? "website"}` : `Kaviar AI · ${ob.chat?.recommendation?.title ?? "finding the path"}`,
    ob.basics ? [ob.basics.category.split("·")[0].trim() || null, ob.basics.markets.map((m) => SHORT[m] ?? m).join(", ") || null, ob.basics.currency].filter(Boolean).join(" · ") : undefined,
    counts.length ? [n("deck") ? "Deck" : null, n("logo") ? `${n("logo")} logo${n("logo") > 1 ? "s" : ""}` : null, n("imagery") ? `${n("imagery")} images` : null].filter(Boolean).join(", ") || "Assets added" : undefined,
    ob.analysis?.finishedAt ? `${ob.analysis.pagesDone} pages · ${ob.analysis.productCount} products` : undefined,
  ];
  const thumb = ob.scan?.image ?? (logo ? `/api/assets/${logo.id}` : null);
  const [conn] = await db.select().from(schema.connections).where(sql`${schema.connections.brandId} = ${id} and ${schema.connections.provider} = 'shopify' and ${schema.connections.status} = 'connected'`).limit(1);
  return { b, ob, subs, thumb, reached: b.onboardingStep ?? 1, name: b.name, shopConnected: conn ?? null };
}

export async function productCount(id: string) {
  const [r] = (await db.execute(sql`select count(*)::int as n from shop_products where brand_id = ${id}`)).rows as { n: number }[];
  return r?.n ?? 0;
}

