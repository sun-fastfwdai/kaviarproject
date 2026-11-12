"use client";
import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { login, setupOwner, type FormState } from "./actions";

/** Tells the mascot panel what the form is doing (typing a password, error, sending). */
const emit = (state: string) => window.dispatchEvent(new CustomEvent("kaviar:auth", { detail: state }));

function strength(pw: string): number {
  let s = 0;
  if (pw.length >= 10) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw) && /\d/.test(pw)) s++;
  if (pw.length >= 14 || /[^A-Za-z0-9]/.test(pw)) s++;
  return pw ? Math.max(1, s) : 0;
}

export function LoginForm({ firstRun }: { firstRun: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(firstRun ? setupOwner : login, undefined);
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  const [pw, setPw] = useState("");
  // Each failed attempt returns a fresh `at`, which re-keys the notice so it shakes again.
  useEffect(() => { if (state?.error) emit("error"); }, [state]);
  useEffect(() => { if (pending) emit("sending"); }, [pending]);

  const level = strength(pw);
  const meter = ["", "#B7791F", "#B7791F", "#1F8A5B"][level];

  return (
    <form action={action} className="col g16" onSubmit={() => setPw("")}>
      <div className="col g6 auth-in">
        <h1 className="h1">{firstRun ? "Set up Kaviar" : "Welcome back"}</h1>
        <p className="t i3">{firstRun ? "Create the owner account. Add the rest of the team after." : "Sign in to the Kaviar console."}</p>
      </div>
      {firstRun && (
        <div className="notice auth-in" style={{ ["--i" as string]: 1 }}>
          <span>This database has no accounts yet, so this one-time setup appears instead of sign in. Once the owner account exists, everyone signs in here.</span>
        </div>
      )}

      {firstRun && (
        <label className="field auth-in" style={{ ["--i" as string]: 1 }}>
          <span className="label">Name</span>
          <div className="input"><input name="name" autoComplete="name" defaultValue={state?.name} required /></div>
        </label>
      )}
      <label className="field auth-in" style={{ ["--i" as string]: 2 }}>
        <span className="label">Email</span>
        <div className="input"><input name="email" type="email" autoComplete="email" defaultValue={state?.email} placeholder="you@kaviar.ai" required onFocus={() => emit("email")} /></div>
      </label>
      <label className="field auth-in" style={{ ["--i" as string]: 3 }}>
        <span className="row between"><span className="label">Password</span>{!firstRun && <span className="xs i3">Forgot it? Ask an owner to reset it.</span>}</span>
        <div className="input">
          <input
            name="password" type={show ? "text" : "password"} required minLength={firstRun ? 10 : 1}
            autoComplete={firstRun ? "new-password" : "current-password"}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            onFocus={() => emit(show ? "peek" : "password")}
            onBlur={() => emit("idle")}
            onKeyUp={(e) => setCaps(e.getModifierState("CapsLock"))}
          />
          <button type="button" onClick={() => { setShow(!show); emit(!show ? "peek" : "password"); }} aria-label={show ? "Hide password" : "Show password"} title={show ? "Hide password" : "Show password"}>
            {show ? (
              <svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor"><path d="M53.92 34.62a8 8 0 1 0-11.84 10.76l19.24 21.17C25 88.84 9.38 123.2 8.69 124.76a8 8 0 0 0 0 6.5c.35.79 8.82 19.57 27.65 38.4C61.43 194.74 93.12 208 128 208a127.1 127.1 0 0 0 52.07-10.83l22 24.21a8 8 0 1 0 11.84-10.76Zm47.33 75.84 41.67 45.85a32 32 0 0 1-41.67-45.85M128 192c-30.78 0-57.67-11.19-79.93-33.25A133.2 133.2 0 0 1 25 128c4.69-8.79 19.66-33.39 47.35-49.38l18 19.75a48 48 0 0 0 63.66 70l14.73 16.2A112 112 0 0 1 128 192m6-95.43a8 8 0 0 1 3-15.72 48.16 48.16 0 0 1 38.77 42.64 8 8 0 0 1-7.22 8.71 6 6 0 0 1-.75 0 8 8 0 0 1-8-7.26A32.09 32.09 0 0 0 134 96.57m113.28 34.69c-.42.94-10.55 23.37-33.36 43.8a8 8 0 1 1-10.67-11.92A132.8 132.8 0 0 0 231.05 128a133.2 133.2 0 0 0-23.12-30.77C185.67 75.19 158.78 64 128 64a118 118 0 0 0-19.36 1.57A8 8 0 1 1 106 49.79 134 134 0 0 1 128 48c34.88 0 66.57 13.26 91.66 38.35 18.83 18.83 27.3 37.62 27.65 38.41a8 8 0 0 1 0 6.5Z" /></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor"><path d="M247.31 124.76c-.35-.79-8.82-19.58-27.65-38.41C194.57 61.26 162.88 48 128 48S61.43 61.26 36.34 86.35C17.51 105.18 9 124 8.69 124.76a8 8 0 0 0 0 6.5c.35.79 8.82 19.57 27.65 38.4C61.43 194.74 93.12 208 128 208s66.57-13.26 91.66-38.34c18.83-18.83 27.3-37.61 27.65-38.4a8 8 0 0 0 0-6.5M128 192c-30.78 0-57.67-11.19-79.93-33.25A133.5 133.5 0 0 1 25 128a133.3 133.3 0 0 1 23.07-30.75C70.33 75.19 97.22 64 128 64s57.67 11.19 79.93 33.25A133.5 133.5 0 0 1 231.05 128c-7.21 13.46-38.62 64-103.05 64m0-112a48 48 0 1 0 48 48 48.05 48.05 0 0 0-48-48m0 80a32 32 0 1 1 32-32 32 32 0 0 1-32 32" /></svg>
            )}
          </button>
        </div>
        {caps && <span className="xs c-amber">Caps Lock is on</span>}
        {firstRun && (
          <div className="col g6" style={{ paddingTop: 2 }}>
            <div className="auth-meter">{[1, 2, 3].map((n) => <i key={n} style={{ background: level >= n ? meter : undefined }} />)}</div>
            <span className="xs i3">{level === 0 ? "At least 10 characters." : level === 1 ? "Long enough — mix in numbers and capitals." : level === 2 ? "Good. A symbol or a few more characters makes it strong." : "Strong password."}</span>
          </div>
        )}
      </label>

      {state?.error && (
        <div key={state.at} className="notice red auth-shake" role="alert">
          <svg width="15" height="15" viewBox="0 0 256 256" fill="currentColor" style={{ marginTop: 1 }}><path d="M128 24a104 104 0 1 0 104 104A104.11 104.11 0 0 0 128 24m0 192a88 88 0 1 1 88-88 88.1 88.1 0 0 1-88 88m-8-80V80a8 8 0 0 1 16 0v56a8 8 0 0 1-16 0m20 36a12 12 0 1 1-12-12 12 12 0 0 1 12 12" /></svg>
          {state.error}
        </div>
      )}
      <button className="btn dark lg auth-in" style={{ ["--i" as string]: 4 }} disabled={pending}>
        {pending ? <><span className="auth-spin" />{firstRun ? "Creating your account…" : "Signing in…"}</> : <>{firstRun ? "Create account" : "Sign in"}<span className="arr">→</span></>}
      </button>
      {!firstRun && <p className="sm i3">Have an invite? <Link className="lnk w5 i1" href="/signup">Create an account</Link></p>}
    </form>
  );
}
