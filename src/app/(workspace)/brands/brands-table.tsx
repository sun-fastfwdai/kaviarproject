"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RemoveBrandModal } from "./remove-brand";

export type BrandItem = {
  slug: string; name: string; category: string | null; isSample: boolean; thumb: string | null; shopDomain: string | null;
  shopStatus: string | null; metaStatus: string | null; metaName: string | null; revenue: string; orders: number;
  status: "live" | "syncing" | "attention" | "setup" | "sample"; statusText: string; owner: string | null; activity: string; activityAt: string;
};

const TABS: [string, string, (b: BrandItem) => boolean][] = [
  ["all", "All", () => true],
  ["live", "Connected", (b) => b.status === "live" || b.status === "syncing" || b.status === "sample"],
  ["attention", "Needs attention", (b) => b.status === "attention"],
  ["setup", "Setting up", (b) => b.status === "setup"],
];
const DOT: Record<BrandItem["status"], string> = { live: "green", syncing: "blue", attention: "amber", setup: "", sample: "blue" };
const initials = (n: string) => n.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();

function Thumb({ b, size }: { b: BrandItem; size: number }) {
  return (
    <div className="thumb" style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.4, fontWeight: 600, color: "var(--ink-2)" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {b.thumb ? <img src={b.thumb} alt="" /> : b.name.slice(0, 1).toUpperCase()}
    </div>
  );
}

function RowMenu({ slug, name, canRemove }: { slug: string; name: string; canRemove: boolean }) {
  const [open, setOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div ref={ref} style={{ position: "relative" }} onClick={(e) => e.preventDefault()}>
      <button type="button" className="btn quiet sm ic" aria-label="More" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(!open); }}>⋯</button>
      {open && (
        <div className="menu" role="menu">
          {[["Overview", ""], ["Integrations", "/integrations"], ["Performance", "/performance"], ["Data sync", "/sync"]].map(([l, p]) => (
            <button key={l} role="menuitem" onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push(`/brands/${slug}${p}`); }}>{l}</button>
          ))}
          {canRemove && (
            <>
              <div style={{ height: 1, background: "var(--line)", margin: "4px 0" }} />
              <button role="menuitem" className="danger" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(false); setRemoving(true); }}>Remove brand…</button>
            </>
          )}
        </div>
      )}
      {removing && <RemoveBrandModal slug={slug} name={name} onClose={() => setRemoving(false)} />}
    </div>
  );
}

