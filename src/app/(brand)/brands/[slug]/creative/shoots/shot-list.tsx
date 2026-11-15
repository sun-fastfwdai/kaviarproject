"use client";
import { Combo } from "./combo";
import { Icon } from "@/components/icon";
import { AgentFace } from "@/components/agent";
import { ANGLES, CAMERA, SIZES, SIZE_SHORT, fitTimes } from "@/lib/creative/director";
import type { DirShot, ShotPlan } from "@/lib/db/schema";

const opts = (xs: readonly string[]) => xs.map((x) => ({ value: x, label: x }));

/** A clip's shot list, as a director hands it to the camera: a timeline, then each shot's framing, angle, move, action and line. */
export function ShotList({ plan, talk, onChange }: {
  plan: ShotPlan; talk: boolean; // talk: the clip has a voice, so shots can carry lines
  onChange: (p: ShotPlan, save: boolean) => void;
}) {
  const set = (i: number, x: Partial<DirShot>, save = true) => onChange({ ...plan, shots: plan.shots.map((s, j) => (j === i ? { ...s, ...x } : s)) }, save);
  const remove = (i: number) => onChange({ ...plan, shots: fitTimes(plan.shots.filter((_, j) => j !== i), plan.seconds) }, true);
  // Move the cut after shot i by one second, keeping every shot at least a second long.
  const nudge = (i: number, d: number) => {
    const a = plan.shots[i], b = plan.shots[i + 1];
    if (!b || a.to + d <= a.from || a.to + d >= b.to) return;
    onChange({ ...plan, shots: plan.shots.map((s, j) => (j === i ? { ...s, to: s.to + d } : j === i + 1 ? { ...s, from: s.from + d } : s)) }, true);
  };

  return (
    <div className="col g8">
      <div className="col g4">
        <div className="row" style={{ height: 26, borderRadius: 7, overflow: "hidden", gap: 2 }}>
          {plan.shots.map((s, i) => (
            <div key={i} title={`Shot ${i + 1} · ${s.size}`} style={{ flex: Math.max(1, s.to - s.from), minWidth: 0, background: i % 2 ? "#D7EFF5" : "#EAF7FA", color: "#1A8FAB", display: "flex", alignItems: "center", justifyContent: "center", gap: 3, fontSize: 10.5, fontWeight: 500 }}>
              <span className="tnum" style={{ opacity: 0.6 }}>{i + 1}</span>{SIZE_SHORT[s.size] ?? ""}
            </div>
          ))}
        </div>
        <div className="row between xs i3 tnum"><span>0s</span><span>{plan.seconds}s</span></div>
      </div>

      {plan.shots.map((s, i) => (
        <div key={i} className="col g6" style={{ padding: "8px 10px 10px", borderRadius: 10, border: "1px solid var(--line)" }}>
          <div className="row g6">
            <span className="tnum" style={{ width: 18, height: 18, borderRadius: 5, background: "var(--ink)", color: "#fff", fontSize: 10, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</span>
            <span className="xs w5 i1 tnum">{s.from}–{s.to}s</span>
            {i < plan.shots.length - 1 && (
              <span className="row g2" title="Move the cut">
                <button type="button" aria-label={`End shot ${i + 1} a second earlier`} onClick={() => nudge(i, -1)} style={{ width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 4 }}><Icon name="minus" size={10} color="#8B8883" /></button>
                <button type="button" aria-label={`End shot ${i + 1} a second later`} onClick={() => nudge(i, 1)} style={{ width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 4 }}><Icon name="plus" size={10} color="#8B8883" /></button>
              </span>
            )}
            <span className="fill" />
            {plan.shots.length > 1 && <button type="button" aria-label={`Remove shot ${i + 1}`} title="Remove shot" onClick={() => remove(i)} style={{ display: "flex" }}><Icon name="x" size={11} color="#B5B2AC" /></button>}
          </div>
          <div className="row g4" style={{ flexWrap: "wrap" }}>
            <Combo chip small menuWidth={200} label="Shot size" value={s.size} options={opts(SIZES)} onChange={(v) => set(i, { size: v })} />
            <Combo chip small menuWidth={200} label="Angle" value={s.angle} options={opts(ANGLES)} onChange={(v) => set(i, { angle: v })} />
            <Combo chip small menuWidth={200} label="Camera move" value={s.move} options={opts(CAMERA)} onChange={(v) => set(i, { move: v })} />
          </div>
          <textarea value={s.action} rows={3} maxLength={300} aria-label={`Shot ${i + 1} action`} onChange={(e) => set(i, { action: e.target.value }, false)}
            style={{ border: "1px solid var(--line-2)", borderRadius: 8, padding: "6px 8px", resize: "vertical", font: "inherit", fontSize: 12, lineHeight: "17px" }} />
          {talk && (
            <label className="row g6" style={{ height: 28, padding: "0 8px", borderRadius: 7, background: "var(--tray)" }}>
              <Icon name="msg" size={12} color="#8B8883" />
              <input value={s.line ?? ""} maxLength={140} onChange={(e) => set(i, { line: e.target.value }, false)} placeholder="Says… (or nothing in this shot)" aria-label={`Shot ${i + 1} line`}
                style={{ border: 0, outline: 0, background: "transparent", font: "inherit", fontSize: 12, width: "100%" }} />
            </label>
          )}
        </div>
      ))}

      {plan.why && <div className="row top g6"><AgentFace kind="builder" size={16} /><span className="xs i2" style={{ lineHeight: "16px" }}>{plan.why}</span></div>}
    </div>
  );
}
