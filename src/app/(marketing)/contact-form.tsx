"use client";
import { useActionState, useEffect, useRef } from "react";
import { submitLead, type LeadState } from "./actions";

function Field({ label, name, type = "text", placeholder, optional, value, auto }: {
  label: string; name: string; type?: string; placeholder?: string; optional?: boolean; value?: string; auto?: string;
}) {
  return (
    <label className="col g6 fill" style={{ minWidth: 200 }}>
      <span className="label">{label}{optional && <span className="i3" style={{ fontWeight: 400 }}> · optional</span>}</span>
      <div className="input"><input name={name} type={type} placeholder={placeholder} required={!optional} defaultValue={value} autoComplete={auto} /></div>
    </label>
  );
}

export function ContactForm() {
  const [state, action, pending] = useActionState<LeadState, FormData>(submitLead, undefined);
  const msg = useRef<HTMLTextAreaElement>(null);
  const name = useRef<HTMLDivElement>(null);
  // A brief typed in the hero or the dock lands here.
  useEffect(() => {
    const fill = (text: string) => {
      if (!text || !msg.current) return;
      msg.current.value = text;
      setTimeout(() => name.current?.querySelector("input")?.focus({ preventScroll: true }), 650);
    };
    try { fill(sessionStorage.getItem("kaviar-brief") ?? ""); } catch {}
    const on = (e: Event) => fill((e as CustomEvent<string>).detail);
    window.addEventListener("kaviar:brief", on);
    return () => window.removeEventListener("kaviar:brief", on);
  }, []);
  useEffect(() => {
    if (state?.ok) try { sessionStorage.removeItem("kaviar-brief"); } catch {}
  }, [state?.ok]);
  if (state?.ok) {
    return (
      <div className="col g8" style={{ padding: "32px 0", alignItems: "flex-start" }}>
        <span className="lp-check"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="#1F8A5B" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
        <span className="h2">Thanks — we’ve got it.</span>
        <p className="sm i2">The Kaviar team will reply by email to set up a time to look at your store together.</p>
      </div>
    );
  }
  const v = state?.values ?? {};
  return (
    <form action={action} className="lp-form col g16">
      <div className="row g12" style={{ flexWrap: "wrap" }} ref={name}>
        <Field label="Name" name="name" value={v.name} auto="name" />
        <Field label="Work email" name="email" type="email" value={v.email} auto="email" />
      </div>
      <div className="row g12" style={{ flexWrap: "wrap" }}>
        <Field label="Brand" name="brand" value={v.brand} auto="organization" />
        <Field label="Store URL" name="storeUrl" placeholder="yourbrand.com" optional value={v.storeUrl} auto="url" />
      </div>
      <label className="col g6">
        <span className="label">What would help most? <span className="i3" style={{ fontWeight: 400 }}>· optional</span></span>
        <textarea ref={msg} name="message" defaultValue={v.message} placeholder="Moving to Shopify, a new store, or growing sales from Meta ads…" />
      </label>
      <div className="lp-hp" aria-hidden><label>Website <input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      {state?.error && <div className="notice red" role="alert">{state.error}</div>}
      <div className="row g12" style={{ flexWrap: "wrap" }}>
        <button className="btn dark lg" disabled={pending}>{pending ? <><span className="spin" style={{ width: 14, height: 14, borderRadius: 99, border: "2px solid rgba(255,255,255,.35)", borderTopColor: "#fff" }} />Sending…</> : <>Book a call<span className="arr">→</span></>}</button>
        <span className="xs i3">We only use this to reply to you.</span>
      </div>
    </form>
  );
}
