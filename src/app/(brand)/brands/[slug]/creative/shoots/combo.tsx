"use client";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icon";

export type ComboOption = { value: string; label: string; sub?: string; icon?: React.ReactNode; tone?: "muted" };

/** One picker for the canvas: a list you click, with search once it's long (more than 6 options). */
export function Combo({ value, options, onChange, label, icon, prefix, chip = false, searchable }: {
  value: string; options: ComboOption[]; onChange: (v: string) => void; label: string; icon?: React.ReactNode; prefix?: string; chip?: boolean; searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const search = searchable ?? options.length > 6;
  const cur = options.find((o) => o.value === value);
  const term = q.trim().toLowerCase();
  const shown = term ? options.filter((o) => `${o.label} ${o.sub ?? ""}`.toLowerCase().includes(term)) : options;

  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, [open]);

  const show = () => {
    setOpen(true); setQ("");
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setTimeout(() => (search ? input.current : list.current)?.focus(), 0);
  };
  const pick = (o: ComboOption) => { onChange(o.value); setOpen(false); };
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(shown.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter" && shown[active]) { e.preventDefault(); pick(shown[active]); }
    else if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
  };

  return (
    <div ref={box} style={{ position: "relative", flexShrink: 0, ...(chip ? {} : { width: "100%" }) }}>
      <button type="button" aria-haspopup="listbox" aria-expanded={open} aria-label={label} onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(e) => { if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) { e.preventDefault(); show(); } }}
        className={chip ? "chip" : "row g8"}
        style={chip ? { height: 28, fontSize: 12, maxWidth: 280 } : { width: "100%", height: 34, padding: "0 10px", border: `1px solid ${open ? "var(--ink)" : "var(--line-2)"}`, borderRadius: 8, background: "#fff", textAlign: "left" }}>
        {icon}{prefix && <span>{prefix}</span>}
        <span className={chip ? "v ell" : "sm i1 fill ell"}>{cur?.label ?? "—"}</span>
        <Icon name="chev-d" size={chip ? 11 : 12} color="#8B8883" />
      </button>
      {open && (
        <div className="col" style={{ position: "absolute", left: 0, top: chip ? 32 : 38, zIndex: 40, minWidth: chip ? 300 : "100%", maxWidth: 380, background: "#fff", borderRadius: 10, boxShadow: "0 0 0 1px var(--line), 0 10px 28px rgba(18,18,18,.14)", overflow: "hidden" }}>
          {search && (
            <label className="row g6" style={{ height: 34, padding: "0 10px", borderBottom: "1px solid var(--line)" }}>
              <Icon name="search" size={13} color="#8B8883" />
              <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }} onKeyDown={keys} placeholder={`Search ${label.toLowerCase()}`} aria-label={`Search ${label}`}
                style={{ border: 0, outline: 0, flex: 1, font: "inherit", fontSize: 12.5, background: "transparent" }} />
            </label>
          )}
          <div ref={list} role="listbox" aria-label={label} tabIndex={-1} onKeyDown={keys} style={{ maxHeight: 300, overflowY: "auto", padding: 4, outline: 0 }}>
            {shown.map((o, i) => (
              <button key={o.value || "_"} type="button" role="option" aria-selected={o.value === value} onMouseEnter={() => setActive(i)} onClick={() => pick(o)}
                className="row g8" style={{ width: "100%", padding: "7px 8px", borderRadius: 7, textAlign: "left", background: i === active ? "var(--tray)" : "transparent" }}>
                {o.icon}
                <span className="col fill" style={{ minWidth: 0 }}>
                  <span className={`xs ell ${o.tone === "muted" ? "i3" : "i1"}`}>{o.label}</span>
                  {o.sub && <span className="xs i3 ell">{o.sub}</span>}
                </span>
                {o.value === value && <Icon name="check" size={12} color="#1F8A5B" />}
              </button>
            ))}
            {!shown.length && <span className="xs i3" style={{ display: "block", padding: "10px 8px" }}>Nothing matches.</span>}
          </div>
        </div>
      )}
    </div>
  );
}
