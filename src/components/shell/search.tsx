"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export type SearchItem = { label: string; sub?: string; href: string; group: string };

/** Sidebar search box (design: “Search ⌘K”) opening a command palette over brands and pages. */
export function SearchBox({ items }: { items: SearchItem[] }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <>
      <button type="button" className="input sm" onClick={() => setOpen(true)} style={{ background: "transparent", borderColor: "var(--line-2)", boxShadow: "none", width: "100%", cursor: "pointer" }}>
        <svg width="14" height="14" viewBox="0 0 256 256" fill="#8B8883"><path d="m229.66 218.34-50.07-50.06a88.11 88.11 0 1 0-11.31 11.31l50.06 50.07a8 8 0 0 0 11.32-11.32M40 112a72 72 0 1 1 72 72 72.08 72.08 0 0 1-72-72" /></svg>
        <span className="fill" style={{ color: "var(--ink-3)", textAlign: "left" }}>Search</span><span className="key">⌘K</span>
      </button>
      {open && <Palette items={items} onClose={() => setOpen(false)} />}
    </>
  );
}

function Palette({ items, onClose }: { items: SearchItem[]; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (t ? items.filter((x) => `${x.label} ${x.sub ?? ""} ${x.group}`.toLowerCase().includes(t)) : items).slice(0, 40);
  }, [q, items]);
  useEffect(() => { input.current?.focus(); }, []);
  const go = (it?: SearchItem) => { if (!it) return; onClose(); router.push(it.href); };
  return (
    <div className="scrim fx" style={{ alignItems: "flex-start", paddingTop: "14vh" }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-label="Search" style={{ maxWidth: 560 }}>
        <div className="row g10" style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)" }}>
          <svg width="16" height="16" viewBox="0 0 256 256" fill="#8B8883"><path d="m229.66 218.34-50.07-50.06a88.11 88.11 0 1 0-11.31 11.31l50.06 50.07a8 8 0 0 0 11.32-11.32M40 112a72 72 0 1 1 72 72 72.08 72.08 0 0 1-72-72" /></svg>
          <input ref={input} value={q} placeholder="Search brands and pages…" style={{ flex: 1, border: 0, outline: 0, fontSize: 14, background: "transparent" }}
            onChange={(e) => { setQ(e.target.value); setI(0); }}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "ArrowDown") { e.preventDefault(); setI((n) => Math.min(n + 1, list.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setI((n) => Math.max(n - 1, 0)); }
              if (e.key === "Enter") go(list[i]);
            }} />
          <span className="key">esc</span>
        </div>
        <div className="col" style={{ maxHeight: 380, overflowY: "auto", padding: 6 }}>
          {list.length === 0 && <span className="sm i3" style={{ padding: 14 }}>Nothing matches “{q}”.</span>}
          {list.map((it, n) => {
            const head = n === 0 || list[n - 1].group !== it.group ? it.group : null;
            return (
              <div key={it.href + it.label}>
                {head && <div className="xs i3" style={{ padding: "8px 10px 4px" }}>{head}</div>}
                <button type="button" onMouseEnter={() => setI(n)} onClick={() => go(it)}
                  className="row g10" style={{ width: "100%", height: 38, padding: "0 10px", borderRadius: 8, background: n === i ? "var(--tray)" : "transparent", textAlign: "left" }}>
                  <span className="sm i1 fill ell">{it.label}</span>{it.sub && <span className="xs i3 ell">{it.sub}</span>}
                  {n === i && <span className="key">↵</span>}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