export function BrandsTable({ brands, canRemove = false }: { brands: BrandItem[]; canRemove?: boolean }) {
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const f = TABS.find((t) => t[0] === tab)![2];
    const t = q.trim().toLowerCase();
    return brands.filter((b) => f(b) && (!t || `${b.name} ${b.category ?? ""} ${b.shopDomain ?? ""}`.toLowerCase().includes(t)));
  }, [brands, tab, q]);

  return (
    <div className="col g12">
      <div className="row between" style={{ borderBottom: "1px solid var(--line)" }}>
        <div className="tabs" style={{ borderBottom: 0 }} role="tablist">
          {TABS.map(([k, l, f]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={`tab${tab === k ? " on" : ""}`} onClick={() => setTab(k)}>{l}<span className="n">{brands.filter(f).length}</span></button>
          ))}
        </div>
        <div className="input sm" style={{ width: 220, marginBottom: 6 }}>
          <svg width="13" height="13" viewBox="0 0 256 256" fill="#8B8883"><path d="m229.66 218.34-50.07-50.06a88.11 88.11 0 1 0-11.31 11.31l50.06 50.07a8 8 0 0 0 11.32-11.32M40 112a72 72 0 1 1 72 72 72.08 72.08 0 0 1-72-72" /></svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter brands" />
        </div>
      </div>
      <div className="tbl">
        <div className="tr hd" style={{ padding: "0 12px" }}>
          <div className="td" style={{ flex: 2 }}>Brand</div><div className="td" style={{ flex: 1.8 }}>Source</div><div className="td" style={{ flex: 1.5 }}>Ads</div>
          <div className="td" style={{ flex: 1.3 }}>Status</div><div className="td num" style={{ width: 96 }}>Sales · 30d</div><div className="td" style={{ width: 56 }}>Owner</div>
          <div className="td" style={{ flex: 1.3 }}>Last activity</div><div className="td" style={{ width: 110 }} />
        </div>
        {list.map((b) => (
          <Link key={b.slug} href={`/brands/${b.slug}`} className="tr" style={{ padding: "0 12px" }}>
            <div className="td" style={{ flex: 2 }}><Thumb b={b} size={36} /><div className="col" style={{ minWidth: 0 }}><span className="t w5 i1 ell">{b.name}</span><span className="xs i3 ell">{b.category ?? (b.isSample ? "Sample data" : "—")}</span></div></div>
            <div className="td" style={{ flex: 1.8 }}>
              {b.shopDomain ? <div className="col" style={{ minWidth: 0 }}><span className="row g6 sm i1"><svg width="13" height="13" viewBox="0 0 24 24"><path fill="#95BF47" d="M15.337 23.979l7.216-1.561s-2.604-17.613-2.625-17.73c-.018-.116-.114-.192-.211-.192s-1.929-.136-1.929-.136-1.275-1.274-1.439-1.411c-.045-.037-.075-.057-.121-.074l-.914 21.104h.023zM11.71 11.305s-.81-.424-1.774-.424c-1.447 0-1.504.906-1.504 1.141 0 1.232 3.24 1.715 3.24 4.629 0 2.295-1.44 3.76-3.406 3.76-2.354 0-3.54-1.465-3.54-1.465l.646-2.086s1.245 1.066 2.28 1.066c.675 0 .975-.545.975-.932 0-1.619-2.654-1.694-2.654-4.359-.034-2.237 1.571-4.416 4.827-4.416 1.257 0 1.875.361 1.875.361l-.945 2.715-.024.01zM11.17.83c.136 0 .271.038.405.135-.984.465-2.064 1.639-2.508 3.992-.656.213-1.293.405-1.889.578C7.697 3.75 8.951.84 11.17.84V.83zm1.235 2.949v.135c-.754.232-1.583.484-2.394.736.466-1.777 1.333-2.645 2.085-2.971.193.501.309 1.176.309 2.1zm.539-2.234c.694.074 1.141.867 1.429 1.755-.349.114-.735.231-1.158.366v-.252c0-.752-.096-1.371-.271-1.871v.002zm2.992 1.289c-.02 0-.06.021-.078.021s-.289.075-.714.21c-.423-1.233-1.176-2.37-2.508-2.37h-.115C12.135.209 11.669 0 11.265 0 8.159 0 6.675 3.877 6.21 5.846c-1.194.365-2.063.636-2.16.674-.675.213-.694.232-.772.87-.075.462-1.83 14.063-1.83 14.063L15.009 24l.927-21.166z" /></svg><span className="ell">Shopify</span></span><span className="xs i3 ell">{b.shopDomain}</span></div> : <span className="sm i4">Not connected</span>}
            </div>
            <div className="td" style={{ flex: 1.5 }}>{b.metaStatus ? <div className="col" style={{ minWidth: 0 }}><span className="sm i1">Meta Ads</span><span className="xs i3 ell">{b.metaName ?? "Ad account"}</span></div> : <span className="sm i4">Not connected</span>}</div>
            <div className="td" style={{ flex: 1.3 }}><span className="st sm"><span className={`dot ${DOT[b.status]}`} />{b.statusText}</span></div>
            <div className="td num i1" style={{ width: 96 }}>{b.revenue}</div>
            <div className="td" style={{ width: 56 }}>{b.owner ? <span className="av k" title={b.owner}>{initials(b.owner)}</span> : <span className="i4">—</span>}</div>
            <div className="td" style={{ flex: 1.3 }}><div className="col" style={{ minWidth: 0 }}><span className="sm i1 ell">{b.activity}</span><span className="xs i3">{b.activityAt}</span></div></div>
            <div className="td" style={{ width: 110, justifyContent: "flex-end", gap: 4 }}><span className="btn sm">Open →</span>{!b.isSample || canRemove ? <RowMenu slug={b.slug} name={b.name} canRemove={canRemove} /> : null}</div>
          </Link>
        ))}
        {list.length === 0 && <div className="sm i3" style={{ padding: 18 }}>No brands match.</div>}
      </div>
      <div className="row between xs i3" style={{ padding: "0 4px" }}><span>{list.length} {list.length === 1 ? "brand" : "brands"} · sorted by last activity</span><span>Press ⌘K to jump to any brand</span></div>
    </div>
  );
}
