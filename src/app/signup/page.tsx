import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getMember } from "@/lib/auth";
import { sha256 } from "@/lib/crypto";
import { Wordmark } from "@/components/shell/parts";
import { AuthPanel } from "../login/panel";
import { SignupForm } from "./form";
import "../login/auth.css";

export const metadata = { title: "Create account" };

async function Form({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  if (await getMember()) redirect("/brands");
  const code = String((await searchParams).code ?? "").trim();
  let invite: { role: string; by: string | null } | null = null;
  if (code) {
    const [row] = await db
      .select({ role: schema.invites.role, uses: schema.invites.uses, maxUses: schema.invites.maxUses, by: schema.members.name })
      .from(schema.invites)
      .leftJoin(schema.members, eq(schema.members.id, schema.invites.createdBy))
      .where(and(eq(schema.invites.codeHash, sha256(code)), isNull(schema.invites.revokedAt), gt(schema.invites.expiresAt, sql`now()`)))
      .limit(1);
    if (row && row.uses < row.maxUses) invite = { role: row.role, by: row.by };
    else {
      return (
        <div className="col g16">
          <h1 className="h1">This invite has expired</h1>
          <p className="t i3">Invite links last 7 days and can be used a limited number of times. Ask an owner on the Kaviar team for a new one.</p>
          <Link href="/login" className="btn lg">Back to sign in</Link>
        </div>
      );
    }
  }
  return <SignupForm code={code} invite={invite} />;
}

export default function SignupPage({ searchParams }: PageProps<"/signup">) {
  return (
    <div className="auth">
      <div className="auth-left">
        <div className="row between">
          <Wordmark href="/" />
          <Link href="/" className="btn quiet sm">← Back to site</Link>
        </div>
        <div className="auth-form">
          <Suspense fallback={<div className="skel" style={{ height: 420 }} />}>
            <Form searchParams={searchParams} />
          </Suspense>
          <p className="xs i3">Accounts are for the Kaviar team. Brands never need one — we handle their store for them.</p>
        </div>
        <span className="xs i4">© 2026 Kaviar</span>
      </div>
      <AuthPanel />
    </div>
  );
}
