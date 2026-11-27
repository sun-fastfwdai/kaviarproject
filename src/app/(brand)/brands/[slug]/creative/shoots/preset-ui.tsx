"use client";
/* eslint-disable @next/next/no-img-element -- Higgsfield's preset covers */
import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { listPresets } from "./actions";

/** One of Higgsfield's Marketing Studio presets, as the picker shows it. */
export type Preset = { id: string; name: string; group: string; type: string; ratio: string | null; cover: string | null };
export type PresetPick = { id: string; name: string; cover?: string | null };

// The catalogue is the same for every brand and changes rarely: read it once a visit.
let cached: Preset[] | null = null;

/**
 * Higgsfield's presets as a gallery: their cover, name and group, searchable. Picking one either sets the Photo node to render with it,
 * or makes a new picture with it straight away (`action` names which).
 */
export function PresetPicker({ slug, current, price, action, onPick, onClose }: {
  slug: string; current: string | null; price: string; action: string; onPick: (p: PresetPick) => void; onClose: () => void;
}) {
  const [list, setList] = useState<Preset[] | null>(cached);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(current);
  useEffect(() => {
    if (cached) return;
    let live = true;
    listPresets(slug).then((r) => { if (!live) return; if (r.presets) { cached = r.presets; setList(r.presets); } else setError(r.error ?? "Couldn’t read Higgsfield’s presets."); })
      .catch((e: Error) => live && setError(e.message.slice(0, 160)));
    return () => { live = false; };
  }, [slug]);
  const groups = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of list ?? []) m.set(p.group, (m.get(p.group) ?? 0) + 1);
    return [...m];
  }, [list]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (list ?? []).filter((p) => (!group || p.group === group) && (!t || p.name.toLowerCase().includes(t) || p.group.toLowerCase().includes(t)));
  }, [list, q, group]);
  const picked = list?.find((p) => p.id === sel) ?? null;
  const chip = (label: string, n: number, on: boolean, click: () => void) => (
    <button key={label} type="button" aria-pressed={on} onClick={click} className="row g4 xs" style={{ height: 26, padding: "0 10px", borderRadius: 99, flexShrink: 0, background: on ? "var(--ink)" : "var(--tray)", color: on ? "#fff" : "var(--ink)" }}>
      {label}<span style={{ opacity: 0.6 }}>{n}</span></button>
  );

  return (
    <Modal icon={<Icon name="squares" size={16} />} title="Higgsfield presets" sub={list ? `${list.length} set-ups · your product photo goes in first` : undefined} onClose={onClose} width={920}
      footer={<>
        <span className="xs i3 fill">{picked ? `${picked.name} · ${price} a picture` : `${price} a picture`}</span>
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn dark" disabled={!picked} onClick={() => picked && onPick({ id: picked.id, name: picked.name, cover: picked.cover })}>{action}</button>
      </>}>
      {error ? <span className="sm c-amber">{error}</span>
        : !list ? <span className="row g8 sm i3"><Icon name="spinner" size={14} className="spin" />Reading Higgsfield’s presets…</span>
        : <>
          <div className="col g10">
            <div className="row g8" style={{ height: 34, padding: "0 10px", border: "1px solid var(--line-2)", borderRadius: 8 }}>
              <Icon name="search" size={13} color="#8A8782" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search presets" aria-label="Search presets" className="fill sm" style={{ border: 0, outline: "none", background: "transparent", font: "inherit" }} />
            </div>
            {groups.length > 1 && <div className="row g6" style={{ overflowX: "auto", paddingBottom: 2 }}>
              {chip("All", list.length, !group, () => setGroup(null))}
              {groups.map(([g, n]) => chip(g, n, group === g, () => setGroup(group === g ? null : g)))}
            </div>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(128px, 1fr))", gap: 10, maxHeight: "min(56vh, 600px)", overflowY: "auto", padding: 2 }}>
            {shown.map((p) => (
              <button key={p.id} type="button" aria-pressed={sel === p.id} onClick={() => setSel(p.id)} onDoubleClick={() => onPick({ id: p.id, name: p.name, cover: p.cover })}
                className="col g4" style={{ padding: 0, textAlign: "left", background: "transparent", minWidth: 0 }}>
                <span style={{ position: "relative", display: "block", width: "100%", aspectRatio: "4 / 5", borderRadius: 10, overflow: "hidden", background: "var(--tray)", boxShadow: sel === p.id ? "0 0 0 2px var(--ink)" : "0 0 0 1px var(--line)" }}>
                  {p.cover ? <img src={p.cover} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    : <span className="col xs i3" style={{ height: "100%", alignItems: "center", justifyContent: "center", padding: 10, textAlign: "center" }}><Icon name="image" size={18} color="#B5B2AC" />{p.name}</span>}
                  {sel === p.id && <span style={{ position: "absolute", right: 6, top: 6, width: 20, height: 20, borderRadius: 99, background: "var(--ink)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="check" size={11} color="#fff" /></span>}
                  {p.ratio && <span className="xs" style={{ position: "absolute", left: 6, bottom: 6, padding: "1px 6px", borderRadius: 6, background: "rgba(14,14,14,.6)", color: "#fff", fontSize: 10 }}>{p.ratio}</span>}
                </span>
                <span className="xs w5 i1 ell">{p.name}</span>
                <span className="xs i3 ell" style={{ marginTop: -4 }}>{p.group}</span>
              </button>
            ))}
            {!shown.length && <span className="sm i3">No preset matches</span>}
          </div>
        </>}
    </Modal>
  );
}

/** The Photo node's preset: its cover and name, change or clear it — or pick one. */
export function PresetField({ preset, onChoose, onClear }: { preset: PresetPick | null; onChoose: () => void; onClear: () => void }) {
  if (!preset) return <button type="button" className="btn sm" style={{ alignSelf: "flex-start" }} onClick={onChoose}><Icon name="squares" size={12} />Choose a Higgsfield preset</button>;
  return (
    <div className="row g8" style={{ padding: 6, borderRadius: 10, border: "1px solid var(--line-2)" }}>
      <span style={{ width: 36, height: 45, borderRadius: 6, overflow: "hidden", background: "var(--tray)", flexShrink: 0 }}>{preset.cover && <img src={preset.cover} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}</span>
      <span className="sm w5 i1 fill ell">{preset.name}</span>
      <button type="button" className="lnk xs i2" onClick={onChoose}>Change</button>
      <button type="button" aria-label="Clear the preset" title="Clear the preset" onClick={onClear} style={{ width: 24, height: 24, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="x" size={11} color="#8A8782" /></button>
    </div>
  );
}
