"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { buildPipeline, planTurn } from "./actions";
import { Icon, type IconName } from "@/components/icon";
import { AgentFace } from "@/components/agent";
import type { PlanBrief, PlanFormat, PlanReply, PlanTurn } from "@/lib/creative/planner";

export type PlanCard = { key: string; title: string; why: string; evidence: [string, string][]; href: string };

const FORMAT: Record<PlanFormat, { name: string; icon: IconName; time: string; steps: (b: PlanBrief) => string[] }> = {
  static: { name: "Static image ads", icon: "image", time: "about 2 minutes to shoot", steps: (b) => ["Product", "Buyer data", "Brand kit", "Prompt · Remy", `Photo × ${Math.min(4, b.count)}`, "Otto’s check", "Editor · designed cards", "Ads"] },
  video: { name: "Product video", icon: "video", time: "3–6 minutes a clip", steps: (b) => ["Product", "Buyer data", "Brand kit", "Prompt · Remy", "Start photo", `Video · ${b.seconds}s`, "Otto’s check", "Ads"] },
  ugc: { name: "UGC video", icon: "user", time: "3–6 minutes a clip", steps: (b) => ["Creator", "Product", "Buyer data", "Prompt · Remy", "Selfie photo", `Video · ${b.seconds}s`, "Voice", "Ads"] },
  full: { name: "Full video ad", icon: "play", time: "8–12 minutes", steps: () => ["Creator", "Product", "Buyer data", "Storyboard · Remy", "Scene clips", "Final cut", "Ads"] },
};

