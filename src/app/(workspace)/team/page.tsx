import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { ago, daysUntil } from "@/lib/format";
import { Bar } from "@/components/shell/parts";
import { Icon, type IconName } from "@/components/icon";
import { AgentFace } from "@/components/agent";
import { InviteLinkButton, InviteTeammate, RevokeInvite, RowMenu } from "./team-ui";

export const metadata = { title: "Team" };

type Row = { id: string; name: string; email: string; role: string; lastActive: Date | null };
const COLORS = ["k", "j", "u", "d"];
const initials = (n: string) => n.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();

const AGENTS: { kind: "builder" | "catalog" | "qa" | "analyst"; name: string; role: string; does: string; rules: [IconName, string, string][] }[] = [
  { kind: "builder", name: "Remy", role: "Builds pages", does: "Builds store pages and drafts ad creatives.", rules: [["eye", "Reads", "Store & brand files"], ["sparkle", "Drafts", "Theme, creatives"], ["check-circle", "Asks first", "Headlines, creatives"], ["lock", "Never", "Publish, launch ads"]] },
  { kind: "catalog", name: "Cleo", role: "Manages catalog", does: "Syncs Shopify and Meta data, keeps the catalog clean.", rules: [["eye", "Reads", "Store & ads data"], ["sparkle", "Drafts", "Catalog updates"], ["check-circle", "Asks first", "Price changes"], ["lock", "Never", "Delete products"]] },
  { kind: "qa", name: "Otto", role: "Checks quality", does: "Checks quality, brand voice and ad policy.", rules: [["eye", "Reads", "Everything"], ["sparkle", "Drafts", "Fix suggestions"], ["check-circle", "Asks first", "Alt text, fixes"], ["lock", "Never", "Publish"]] },
  { kind: "analyst", name: "Iris", role: "Studies the brand", does: "Studies each brand and explains the numbers.", rules: [["eye", "Reads", "Data & brand docs"], ["sparkle", "Drafts", "Insights, segments"], ["check-circle", "Asks first", "Budget proposals"], ["lock", "Never", "Spend"]] },
];

