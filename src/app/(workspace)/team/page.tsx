import { asc } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { shortDate } from "@/lib/format";
import { Bar } from "@/components/shell/parts";
import { AddMember, ChangePassword, MemberActions } from "./team-ui";

export const metadata = { title: "Team" };

export default async function TeamPage() {
  const me = await requireMember();
  const owner = me.role === "owner";
  const members = await db
    .select({ id: schema.members.id, name: schema.members.name, email: schema.members.email, role: schema.members.role, createdAt: schema.members.createdAt })
    .from(schema.members)
    .orderBy(asc(schema.members.createdAt));
  return (
    <>
      <Bar crumbs={[{ label: "Workspace" }, { label: "Team" }]}>
        <ChangePassword />
      </Bar>
      <div className="scroll">
        <div className="col g20" style={{ padding: "28px 32px", maxWidth: 960 }}>
          <div className="row between" style={{ alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
            <div className="col g4">
              <h1 className="h1">Team</h1>
              <p className="lead">Everyone at Kaviar who can open brand data. Brands never log in.</p>
            </div>
            {owner && <AddMember />}
          </div>
          <div className="card" style={{ overflow: "visible" }}>
            <div className="tr hd" style={{ padding: "0 16px" }}>
              <div className="td fill">Member</div><div className="td" style={{ width: 100 }}>Role</div><div className="td" style={{ width: 90 }}>Joined</div>
              {owner && <div className="td" style={{ width: 260 }} />}
            </div>
            {members.map((m) => (
              <div key={m.id} className="tr compact" style={{ padding: "0 16px", position: "relative" }}>
                <div className="td fill"><div className="av l k">{m.name.slice(0, 2).toUpperCase()}</div><div className="col" style={{ minWidth: 0 }}><span className="t w5 i1">{m.name}{m.id === me.id && <span className="xs i3" style={{ fontWeight: 400 }}> · you</span>}</span><span className="xs i3 ell">{m.email}</span></div></div>
                <div className="td" style={{ width: 100 }}><span className="pill">{m.role === "owner" ? "Owner" : "Operator"}</span></div>
                <div className="td" style={{ width: 90 }}>{shortDate(m.createdAt)}</div>
                {owner && <div className="td" style={{ width: 260, justifyContent: "flex-end" }}>{m.id !== me.id && <MemberActions id={m.id} name={m.name} />}</div>}
              </div>
            ))}
          </div>
          {!owner && <p className="sm i3">Ask an owner to add teammates or reset a password.</p>}
        </div>
      </div>
    </>
  );
}
