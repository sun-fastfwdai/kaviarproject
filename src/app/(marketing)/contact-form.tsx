"use client";
import { useActionState } from "react";
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
  if (state?.ok) {
    return (
      <div className="col g8" style={{ padding: "32px 0", alignItems: "flex-start" }}>
        <span className="pill green"><span className="dot green" />Sent</span>
        <span className="h2">Thanks — we’ve got it.</span>
        <p className="sm i2">The Kaviar team will reply by email to set up a time to look at your store together.</p>
      </div>
    );
  }
  const v = state?.values ?? {};
  return (
    <form action={action} className="lp-form col g16">
      <div className="row g12" style={{ flexWrap: "wrap" }}>
        <Field label="Name" name="name" value={v.name} auto="name" />
        <Field label="Work email" name="email" type="email" value={v.email} auto="email" />
      </div>
      <div className="row g12" style={{ flexWrap: "wrap" }}>
        <Field label="Brand" name="brand" value={v.brand} auto="organization" />
        <Field label="Store URL" name="storeUrl" placeholder="yourbrand.com" optional value={v.storeUrl} auto="url" />
      </div>
      <label className="col g6">
        <span className="label">What would help most? <span className="i3" style={{ fontWeight: 400 }}>· optional</span></span>
        <textarea name="message" defaultValue={v.message} placeholder="Moving to Shopify, a new store, or growing sales from Meta ads…" />
      </label>
      <div className="lp-hp" aria-hidden><label>Website <input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      {state?.error && <div className="notice red" role="alert">{state.error}</div>}
      <div className="row g12" style={{ flexWrap: "wrap" }}>
        <button className="btn dark lg" disabled={pending}>{pending ? "Sending…" : "Book a call"}</button>
        <span className="xs i3">We only use this to reply to you.</span>
      </div>
    </form>
  );
}