export default async function TeamPage() {
  const me = await requireMember();
  const owner = me.role === "owner";
  const people = (await db.execute(sql`
    select m.id, m.name, m.email, m.role, (select max(s.created_at) from sessions s where s.member_id = m.id) as "lastActive"
    from members m order by m.created_at`)).rows as Row[];
  const meInfo = { initials: initials(me.name), role: me.role };
  const links = owner ? ((await db.execute(sql`
    select i.id, i.hint, i.role, i.uses, i.max_uses as "maxUses", i.expires_at as "expiresAt", m.name as "by"
    from invites i left join members m on m.id = i.created_by
    where i.revoked_at is null and i.expires_at > now() and i.uses < i.max_uses order by i.created_at desc`)).rows as { id: string; hint: string; role: string; uses: number; maxUses: number; expiresAt: Date; by: string | null }[]) : [];

  return (
    <>
      <Bar crumbs={[{ label: "Operations" }, { label: "Team" }]}>
        <span className="xs i3">{people.length} {people.length === 1 ? "person" : "people"} · 4 agents</span>
        {owner && <InviteLinkButton me={meInfo} />}
        {owner && <InviteTeammate me={meInfo} />}
      </Bar>
      <div className="scroll">
        <div className="col g24" style={{ padding: "28px 32px" }}>
          <div className="row between top" style={{ gap: 16, flexWrap: "wrap" }}>
            <div className="col g4">
              <h1 className="h1">Team</h1>
              <p className="lead">The people and agents who run every brand.</p>
            </div>
            <div className="notice" style={{ alignItems: "center" }}><Icon name="info" size={14} />Brands don’t have seats — they approve in their own Shopify and Meta accounts.</div>
          </div>

          <div className="col g10">
            <div className="row between">
              <span className="row g8"><span className="h3">People</span><span className="pill" style={{ height: 20, fontSize: 11 }}>{people.length}</span></span>
              <span className="xs i3">Only owners can invite teammates or reset passwords</span>
            </div>
            <div className="card">
              <div className="tr hd" style={{ padding: "0 16px" }}>
                <div className="td fill">Member</div><div className="td" style={{ width: 140 }}>Role</div>
                <div className="td" style={{ width: 160 }}>Brands</div><div className="td" style={{ width: 130 }}>Last active</div><div className="td" style={{ width: 40 }} />
              </div>
              {people.map((p, i) => (
                <div key={p.id} className="tr" style={{ padding: "0 16px" }}>
                  <div className="td fill">
                    <div style={{ position: "relative" }}><div className={`av l ${COLORS[i % 4]}`} style={{ width: 32, height: 32 }}>{initials(p.name)}</div>
                      {p.lastActive && <span style={{ position: "absolute", right: -1, bottom: -1, width: 9, height: 9, borderRadius: 99, background: "var(--green)", boxShadow: "0 0 0 2px #fff" }} />}</div>
                    <div className="col" style={{ minWidth: 0 }}>
                      <span className="t w5 i1">{p.name}{p.id === me.id && <span className="xs i3" style={{ fontWeight: 400 }}> · you</span>}</span>
                      <span className="xs i3 ell">{p.email}</span>
                    </div>
                  </div>
                  <div className="td" style={{ width: 140 }}><span className="pill">{p.role === "owner" ? "Owner" : "Operator"}</span></div>
                  <div className="td" style={{ width: 160 }}>All brands</div>
                  <div className="td" style={{ width: 130 }}>{p.lastActive ? ago(p.lastActive) : <span className="i4">Not yet</span>}</div>
                  <div className="td" style={{ width: 40, justifyContent: "flex-end" }}><RowMenu id={p.id} name={p.name} email={p.email} self={p.id === me.id} me={meInfo} /></div>
                </div>
              ))}
            </div>
          </div>

          {links.length > 0 && (
            <div className="col g10">
              <div className="row between">
                <span className="row g8"><span className="h3">Invite links</span><span className="pill" style={{ height: 20, fontSize: 11 }}>{links.length}</span></span>
                <span className="xs i3">Anyone with an active link can create an account</span>
              </div>
              <div className="card">
                {links.map((l, i) => (
                  <div key={l.id} className="row g12" style={{ padding: "10px 16px", borderTop: i ? "1px solid var(--line)" : 0 }}>
                    <span className="mono i1">…{l.hint}</span>
                    <span className="pill" style={{ height: 22, fontSize: 11.5 }}>{l.role === "owner" ? "Owner" : "Operator"}</span>
                    <span className="sm i2 fill">{l.uses} of {l.maxUses} used · expires in {Math.max(0, daysUntil(l.expiresAt))} days{l.by ? ` · by ${l.by}` : ""}</span>
                    <RevokeInvite id={l.id} />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="col g10">
            <div className="row between">
              <span className="row g8"><span className="h3">Agents</span><span className="pill" style={{ height: 20, fontSize: 11 }}>4</span></span>
              <span className="row g6 xs i3"><Icon name="lock" size={12} />Agents are teammates — they never publish or spend alone</span>
            </div>
            <div className="row g12 stretch" style={{ flexWrap: "wrap" }}>
              {AGENTS.map((a) => (
                <div key={a.name} className="card col g12" style={{ flex: "1 1 220px", padding: 16, minWidth: 0 }}>
                  <div className="row g10"><AgentFace kind={a.kind} size={30} /><div className="col"><span className="sm w5 i1">{a.name}</span><span className="xs i3">{a.role}</span></div><span className="fill" /><span className="xs i3">All brands</span></div>
                  <span className="sm i2" style={{ lineHeight: "19px", minHeight: 38 }}>{a.does}</span>
                  <div className="col" style={{ borderTop: "1px solid var(--line)", paddingTop: 6 }}>
                    {a.rules.map(([ic, k, v]) => (
                      <div key={k} className="row g8" style={{ height: 26 }}>
                        <Icon name={ic} size={13} color={k === "Never" ? "#8B8883" : k === "Asks first" ? "#B7791F" : k === "Drafts" ? "#2563EB" : "#1F8A5B"} />
                        <span className="xs i3" style={{ width: 66 }}>{k}</span><span className="xs i1">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
