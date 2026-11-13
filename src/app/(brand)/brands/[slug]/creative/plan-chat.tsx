"use client";
import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { startBatch, type State } from "./actions";
import { Icon } from "@/components/icon";
import { AgentFace } from "@/components/agent";

export type PlanCard = { key: string; title: string; why: string; evidence: [string, string][]; href: string };

/** Board 17's Plan as a chat: ask Remy for a batch in your own words, or pick one of Iris's plans. */
export function PlanChat({ slug, brand, plans, hasMeta, aiOk, base }: { slug: string; brand: string; plans: PlanCard[]; hasMeta: boolean; aiOk: boolean; base: string }) {
  const [state, action, pending] = useActionState<State, FormData>(startBatch.bind(null, slug), undefined);
  const [text, setText] = useState("");
  const [count, setCount] = useState(6);
  const [sent, setSent] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const ideas = [
    ...plans.slice(0, 2).map((p) => `Ads for ${p.title.toLowerCase()} — ${p.why.split(/[.;—]/)[0].toLowerCase()}`),
    `Holiday gift ads for ${brand}’s best-seller — warm and cosy`,
    "A UGC-style video for first-time buyers",
    "A bundle offer for people who bought twice",
  ].slice(0, 4);

  return (
    <form ref={form} action={action} className="col" style={{ minHeight: "100%", alignItems: "center", padding: "44px 24px 40px",
      background: "radial-gradient(60% 42% at 50% 0%, rgba(106,143,214,.16), transparent 70%), radial-gradient(38% 34% at 88% 18%, rgba(26,167,200,.12), transparent 70%), radial-gradient(36% 32% at 10% 30%, rgba(235,207,159,.28), transparent 70%), var(--sheet)" }}
      onSubmit={(e) => {
        const by = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        const plan = by?.name === "signal" ? plans.find((p) => p.key === by.value) : null;
        if (!plan && text.trim().length < 8) { e.preventDefault(); area.current?.focus(); return; }
        setSent(plan ? `Build the “${plan.title}” plan — ${count} ads` : text.trim());
      }}>
      <div className="col g16" style={{ width: "100%", maxWidth: 780 }}>
        <div className="col g8" style={{ alignItems: "center", textAlign: "center", paddingBottom: 6 }}>
          <div className="row" style={{ marginBottom: 2 }}>{(["analyst", "builder", "qa"] as const).map((k, i) => <span key={k} style={{ marginLeft: i ? -8 : 0, borderRadius: 99, background: "#fff", padding: 3, display: "flex", boxShadow: "0 1px 3px rgba(18,18,18,.08)" }}><AgentFace kind={k} size={30} mood="happy" /></span>)}</div>
          <h1 className="h1" style={{ fontSize: 28, letterSpacing: "-0.02em" }}>What should we make for {brand}?</h1>
          <p className="sm i3" style={{ maxWidth: 520 }}>Iris read {brand}’s Shopify orders{hasMeta ? " and Meta results" : ""} this morning. Pick a plan below, or tell Remy what you want in your own words.</p>
        </div>

        {sent && (pending || state?.error) && (
          <div className="col g10">
            <div className="row" style={{ justifyContent: "flex-end" }}><span className="sm" style={{ maxWidth: "78%", padding: "10px 14px", borderRadius: "16px 16px 4px 16px", background: "var(--ink)", color: "#fff", lineHeight: "20px" }}>{sent}</span></div>
            <div className="row top g8">
              <AgentFace kind="builder" size={26} mood={state?.error && !pending ? "worried" : "focus"} />
              <span className="sm i1" style={{ padding: "10px 14px", borderRadius: "16px 16px 16px 4px", background: "#fff", boxShadow: "0 0 0 1px var(--line), 0 4px 14px rgba(18,18,18,.05)", lineHeight: "20px" }}>
                {pending ? <span className="row g8"><span className="row g4">{[0, 1, 2].map((i) => <span key={i} className="pulse-dot" style={{ width: 6, height: 6, borderRadius: 99, background: "#1AA7C8", animationDelay: `${i * 0.15}s` }} />)}</span>Writing {count} ads on {brand}’s real products — about 30 seconds. Then we’ll make the visuals in Shoots.</span>
                  : <span className="c-amber">{state?.error}</span>}
              </span>
            </div>
          </div>
        )}

        <div className="col g10" style={{ padding: "14px 14px 10px 16px", background: "#fff", borderRadius: 18, boxShadow: "0 0 0 1px var(--line), 0 12px 32px rgba(18,18,18,.08)" }}>
          <textarea ref={area} name="idea" value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={600} disabled={pending}
            placeholder={`Describe the ads you want — e.g. Holiday gift ads for ${brand}’s best-seller, warm and cosy, for people who bought last December`}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); form.current?.requestSubmit(); } }}
            style={{ border: 0, outline: 0, resize: "none", font: "inherit", fontSize: 15, lineHeight: "22px", width: "100%", background: "transparent" }} />
          <div className="row g8">
            <label className="chip" style={{ height: 30, position: "relative" }}><Icon name="squares" size={12} /><span className="i3">Ads</span>{count}<Icon name="chev-d" size={11} color="#8B8883" />
              <select name="count" value={count} onChange={(e) => setCount(Number(e.target.value))} aria-label="How many ads" style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}>{[3, 6, 9].map((n) => <option key={n} value={n}>{n} ads</option>)}</select></label>
            <span className="chip" style={{ height: 30 }}><Icon name="image" size={12} />Static, video & UGC</span>
            <span className="fill xs i3" style={{ textAlign: "right" }}>{aiOk ? "⌘↵ to send" : "Remy needs the Claude API key"}</span>
            <button type="submit" aria-label="Send to Remy" disabled={pending || !aiOk || text.trim().length < 8}
              style={{ width: 34, height: 34, borderRadius: 99, background: text.trim().length >= 8 && !pending ? "var(--ink)" : "var(--tray-2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {pending ? <Icon name="spinner" size={14} className="spin" color="#fff" /> : <Icon name="arrow-up" size={15} color={text.trim().length >= 8 ? "#fff" : "#8B8883"} />}
            </button>
          </div>
        </div>

        <div className="row g6" style={{ flexWrap: "wrap", justifyContent: "center" }}>
          {ideas.map((t) => (
            <button key={t} type="button" onClick={() => { setText(t); area.current?.focus(); }} className="row g6 xs i2 hv-card"
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
                <button type="submit" name="signal" value={p.key} disabled={pending || !aiOk} className={`btn sm${i === 0 ? " dark" : ""}`} style={{ justifyContent: "center" }}>
                  <Icon name="sparkle" size={12} color={i === 0 ? "#fff" : undefined} />Build {count} ads</button>
              </div>
            ))}
          </div>
        ) : (
          <div className="row g10" style={{ padding: 14, background: "rgba(255,255,255,.8)", borderRadius: 14, boxShadow: "0 0 0 1px var(--line)" }}>
            <AgentFace kind="analyst" size={22} />
            <span className="xs i2 fill" style={{ lineHeight: "17px" }}>Iris needs a little more store data — plans appear once orders and customers have synced. You can still ask Remy for any idea above.</span>
            <Link className="btn sm" href={`${base}/sync`}><Icon name="database" size={12} />Data sync</Link>
          </div>
        )}
        <span className="xs i3" style={{ textAlign: "center", paddingTop: 4 }}>Next: Remy writes the batch → you make the visuals in Shoots → design in the Editor → review in Ads.</span>
      </div>
    </form>
  );
}
