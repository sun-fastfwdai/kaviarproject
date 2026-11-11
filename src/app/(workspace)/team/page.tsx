import { asc } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { shortDate } from "@/lib/format";
import { Bar } from "@/components/shell/parts";

export const metadata = { title: "Team" };

export default async function TeamPage() {
  await requireMember();
  const members = await db
    .select({ id: schema.members.id, name: schema.members.name, email: schema.members.email, role: schema.members.role, createdAt: schema.members.createdAt })
    .from(schema.members)
    .orderBy(asc(schema.members.createdAt));
  return (
    <>
      <Bar crumbs={[{ label: "Workspace" }, { label: "Team" }]} />
      <div className="scroll">
        <div className="col g20" style={{ padding: "28px 32px", maxWidth: 880 }}>
          <div className="col g4">
            <h1 className="h1">Team</h1>
            <p className="lead">Everyone at Kaviar who can open brand data. Brands never log in.</p>
          </div>
          <div className="card">
            <div className="tr hd" style={{ padding: "0 16px" }}>
              <div className="td fill">Member</div><div className="td" style={{ width: 120 }}>Role</div><div className="td" style={{ width: 120 }}>Joined</div>
            </div>
            {members.map((m) => (
              <div key={m.id} className="tr compact" style={{ padding: "0 16px" }}>
                <div className="td fill"><div className="av l k">{m.name.slice(0, 2).toUpperCase()}</div><div className="col"><span className="t w5 i1">{m.name}</span><span className="xs i3">{m.email}</span></div></div>
                <div className="td" style={{ width: 120 }}><span className="pill">{m.role === "owner" ? "Owner" : "Operator"}</span></div>
                <div className="td" style={{ width: 120 }}>{shortDate(m.createdAt)}</div>
              </div>
            ))}
          </div>
          <div className="notice">
            <span>Add a teammate from the terminal: <span className="code">npm run team:add -- --email jina@kaviar.ai --name Jina</span> — it prints a one-time password.</span>
          </div>
        </div>
      </div>
    </>
  );
}
