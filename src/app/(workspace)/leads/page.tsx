import { listLeads } from "@/lib/queries/leads";
import { ago } from "@/lib/format";
import { Bar } from "@/components/shell/parts";
import { Icon } from "@/components/icon";
import { setLeadStatus } from "./actions";

export const metadata = { title: "Leads" };

const NEXT: Record<string, ["contacted" | "closed" | "new", string]> = { new: ["contacted", "Mark contacted"], contacted: ["closed", "Close"], closed: ["new", "Reopen"] };
const TONE: Record<string, string> = { new: "blue", contacted: "amber", closed: "" };

export default async function LeadsPage() {
  const leads = await listLeads();
  return (
    <>
      <Bar crumbs={[{ label: "Workspace" }, { label: "Leads" }]} />
      <div className="scroll">
        <div className="col g20" style={{ padding: "28px 32px" }}>
          <div className="col g4">
            <h1 className="h1">Leads</h1>
            <p className="lead">Brands that asked for a call from the website.</p>
          </div>
          {leads.length === 0 ? (
            <div className="card col g8" style={{ padding: 36, alignItems: "center", textAlign: "center" }}>
              <Icon name="receipt" size={26} color="#8B8883" />
              <span className="h3">No enquiries yet</span>
              <p className="sm i3">When a brand fills in “Book a call” on the website, it shows up here.</p>
            </div>
          ) : (
            <div className="card">
              <div className="tr hd" style={{ padding: "0 16px" }}>
                <div className="td" style={{ flex: 1.4 }}>Brand</div><div className="td" style={{ flex: 1.6 }}>Contact</div>
                <div className="td" style={{ flex: 2.4 }}>Message</div><div className="td" style={{ width: 100 }}>Received</div>
                <div className="td" style={{ width: 210 }}>Status</div>
              </div>
              {leads.map((l) => (
                <div key={l.id} className="tr" style={{ padding: "10px 16px", alignItems: "flex-start" }}>
                  <div className="td" style={{ flex: 1.4 }}><div className="col" style={{ minWidth: 0 }}><span className="t w5 i1 ell">{l.brand}</span>{l.storeUrl && <span className="xs i3 ell">{l.storeUrl}</span>}</div></div>
                  <div className="td" style={{ flex: 1.6 }}><div className="col" style={{ minWidth: 0 }}><span className="sm i1 ell">{l.name}</span><a className="xs lnk i2 ell" href={`mailto:${l.email}`}>{l.email}</a></div></div>
                  <div className="td sm" style={{ flex: 2.4, lineHeight: "18px" }}>{l.message ?? <span className="i4">—</span>}</div>
                  <div className="td" style={{ width: 100 }}>{ago(l.createdAt)}</div>
                  <div className="td" style={{ width: 210, gap: 8 }}>
                    <span className={`pill ${TONE[l.status]}`}>{l.status[0].toUpperCase() + l.status.slice(1)}</span>
                    <form action={setLeadStatus.bind(null, l.id, NEXT[l.status][0])}><button className="btn sm">{NEXT[l.status][1]}</button></form>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
