"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { rerun, savePositioning } from "./actions";
import { Figures, From, Line, Section, Tone } from "./bits";
import { Icon } from "@/components/icon";
import { AgentFace } from "@/components/agent";
import type { DataSource, Positioning } from "@/lib/research/types";

/** Kept for other pages that show where a fact came from. */
export function Source({ s }: { s: DataSource }) { return <From s={s} />; }

/** "For <buyer> who <need>, <product> is the <category> that <benefit>, unlike <alternative>." — the parts in ink, the frame quiet. */
const FRAME = /^For (.+?) who (.+?), (.+?) is (the |a |an )?(.+?) that (.+?)(?:,| —| –| -) unlike (.+?)\.?$/i;
function Statement({ text }: { text: string }) {
  const m = FRAME.exec(text.trim());
  if (!m) return <>{text}</>;
  const [, buyer, need, product, art, category, benefit, alt] = m;
  const k = (s: string) => <span className="i1" style={{ fontWeight: 500 }}>{s}</span>;
  const c = (s: string) => <span className="i3">{s}</span>;
  return <>{c("For ")}{k(buyer)}{c(" who ")}{k(need)}{c(", ")}{k(product)}{c(` is ${art ?? ""}`)}{k(category)}{c(" that ")}{k(benefit)}{c(", unlike ")}{k(alt)}{c(".")}</>;
}

const STANCE: Record<string, string> = { value: "Value", "accessible premium": "Accessible premium", premium: "Premium" };

