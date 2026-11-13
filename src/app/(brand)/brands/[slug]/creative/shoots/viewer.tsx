"use client";
/* eslint-disable @next/next/no-img-element -- generated media */
import { useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import { AgentFace } from "@/components/agent";
import { agoFrom, asset, flagOf, passes, usd, type Check, type Shot } from "./canvas-nodes";

type Edit = "remove-bg" | "extend" | "relight";

/** Full-screen look at what a node made: play clips with sound, flip through results, act on one. */
export function ResultViewer({ items, start, title, now, busy, checkOf, onClose, actions }: {
  items: Shot[]; start: number; title: string; now: number; busy: boolean; checkOf: (id: string) => Check | null; onClose: () => void;
  actions: {
    design: (id: string) => void; edit?: (id: string, k: Edit) => void; startClip?: (id: string) => void; rerun?: (id: string) => void; recheck?: (id: string) => void;
    pick?: { on: (id: string) => boolean; toggle: (id: string) => void }; remove: (id: string) => void;
  };
}) {
  const [i, setI] = useState(Math.max(0, Math.min(start, items.length - 1)));
  const [full, setFull] = useState(false);
  const shot = items[i];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea")) return;
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") setI((x) => Math.min(items.length - 1, x + 1));
      else if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items.length, onClose]);
  if (!shot) return null;
  const check = checkOf(shot.id), video = shot.kind === "video";
  const rows: [string, boolean | undefined][] = check ? [["Label matches", check.labelMatches], ["Shape exact", check.shapeExact], ["Colours on-brand", check.coloursOnBrand], ["No text or watermark", check.noTextOrWatermark]] : [];
  const nav = (d: number, label: string, icon: "chev-l" | "chev-r", off: boolean) => (
    <button type="button" aria-label={label} disabled={off} onClick={() => setI((x) => x + d)}
      style={{ width: 40, height: 40, borderRadius: 99, background: "rgba(255,255,255,.12)", display: "flex", alignItems: "center", justifyContent: "center", opacity: off ? 0.25 : 1, flexShrink: 0 }}>
      <Icon name={icon} size={18} color="#fff" />
    </button>
  );

  return (
    <div role="dialog" aria-modal aria-label={title} onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 80, display: "flex", background: "rgba(14,14,14,.86)", backdropFilter: "blur(6px)" }}>
      <div className="col fill" style={{ minWidth: 0, padding: "16px 20px 14px", gap: 12 }} onClick={(e) => e.stopPropagation()}>
        <div className="row g10">
          <span className="sm w5" style={{ color: "#fff" }}>{title}</span>
          <span className="xs" style={{ color: "rgba(255,255,255,.6)" }}>{i + 1} of {items.length} · {shot.engine ?? (video ? "Clip" : "Photo")}{shot.seconds ? ` · ${shot.seconds}s` : ""}{video ? (shot.sound ? " · with sound" : " · silent") : ""}</span>
          <span className="fill" />
          <button type="button" className="row g6 xs" onClick={() => setFull((f) => !f)} style={{ color: "rgba(255,255,255,.8)" }}><Icon name={full ? "minus" : "arrow-ur"} size={12} color="#fff" />{full ? "Fit" : "Actual size"}</button>
          <button type="button" aria-label="Close" onClick={onClose} style={{ width: 32, height: 32, borderRadius: 99, background: "rgba(255,255,255,.12)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="x" size={14} color="#fff" /></button>
        </div>
        <div className="row fill g12" style={{ minHeight: 0, alignItems: "center", justifyContent: "center" }}>
          {nav(-1, "Previous", "chev-l", i === 0)}
          <div className="fill" style={{ height: "100%", minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center", overflow: full ? "auto" : "hidden" }}>
            {video
              ? <video key={shot.id} src={asset(shot.id)} controls autoPlay playsInline loop style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 10, background: "#000" }} />
              : <img key={shot.id} src={asset(shot.id)} alt="" style={full ? { borderRadius: 10 } : { maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 10 }} />}
          </div>
          {nav(1, "Next", "chev-r", i === items.length - 1)}
        </div>
        <div className="row g8" style={{ justifyContent: "center", overflowX: "auto", paddingBottom: 2 }}>
          {items.map((s, j) => {
            const f = s.kind === "image" ? flagOf(checkOf(s.id)) : null;
            return (
              <button key={s.id} type="button" onClick={() => setI(j)} aria-label={`Result ${j + 1}`}
                style={{ position: "relative", width: 58, height: 58, borderRadius: 8, overflow: "hidden", flexShrink: 0, padding: 0, boxShadow: j === i ? "0 0 0 2px #fff" : "0 0 0 1px rgba(255,255,255,.2)", opacity: j === i ? 1 : 0.7 }}>
                {s.kind === "video" ? <video src={asset(s.id)} muted preload="metadata" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <img src={asset(s.id)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                {f && <span style={{ position: "absolute", left: 2, bottom: 2, width: 8, height: 8, borderRadius: 99, background: "#E0A030" }} />}
                {s.kind === "video" && <span style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)" }}><Icon name="play" size={12} weight="fill" color="#fff" /></span>}
              </button>
            );
          })}
        </div>
      </div>

      <aside className="col" onClick={(e) => e.stopPropagation()} style={{ width: 320, flexShrink: 0, background: "#fff", padding: 16, gap: 14, overflowY: "auto" }}>
        {!video && (
          <div className="col g6" style={{ padding: 12, borderRadius: 12, background: check ? (passes(check) ? "#EEF7F1" : "var(--amber-bg)") : "var(--tray)" }}>
            <span className="row g8 sm w5"><AgentFace kind="qa" size={18} />{check ? (passes(check) ? "Otto: passed" : `Otto: ${flagOf(check)}`) : "Otto hasn’t checked this one"}</span>
            {rows.map(([t, ok]) => <span key={t} className="row g6 xs"><Icon name={ok ? "check-circle" : "warning-circle"} size={12} weight={ok ? "fill" : "regular"} color={ok ? "#1F8A5B" : "#B7791F"} /><span className={ok ? "i2" : "c-amber"}>{t}</span></span>)}
            {check?.note && <span className="xs i2" style={{ lineHeight: "16px" }}>“{check.note}”</span>}
            <div className="row g6">{actions.rerun && check && !passes(check) && <button type="button" className="btn sm" disabled={busy} onClick={() => actions.rerun!(shot.id)}><Icon name="refresh" size={12} />Re-run this one</button>}
              {actions.recheck && <button type="button" className="btn quiet sm" disabled={busy} onClick={() => actions.recheck!(shot.id)}>Check {check ? "again" : "now"}</button>}</div>
          </div>
        )}
        <div className="col g6">
          <button type="button" className="btn dark" disabled={busy} onClick={() => actions.design(shot.id)} style={{ justifyContent: "center" }}><Icon name="pen" size={13} color="#fff" />Design an ad with it</button>
          {!video && actions.startClip && <button type="button" className="btn" onClick={() => actions.startClip!(shot.id)} style={{ justifyContent: "center" }}><Icon name="video" size={13} />Start the clip from this photo</button>}
          {actions.pick && <button type="button" className="btn" onClick={() => actions.pick!.toggle(shot.id)} style={{ justifyContent: "center" }}><Icon name={actions.pick.on(shot.id) ? "check-circle" : "circle"} size={13} weight={actions.pick.on(shot.id) ? "fill" : "regular"} color={actions.pick.on(shot.id) ? "#1F8A5B" : undefined} />{actions.pick.on(shot.id) ? "Picked to send" : "Pick to send"}</button>}
        </div>
        {!video && actions.edit && (
          <div className="col g6">
            <span className="xs w5 i3">Edit · a new photo, the original stays</span>
            <div className="row g4" style={{ flexWrap: "wrap" }}>{([["remove-bg", "Remove bg"], ["extend", "Extend to 9:16"], ["relight", "Relight"]] as const).map(([k, l]) => <button key={k} type="button" className="btn sm" disabled={busy} onClick={() => actions.edit!(shot.id, k)}><Icon name="brush" size={12} />{l}</button>)}</div>
          </div>
        )}
        <div className="col" style={{ borderTop: "1px solid var(--line)" }}>
          {([["Made", agoFrom(shot.at, now)], ["Model", shot.engine ?? "—"], ["Product", shot.product ?? "—"], ["Cost", shot.cost != null ? usd(shot.cost) : "—"], ...(shot.edit ? [["Edit", shot.edit]] : [])] as [string, string][]).map(([a, b]) => (
            <div key={a} className="row between g8" style={{ minHeight: 28, borderBottom: "1px solid var(--line)" }}><span className="xs i3">{a}</span><span className="xs i1 ell" style={{ maxWidth: 200 }}>{b}</span></div>))}
        </div>
        {shot.prompt && <div className="col g4"><span className="xs w5 i3">Prompt</span><span className="xs i2" style={{ lineHeight: "17px" }}>{shot.prompt}</span></div>}
        <div className="row g10 xs" style={{ marginTop: "auto" }}>
          <a className="lnk i2 row g4" href={asset(shot.id)} download><Icon name="download" size={12} />Download</a>
          <button type="button" className="lnk i3" onClick={() => { actions.remove(shot.id); if (items.length <= 1) onClose(); else setI((x) => Math.min(x, items.length - 2)); }}>Delete</button>
        </div>
      </aside>
    </div>
  );
}
