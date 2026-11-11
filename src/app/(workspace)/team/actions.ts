"use server";
import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { hashPassword, randomToken, sha256, verifyPassword } from "@/lib/crypto";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth";

export type TeamState = { error?: string; created?: { name: string; email: string; password: string }; ok?: string; at?: number } | undefined;

const tempPassword = () => randomToken(12).replace(/[-_]/g, "x").slice(0, 14);

async function requireOwner() {
  const m = await requireMember();
  if (m.role !== "owner") throw new Error("Only owners can manage the team.");
  return m;
}

const Add = z.object({
  name: z.string().trim().min(1, "Add their name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  role: z.enum(["operator", "owner"]),
});

export async function addMember(_: TeamState, form: FormData): Promise<TeamState> {
  await requireOwner();
  const p = Add.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]?.message, at: Date.now() };
  const [exists] = await db.select({ id: schema.members.id }).from(schema.members).where(eq(schema.members.email, p.data.email)).limit(1);
  if (exists) return { error: "Someone with that email is already on the team.", at: Date.now() };
  const password = tempPassword();
  await db.insert(schema.members).values({ ...p.data, passwordHash: await hashPassword(password) });
  revalidatePath("/team");
  return { created: { name: p.data.name, email: p.data.email, password }, at: Date.now() };
}

/** New one-time password for a teammate; signs them out everywhere. */
export async function resetPassword(memberId: string): Promise<TeamState> {
  const me = await requireOwner();
  if (memberId === me.id) return { error: "Use “Change your password” for your own account.", at: Date.now() };
  const [m] = await db.select().from(schema.members).where(eq(schema.members.id, memberId)).limit(1);
  if (!m) return { error: "That teammate no longer exists.", at: Date.now() };
  const password = tempPassword();
  await db.update(schema.members).set({ passwordHash: await hashPassword(password) }).where(eq(schema.members.id, memberId));
  await db.delete(schema.sessions).where(eq(schema.sessions.memberId, memberId));
  return { created: { name: m.name, email: m.email, password }, at: Date.now() };
}

export async function removeMember(memberId: string) {
  const me = await requireOwner();
  if (memberId === me.id) return;
  await db.delete(schema.members).where(and(eq(schema.members.id, memberId), ne(schema.members.id, me.id)));
  revalidatePath("/team");
}

const Change = z.object({ current: z.string().min(1, "Enter your current password"), next: z.string().min(10, "Use at least 10 characters") });

export async function changePassword(_: TeamState, form: FormData): Promise<TeamState> {
  const me = await requireMember();
  const p = Change.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]?.message, at: Date.now() };
  const [m] = await db.select().from(schema.members).where(eq(schema.members.id, me.id)).limit(1);
  if (!m || !(await verifyPassword(p.data.current, m.passwordHash))) return { error: "Your current password doesn’t match.", at: Date.now() };
  await db.update(schema.members).set({ passwordHash: await hashPassword(p.data.next) }).where(eq(schema.members.id, me.id));
  // Sign out every other session; keep this one.
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  await db.delete(schema.sessions).where(and(eq(schema.sessions.memberId, me.id), ne(schema.sessions.id, token ? sha256(token) : "")));
  return { ok: "Password changed. Other devices were signed out.", at: Date.now() };
}
