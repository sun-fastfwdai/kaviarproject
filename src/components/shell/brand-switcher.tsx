"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type B = { slug: string; name: string; category: string | null; thumb: string | null };

function Thumb({ b, size }: { b: B; size: number }) {
  return (
    <div className="thumb" style={{ width: size, height: size, borderRadius: Math.round(size / 4), display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.42, fontWeight: 600, color: "var(--ink-2)" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {b.thumb ? <img src={b.thumb} alt="" /> : b.name.slice(0, 1).toUpperCase()}
    </div>
  );
}

/** Design switcher: current brand, opens a list of every brand. */
export function BrandSwitcher({ current, brands }: { current: B; brands: B[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" className="switcher boxed" style={{ width: "100%", cursor: "pointer", textAlign: "left" }} onClick={() => setOpen(!open)} aria-expanded={open}>
        <Thumb b={current} size={28} />
        <div className="col fill" style={{ minWidth: 0 }}><span className="nm ell">{current.name}</span><span className="sb ell">{current.category ?? "Brand"}</span></div>
        <svg width="14" height="14" viewBox="0 0 256 256" fill="#8B8883"><path d="M181.66 170.34a8 8 0 0 1 0 11.32l-48 48a8 8 0 0 1-11.32 0l-48-48a8 8 0 0 1 11.32-11.32L128 212.69l42.34-42.35a8 8 0 0 1 11.32 0m-96-84.68L128 43.31l42.34 42.35a8 8 0 0 0 11.32-11.32l-48-48a8 8 0 0 0-11.32 0l-48 48a8 8 0 0 0 11.32 11.32" /></svg>
      </button>
      {open && (
        <div className="menu" style={{ left: 0, right: 0, minWidth: 0 }}>
          <span className="xs i3" style={{ padding: "6px 10px 4px" }}>Brands</span>
          {brands.map((b) => (
            <Link key={b.slug} href={`/brands/${b.slug}`} onClick={() => setOpen(false)} className="row g8 hv" style={{ height: 36, padding: "0 8px", borderRadius: 7 }}>
              <Thumb b={b} size={20} /><span className="sm i1 fill ell">{b.name}</span>
              {b.slug === current.slug && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#121212" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
            </Link>
          ))}
          <div style={{ height: 1, background: "var(--line)", margin: "4px 0" }} />
          <Link href="/brands" className="row g8 hv" style={{ height: 34, padding: "0 10px", borderRadius: 7 }} onClick={() => setOpen(false)}><span className="sm i2">All brands</span></Link>
          <Link href="/brands/new" className="row g8 hv" style={{ height: 34, padding: "0 10px", borderRadius: 7 }} onClick={() => setOpen(false)}><span className="sm i2">+ Add brand</span></Link>
        </div>
      )}
    </div>
  );
}
