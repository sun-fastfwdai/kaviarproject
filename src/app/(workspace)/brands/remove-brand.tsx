"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { getFootprint, removeBrand } from "./actions-remove";

const fmt = (n: number) => n.toLocaleString("en-US");
const Trash = () => <svg width="17" height="17" viewBox="0 0 256 256" fill="currentColor"><path d="M216 48h-40v-8a24 24 0 0 0-24-24h-48a24 24 0 0 0-24 24v8H40a8 8 0 0 0 0 16h8v144a16 16 0 0 0 16 16h128a16 16 0 0 0 16-16V64h8a8 8 0 0 0 0-16M96 40a8 8 0 0 1 8-8h48a8 8 0 0 1 8 8v8H96Zm96 168H64V64h128Zm-80-104v64a8 8 0 0 1-16 0v-64a8 8 0 0 1 16 0m48 0v64a8 8 0 0 1-16 0v-64a8 8 0 0 1 16 0" /></svg>;

/** Remove a brand: shows exactly what goes, asks for the brand name, then hides it at once and purges data in the background. */
export function RemoveBrandModal({ slug, name, onClose }: { slug: string; name: string; onClose: () => void }) {
  const [fp, setFp] = useState<Awaited<ReturnType<typeof getFootprint>> | null>(null);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  useEffect(() => { getFootprint(slug).then(setFp).catch((e) => setError(String(e.message ?? e))); }, [slug]);
  const match = typed.trim().toLowerCase() === name.trim().toLowerCase();
  const rows: [string, number][] = fp ? [["orders", fp.orders], ["order lines", fp.lines], ["products", fp.products], ["customers", fp.customers], ["Meta insight rows", fp.metaRows], ["ads", fp.ads]] : [];
  const any = rows.some(([, n]) => n > 0);

  return (
    <Modal icon={<Trash />} title={`Remove ${name}?`} sub="The brand and everything Kaviar synced for it are deleted. This can’t be undone." onClose={onClose} width={540}
      footer={<><span className="fill" /><button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button className="btn" style={{ color: "#fff", background: match ? "var(--red)" : "var(--ink-4)", borderColor: "transparent" }} disabled={!match || pending}
          onClick={() => start(async () => {
            const r = await removeBrand(slug, typed);
            if (r.error) setError(r.error);
            else { onClose(); router.push("/brands"); router.refresh(); }
          })}>{pending ? "Removing…" : "Remove brand"}</button></>}>
      <div className="col" style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "6px 12px", background: "var(--tray)" }}>
        <span className="xs i3" style={{ padding: "4px 0" }}>What gets deleted from Kaviar</span>
        {!fp && !error && <span className="sm i3" style={{ padding: "6px 0" }}>Counting…</span>}
        {fp && !any && <span className="sm i2" style={{ padding: "6px 0" }}>No synced data yet — just the brand.</span>}
        {fp && any && rows.filter(([, n]) => n > 0).map(([k, n]) => (
          <div key={k} className="row between" style={{ height: 26 }}><span className="sm i2">{k}</span><span className="sm w5 i1 tnum">{fmt(n)}</span></div>
        ))}
      </div>
      <div className="col g4">
        <span className="sm i2">Syncing stops right away and Kaviar’s access to Meta is revoked. {any ? "Large histories are deleted in the background over a few minutes." : ""}</span>
        <span className="sm i2">Nothing changes in the brand’s Shopify store or Meta ad account. To remove the Kaviar app from the store, uninstall it in Shopify admin.</span>
      </div>
      <label className="col g6">
        <span className="label">Type <span className="code">{name}</span> to confirm</span>
        <div className="input"><input value={typed} onChange={(e) => { setTyped(e.target.value); setError(null); }} autoFocus autoComplete="off" /></div>
      </label>
      {error && <div className="notice red" role="alert">{error}</div>}
    </Modal>
  );
}
