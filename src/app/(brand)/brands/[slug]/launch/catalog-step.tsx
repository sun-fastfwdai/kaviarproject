"use client";
/* eslint-disable @next/next/no-img-element -- product photos from the old site */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { readCatalog } from "./actions";
import { Icon } from "@/components/icon";
import { AgentFace } from "@/components/agent";
import type { CatalogProduct } from "@/lib/onboarding/types";

export function CatalogStep({ slug, catalog, currency }: { slug: string; catalog: { at: string; source: string; products: CatalogProduct[] } | null; currency: string }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const read = () => start(async () => { setMsg(null); const r = await readCatalog(slug); setMsg(r.error ?? `Cleo found ${r.count} products.`); router.refresh(); });
  const fmt = (v: number | null) => (v == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: v % 1 ? 2 : 0 }).format(v));
  const list = catalog?.products ?? [];
  return (
    <div className="col g10">
      <div className="row g8" style={{ flexWrap: "wrap" }}>
        <button type="button" className={`btn sm${list.length ? "" : " dark"}`} disabled={busy} onClick={read}>
          {busy ? <Icon name="spinner" size={12} className="spin" color={list.length ? undefined : "#fff"} /> : <AgentFace kind="catalog" size={14} />}{busy ? "Cleo is reading the site…" : list.length ? "Read again" : "Read the website’s products"}</button>
        {list.length > 0 && <a className="btn dark sm" href={`/brands/${slug}/launch/csv`}><Icon name="download" size={12} color="#fff" />Download Shopify CSV · {list.length} products</a>}
        {msg && <span className="xs i2">{msg}</span>}
      </div>
      {busy && <span className="xs i3">Usually under a minute — longer for sites that aren’t on Shopify.</span>}
      {list.length > 0 && (
        <div className="col" style={{ border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden" }}>
          <div className="row between xs i3" style={{ padding: "7px 12px", background: "var(--tray)" }}><span>From {catalog?.source}</span><span>Imported as drafts — publish in Shopify when ready</span></div>
          {list.slice(0, 6).map((p) => (
            <div key={p.handle} className="row g10 sm" style={{ padding: "7px 12px", borderTop: "1px solid var(--line)" }}>
              {p.images[0] ? <img src={p.images[0]} alt="" width={30} height={30} style={{ borderRadius: 6, objectFit: "cover" }} /> : <span style={{ width: 30, height: 30, borderRadius: 6, background: "var(--tray-2)" }} />}
              <span className="i1 fill ell">{p.title}</span><span className="xs i3">{p.variants.length > 1 ? `${p.variants.length} variants · ` : ""}{p.images.length} photo{p.images.length === 1 ? "" : "s"}</span><span className="i1 tnum">{fmt(p.variants[0]?.price ?? null)}</span>
            </div>
          ))}
          {list.length > 6 && <span className="xs i3" style={{ padding: "7px 12px", borderTop: "1px solid var(--line)" }}>+ {list.length - 6} more</span>}
        </div>
      )}
      <span className="xs i3" style={{ lineHeight: "17px" }}>In the new store: <b className="w5 i2">Shopify admin → Products → Import → upload the CSV</b>. Shopify pulls the photos straight from the old site. Prices are in the old site’s currency — check them if the store sells in another.</span>
    </div>
  );
}
