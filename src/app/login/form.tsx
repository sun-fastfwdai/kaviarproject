"use client";
import { useActionState } from "react";
import { login, setupOwner, type FormState } from "./actions";

function Field({ label, name, type = "text", auto, value }: { label: string; name: string; type?: string; auto?: string; value?: string }) {
  return (
    <label className="col g6">
      <span className="label">{label}</span>
      <div className="input"><input name={name} type={type} autoComplete={auto} defaultValue={value} required /></div>
    </label>
  );
}

export function LoginForm({ firstRun }: { firstRun: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(firstRun ? setupOwner : login, undefined);
  return (
    <form action={action} className="col g16">
      <div className="col g4">
        <h1 className="h2">{firstRun ? "Set up Kaviar" : "Sign in"}</h1>
        <p className="sm i3">{firstRun ? "Create the owner account. Add the rest of the team from Team after." : "For the Kaviar team. Brands don’t log in here."}</p>
      </div>
      {firstRun && <Field label="Name" name="name" auto="name" value={state?.name} />}
      <Field label="Email" name="email" type="email" auto="email" value={state?.email} />
      <Field label="Password" name="password" type="password" auto={firstRun ? "new-password" : "current-password"} />
      {state?.error && <div className="notice red" role="alert">{state.error}</div>}
      <button className="btn dark lg" disabled={pending}>{pending ? "One moment…" : firstRun ? "Create account" : "Sign in"}</button>
    </form>
  );
}