/** The product's positioning — built by Iris from the store, live ads, the research and competitors' ads. Every agent writes from it. */
export function PositionTab({ slug, id, pos, running }: { slug: string; id: string; pos: Positioning | null; running: boolean }) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [statement, setStatement] = useState(pos?.statement ?? "");
  const [pillars, setPillars] = useState(pos?.pillars ?? []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async (p: Parameters<typeof savePositioning>[2]) => { setBusy(true); try { await savePositioning(slug, id, p); router.refresh(); } finally { setBusy(false); } };
  const again = async () => { setBusy(true); setErr(null); try { const r = await rerun(slug, id, ["position"]); if (r.error) setErr(r.error); router.refresh(); } finally { setBusy(false); } };

  if (!pos) return (
    <div className="col g10" style={{ padding: "18px 0" }}>
      <span className="sm i2" style={{ maxWidth: 560, lineHeight: "20px" }}>No positioning yet. Iris writes it from the market research, competitors’ ads, the store’s own numbers and what live ads show — then every agent writes from it.</span>
      <button type="button" className="btn sm dark" style={{ alignSelf: "flex-start" }} disabled={busy || running} onClick={again}><AgentFace kind="analyst" size={14} />Position the product</button>
      {err && <span className="xs c-amber">{err}</span>}
    </div>
  );
  const accepted = pos.status === "accepted";
  const from = [...new Set([...pos.pillars.map((p) => p.source), ...pos.proof.map((p) => p.source)])];
  const fromText = from.map((s) => ({ shopify: "Shopify", meta: "Meta ads", research: "the research", ads: "competitors’ ads", brand: "the brand profile" })[s]).join(", ").replace(/, ([^,]*)$/, " and $1");

  return (
    <div className="col" style={{ gap: 28 }}>
      {/* The statement: one sentence the whole team and every agent works from. */}
      <div className="col g12">
        <div className="row g8">
          <AgentFace kind="analyst" size={18} />
          <span className="xs i3 fill">{pos.edited ? "Edited by the team" : `Written by Iris from ${fromText}`}</span>
          {accepted ? <Tone c="green">In use</Tone> : <span className="xs i3">Not in use yet</span>}
          {!edit && <button type="button" className="btn quiet sm" onClick={() => { setStatement(pos.statement); setPillars(pos.pillars); setEdit(true); }}><Icon name="pencil" size={12} />Edit</button>}
        </div>
        {edit
          ? <textarea value={statement} onChange={(e) => setStatement(e.target.value)} rows={3} maxLength={400} aria-label="Positioning statement" className="input" style={{ height: "auto", padding: 12, fontSize: 18, lineHeight: "27px", resize: "vertical" }} />
          : <p style={{ margin: 0, fontSize: 21, lineHeight: "31px", letterSpacing: "-0.015em", maxWidth: 860 }}><Statement text={pos.statement} /></p>}
        <div className="row g8" style={{ flexWrap: "wrap" }}>
          {edit ? (
            <>
              <button type="button" className="btn sm dark" disabled={busy || statement.trim().length < 20} onClick={() => save({ statement, pillars }).then(() => setEdit(false))}>{busy ? <Icon name="spinner" size={12} className="spin" color="#fff" /> : <Icon name="check" size={12} color="#fff" />}Save</button>
              <button type="button" className="btn sm" onClick={() => setEdit(false)}>Cancel</button>
            </>
          ) : accepted
            ? <button type="button" className="btn sm" disabled={busy} onClick={() => save({ status: null })}>Stop using it</button>
            : <button type="button" className="btn sm dark" disabled={busy} onClick={() => save({ status: "accepted" })}><Icon name="check" size={12} color="#fff" />Use this positioning</button>}
          {!edit && <button type="button" className="btn sm quiet" disabled={busy || running} onClick={again}>{running ? <Icon name="spinner" size={12} className="spin" /> : <Icon name="refresh" size={12} />}Write it again</button>}
          {err && <span className="xs c-amber">{err}</span>}
          <span className="fill" />
          <span className="xs i3">Remy writes every ad, photo prompt, storyboard and casting from this.</span>
        </div>
      </div>

      <Section title="The brief" right="what every agent writes from">
        <Line label="Primary buyer"><span className="w5">{pos.primary}</span></Line>
        {pos.secondary.length > 0 && <Line label="Then test">{pos.secondary.join(" · ")}</Line>}
        <Line label="Price" sub={pos.price.note}><span className="w5">{STANCE[pos.price.stance] ?? pos.price.stance}</span></Line>
        <Line label="Say">{pos.voice.say.join(" · ")}</Line>
        <Line label="Don’t say"><span className="i2">{pos.voice.avoid.join(" · ")}</span></Line>
      </Section>

      <Section title="Message pillars" right={`${pos.pillars.length} · what every ad says, and the proof behind it`}>
        {(edit ? pillars : pos.pillars).map((p, i) => (
          <Line key={p.id} label={<span className="row top g8"><span className="tnum i3" style={{ width: 12 }}>{i + 1}</span><span className="w5 i1">{p.title}</span></span>} labelW={190}
            sub={<><span className="i2 w5">Proof</span> <Figures text={p.proof} /></>} from={<From s={p.source} />}>
            {edit
              ? <textarea value={p.message} rows={2} maxLength={160} aria-label={`Pillar ${i + 1} message`} className="input" onChange={(e) => setPillars((xs) => xs.map((x) => (x.id === p.id ? { ...x, message: e.target.value } : x)))} style={{ width: "100%", height: "auto", padding: 8, lineHeight: "19px", resize: "vertical" }} />
              : <>“{p.message}”</>}
          </Line>
        ))}
      </Section>

      <div className="row top" style={{ gap: 28, flexWrap: "wrap" }}>
        <div className="fill" style={{ minWidth: 340 }}>
          <Section title="Proof the ads can use" right={`${pos.proof.length} facts`}>
            {pos.proof.map((p, i) => <Line key={i} from={<From s={p.source} />}><Figures text={p.fact} /></Line>)}
          </Section>
        </div>
        <div className="fill" style={{ minWidth: 300 }}>
          <Section title="Where to lead" right={`${pos.where.length} placements`}>
            {pos.where.map((w) => <Line key={w.placement} sub={<Figures text={w.why} />}><span className="w5">{w.placement}</span></Line>)}
          </Section>
        </div>
      </div>

      <div className="row top" style={{ gap: 28, flexWrap: "wrap" }}>
        <div className="fill" style={{ minWidth: 340 }}>
          <Section title="Stay away from" right="overused, or against Meta’s ad rules">
            {pos.avoid.map((x) => <Line key={x}><Figures text={x} /></Line>)}
          </Section>
        </div>
        <div className="fill" style={{ minWidth: 300 }}>
          <Section title="Test next" right="what the data can’t answer yet">
            {pos.next.map((x, i) => <Line key={x} label={<span className="tnum">{i + 1}</span>} labelW={14}><Figures text={x} /></Line>)}
          </Section>
        </div>
      </div>
    </div>
  );
}
