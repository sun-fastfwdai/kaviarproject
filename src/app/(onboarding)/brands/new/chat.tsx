"use client";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { bookCall, followRecommendation, sendChat, type ActionState } from "./actions";
import { OnboardingShell } from "./shell";
import { KaviarOrb } from "./source-step";
import { AgentFace } from "@/components/agent";
import { Icon } from "@/components/icon";
import { Modal } from "@/components/modal";
import type { ChatTurn, Onboarding } from "@/lib/onboarding/types";

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const ASKS = ["Where it sells", "Customer data", "What matters first"];
const SIDE = ["What will Shopify cost them?", "Can the old store stay live meanwhile?", "How long until launch?"];

function Who({ turn }: { turn: ChatTurn }) {
  return turn.who === "iris" ? <AgentFace kind="analyst" size={24} /> : <KaviarOrb size={24} />;
}

function Rec({ turn, onUse, busy }: { turn: ChatTurn; onUse: () => void; busy: boolean }) {
  const r = turn.rec!;
  return (
    <div className="col" style={{ border: "1px solid var(--ink)", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
      <div className="row g12" style={{ padding: "12px 14px" }}>
        <span style={{ width: 32, height: 32, borderRadius: 99, border: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name={r.path === "specialist" ? "phone" : "globe"} size={16} /></span>
        <div className="col fill"><span className="xs i3">Here’s what I’d do — you can change it later</span><span className="h3">{r.title}</span></div>
        <span className="row g4 xs" style={{ color: r.confidence === "Low" ? "var(--amber)" : "var(--green)" }}>
          <svg width="12" height="12" viewBox="0 0 12 12">{[0, 1, 2].map((i) => <rect key={i} x={i * 4} y={8 - i * 3} width="3" height={4 + i * 3} rx="0.6" fill="currentColor" opacity={i < (r.confidence === "High" ? 3 : r.confidence === "Med" ? 2 : 1) ? 1 : 0.25} />)}</svg>{r.confidence}
        </span>
      </div>
      <div className="col g8" style={{ padding: "12px 14px", borderTop: "1px solid var(--line)" }}>
        {r.points.map((p, i) => (
          <span key={i} className="row top g8 sm i2"><Icon name={p.tone === "good" ? "check-circle" : "clock"} size={15} weight={p.tone === "good" ? "fill" : "regular"} color={p.tone === "good" ? "#1F8A5B" : "#B7791F"} style={{ marginTop: 2 }} />
            <span><b className="w5 i1">{p.lead}</b> {p.text}</span></span>
        ))}
      </div>
      <div className="row g8" style={{ padding: "10px 14px", borderTop: "1px solid var(--line)", background: "var(--tray)" }}>
        <button type="button" className="btn dark sm" onClick={onUse} disabled={busy}>Use this path<Icon name="arrow-r" size={12} color="#fff" /></button>
        <Link className="btn sm" href="?pick=1">See other options</Link>
        <span className="fill" />
        <span className="xs i3 row g4">{r.landsOn}</span>
      </div>
    </div>
  );
}

function BookModal({ id, brand, slot, onClose }: { id: string; brand: string; slot: string; onClose: () => void }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(bookCall.bind(null, id), undefined);
  return (
    <Modal icon={<Icon name="phone" size={18} />} title={`Book a 15-min call with ${brand}`} sub="Jina, brand specialist, joins. The request lands in Leads." onClose={onClose}
      footer={state?.ok ? <button className="btn dark" type="button" onClick={onClose}>Done</button> : <><button type="button" className="btn" onClick={onClose}>Cancel</button><button form="book" className="btn dark" disabled={pending}>{pending ? "Booking…" : "Book call"}</button></>}>
      {state?.ok ? <div className="notice green"><Icon name="check-circle" size={14} weight="fill" /><span>Requested for {slot}. Jina will send the invite.</span></div> : (
        <form id="book" action={action} className="col g12">
          <input type="hidden" name="slot" value={slot} />
          <div className="row between sm" style={{ padding: "8px 10px", background: "var(--tray)", borderRadius: 8 }}><span className="i3">Time</span><span className="w5">{slot}</span></div>
          <label className="col g6"><span className="label">Brand contact’s email</span><div className="input"><input name="email" type="email" required placeholder="founder@brand.com" autoFocus /></div></label>
          <label className="col g6"><span className="label">Note for Jina <span className="i3" style={{ fontWeight: 400 }}>· optional</span></span><div className="input" style={{ height: "auto", padding: 8 }}><textarea name="note" rows={3} style={{ border: 0, outline: 0, width: "100%", resize: "none", font: "inherit" }} placeholder="They mostly want subscriptions first." /></div></label>
          {state?.error && <div className="notice red">{state.error}</div>}
        </form>
      )}
    </Modal>
  );
}

export function ChatStep({ id, name, reached, ob, slots, aiReady }: { id: string; name: string; reached: number; ob: Onboarding; slots: string[]; aiReady: boolean }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [text, setText] = useState("");
  const [pendingTurn, setPendingTurn] = useState<string | null>(null);
  const [slot, setSlot] = useState(slots[0]);
  const [book, setBook] = useState(false);
  const [using, startUse] = useTransition();
  const chat = ob.chat;
  const turns = chat?.turns ?? [];
  const answered = chat?.answered ?? 0;
  const rec = chat?.recommendation ?? null;
  const u = chat?.understands;
  const scroller = useRef<HTMLDivElement>(null);
  const lastAsk = turns.reduce((n, t, i) => (t.who === "kaviar" ? i : n), -1);
  const opened = useRef(false);

  const send = (t: string) => {
    if (busy) return;
    setPendingTurn(t || null);
    setText("");
    start(async () => {
      await sendChat(id, t);
      router.refresh();
      setPendingTurn(null);
    });
  };

  // Kaviar AI opens the conversation itself.
  useEffect(() => {
    if (!opened.current && turns.length === 0 && aiReady) { opened.current = true; send(""); }
  });
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }); }, [turns.length, pendingTurn, busy]);

  const rows: [string, string | null | undefined, boolean?][] = [
    ["Brand", name], ["Sells on", ob.scan?.ok ? `${ob.scan.platform ?? "Website"} · ${ob.scan.host}` : u?.sellsOn],
    ["Catalog", ob.scan?.productCount ? `${ob.scan.productCount} products${ob.scan.languages.length ? ` · ${ob.scan.languages.map((l) => l.slice(0, 2).toUpperCase()).join(", ")}` : ""}` : u?.catalog],
    ["Wants", u?.wants], ["Customer data", u?.customerData, true], ["Path", rec?.title ?? u?.path],
  ];

  return (
    <>
      <OnboardingShell id={id} step={1} reached={reached} name={name} subs={["Kaviar AI · finding the path"]}
        footer={<>
          <Link className="btn" href="?pick=1"><Icon name="arrow-l" size={13} />Back</Link>
          <span className="fill" />
          <span className="xs i3">{rec ? "You can switch paths later in setup" : `Answer ${3 - answered} more question${3 - answered === 1 ? "" : "s"} to get a recommendation`}</span>
          <button type="button" className="btn dark" disabled={!rec || using} onClick={() => startUse(() => followRecommendation(id))}>{using ? "Opening…" : "Use recommended path"}<Icon name="arrow-r" size={13} color="#fff" /></button>
        </>}>
        <div className="row stretch" style={{ height: "100%" }}>
          <div className="col fill" style={{ minWidth: 0, borderRight: "1px solid var(--line)" }}>
            <div className="row g12" style={{ padding: "16px 22px", borderBottom: "1px solid var(--line)" }}>
              <KaviarOrb size={34} />
              <div className="col fill" style={{ minWidth: 0 }}>
                <span className="row g8"><span className="h3">Kaviar AI</span><span className="pill" style={{ height: 20, fontSize: 11 }}>Step 1 · Find the right path</span></span>
                <span className="xs i3">{rec ? "All three answered — here is the recommended path." : "Answer a few questions and Kaviar AI recommends how to set up the store."}</span>
              </div>
              <span className="row g2">{(["analyst", "catalog", "builder", "qa"] as const).map((k) => <AgentFace key={k} kind={k} size={18} mood={rec ? "happy" : "focus"} />)}</span>
              <span className="xs i3">{answered} of 3 answered</span>
            </div>

            <div ref={scroller} className="col g16 fill" style={{ padding: "18px 22px", overflowY: "auto", minHeight: 0 }}>
              {!aiReady && <div className="notice amber"><span>Kaviar AI isn’t switched on for this workspace yet. Pick a path with “Back”, or ask an owner to add the Claude key.</span></div>}
              {answered === 0 && !rec && (
                <div className="col g8" style={{ alignItems: "center", textAlign: "center", padding: "18px 0 6px" }}>
                  <KaviarOrb size={72} />
                  <span className="h2">Let’s find the right path for {name}</span>
                  <span className="sm i3" style={{ maxWidth: 420 }}>Three quick questions, then a recommendation. Nothing is final — you can change the path later in setup.</span>
                  <div className="row g6" style={{ marginTop: 6 }}>{ASKS.map((a, i) => <span key={a} className="pill" style={{ height: 24, background: i === answered ? "#fff" : undefined, borderColor: i === answered ? "var(--ink)" : undefined, color: i === answered ? "var(--ink)" : undefined }}>{i + 1}&nbsp; {a}</span>)}</div>
                </div>
              )}
              {turns.map((t, i) => t.who === "kris" ? (
                <div key={i} className="col g4" style={{ alignItems: "flex-end" }}>
                  <span style={{ maxWidth: "70%", padding: "9px 12px", borderRadius: 10, background: "var(--ink)", color: "#fff", fontSize: 13, lineHeight: "19px" }}>{t.text}</span>
                  <span className="xs i4">You · {time(t.at)}</span>
                </div>
              ) : (
                <div key={i} className="row top g10">
                  <Who turn={t} />
                  <div className="col g8 fill" style={{ minWidth: 0 }}>
                    <span className="row g6"><span className="sm w5">{t.who === "iris" ? "Iris" : "Kaviar AI"}</span><span className="xs i4">{time(t.at)}</span></span>
                    {t.site ? (
                      <div className="row g12" style={{ padding: 10, border: "1px solid var(--line)", borderRadius: 10, background: "#fff" }}>
                        {t.site.image && <img src={t.site.image} alt="" width={48} height={48} style={{ borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />}
                        <div className="col g6"><span className="sm i1">{t.text}</span><span className="row g4" style={{ flexWrap: "wrap" }}>{t.site.chips.map((c) => <span key={c} className="pill" style={{ height: 20, fontSize: 11 }}>{c}</span>)}</span></div>
                      </div>
                    ) : <span className="sm i1" style={{ lineHeight: "20px" }}>{t.text}</span>}
                    {t.rec && <Rec turn={t} busy={using} onUse={() => startUse(() => followRecommendation(id))} />}
                    {!!t.options?.length && (i === lastAsk || t.chosen) && (
                      <div className="row g6" style={{ flexWrap: "wrap" }}>
                        {t.options.filter((o) => i === lastAsk || o === t.chosen).map((o) => {
                          const on = t.chosen === o;
                          return <button key={o} type="button" className={`btn sm${on ? " dark" : ""}`} disabled={busy || Boolean(t.chosen) || i !== lastAsk} onClick={() => send(o)}>{on && <Icon name="check" size={12} color="#fff" />}{o}</button>;
                        })}
                      </div>
                    )}
                    {i === 0 && !ob.scan && <span className="xs i3">Or paste the store link below and Iris will read it.</span>}
                  </div>
                </div>
              ))}
              {pendingTurn && !turns.some((t) => t.chosen === pendingTurn) && (
                <div className="col g4" style={{ alignItems: "flex-end" }}><span style={{ maxWidth: "70%", padding: "9px 12px", borderRadius: 10, background: "var(--ink)", color: "#fff", fontSize: 13 }}>{pendingTurn}</span></div>
              )}
              {busy && <div className="row g10"><KaviarOrb size={24} /><span className="sm i3 row g6"><Icon name="spinner" size={14} className="spin" />{/\./.test(pendingTurn ?? "") ? "Iris is reading the site…" : "Thinking…"}</span></div>}
              {!ob.scan && turns.length > 0 && (
                <div className="row g10" style={{ padding: "10px 12px", border: "1px dashed var(--line-2)", borderRadius: 10 }}>
                  <AgentFace kind="analyst" size={20} /><span className="sm i2"><b className="w5 i1">Iris</b> is ready to read the site and brand deck as soon as you share them.</span>
                </div>
              )}
            </div>

            <div className="col g10" style={{ padding: "12px 22px 18px" }}>
              <div className="row g6" style={{ flexWrap: "wrap" }}>{SIDE.map((q) => <button key={q} type="button" className="btn sm" disabled={busy} onClick={() => send(q)} style={{ color: "var(--ink-2)", fontWeight: 400 }}>{q}</button>)}</div>
              <form className="col" onSubmit={(e) => { e.preventDefault(); if (text.trim()) send(text.trim()); }}
                style={{ border: "1px solid var(--line-2)", borderRadius: 12, padding: "10px 12px", background: "#fff" }}>
                <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder={rec ? "Ask Kaviar AI anything about this brand…" : "Type an answer or paste the store link…"}
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && text.trim()) { e.preventDefault(); send(text.trim()); } }}
                  style={{ border: 0, outline: 0, resize: "none", font: "inherit", fontSize: 13, width: "100%" }} disabled={!aiReady} />
                <div className="row g8">
                  <Icon name="clip" size={15} color="#8B8883" /><Icon name="link" size={15} color="#8B8883" />
                  <span className="fill" /><span className="xs i4">⌘↵</span>
                  <button className="btn dark sm ic" disabled={busy || !text.trim()} aria-label="Send"><Icon name="arrow-up" size={13} color="#fff" /></button>
                </div>
              </form>
            </div>
          </div>

          <aside className="col g16" style={{ width: 300, flexShrink: 0, padding: 18, background: "var(--tray)" }}>
            <div className="col">
              <span className="row between" style={{ paddingBottom: 8 }}><span className="sm w5">What Kaviar AI understands</span><span className={`xs ${rec ? "c-green" : "i3"}`}>{rec ? "Live" : `${answered} of 3`}</span></span>
              <div className="col" style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 10, padding: "0 12px" }}>
                {rows.map(([k, v, warn], i) => (
                  <div key={k} className="row between g8 xs" style={{ minHeight: 34, borderTop: i ? "1px solid var(--line)" : 0 }}>
                    <span className="i3">{k}</span>
                    <span className={`ell ${v ? (warn && /not|unsure|decid/i.test(v) ? "c-amber" : "i1") : "i4"}`} style={{ textAlign: "right" }}>{v || (k === "Path" ? "Fills in as you answer" : "—")}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="col g8">
              <span className="sm w5">Team on standby</span>
              {([["analyst", "Iris", "Reads the site and brand deck"], ["catalog", "Cleo", ob.scan?.productCount ? `Moves ${ob.scan.productCount} products to Shopify` : "Moves the catalog to Shopify"], ["builder", "Remy", "Builds on Kaviar Starter"], ["qa", "Otto", "Checks everything before launch"]] as const).map(([k, n, t]) => (
                <div key={k} className="row g10"><AgentFace kind={k} size={22} /><div className="col"><span className="xs w5 i1">{n}</span><span className="xs i3">{t}</span></div></div>
              ))}
            </div>
            <div className="col g10" style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 12, padding: 12 }}>
              <div className="row top g10">
                <span style={{ width: 30, height: 30, borderRadius: 99, background: "#9A6B4F", color: "#fff", fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>JN</span>
                <div className="col"><span className="sm w5">{name} still unsure?</span><span className="xs i3">Book a call between {name} and Jina, brand specialist.</span></div>
              </div>
              <div className="row g6">{slots.map((s) => <button key={s} type="button" className={`btn sm fill${slot === s ? " dark" : ""}`} onClick={() => setSlot(s)} style={{ padding: 0 }}>{s}</button>)}</div>
              <button type="button" className="btn sm" onClick={() => setBook(true)}><Icon name="calendar" size={13} />Book a 15-min call with {name}</button>
            </div>
          </aside>
        </div>
      </OnboardingShell>
      {book && <BookModal id={id} brand={name} slot={slot} onClose={() => setBook(false)} />}
    </>
  );
}
