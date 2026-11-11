"use server";
import { z } from "zod";
import { db, schema } from "@/lib/db";

export type LeadState = { ok?: boolean; error?: string; values?: Record<string, string> } | undefined;

const Lead = z.object({
  name: z.string().trim().min(1, "Add your name").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid work email").max(200),
  brand: z.string().trim().min(1, "Add your brand").max(100),
  storeUrl: z.string().trim().max(300).optional(),
  message: z.string().trim().max(2000).optional(),
});

export async function submitLead(_: LeadState, form: FormData): Promise<LeadState> {
  const values = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
  // Honeypot: real people never see this field.
  if (values.website) return { ok: true };
  const p = Lead.safeParse(values);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Check the form.", values };
  await db.insert(schema.leads).values({
    name: p.data.name, email: p.data.email, brand: p.data.brand,
    storeUrl: p.data.storeUrl || null, message: p.data.message || null,
  });
  return { ok: true };
}
