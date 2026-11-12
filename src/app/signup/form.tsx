"use client";
import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { signup, type SignupState } from "./actions";

const emit = (state: string) => window.dispatchEvent(new CustomEvent("kaviar:auth", { detail: state }));

function strength(pw: string): number {
  let s = 0;
  if (pw.length >= 10) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw) && /\d/.test(pw)) s++;
  if (pw.length >= 14 || /[^A-Za-z0-9]/.test(pw)) s++;
  return pw ? Math.max(1, s) : 0;
}

export function SignupForm({ code, invite }: { code: string; invite: { role: string; by: string | null } | null }) {
  const [state, action, pending] = useActionState<SignupState, FormData>(signup, undefined);
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  useEffect(() => { if (state?.error) emit("error"); }, [state]);
  useEffect(() => { if (pending) emit("sending"); }, [pending]);
  const level = strength(pw);
  const meter = ["", "#B7791F", "#B7791F", "#1F8A5B"][level];

  return (
    <form action={action} className="col g16" onSubmit={() => setPw("")}>
      <div className="col g6 auth-in">
        <h1 className="h1">Create your account</h1>
        <p className="t i3">{invite ? <>You’re invited{invite.by ? <> by <b className="w5 i1">{invite.by}</b></> : null} to join the Kaviar team{invite.role === "owner" ? " as an owner" : ""}.</> : "Enter the invite code an owner shared with you."}</p>
      </div>

      {invite ? (
        <>
          <input type="hidden" name="code" value={code} />
          <div className="notice green auth-in" style={{ ["--i" as string]: 1 }}><span>Invite link verified.</span></div>
        </>
      ) : (
        <label className="field auth-in" style={{ ["--i" as string]: 1 }}>
          <span className="label">Invite code</span>
          <div className="input"><input name="code" defaultValue={code} autoComplete="off" required /></div>
        </label>
      )}
      <label className="field auth-in" style={{ ["--i" as string]: 2 }}>
        <span className="label">Name</span>
        <div className="input"><input name="name" autoComplete="name" defaultValue={state?.name} required autoFocus /></div>
      </label>
      <label className="field auth-in" style={{ ["--i" as string]: 3 }}>
        <span className="label">Work email</span>
        <div className="input"><input name="email" type="email" autoComplete="email" defaultValue={state?.email} placeholder="you@company.com" required onFocus={() => emit("email")} /></div>
      </label>
      <label className="field auth-in" style={{ ["--i" as string]: 4 }}>
        <span className="label">Password</span>
        <div className="input">
          <input name="password" type={show ? "text" : "password"} autoComplete="new-password" minLength={10} required value={pw}
            onChange={(e) => setPw(e.target.value)} onFocus={() => emit(show ? "peek" : "password")} onBlur={() => emit("idle")} />
          <button type="button" onClick={() => { setShow(!show); emit(!show ? "peek" : "password"); }} aria-label={show ? "Hide password" : "Show password"}>{show ? "Hide" : "Show"}</button>
        </div>
        <div className="col g6" style={{ paddingTop: 2 }}>
          <div className="auth-meter">{[1, 2, 3].map((n) => <i key={n} style={{ background: level >= n ? meter : undefined }} />)}</div>
          <span className="xs i3">{level === 0 ? "At least 10 characters." : level === 1 ? "Long enough — mix in numbers and capitals." : level === 2 ? "Good. A symbol or a few more characters makes it strong." : "Strong password."}</span>
        </div>
      </label>
      {state?.error && <div key={state.at} className="notice red auth-shake" role="alert">{state.error}</div>}
      <button className="btn dark lg auth-in" style={{ ["--i" as string]: 5 }} disabled={pending}>
        {pending ? <><span className="auth-spin" />Creating your account…</> : <>Create account<span className="arr">→</span></>}
      </button>
      <p className="sm i3">Already have an account? <Link className="lnk w5 i1" href="/login">Sign in</Link></p>
    </form>
  );
}
