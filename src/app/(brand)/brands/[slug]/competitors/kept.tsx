"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { AgentFace } from "@/components/agent";
import { Modal } from "@/components/modal";
import { Combo } from "@/components/combo";
import { makeOurVersion, versionProducts } from "./actions";

export type Kept = { competitor: string; id: string; text: string; title: string | null; days: number; open: boolean; start: string; reach: number | null };
const month = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { day: "numeric", month: "short", timeZone: "UTC" });

/**
 * The ads competitors kept running longest in the last six months — the nearest public sign of what worked for them. Each can be turned
 * into a campaign of the brand's own: pick the product, and Remy gets the idea as his brief.
 */
export function KeptAds({ slug, items }: { slug: string; items: Kept[] }) {
  const router = useRouter();
  const [pick, setPick] = useState<Kept | null>(null);
  const [products, setProducts] = useState<{ title: string; price: number; stock: number; image: string | null }[] | null>(null);
  const [product, setProduct] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const open = (k: Kept) => { setPick(k); setErr(null); if (!products) void versionProducts(slug).then((p) => { setProducts(p); setProduct((v) => v || p[0]?.title || ""); }).catch(() => setProducts([])); };
  const start = async () => {
    if (!pick || !product) return;
    setBusy(true); setErr(null);
    try { const r = await makeOurVersion(slug, { competitor: pick.competitor, text: pick.text, days: pick.days, product }); if (r.key) router.push(`/brands/${slug}/campaigns/${encodeURIComponent(r.key)}`); else { setErr(r.error ?? "That did not work — try again"); setBusy(false); } }
    catch { setErr("That did not work — try again"); setBusy(false); }
  };
  if (!items.length) return null;
  return (
    <div className="col g8" style={{ padding: "16px 0 8px" }}>
      <span className="xs i3" title="Of the ads each competitor started in the last six months, the ones they ran longest. Meta shares how long an ad ran, never what it earned.">What they kept running · last 6 months</span>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 8 }}>
        {items.map((k) => (
          <div key={k.id} className="col g12" style={{ padding: 16, borderRadius: 12, background: "#fff", boxShadow: "0 0 0 1px var(--line)" }}>
            <span className="row between g8">
              <span className="sm w5 ell">{k.competitor}</span>
              <span className="xs tnum" style={{ flexShrink: 0 }}><span className="c-green">{k.open ? `running ${k.days} days` : `ran ${k.days} days`}</span><span className="i3"> · from {month(k.start)}</span></span>
            </span>
            <span className="sm i2" title={k.text} style={{ display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden", minHeight: 80 }}>{k.title ? <b className="w5 i1">{k.title} · </b> : null}{k.text}</span>
            <span className="row g8" style={{ marginTop: "auto" }}>
              <button type="button" className="btn dark sm" onClick={() => open(k)}><AgentFace kind="builder" size={14} />Make our version</button>
              <a className="btn quiet sm" href={`https://www.facebook.com/ads/library/?id=${k.id}`} target="_blank" rel="noreferrer">See it on Meta<Icon name="external" size={11} /></a>
            </span>
          </div>))}
      </div>
      {pick && <Modal icon={<AgentFace kind="builder" size={18} />} title="Make our version" sub={`${pick.competitor} ${pick.open ? "has run" : "ran"} this for ${pick.days} days`} onClose={() => { if (!busy) setPick(null); }} width={460}
        footer={<><span className="xs i3 fill">Nothing is spent. Remy writes your own words, not theirs</span><button type="button" className="btn sm" disabled={busy} onClick={() => setPick(null)}>Cancel</button>
          <button type="button" className="btn dark sm" disabled={busy || !product} style={busy || !product ? { opacity: 0.5 } : undefined} onClick={start}>{busy ? <Icon name="spinner" size={12} className="spin" color="#fff" /> : null}Start campaign</button></>}>
        <div className="col g8">
          <span className="xs i3">Product</span>
          {products == null ? <span className="sm i3" style={{ height: 52, display: "flex", alignItems: "center" }}>Loading your products…</span>
            : products.length ? <Combo label="Product" value={product} onChange={setProduct} items={products.map((x) => ({ value: x.title, label: x.title, right: `${x.stock} in stock`, image: x.image }))} />
            : <span className="sm c-amber">No product with a price yet — sync your store first</span>}
          {err && <span className="xs c-amber">{err}</span>}
        </div>
      </Modal>}
    </div>
  );
}
