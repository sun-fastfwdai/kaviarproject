"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setAppStatus } from "./apps-actions";
import { Icon } from "@/components/icon";
import { Modal } from "@/components/modal";
import { CopyButton } from "@/components/copy";
import { STORE_APPS, type StoreApp } from "./apps";

type State = Record<string, { status: "requested" | "connected"; at: string }>;
const GROUPS = ["Required for launch", "Recommended", "Optional"] as const;

function RequestModal({ app, brand, slug, onClose }: { app: StoreApp; brand: string; slug: string; onClose: () => void }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const text = `Hi ${brand} team — to finish the new Shopify store, could you please ${app.request}?\n\nApp: ${app.name} — ${app.listing}\n\nThanks!\nKaviar`;
  return (
    <Modal icon={<Icon name="megaphone" size={18} />} title={`Ask ${brand} for ${app.name}`} sub="Paid apps and payments are always the merchant’s decision — Kaviar never installs them." onClose={onClose} width={560}
      footer={<><CopyButton text={text} label="Copy message" /><button type="button" className="btn dark" disabled={busy} onClick={() => start(async () => { await setAppStatus(slug, app.key, "requested"); router.refresh(); onClose(); })}>Mark as requested</button></>}>
      <pre className="sm i1" style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", margin: 0, padding: 12, background: "var(--tray)", borderRadius: 8 }}>{text}</pre>
    </Modal>
  );
}

export function StoreApps({ slug, brand, shop, state }: { slug: string; brand: string; shop: string | null; state: State }) {
  const router = useRouter();
  const [ask, setAsk] = useState<StoreApp | null>(null);
  const [busy, start] = useTransition();
  const admin = (path: string) => (shop ? `https://admin.shopify.com/store/${shop.replace(/\.myshopify\.com$/, "")}/${path}` : null);
  const mark = (key: string, status: "requested" | "connected" | null) => start(async () => { await setAppStatus(slug, key, status); router.refresh(); });
  return (
    <>
      <div className="card" style={{ overflow: "visible" }}>
        <div className="row between" style={{ padding: "12px 16px" }}><span className="h3">Store apps</span><span className="xs i3">Kaviar never installs paid apps for the merchant</span></div>
        <div className="tr hd" style={{ padding: "0 16px", borderTop: "1px solid var(--line)" }}>
          <div className="td" style={{ flex: 1.4 }}>App</div><div className="td" style={{ flex: 1.4 }}>Capability</div><div className="td" style={{ flex: 1.6 }}>Status</div>
          <div className="td" style={{ flex: 1 }}>Who acts</div><div className="td" style={{ flex: 1 }}>Cost</div><div className="td" style={{ width: 210 }} />
        </div>
        {GROUPS.map((g) => (
          <div key={g}>
            <div className="row" style={{ height: 30, padding: "0 16px", background: "var(--tray)", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }}><span className="xs w5 i2">{g}</span><span className="xs i3" style={{ marginLeft: 6 }}>{STORE_APPS.filter((a) => a.group === g).length}</span></div>
            {STORE_APPS.filter((a) => a.group === g).map((a) => {
              const s = state[a.key]?.status;
              const included = a.key === "analytics";
              const status: [string, string] = included || s === "connected" ? ["green", included ? "Included with Shopify" : "Connected"] : s === "requested" ? ["amber", "Requested from merchant"] : a.who === "Merchant" ? ["amber", "Needs merchant authorization"] : a.who === "Kaviar" ? ["blue", "Kaviar configures after install"] : ["", "Not installed"];
              const adminUrl = a.admin ? admin(a.admin) : null;
              return (
                <div key={a.key} className="tr compact" style={{ padding: "0 16px" }}>
                  <div className="td sm w5 i1" style={{ flex: 1.4 }}>{a.name}</div>
                  <div className="td sm" style={{ flex: 1.4 }}>{a.does}</div>
                  <div className="td" style={{ flex: 1.6 }}><span className={`st sm ${status[0] === "amber" ? "c-amber" : ""}`}><span className={`dot ${status[0]}`} />{status[1]}</span></div>
                  <div className="td sm" style={{ flex: 1 }}>{a.who}</div>
                  <div className="td sm" style={{ flex: 1 }}>{a.cost}</div>
                  <div className="td" style={{ width: 210, justifyContent: "flex-end", gap: 6 }}>
                    {included ? (adminUrl && <a className="btn sm" href={adminUrl} target="_blank" rel="noreferrer">View</a>)
                      : s === "connected" ? <button type="button" className="btn quiet sm" disabled={busy} onClick={() => mark(a.key, null)}>Undo</button>
                      : <>
                        {a.request && s !== "requested" && <button type="button" className="btn sm" onClick={() => setAsk(a)}><Icon name="megaphone" size={12} />Send request</button>}
                        {a.who === "Kaviar" && adminUrl && <a className="btn sm" href={adminUrl} target="_blank" rel="noreferrer">Configure</a>}
                        {!a.request && a.who !== "Kaviar" && <a className="btn sm" href={a.listing} target="_blank" rel="noreferrer">View app</a>}
                        <button type="button" className="btn quiet sm" disabled={busy} onClick={() => mark(a.key, "connected")} title="Mark as installed and connected">Done</button>
                      </>}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {ask && <RequestModal app={ask} brand={brand} slug={slug} onClose={() => setAsk(null)} />}
    </>
  );
}
