import { AgentFace } from "./agent";
import { Icon, type IconName } from "./icon";

type Agent = "analyst" | "builder" | "catalog" | "qa";
export type Step = { agent?: Agent; icon?: IconName; title: string; body: string };

/**
 * Empty screens explain themselves: what this step is for, how it fills up (who does what),
 * a picture of the result, and the one action that starts it.
 */
export function EmptyState({ eyebrow, title, body, steps, art, actions, note }: {
  eyebrow?: string; title: string; body: string; steps: Step[]; art: React.ReactNode; actions: React.ReactNode; note?: React.ReactNode;
}) {
  return (
    <div className="row stretch" style={{ border: "1px solid var(--line)", borderRadius: 16, overflow: "hidden", background: "#fff", flexWrap: "wrap" }}>
      <div className="col g16 fill" style={{ padding: "28px 30px", minWidth: 320 }}>
        <div className="col g6">
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <span className="h2">{title}</span>
          <span className="sm i2" style={{ lineHeight: "21px", maxWidth: 520 }}>{body}</span>
        </div>
        <div className="col g10">
          {steps.map((s, i) => (
            <div key={s.title} className="row top g12">
              <span style={{ width: 26, height: 26, borderRadius: 99, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--tray)", border: "1px solid var(--line)", fontSize: 11.5, fontWeight: 600 }}>{i + 1}</span>
              <div className="col g2">
                <span className="row g6 sm w5 i1">{s.agent && <AgentFace kind={s.agent} size={15} />}{s.icon && !s.agent && <Icon name={s.icon} size={14} />}{s.title}</span>
                <span className="xs i3" style={{ lineHeight: "17px" }}>{s.body}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="row g8" style={{ flexWrap: "wrap" }}>{actions}</div>
        {note && <span className="xs i3" style={{ lineHeight: "17px" }}>{note}</span>}
      </div>
      <div className="col" style={{ flex: "1 1 380px", minWidth: 320, background: "var(--tray)", borderLeft: "1px solid var(--line)", padding: 24, alignItems: "center", justifyContent: "center", backgroundImage: "radial-gradient(#E2DFDA 1px, transparent 1px)", backgroundSize: "14px 14px" }}>
        {art}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ small pieces the illustrations are built from */

const Card = ({ children, w = 132, style }: { children: React.ReactNode; w?: number; style?: React.CSSProperties }) => (
  <div className="col g6" style={{ width: w, padding: 10, background: "#fff", border: "1px solid var(--line)", borderRadius: 12, boxShadow: "0 6px 18px rgba(18,18,18,.06)", ...style }}>{children}</div>
);
const Arrow = () => <svg width="26" height="14" viewBox="0 0 26 14" style={{ flexShrink: 0 }}><path d="M1 7h22m-5-5 5 5-5 5" fill="none" stroke="#B5B2AC" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const Bar = ({ w, tone = "var(--tray-2)", h = 6 }: { w: string; tone?: string; h?: number }) => <span style={{ display: "block", width: w, height: h, borderRadius: 99, background: tone }} />;
const Tile = ({ hook, tone, check, play }: { hook: string; tone: string; check?: boolean; play?: boolean }) => (
  <div style={{ position: "relative", width: 44, height: 56, borderRadius: 7, overflow: "hidden", background: tone, flexShrink: 0 }}>
    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, transparent 40%, rgba(0,0,0,.45))" }} />
    {play && <span style={{ position: "absolute", top: 16, left: 15, width: 14, height: 14, borderRadius: 99, background: "rgba(255,255,255,.9)" }} />}
    <span style={{ position: "absolute", left: 4, right: 4, bottom: 4, color: "#fff", fontFamily: "Georgia, serif", fontSize: 7.5, lineHeight: "9px" }}>{hook}</span>
    {check && <span style={{ position: "absolute", top: 3, left: 3, width: 12, height: 12, borderRadius: 99, background: "var(--green)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="check" size={8} color="#fff" weight="bold" /></span>}
  </div>
);
const TONES = ["#B99A7A", "#8D9A86", "#C8B8A6", "#9E8F80", "#7E8B95", "#B8A48C"];

/** Approved ads → a small paused test → judged on Shopify orders. */
export function RunTestArt() {
  return (
    <div className="row g8" style={{ alignItems: "center" }}>
      <Card w={118}>
        <span className="xs w5 i2">Approved ads</span>
        <div className="row g4">{["We miss you", "Day 46", "Your ritual"].map((h, i) => <Tile key={h} hook={h} tone={TONES[i]} check play={i === 1} />)}</div>
      </Card>
      <Arrow />
      <Card w={136}>
        <span className="row g6 xs w5 i1"><Icon name="target" size={12} />Win-back test</span>
        <span className="row between xs"><span className="i3">Budget</span><span className="i1">$20/day</span></span>
        <span className="row between xs"><span className="i3">For</span><span className="i1">7 days</span></span>
        <span className="row between xs"><span className="i3">Audience</span><span className="i1">2,140</span></span>
        <span className="pill" style={{ height: 18, fontSize: 10, alignSelf: "flex-start" }}>Paused · you switch on</span>
      </Card>
      <Arrow />
      <Card w={118}>
        <span className="xs w5 i2">Day 7 · Shopify</span>
        <svg width="96" height="34" viewBox="0 0 96 34"><path d="M2 30 L18 26 L34 27 L50 18 L66 14 L82 9 L94 5" fill="none" stroke="#1F8A5B" strokeWidth="2" strokeLinecap="round" /></svg>
        <span className="row g4 xs"><b className="c-green">1.8×</b><span className="i3">real return</span></span>
        <span className="pill green" style={{ height: 18, fontSize: 10, alignSelf: "flex-start" }}>Scale it</span>
      </Card>
    </div>
  );
}

/** A signal from the store → Remy writes a batch → you approve. */
export function BatchArt() {
  return (
    <div className="row g8" style={{ alignItems: "center" }}>
      <Card w={124}>
        <span className="row g6 xs w5 i2"><Icon name="lightning" size={12} />Signal</span>
        <span className="sm w5 i1">2,140 lapsed buyers</span>
        <span className="xs i3">bought 60–180 days ago</span>
      </Card>
      <Arrow />
      <Card w={176}>
        <span className="row g6 xs w5 i2"><AgentFace kind="builder" size={13} />Remy writes 6 ads</span>
        <div className="row g4" style={{ flexWrap: "wrap" }}>{["Missing your scent?", "It’s been a while", "Back to ritual", "Day 46", "Still thinking?", "Your shelf misses"].map((h, i) => <Tile key={h} hook={h} tone={TONES[i]} play={i % 3 === 1} check={i < 2} />)}</div>
      </Card>
      <Arrow />
      <Card w={104}>
        <span className="row g6 xs"><Icon name="check-circle" size={13} weight="fill" color="#1F8A5B" /><span className="i1">2 approved</span></span>
        <span className="row g6 xs"><Icon name="x" size={13} color="#C8423B" /><span className="i3">1 rejected</span></span>
        <span className="xs i3" style={{ lineHeight: "14px" }}>“Number feels pushy” → Remy learns</span>
      </Card>
    </div>
  );
}

/** The same design in three Meta sizes, exported as PNGs. */
export function EditorArt() {
  const board = (w: number, h: number, label: string) => (
    <div className="col g4" style={{ alignItems: "center" }}>
      <div style={{ position: "relative", width: w, height: h, borderRadius: 8, overflow: "hidden", background: "linear-gradient(160deg,#C9B49B,#8E7D6B)", boxShadow: "0 6px 18px rgba(18,18,18,.1)" }}>
        <span style={{ position: "absolute", left: 8, top: 8, padding: "2px 6px", borderRadius: 4, background: "#fff", fontSize: 7.5, fontWeight: 700 }}>10% OFF</span>
        <span style={{ position: "absolute", left: 8, right: 8, bottom: 26, color: "#fff", fontFamily: "Georgia, serif", fontSize: 12, lineHeight: "13px", outline: label === "9:16" ? "1px solid #1AA7C8" : "none", outlineOffset: 2 }}>Missing your scent?</span>
        <span style={{ position: "absolute", right: 8, bottom: 8, padding: "2px 7px", borderRadius: 99, background: "#fff", fontSize: 7.5, fontWeight: 600 }}>Shop now</span>
      </div>
      <span className="xs i3">{label}</span>
    </div>
  );
  return (
    <div className="col g12" style={{ alignItems: "center" }}>
      <div className="row g12" style={{ alignItems: "flex-end" }}>{board(72, 128, "9:16")}{board(84, 105, "4:5")}{board(84, 84, "1:1")}</div>
      <span className="chip" style={{ height: 28 }}><Icon name="download" size={12} />3 PNGs · 1080 px</span>
    </div>
  );
}

/** Real product photo + a scene → new photos with the same product. */
export function ShootArt() {
  return (
    <div className="row g8" style={{ alignItems: "center" }}>
      <Card w={96}><span className="xs w5 i2">Shopify photo</span><div style={{ height: 70, borderRadius: 8, background: "linear-gradient(180deg,#F4F2EE,#E5E1DA)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}><span style={{ width: 22, height: 50, borderRadius: "6px 6px 4px 4px", background: "#C79A5B" }} /></div></Card>
      <span className="h3 i3">+</span>
      <Card w={118}><span className="row g6 xs w5 i2"><AgentFace kind="builder" size={13} />Scene</span><span className="xs i1" style={{ lineHeight: "15px" }}>“On a linen-draped vanity, morning light, a hand reaching for it”</span></Card>
      <Arrow />
      <div className="row g6">
        {["linear-gradient(160deg,#E9DCC8,#B79B78)", "linear-gradient(160deg,#DCE3DA,#8FA08A)", "linear-gradient(160deg,#EADFD9,#B89488)"].map((bg) => (
          <div key={bg} style={{ position: "relative", width: 56, height: 72, borderRadius: 8, background: bg, display: "flex", alignItems: "flex-end", justifyContent: "center", boxShadow: "0 6px 18px rgba(18,18,18,.08)" }}>
            <span style={{ width: 16, height: 36, marginBottom: 10, borderRadius: "5px 5px 3px 3px", background: "#C79A5B" }} />
            <span className="pill" style={{ position: "absolute", left: 3, top: 3, height: 14, fontSize: 8.5, padding: "0 4px" }}>AI</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Live ads with their health, and the lessons Iris draws from them. */
export function InsightsArt() {
  const rows: [string, string, string, string][] = [["Question hook · video", "2.3×", "Winning", "green"], ["Product flatlay", "1.2×", "Steady", ""], ["Carousel · gift sets", "0.6×", "Tiring", "amber"]];
  return (
    <div className="col g10" style={{ width: 330 }}>
      <Card w={330}>
        {rows.map(([n, v, h, t], i) => (
          <div key={n} className="row g8" style={{ paddingTop: i ? 6 : 0, borderTop: i ? "1px solid var(--line)" : 0 }}>
            <Tile hook="" tone={TONES[i]} /><span className="xs i1 fill">{n}</span><span className={`xs w5 ${t === "green" ? "c-green" : t === "amber" ? "c-amber" : "i1"}`}>{v}</span>
            <span className={`pill ${t}`} style={{ height: 18, fontSize: 10 }}>{h}</span>
          </div>
        ))}
      </Card>
      <Card w={330} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <AgentFace kind="analyst" size={18} /><span className="xs i1 fill"><b className="w5">Hook:</b> open with the customer, not the bottle</span><span className="pill green" style={{ height: 18, fontSize: 10 }}>Strong</span>
      </Card>
    </div>
  );
}

/** The weekly loop: read → propose → approve → apply → check. */
export function WeeklyLoopArt() {
  const steps: [string, string, Agent | null][] = [["Mon", "Kaviar reads the week", "catalog"], ["Mon", "Agents propose changes", "analyst"], ["Tue", "You approve or skip", null], ["Tue", "Applied in Ads Manager", null], ["Next Mon", "Did it work? · Shopify", "qa"]];
  return (
    <div className="col g6" style={{ width: 300 }}>
      {steps.map(([d, t, a], i) => (
        <div key={t} className="row g10" style={{ padding: "8px 10px", background: "#fff", border: "1px solid var(--line)", borderRadius: 10, marginLeft: i * 10 }}>
          <span className="xs i3" style={{ width: 52 }}>{d}</span>
          {a ? <AgentFace kind={a} size={16} /> : <span style={{ width: 16, height: 16, borderRadius: 99, background: "var(--ink)", color: "#fff", fontSize: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>K</span>}
          <span className="xs i1">{t}</span>
        </div>
      ))}
    </div>
  );
}

/** Ghost rows — a hint of the table that will fill in. */
export function GhostRows({ n = 3 }: { n?: number }) {
  return (
    <div className="col g8" style={{ width: 300 }}>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="row g10" style={{ padding: 10, background: "#fff", border: "1px solid var(--line)", borderRadius: 10, opacity: 1 - i * 0.22 }}>
          <span style={{ width: 28, height: 28, borderRadius: 7, background: TONES[i] }} /><div className="col g4 fill"><Bar w="70%" /><Bar w="40%" h={4} /></div>
        </div>
      ))}
    </div>
  );
}
