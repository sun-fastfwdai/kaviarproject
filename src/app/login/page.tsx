import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getMember } from "@/lib/auth";
import { count } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { Wordmark } from "@/components/shell/parts";
import { LoginForm } from "./form";

export const metadata = { title: "Sign in" };

async function Form() {
  await connection(); // first-run check must happen per request, never at build time
  if (await getMember()) redirect("/brands");
  const [{ n }] = await db.select({ n: count() }).from(schema.members);
  return <LoginForm firstRun={n === 0} />;
}

export default function LoginPage() {
  return (
    <div className="col center" style={{ minHeight: "100dvh", alignItems: "center", padding: 24 }}>
      <div className="col g20" style={{ width: 380 }}>
        <Wordmark href="/" />
        <div className="card" style={{ padding: 28, boxShadow: "0 1px 2px rgba(18,18,18,0.04), 0 12px 32px rgba(18,18,18,0.06)" }}>
          <Suspense fallback={<div className="skel" style={{ height: 260 }} />}>
            <Form />
          </Suspense>
        </div>
        <p className="xs i3" style={{ textAlign: "center" }}>Shopify and Meta data for every brand, in one place.</p>
      </div>
    </div>
  );
}
