"use client";
import { useActionState, useState, useTransition } from "react";
import { addMember, changePassword, removeMember, resetPassword, type TeamState } from "./actions";
import { CopyButton } from "@/components/copy";

function Created({ c, onDone }: { c: NonNullable<TeamState>["created"] & object; onDone?: () => void }) {
  return (
    <div className="notice green col g8" style={{ alignItems: "stretch" }}>
      <span><b className="w5">{c.name}</b> can sign in with <b className="w5">{c.email}</b> and this one-time password. It won’t be shown again.</span>
      <div className="row g8">
        <div className="input sm fill" style={{ background: "#fff" }}><span className="mono i1">{c.password}</span></div>
        <CopyButton text={c.password} label="Copy password" />
        {onDone && <button type="button" className="btn sm quiet" onClick={onDone}>Done</button>}
      </div>
      <span className="xs">Share it privately. They can change it on the Team page after signing in.</span>
    </div>
  );
}

export function AddMember() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<TeamState, FormData>(addMember, undefined);
  if (state?.created && open) return <Created c={state.created} onDone={() => setOpen(false)} />;
  if (!open) return <button className="btn dark sm" onClick={() => setOpen(true)}>+ Add teammate</button>;
  return (
    <form action={action} className="card col g12" style={{ padding: 16 }}>
      <span className="h3">Add a teammate</span>
      <div className="row g12" style={{ flexWrap: "wrap" }}>
        <label className="col g6 fill" style={{ minWidth: 180 }}><span className="label">Name</span><div className="input sm"><input name="name" required autoFocus /></div></label>
        <label className="col g6 fill" style={{ minWidth: 220 }}><span className="label">Email</span><div className="input sm"><input name="email" type="email" required /></div></label>
        <label className="col g6" style={{ width: 150 }}><span className="label">Role</span>
          <div className="input sm"><select name="role" defaultValue="operator"><option value="operator">Operator</option><option value="owner">Owner</option></select></div>
        </label>
      </div>
      {state?.error && <div key={state.at} className="notice red">{state.error}</div>}
      <div className="row g8">
        <button className="btn dark sm" disabled={pending}>{pending ? "Adding…" : "Add and create password"}</button>
        <button type="button" className="btn sm quiet" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}

export function MemberActions({ id, name }: { id: string; name: string }) {
  const [res, setRes] = useState<TeamState>();
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  if (res?.created) return <div style={{ position: "absolute", left: 16, right: 16, top: "100%", zIndex: 5 }}><Created c={res.created} onDone={() => setRes(undefined)} /></div>;
  return (
    <div className="row g6">
      <button className="btn sm" disabled={pending} onClick={() => start(async () => setRes(await resetPassword(id)))}>Reset password</button>
      {confirm ? (
        <>
          <button className="btn sm" style={{ color: "var(--red)" }} disabled={pending} onClick={() => start(() => removeMember(id))}>Remove {name.split(" ")[0]}</button>
          <button className="btn sm quiet" onClick={() => setConfirm(false)}>Keep</button>
        </>
      ) : (
        <button className="btn sm quiet" onClick={() => setConfirm(true)}>Remove</button>
      )}
      {res?.error && <span className="xs c-amber">{res.error}</span>}
    </div>
  );
}

export function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<TeamState, FormData>(changePassword, undefined);
  if (!open) return <button className="btn sm" onClick={() => setOpen(true)}>Change your password</button>;
  return (
    <form action={action} className="card col g12" style={{ padding: 16 }}>
      <span className="h3">Change your password</span>
      <div className="row g12" style={{ flexWrap: "wrap" }}>
        <label className="col g6 fill" style={{ minWidth: 200 }}><span className="label">Current password</span><div className="input sm"><input name="current" type="password" autoComplete="current-password" required /></div></label>
        <label className="col g6 fill" style={{ minWidth: 200 }}><span className="label">New password</span><div className="input sm"><input name="next" type="password" autoComplete="new-password" minLength={10} required /></div></label>
      </div>
      {state?.error && <div key={state.at} className="notice red">{state.error}</div>}
      {state?.ok && <div className="notice green">{state.ok}</div>}
      <div className="row g8">
        <button className="btn dark sm" disabled={pending}>{pending ? "Saving…" : "Save new password"}</button>
        <button type="button" className="btn sm quiet" onClick={() => setOpen(false)}>Close</button>
      </div>
    </form>
  );
}
