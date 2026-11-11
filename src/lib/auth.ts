import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { and, eq, gt, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { randomToken, sha256 } from "./crypto";

export const SESSION_COOKIE = "kv_session";
const SESSION_DAYS = 30;

export type Member = { id: string; name: string; email: string; role: string };

export async function createSession(memberId: string) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);
  await db.insert(schema.sessions).values({ id: sha256(token), memberId, expiresAt });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(schema.sessions).where(eq(schema.sessions.id, sha256(token)));
  jar.delete(SESSION_COOKIE);
}

/** The signed-in team member, or null. Deduped per request. */
export const getMember = cache(async (): Promise<Member | null> => {
  // Brand data is per-request: never prerender anything behind the session check.
  await connection();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const [row] = await db
    .select({ id: schema.members.id, name: schema.members.name, email: schema.members.email, role: schema.members.role })
    .from(schema.sessions)
    .innerJoin(schema.members, eq(schema.members.id, schema.sessions.memberId))
    .where(and(eq(schema.sessions.id, sha256(token)), gt(schema.sessions.expiresAt, sql`now()`)))
    .limit(1);
  return row ?? null;
});

/** Every page, action and route handler that touches brand data calls this first. */
export async function requireMember(): Promise<Member> {
  const m = await getMember();
  if (!m) redirect("/login");
  return m;
}
