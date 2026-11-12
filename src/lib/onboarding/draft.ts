import "server-only";
import { notFound } from "next/navigation";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db, schema } from "../db";
import type { Onboarding } from "./types";

export type Draft = typeof schema.brands.$inferSelect;

/** A brand still being onboarded (onboarding_step is set). Live brands and removed ones 404 here. */
export async function getDraft(id: string): Promise<Draft> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [b] = await db.select().from(schema.brands)
    .where(and(eq(schema.brands.id, id), isNotNull(schema.brands.onboardingStep), isNull(schema.brands.deletedAt))).limit(1);
  if (!b) notFound();
  return b;
}

/** Merge a patch into brands.onboarding in one statement, so parallel jobs never overwrite each other's keys. */
export async function patchOnboarding(id: string, patch: Partial<Onboarding>, step?: number) {
  await db.update(schema.brands).set({
    onboarding: sql`${schema.brands.onboarding} || ${JSON.stringify(patch)}::jsonb`,
    ...(step ? { onboardingStep: sql`greatest(coalesce(${schema.brands.onboardingStep}, 1), ${step})` } : {}),
  }).where(eq(schema.brands.id, id));
}

export async function readOnboarding(id: string): Promise<Onboarding> {
  const [b] = await db.select({ o: schema.brands.onboarding }).from(schema.brands).where(eq(schema.brands.id, id));
  return b?.o ?? {};
}
