"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireMember } from "@/lib/auth";

export async function setLeadStatus(id: string, status: "new" | "contacted" | "closed") {
  await requireMember();
  await db.update(schema.leads).set({ status }).where(eq(schema.leads.id, id));
  revalidatePath("/leads");
}