/** Board 17's Plan as a conversation: say what you want, Remy asks what's missing, then lays out the pipeline it will set up in Shoots. */
export function PlanChat({ slug, brand, plans, research = [], aiOk, base }: { slug: string; brand: string; plans: PlanCard[]; research?: PlanCard[]; hasMeta: boolean; aiOk: boolean; base: string }) {
  const [turns, setTurns] = useState<(PlanTurn & { show?: string })[]>([]); // `show` is what the bubble says; `text` is what Remy reads back
  const [reply, setReply] = useState<PlanReply | null>(null);
  const [picks, setPicks] = useState<Record<number, string>>({});
  const [text, setText] = useState("");
  const [thinking, setThinking] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [building, startBuild] = useTransition();
  const area = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const options = { plans: plans.map(({ key, title, why }) => ({ key, title, why })), buyers: research.map(({ key, title, why }) => ({ key, title, why })) };
  const ideas = [
    ...plans.slice(0, 2).map((p) => `Ads for ${p.title.toLowerCase()} — ${p.why.split(/[.;—]/)[0].toLowerCase()}`),
    ...research.slice(0, plans.length ? 1 : 2).map((p) => `Static ads for ${p.title} — test which message lands`),
    `Holiday gift ads for ${brand}’s best-seller — warm and cosy`,
    "A UGC-style video for first-time buyers",
  ].slice(0, 4);

  const send = async (say: string, show?: string) => {
    const q = say.trim();
    if (!q || thinking || building) return;
    const next = [...turns, { who: "you" as const, text: q, show }];
    setTurns(next); setText(""); setErr(null); setPicks({}); setReply(null); setThinking(true);
    try {
      const r = await planTurn(slug, next.map(({ who, text }) => ({ who, text })), options);
      if ("error" in r) setErr(r.error);
      else { setReply(r); setTurns([...next, { who: "remy", text: [r.say, ...r.questions.map((x) => x.text)].join(" "), show: r.say }]); }
    } catch { setErr("Remy couldn’t answer just now — try again."); }
    setThinking(false);
  };
  // Tap an answer: with one question it sends straight away; with two, once both are answered.
  const pick = (i: number, o: string) => {
    const all = { ...picks, [i]: o }, qs = reply?.questions ?? [];
    setPicks(all);
    if (qs.every((_, j) => all[j])) void send(qs.map((x, j) => `${x.text} ${all[j]}`).join(" · "), qs.map((_, j) => all[j]).join(" · "));
  };
  const build = (b: PlanBrief) => { setErr(null); startBuild(async () => { const r = await buildPipeline(slug, b); if (r?.error) setErr(r.error); }); };
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [turns, thinking, reply]);

  const started = turns.length > 0, brief = reply?.brief ?? null, f = brief ? FORMAT[brief.format] : null;
  const bubble = { padding: "10px 14px", lineHeight: "20px" } as const;

  return (
    <div className="col" style={{ minHeight: "100%", alignItems: "center", padding: started ? "28px 24px 40px" : "44px 24px 40px",
      background: "radial-gradient(60% 42% at 50% 0%, rgba(106,143,214,.16), transparent 70%), radial-gradient(38% 34% at 88% 18%, rgba(26,167,200,.12), transparent 70%), radial-gradient(36% 32% at 10% 30%, rgba(235,207,159,.28), transparent 70%), var(--sheet)" }}>
      <div className="col g16" style={{ width: "100%", maxWidth: 780 }}>
        {!started && (
          <div className="col g8" style={{ alignItems: "center", textAlign: "center" }}>
            <span className="row" style={{ gap: 0 }}>{(["analyst", "builder", "qa"] as const).map((k, i) => <span key={k} style={{ marginLeft: i ? -8 : 0, borderRadius: 99, boxShadow: "0 0 0 2px var(--sheet)" }}><AgentFace kind={k} size={30} /></span>)}</span>
            <h1 className="h1">What should we make for {brand}?</h1>
            <p className="sm i3" style={{ maxWidth: 520 }}>Tell Remy what you want. Remy asks what’s missing, then sets up the pipeline in Shoots — static images or video — and the ads open in the Editor.</p>
          </div>
        )}

        {started && (
          <div className="col g12">
            <div className="row between"><span className="row g6 sm w5"><AgentFace kind="builder" size={18} />Planning with Remy</span>
              <button type="button" className="lnk xs i3" onClick={() => { setTurns([]); setReply(null); setPicks({}); setErr(null); }}>Start over</button></div>
            {turns.map((t, i) => t.who === "you"
              ? <div key={i} className="row" style={{ justifyContent: "flex-end" }}><span className="sm" style={{ ...bubble, maxWidth: "78%", borderRadius: "16px 16px 4px 16px", background: "var(--ink)", color: "#fff" }}>{t.show ?? t.text}</span></div>
              : <div key={i} className="row top g8"><AgentFace kind="builder" size={26} />
                  <span className="sm i1" style={{ ...bubble, maxWidth: "84%", borderRadius: "16px 16px 16px 4px", background: "#fff", boxShadow: "0 0 0 1px var(--line), 0 4px 14px rgba(18,18,18,.05)" }}>{t.show ?? t.text}</span></div>)}

            {!thinking && reply && reply.questions.length > 0 && (
              <div className="col g10" style={{ paddingLeft: 34 }}>
                {reply.questions.map((q, i) => (
                  <div key={i} className="col g6">
                    <span className="sm w5 i1">{q.text}</span>
                    <div className="row g6" style={{ flexWrap: "wrap" }}>
                      {q.options.map((o, j) => (
                        <button key={o} type="button" onClick={() => pick(i, o)} className="row g6 sm hv-card"
                          style={{ height: 34, padding: "0 14px", borderRadius: 99, background: picks[i] === o ? "var(--ink)" : "#fff", color: picks[i] === o ? "#fff" : "var(--ink)", boxShadow: picks[i] === o ? "none" : j === 0 ? "0 0 0 1.5px var(--ink)" : "0 0 0 1px var(--line-2)" }}>
                          {o}{j === 0 && picks[i] !== o && <span className="xs i3">· Remy’s pick</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <span className="xs i3">Tap an answer, or type your own below.</span>
              </div>
            )}

            {thinking && <div className="row top g8"><AgentFace kind="builder" size={26} mood="focus" />
              <span className="sm i2 row g8" style={{ ...bubble, borderRadius: "16px 16px 16px 4px", background: "#fff", boxShadow: "0 0 0 1px var(--line)" }}>
                <span className="row g4">{[0, 1, 2].map((i) => <span key={i} className="pulse-dot" style={{ width: 6, height: 6, borderRadius: 99, background: "#1AA7C8", animationDelay: `${i * 0.15}s` }} />)}</span>Reading {brand}’s products and data…</span></div>}

            {brief && f && (
              <div className="col" style={{ marginLeft: 34, background: "#fff", borderRadius: 16, boxShadow: "0 0 0 1px var(--line), 0 12px 32px rgba(18,18,18,.08)", overflow: "hidden" }}>
                <div className="row g10" style={{ padding: "14px 16px", borderBottom: "1px solid var(--line)" }}>
                  <span style={{ width: 34, height: 34, borderRadius: 10, background: "var(--tray)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name={f.icon} size={16} /></span>
                  <span className="col fill" style={{ minWidth: 0 }}><span className="sm w5">The plan · {brief.count} {f.name.toLowerCase()}</span><span className="xs i3 ell">{brief.why}</span></span>
                </div>
                <div className="col" style={{ padding: "4px 16px" }}>
                  {([["Product", brief.product || "The whole range"], ["For", brief.audience], ["Messages to test", null], ["Look", `${brief.adLook ? `${brief.adLook.replace("Ad look · ", "")} — ` : ""}${brief.look}`]] as const).map(([k, v]) => (
                    <div key={k} className="row top g12" style={{ padding: "9px 0", borderBottom: "1px solid var(--line)" }}>
                      <span className="xs i3" style={{ width: 110, flexShrink: 0, lineHeight: "20px" }}>{k}</span>
                      {v != null ? <span className="sm i1 fill" style={{ lineHeight: "20px" }}>{v}</span>
                        : <span className="col g2 fill">{brief.angles.map((a, i) => <span key={a} className="sm i1" style={{ lineHeight: "20px" }}><span className="i3 tnum">{i + 1}</span>&ensp;{a}</span>)}</span>}
                    </div>
                  ))}
                </div>
                <div className="col g8" style={{ padding: "12px 16px 14px", background: "var(--tray)" }}>
                  <span className="xs w5 i2">The pipeline Remy sets up in Shoots</span>
                  <div className="row g4" style={{ flexWrap: "wrap", rowGap: 6 }}>
                    {f.steps(brief).map((s, i, all) => (
                      <span key={s} className="row g4">
                        <span className="xs i1" style={{ height: 24, padding: "0 9px", display: "inline-flex", alignItems: "center", borderRadius: 7, background: "#fff", boxShadow: "0 0 0 1px var(--line)", fontWeight: /Editor|Ads/.test(s) ? 500 : 400 }}>{s}</span>
                        {i < all.length - 1 && <Icon name="arrow-r" size={10} color="#8B8883" />}
                      </span>
                    ))}
                  </div>
                  <div className="row g8" style={{ paddingTop: 6 }}>
                    <button type="button" className="btn dark" disabled={building || !aiOk} onClick={() => build(brief)}>
                      {building ? <Icon name="spinner" size={13} className="spin" color="#fff" /> : <Icon name="sparkle" size={13} color="#fff" />}{building ? "Remy is writing the ads…" : "Set it up in Shoots"}</button>
                    <button type="button" className="btn" disabled={building} onClick={() => area.current?.focus()}>Change something</button>
                    <span className="fill" /><span className="xs i3">{f.time}</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={end} />
          </div>
        )}

        <form onSubmit={(e) => { e.preventDefault(); void send(text); }} className="col g10" style={{ padding: "14px 14px 10px 16px", background: "#fff", borderRadius: 18, boxShadow: "0 0 0 1px var(--line), 0 12px 32px rgba(18,18,18,.08)" }}>
          <textarea ref={area} value={text} onChange={(e) => setText(e.target.value)} rows={started ? 2 : 3} maxLength={600} disabled={thinking || building}
            placeholder={brief ? "Change the plan — e.g. make it 9 ads, or use the toner instead" : started ? "Type your answer…" : `Describe the ads you want — e.g. static ads for ${brand}’s best-seller that test three messages`}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey || !e.shiftKey)) { e.preventDefault(); void send(text); } }}
            style={{ border: 0, outline: 0, resize: "none", font: "inherit", fontSize: 15, lineHeight: "22px", width: "100%", background: "transparent" }} />
          <div className="row g8">
            <span className="row g6 xs i3 fill"><AgentFace kind="builder" size={14} />{aiOk ? "Remy asks what’s missing, then builds the pipeline" : "Remy needs the Claude API key"}</span>
            {err && <span className="xs c-amber" style={{ maxWidth: 320 }}>{err}</span>}
            <button type="submit" aria-label="Send to Remy" disabled={thinking || building || !aiOk || text.trim().length < 2}
              style={{ width: 34, height: 34, borderRadius: 99, background: text.trim().length >= 2 && !thinking ? "var(--ink)" : "var(--tray-2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {thinking ? <Icon name="spinner" size={14} className="spin" /> : <Icon name="arrow-up" size={15} color={text.trim().length >= 2 ? "#fff" : "#8B8883"} />}
            </button>
          </div>
        </form>

        {!started && <>
          <div className="row g6" style={{ flexWrap: "wrap", justifyContent: "center" }}>
            {ideas.map((t) => (
              <button key={t} type="button" onClick={() => void send(t)} disabled={!aiOk} className="row g6 xs i2 hv-card"
                style={{ height: 30, padding: "0 12px", borderRadius: 99, background: "rgba(255,255,255,.75)", boxShadow: "0 0 0 1px var(--line)", maxWidth: 360 }}>
                <Icon name="sparkle" size={11} color="#1AA7C8" /><span className="ell">{t}</span>
              </button>
            ))}
          </div>

          <div className="row between" style={{ paddingTop: 10 }}>
            <span className="row g6 sm w5"><AgentFace kind="analyst" size={16} />Suggested by Iris</span>
            <span className="xs i3">from today’s store data</span>
          </div>
          {plans.length ? (
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(3, plans.length)}, minmax(0, 1fr))`, gap: 12 }}>
              {plans.map((p, i) => (
                <div key={p.key} className="col g8 hv-card" style={{ padding: 14, background: "#fff", borderRadius: 14, boxShadow: i === 0 ? "0 0 0 1.5px var(--ink), 0 8px 24px rgba(18,18,18,.08)" : "0 0 0 1px var(--line), 0 4px 14px rgba(18,18,18,.04)" }}>
                  <span className="row between"><span className="eyebrow">Plan {i + 1}</span>{i === 0 && <span className="pill" style={{ height: 18, fontSize: 10 }}>Best bet</span>}</span>
                  <Link href={p.href} className="h3 lnk">{p.title}</Link>
                  <span className="xs i2" style={{ lineHeight: "17px", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.why}</span>
                  <span className="row g4" style={{ flexWrap: "wrap" }}>{p.evidence.slice(0, 2).map(([k, v]) => <span key={k} className="pill" style={{ height: 20, fontSize: 10.5 }}>{k}: {v}</span>)}</span>
                  <div className="fill" />
                  <button type="button" disabled={!aiOk} onClick={() => void send(`Ads for the “${p.title}” plan — ${p.why.split(/[.;]/)[0]}`)} className={`btn sm${i === 0 ? " dark" : ""}`} style={{ justifyContent: "center" }}>
                    <Icon name="sparkle" size={12} color={i === 0 ? "#fff" : undefined} />Plan this with Remy</button>
                </div>
              ))}
            </div>
          ) : (
            <div className="row g10" style={{ padding: 14, background: "rgba(255,255,255,.8)", borderRadius: 14, boxShadow: "0 0 0 1px var(--line)" }}>
              <AgentFace kind="analyst" size={22} />
              <span className="xs i2 fill" style={{ lineHeight: "17px" }}>No store data to plan from yet. New to the market? Iris can research demand, buyers and competitors’ ads, and plan a cheap test of static ads — or ask Remy for any idea above.</span>
              <Link className="btn sm dark" href={`${base}/research`}><Icon name="globe" size={12} color="#fff" />Market research</Link>
              <Link className="btn sm" href={`${base}/sync`}><Icon name="database" size={12} />Data sync</Link>
            </div>
          )}
          {research.length > 0 && <>
            <div className="row between" style={{ paddingTop: 10 }}>
              <span className="row g6 sm w5"><Icon name="globe" size={14} color="#5B6FD6" />From market research</span>
              <Link className="xs i3 lnk" href={`${base}/research`}>buyers and positioning Iris found</Link>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(3, research.length)}, minmax(0, 1fr))`, gap: 12 }}>
              {research.map((p, i) => (
                <div key={p.key} className="col g8 hv-card" style={{ padding: 14, background: "#fff", borderRadius: 14, boxShadow: "0 0 0 1px var(--line), 0 4px 14px rgba(18,18,18,.04)" }}>
                  <span className="row between"><span className="eyebrow">Buyer {i + 1}</span>{p.why.includes("primary buyer") && <span className="pill green" style={{ height: 18, fontSize: 10 }}>Primary</span>}</span>
                  <Link href={p.href} className="h3 lnk">{p.title}</Link>
                  <span className="xs i2" style={{ lineHeight: "17px", display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.why}</span>
                  <span className="row g4" style={{ flexWrap: "wrap" }}>{p.evidence.slice(0, 2).map(([k, v]) => <span key={k} className="pill" style={{ height: 20, fontSize: 10.5, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis" }}>{k}: {v}</span>)}</span>
                  <div className="fill" />
                  <button type="button" disabled={!aiOk} onClick={() => void send(`Ads for the “${p.title}” buyer group from market research`)} className="btn sm" style={{ justifyContent: "center" }}>
                    <Icon name="sparkle" size={12} />Plan this with Remy</button>
                </div>
              ))}
            </div>
          </>}
        </>}
        <span className="row g6 xs i3" style={{ justifyContent: "center", paddingTop: 4, flexWrap: "wrap" }}>
          {(["Plan with Remy", "Build in Shoots", "Refine in the Editor", "Review in Ads"] as const).map((s, i) => <span key={s} className="row g6"><span className={i === 0 ? "w5 i1" : ""}>{i + 1} · {s}</span>{i < 3 && <Icon name="arrow-r" size={10} />}</span>)}
        </span>
      </div>
    </div>
  );
}
