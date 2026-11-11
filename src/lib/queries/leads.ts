import "server-only";
import { count, desc, eq } from "drizzle-orm";
import { db, schema } from "../db";
import { requireMember } from "../auth";

export async function listLeads() {
  await requireMember();
  return db.select().from(schema.leads).orderBy(desc(schema.leads.createdAt)).limit(200);
}

export async function newLeadCount() {
  const [{ n }] = await db.select({ n: count() }).from(schema.leads).where(eq(schema.leads.status, "new"));
  return n;
}
