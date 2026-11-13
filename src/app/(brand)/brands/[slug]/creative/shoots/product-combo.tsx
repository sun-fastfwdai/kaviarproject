"use client";
/* eslint-disable @next/next/no-img-element -- Shopify product photos */
import { useEffect, useRef, useState } from "react";
import { searchProducts } from "./actions";
import { Icon } from "@/components/icon";
import type { Product } from "./canvas-nodes";

/** Searchable product picker: the top products straight away, the whole Shopify catalog as you type. */
export function ProductCombo({ slug, value, products, currency, onPick }: { slug: string; value: Product | null; products: Product[]; currency: string; onPick: (p: Product) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ q: string; list: Product[] } | null>(null);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const money = (v: number | null) => (v == null ? "no price" : new Intl.NumberFormat("en", { style: "currency", currency }).format(v));

  // Close on a click outside.
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, [open]);
  // Search the catalog a moment after typing stops.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    let live = true;
    const t = setTimeout(() => {
      setSearching(true);
      searchProducts(slug, term).then((list) => { if (live) setFound({ q: term, list }); }).finally(() => { if (live) setSearching(false); });
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [q, slug]);

  const term = q.trim().toLowerCase();
  const local = term ? products.filter((p) => p.title.toLowerCase().includes(term)) : products;
  const list = term.length >= 2 && found?.q.toLowerCase() === term ? found.list : local;
  const pick = (p: Product) => { onPick(p); setOpen(false); setQ(""); };
  const show = () => { setOpen(true); setActive(0); setTimeout(() => input.current?.focus(), 0); };

  return (
    <div ref={box} style={{ position: "relative", flexShrink: 0 }}>
      <button type="button" onClick={() => (open ? setOpen(false) : show())} aria-haspopup="listbox" aria-expanded={open}
        className="row g8" style={{ width: "100%", height: 34, padding: "0 10px", border: `1px solid ${open ? "var(--ink)" : "var(--line-2)"}`, borderRadius: 8, background: "#fff", textAlign: "left" }}>
        {value && <img src={value.url} alt="" width={20} height={20} style={{ borderRadius: 4, objectFit: "cover", flexShrink: 0 }} />}
        <span className="sm i1 fill ell">{value?.title ?? "Pick a product"}</span>
        <Icon name="chev-d" size={12} color="#8B8883" />
      </button>
      {open && (
        <div className="col" style={{ position: "absolute", left: 0, right: 0, top: 38, zIndex: 30, background: "#fff", borderRadius: 10, boxShadow: "0 0 0 1px var(--line), 0 10px 28px rgba(18,18,18,.14)", overflow: "hidden" }}>
          <label className="row g6" style={{ height: 34, padding: "0 10px", borderBottom: "1px solid var(--line)" }}>
            <Icon name="search" size={13} color="#8B8883" />
            <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }} placeholder="Search products" aria-label="Search products" role="combobox" aria-expanded aria-controls="product-list"
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(list.length - 1, a + 1)); }
                else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
                else if (e.key === "Enter" && list[active]) { e.preventDefault(); pick(list[active]); }
                else if (e.key === "Escape") setOpen(false);
              }}
              style={{ border: 0, outline: 0, flex: 1, font: "inherit", fontSize: 12.5, background: "transparent" }} />
            {searching && <Icon name="spinner" size={12} className="spin" color="#8B8883" />}
          </label>
          <div id="product-list" role="listbox" style={{ maxHeight: 280, overflowY: "auto", padding: 4 }}>
            {list.map((p, i) => (
              <button key={`${p.title}|${p.url}`} type="button" role="option" aria-selected={value?.url === p.url && value.title === p.title} onMouseEnter={() => setActive(i)} onClick={() => pick(p)}
                className="row g8" style={{ width: "100%", padding: "6px 8px", borderRadius: 7, textAlign: "left", background: i === active ? "var(--tray)" : "transparent" }}>
                <img src={p.url} alt="" width={28} height={28} style={{ borderRadius: 5, objectFit: "cover", flexShrink: 0, boxShadow: "0 0 0 1px var(--line)" }} />
                <span className="col fill" style={{ minWidth: 0 }}>
                  <span className="xs i1 ell">{p.title}</span>
                  <span className="xs i3">{money(p.price)}{p.stock != null ? ` · ${p.stock} in stock` : ""}</span>
                </span>
                {value?.url === p.url && value.title === p.title && <Icon name="check" size={12} color="#1F8A5B" />}
              </button>
            ))}
            {!list.length && <span className="xs i3" style={{ display: "block", padding: "10px 8px" }}>{searching ? "Searching the catalog…" : "No product with a photo matches that."}</span>}
          </div>
          <span className="xs i3" style={{ padding: "6px 10px", borderTop: "1px solid var(--line)" }}>{term.length >= 2 ? "Searching all products" : `Top ${products.length} by stock · type to search all`}</span>
        </div>
      )}
    </div>
  );
}
