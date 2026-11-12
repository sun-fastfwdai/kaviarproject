"use server";
import { redirect } from "next/navigation";
import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { hashPassword, sha256 } from "@/lib/crypto";
import { createSession } from "@/lib/auth";

export type SignupState = { error?: string; name?: string; email?: string; at?: number } | undefined;

const Signup = z.object({
  code: z.string().trim().min(8, "Enter your invite code"),
  name: z.string().trim().min(1, "Add your name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(10, "Use at least 10 characters"),
});

export async function signup(_: SignupState, form: FormData): Promise<SignupState> {
  const raw = Object.fromEntries(form);
  const keep = { name: String(raw.name ?? ""), email: String(raw.email ?? ""), at: Date.now() };
  const p = Signup.safeParse(raw);
  if (!p.success) return { ...keep, error: p.error.issues[0]?.message ?? "Check the form." };

  const [taken] = await db.select({ id: schema.members.id }).from(schema.members).where(eq(schema.members.email, p.data.email)).limit(1);
  if (taken) return { ...keep, error: "There’s already an account with this email. Sign in instead." };

  // Claim one use of the invite atomically, so a link can’t be used more times than allowed.
  const [invite] = await db
    .update(schema.invites)
    .set({ uses: sql`${schema.invites.uses} + 1` })
    .where(and(
      eq(schema.invites.codeHash, sha256(p.data.code)),
      isNull(schema.invites.revokedAt),
      gt(schema.invites.expiresAt, sql`now()`),
      lt(schema.invites.uses, schema.invites.maxUses),
    ))
    .returning({ role: schema.invites.role });
  if (!invite) return { ...keep, error: "This invite isn’t valid anymore. Ask an owner for a new link." };

  const [m] = await db
    .insert(schema.members)
    .values({ name: p.data.name, email: p.data.email, role: invite.role, passwordHash: await hashPassword(p.data.password) })
    .returning();
  await createSession(m.id);
  redirect("/brands");
}
