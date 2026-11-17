import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "../db";

/** A brand's own latest finished card for each ad look it has shot — shown in the style picker in place of the illustration. */
export async function lookExamples(brandId: string): Promise<Record<string, string>> {
  const A = schema.brandAssets;
  const rows = await db.select({ id: A.id, look: sql<string | null>`${A.meta}->>'look'` }).from(A)
    .where(and(eq(A.brandId, brandId), eq(A.kind, "imagery"), sql`${A.meta}->>'edit' = 'card'`, sql`${A.meta}->>'look' is not null`))
    .orderBy(desc(A.createdAt)).limit(80).catch(() => []);
  const out: Record<string, string> = {};
  for (const r of rows) if (r.look && !out[r.look]) out[r.look] = `/api/assets/${r.id}?w=360`;
  return out;
}
