"use client";
import { useState } from "react";
import { Icon } from "@/components/icon";
import { AgentFace } from "@/components/agent";
import { Source } from "../research/position";
import { ASOURCE_NAME, PANEL_NAME, type ASource, type PanelBody, type PanelKind, type Persona } from "@/lib/audience/types";

const TONES = [["#1F8A5B", "#EAF5EF"], ["#2563EB", "#EDF2FD"], ["#B7791F", "#FBF3E6"], ["#5B6FD6", "#EFF1FB"], ["#C2410C", "#FDEFE7"], ["#0E7490", "#E6F4F7"]] as const;
/** The same colour for a group everywhere on the page. */
export const groupTone = (groups: string[], g: string) => TONES[Math.max(0, groups.indexOf(g)) % TONES.length];
export const groupsOf = (ps: Persona[]) => [...new Set(ps.map((p) => p.group))];

export function Face({ p, groups, size = 26 }: { p: Persona; groups: string[]; size?: number }) {
  const [c, bg] = groupTone(groups, p.group);
  return <span title={`${p.name}, ${p.age} · ${p.group}`} style={{ width: size, height: size, borderRadius: 99, flexShrink: 0, background: bg, color: c, border: `1px solid ${c}33`, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.42, fontWeight: 600 }}>{p.name.charAt(0)}</span>;
}

export function ASourceChip({ s }: { s: ASource }) {
  if (s !== "general") return <Source s={s} />;
  return <span className="row g4" style={{ height: 20, padding: "0 7px", borderRadius: 6, background: "#F2F1EE", color: "#55534F", fontSize: 10.5, fontWeight: 500, whiteSpace: "nowrap", flexShrink: 0 }}><Icon name="users" size={11} color="#55534F" />{ASOURCE_NAME.general}</span>;
}

/** The people on the panel, who they stand for, and what the panel is built from. */
export function PanelRail({ kind, body, builtAt }: { kind: PanelKind; body: PanelBody; builtAt: string | null }) {
  const [open, setOpen] = useState<string | null>(null);
  const groups = groupsOf(body.personas);
  const weightOf = (g: string) => Math.round(body.personas.filter((p) => p.group === g).reduce((a, p) => a + p.weight, 0));
  return (
    <aside className="col" style={{ width: 340, flexShrink: 0, borderLeft: "1px solid var(--line)", background: "var(--tray)", overflowY: "auto" }}>
      <div className="col g12" style={{ padding: "16px 18px" }}>
        <div className="row g8">
          <AgentFace kind="analyst" size={20} />
          <span className="col fill" style={{ minWidth: 0 }}>
            <span className="sm w5 i1">{PANEL_NAME[kind]} · {body.personas.length} people</span>
            <span className="xs i3" suppressHydrationWarning>Built by Iris{builtAt ? ` · ${new Date(builtAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}</span>
          </span>
        </div>
        <span className="xs i2" style={{ lineHeight: "17px" }}>{body.summary}</span>

        <div className="col g6">
          <span className="xs w5 i2">Who they stand for</span>
          <div className="row" style={{ height: 8, borderRadius: 99, overflow: "hidden", gap: 2 }}>
            {groups.map((g) => <span key={g} title={`${g} · ${weightOf(g)}%`} style={{ width: `${weightOf(g)}%`, background: groupTone(groups, g)[0], height: 8 }} />)}
          </div>
          <div className="col g4">
            {groups.map((g) => <span key={g} className="row g6 xs i2"><span className="dot" style={{ width: 7, height: 7, background: groupTone(groups, g)[0] }} /><span className="fill ell">{g}</span><span className="i3 tnum">{weightOf(g)}%</span></span>)}
          </div>
        </div>

        <div className="col g6">
          <span className="xs w5 i2">Built from</span>
          {body.facts.map((f, i) => <div key={i} className="row top g8"><span className="xs i2 fill" style={{ lineHeight: "16px" }}>{f.text}</span><ASourceChip s={f.source} /></div>)}
        </div>

        <div className="col g6">
          <span className="xs w5 i2">The people</span>
          {body.personas.map((p) => {
            const on = open === p.id;
            return (
              <div key={p.id} className="col" style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden" }}>
                <button type="button" className="row g8" style={{ padding: "8px 10px", textAlign: "left", width: "100%" }} onClick={() => setOpen(on ? null : p.id)} aria-expanded={on}>
                  <Face p={p} groups={groups} />
                  <span className="col fill" style={{ minWidth: 0 }}>
                    <span className="xs w5 i1 ell">{p.name}, {p.age} · {p.place}</span>
                    <span className="xs i3 ell">{p.relation}</span>
                  </span>
                  <span className="xs i3 tnum">{p.weight}%</span>
                  <Icon name={on ? "chev-d" : "chev-r"} size={12} />
                </button>
                {on && (
                  <div className="col g6" style={{ padding: "2px 12px 10px 44px" }}>
                    <span className="xs i1" style={{ lineHeight: "16px" }}>{p.life}</span>
                    {([["Wants", p.wants], ["Worries", p.worries.join(" · ")], ["Budget", p.budget], ["Shops", p.shops], ["Feed", p.feed], ["Convinced by", p.trusts]] as const).map(([k, v]) => (
                      <span key={k} className="xs i2" style={{ lineHeight: "16px" }}><b className="w5 i1">{k}:</b> {v}</span>
                    ))}
                    <span className="xs i3" style={{ lineHeight: "16px" }}><b className="w5">Why on the panel:</b> {p.basis}</span>
                    <span className="row g4" style={{ flexWrap: "wrap" }}>{p.sources.map((s) => <ASourceChip key={s} s={s} />)}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <span className="xs i3" style={{ lineHeight: "16px" }}>Each person is a small agent playing one shopper. They look at the feed twice, in opposite orders, so an ad’s place in the feed doesn’t decide its score.</span>
      </div>
    </aside>
  );
}

export function PanelArt() {
  const people = [["M", "Maya, 29", "Tap", "#1F8A5B", "#EAF5EF"], ["D", "Dana, 41", "Stopped", "#2563EB", "#EDF2FD"], ["L", "Luis, 34", "Scrolled past", "#8B8883", "#F2F1EE"], ["P", "Priya, 23", "Probably buy", "#1F8A5B", "#EAF5EF"]];
  return (
    <div className="col g8" style={{ width: 270, padding: 18, justifyContent: "center", background: "var(--tray)" }}>
      {people.map(([i, n, r, c, bg]) => (
        <div key={n} className="row g8" style={{ padding: "8px 10px", background: "#fff", borderRadius: 10, border: "1px solid var(--line)" }}>
          <span style={{ width: 24, height: 24, borderRadius: 99, background: bg, color: c, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600 }}>{i}</span>
          <span className="xs w5 i1 fill">{n}</span>
          <span className="xs" style={{ color: c }}>{r}</span>
        </div>
      ))}
    </div>
  );
}
