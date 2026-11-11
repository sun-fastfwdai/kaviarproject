import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { count } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getMember } from "@/lib/auth";
import { Wordmark } from "@/components/shell/parts";
import { LoginForm } from "./form";
import { AuthPanel } from "./panel";
import "./auth.css";

export const metadata = { title: "Sign in" };

async function Form() {
  await connection(); // first-run check must happen per request, never at build time
  if (await getMember()) redirect("/brands");
  const [{ n }] = await db.select({ n: count() }).from(schema.members);
  return <LoginForm firstRun={n === 0} />;
}

function FormSkeleton() {
  return (
    <div className="col g16">
      <div className="skel" style={{ width: 220, height: 32 }} /><div className="skel" style={{ width: 260, height: 14 }} />
      <div className="skel" style={{ height: 64 }} /><div className="skel" style={{ height: 64 }} /><div className="skel" style={{ height: 44 }} />
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="auth">
      <div className="auth-left">
        <div className="row between">
          <Wordmark href="/" />
          <Link href="/" className="btn quiet sm">← Back to site</Link>
        </div>
        <div className="auth-form">
          <Suspense fallback={<FormSkeleton />}>
            <Form />
          </Suspense>
          <p className="xs i3">For the Kaviar team. Brands never need an account — we handle their store for them.</p>
        </div>
        <span className="xs i4">© 2026 Kaviar</span>
      </div>
      <AuthPanel />
    </div>
  );
}
