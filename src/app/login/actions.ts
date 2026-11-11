"use server";
import { redirect } from "next/navigation";
import { count, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/crypto";
import { createSession, destroySession } from "@/lib/auth";

export type FormState = { error?: string; email?: string; name?: string; at?: number } | undefined;

const Login = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) });
const Setup = z.object({
  name: z.string().trim().min(1, "Add your name"),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(10, "Use at least 10 characters"),
});

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const p = Login.safeParse(Object.fromEntries(form));
  if (!p.success) return { at: Date.now(), error: "Enter your email and password.", email: String(form.get("email") ?? "") };
  const [m] = await db.select().from(schema.members).where(eq(schema.members.email, p.data.email)).limit(1);
  // Same message either way, so the form doesn't reveal which emails exist.
  if (!m || !(await verifyPassword(p.data.password, m.passwordHash))) return { at: Date.now(), error: "That email and password don’t match.", email: p.data.email };
  await createSession(m.id);
  redirect("/brands");
}

/** First run only: the first person to open Kaviar creates the owner account. */
export async function setupOwner(_: FormState, form: FormData): Promise<FormState> {
  const [{ n }] = await db.select({ n: count() }).from(schema.members);
  if (n > 0) return { at: Date.now(), error: "Kaviar is already set up. Sign in instead." };
  const p = Setup.safeParse(Object.fromEntries(form));
  if (!p.success) return { at: Date.now(), error: p.error.issues[0]?.message ?? "Check the form.", email: String(form.get("email") ?? ""), name: String(form.get("name") ?? "") };
  const [m] = await db
    .insert(schema.members)
    .values({ name: p.data.name, email: p.data.email, role: "owner", passwordHash: await hashPassword(p.data.password) })
    .returning();
  await createSession(m.id);
  redirect("/brands");
}

export async function signOut() {
  await destroySession();
  redirect("/login");
}
