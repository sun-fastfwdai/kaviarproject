"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { Icon, type IconName } from "@/components/icon";
import type { BrandFeatures } from "@/lib/db/schema";
import { setFeature } from "./actions-settings";

/** What the Kaviar team has switched on for one brand. Opened from the Brands list; brands never see it. */
const PARTS: { key: keyof BrandFeatures; icon: IconName; name: string; on: string; off: string }[] = [
  { key: "storeBuilder", icon: "store", name: "Store builder", on: "The brand’s sidebar shows Store builder: Remy builds and edits the storefront.", off: "Hidden. The brand works on the store it already has, with SEO & AI search." },
];

export function BrandSettingsModal({ slug, name, features, onClose }: { slug: string; name: string; features: BrandFeatures; onClose: () => void }) {
  const [state, setState] = useState<BrandFeatures>(features);
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const router = useRouter();
  const flip = (key: keyof BrandFeatures) => {
    const on = !state[key];
    setState((s) => ({ ...s, [key]: on })); setErr(null);
    start(async () => { const r = await setFeature(slug, key, on); if (r.error) { setErr(r.error); setState((s) => ({ ...s, [key]: !on })); } else router.refresh(); });
  };
  return (
    <Modal icon={<Icon name="settings" size={18} />} title={`${name} · settings`} sub="What is switched on for this brand. Only the Kaviar team sees this." onClose={onClose} width={480}
      footer={<button type="button" className="btn dark" onClick={onClose}>Done</button>}>
      {PARTS.map((p) => (
        <div key={p.key} className="row top g12" style={{ padding: 12, borderRadius: 12, border: "1px solid var(--line)" }}>
          <span style={{ width: 34, height: 34, borderRadius: 10, background: "var(--tray)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name={p.icon} size={16} /></span>
          <div className="col g2 fill"><span className="sm w5 i1">{p.name}</span><span className="xs i3" style={{ lineHeight: "17px" }}>{state[p.key] ? p.on : p.off}</span></div>
          <button type="button" role="switch" aria-checked={Boolean(state[p.key])} aria-label={p.name} disabled={busy} className={`switch${state[p.key] ? " on" : ""}`} style={{ marginTop: 4 }} onClick={() => flip(p.key)}><span className="k" /></button>
        </div>
      ))}
      {err && <span className="xs c-amber">{err}</span>}
    </Modal>
  );
}
