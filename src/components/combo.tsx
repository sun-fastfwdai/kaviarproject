"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./icon";

/**
 * A picker that shows what it is picking: each choice has its picture (or an icon), its name, one fact under it and one at the right.
 * Typing narrows the list; arrows move, Enter picks, Esc closes. The list is drawn on top of the page, so it is never cut off by a
 * modal or a scrolling card.
 */
export type ComboItem = { value: string; label: string; sub?: string; right?: string; image?: string | null; icon?: Parameters<typeof Icon>[0]["name"]; tone?: "warn" };

function Thumb({ it, size }: { it: ComboItem; size: number }) {
  const box = { width: size, height: size, borderRadius: Math.round(size / 4), flexShrink: 0 } as const;
  // eslint-disable-next-line @next/next/no-img-element
  if (it.image) return <img src={it.image} alt="" loading="lazy" style={{ ...box, objectFit: "cover", background: "#fff", boxShadow: "0 0 0 1px var(--line)" }} />;
  return <span style={{ ...box, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--tray-2)" }}><Icon name={it.icon ?? "box"} size={Math.round(size / 2.2)} color="#8B8883" /></span>;
}

export function Combo({ items, value, onChange, label, placeholder = "Choose…", searchText = "Search" }: {
  items: ComboItem[]; value: string; onChange: (v: string) => void; label: string; placeholder?: string; searchText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [at, setAt] = useState(0);
  const [box, setBox] = useState<{ left: number; top: number; width: number; max: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null), pop = useRef<HTMLDivElement>(null), list = useRef<HTMLDivElement>(null);
  const cur = items.find((x) => x.value === value);
  const shown = useMemo(() => { const k = q.trim().toLowerCase(); return k ? items.filter((x) => `${x.label} ${x.sub ?? ""}`.toLowerCase().includes(k)) : items; }, [items, q]);
  const search = items.length > 5;

  const place = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom - 12, above = r.top - 12, up = below < 220 && above > below, max = Math.min(360, Math.max(160, up ? above : below));
    setBox({ left: r.left, top: up ? r.top - 6 - max : r.bottom + 6, width: r.width, max });
  };
  const show = () => { setQ(""); setAt(Math.max(0, items.findIndex((x) => x.value === value))); place(); setOpen(true); };
  const pick = (v: string) => { onChange(v); setOpen(false); btn.current?.focus(); };

  useLayoutEffect(() => { if (open) place(); }, [open, shown.length]);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!pop.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false); };
    const move = () => place();
    document.addEventListener("mousedown", away); window.addEventListener("resize", move); window.addEventListener("scroll", move, true);
    return () => { document.removeEventListener("mousedown", away); window.removeEventListener("resize", move); window.removeEventListener("scroll", move, true); };
  }, [open]);
  useEffect(() => { list.current?.querySelector<HTMLElement>(`[data-i="${at}"]`)?.scrollIntoView({ block: "nearest" }); }, [at, open]);

  const key = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setAt((i) => Math.min(shown.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setAt((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); if (shown[at]) pick(shown[at].value); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); btn.current?.focus(); }
    else if (e.key === "Tab") setOpen(false);
  };

  return (
    <>
      <button ref={btn} type="button" className="input row g10" role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls="combo-list" aria-label={label}
        onClick={() => (open ? setOpen(false) : show())} onKeyDown={(e) => { if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) { e.preventDefault(); show(); } else if (open && !search) key(e); }}
        style={{ height: 52, padding: "0 12px 0 8px", textAlign: "left", width: "100%", cursor: "pointer" }}>
        {cur ? <>
          <Thumb it={cur} size={36} />
          <span className="col fill" style={{ minWidth: 0, lineHeight: 1.25 }}><span className="ell sm w5 i1">{cur.label}</span>{cur.sub && <span className="ell xs i3">{cur.sub}</span>}</span>
          {cur.right && <span className={`xs tnum ${cur.tone === "warn" ? "" : "i3"}`} style={{ flexShrink: 0, color: cur.tone === "warn" ? "var(--amber)" : undefined }}>{cur.right}</span>}
        </> : <span className="fill sm i3" style={{ paddingLeft: 4 }}>{placeholder}</span>}
        <Icon name="chev-d" size={13} color="#8B8883" style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : undefined, transition: "transform .15s ease" }} />
      </button>
      {open && box && createPortal(
        <div ref={pop} className="col" style={{ position: "fixed", left: box.left, top: box.top, width: box.width, maxHeight: box.max, zIndex: 400, background: "#fff", borderRadius: 14, boxShadow: "0 0 0 1px var(--line), 0 18px 44px rgba(18,18,18,.16)", overflow: "hidden" }}
          onMouseDown={(e) => e.stopPropagation()}>
          {search && <label className="row g8" style={{ padding: "10px 12px", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
            <Icon name="search" size={13} color="#8B8883" />
            <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setAt(0); }} onKeyDown={key} placeholder={searchText} aria-label={searchText} aria-controls="combo-list"
              style={{ flex: 1, minWidth: 0, border: 0, outline: 0, font: "inherit", fontSize: 14, background: "transparent" }} />
            <span className="xs i3 tnum">{shown.length}</span>
          </label>}
          <div ref={list} id="combo-list" role="listbox" aria-label={label} className="col" style={{ padding: 4, overflowY: "auto", minHeight: 0 }}>
            {shown.map((it, i) => (
              <button key={it.value} type="button" role="option" aria-selected={it.value === value} data-i={i} onMouseEnter={() => setAt(i)} onClick={() => pick(it.value)} className="row g10"
                style={{ padding: "8px 10px 8px 8px", borderRadius: 10, textAlign: "left", background: i === at ? "var(--tray)" : "transparent", flexShrink: 0 }}>
                <Thumb it={it} size={40} />
                <span className="col fill" style={{ minWidth: 0, lineHeight: 1.3 }}><span className="ell sm w5 i1">{it.label}</span>{it.sub && <span className="ell xs i3">{it.sub}</span>}</span>
                {it.right && <span className="xs tnum" style={{ flexShrink: 0, color: it.tone === "warn" ? "var(--amber)" : "var(--ink-3)" }}>{it.right}</span>}
                <span style={{ width: 14, flexShrink: 0 }}>{it.value === value && <Icon name="check" size={13} />}</span>
              </button>))}
            {!shown.length && <span className="sm i3" style={{ padding: "14px 12px" }}>Nothing matches “{q}”</span>}
          </div>
        </div>, document.body)}
    </>
  );
}
