"use client";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { addMember, changePassword, createInvite, removeMember, resetPassword, revokeInvite, type InviteState, type TeamState } from "./actions";
import { CopyButton } from "@/components/copy";
import { Modal } from "@/components/modal";

const UserPlus = () => <svg width="17" height="17" viewBox="0 0 256 256" fill="currentColor"><path d="M256 136a8 8 0 0 1-8 8h-16v16a8 8 0 0 1-16 0v-16h-16a8 8 0 0 1 0-16h16v-16a8 8 0 0 1 16 0v16h16a8 8 0 0 1 8 8m-57.87 58.85a8 8 0 0 1-12.26 10.3C165.75 181.19 138.09 168 108 168s-57.75 13.19-77.87 37.15a8 8 0 0 1-12.25-10.3c14.94-17.78 33.52-30.41 54.17-37.17a68 68 0 1 1 71.9 0c20.65 6.76 39.23 19.39 54.18 37.17M108 152a52 52 0 1 0-52-52 52.06 52.06 0 0 0 52 52" /></svg>;
const Key = () => <svg width="17" height="17" viewBox="0 0 256 256" fill="currentColor"><path d="M216.57 39.43a80 80 0 0 0-132.66 81.35L28.69 176A15.86 15.86 0 0 0 24 187.31V216a16 16 0 0 0 16 16h32a8 8 0 0 0 8-8v-16h16a8 8 0 0 0 8-8v-16h16a8 8 0 0 0 5.66-2.34l9.56-9.57A79.7 79.7 0 0 0 160 176h.1a80 80 0 0 0 56.47-136.57M224 98.1c-1.09 34.09-29.75 61.86-63.89 61.9H160a63.7 63.7 0 0 1-23.65-4.51 8 8 0 0 0-8.84 1.68L116.69 168H96a8 8 0 0 0-8 8v16H72a8 8 0 0 0-8 8v16H40v-28.69l58.83-58.82a8 8 0 0 0 1.68-8.84A63.7 63.7 0 0 1 96 96v-.11c0-34.14 27.81-62.8 61.9-63.89A64 64 0 0 1 224 98.1M192 76a12 12 0 1 1-12-12 12 12 0 0 1 12 12" /></svg>;
const Trash = () => <svg width="17" height="17" viewBox="0 0 256 256" fill="currentColor"><path d="M216 48h-40v-8a24 24 0 0 0-24-24h-48a24 24 0 0 0-24 24v8H40a8 8 0 0 0 0 16h8v144a16 16 0 0 0 16 16h128a16 16 0 0 0 16-16V64h8a8 8 0 0 0 0-16M96 40a8 8 0 0 1 8-8h48a8 8 0 0 1 8 8v8H96Zm96 168H64V64h128Zm-80-104v64a8 8 0 0 1-16 0v-64a8 8 0 0 1 16 0m48 0v64a8 8 0 0 1-16 0v-64a8 8 0 0 1 16 0" /></svg>;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="col g6"><span className="label">{label}</span>{children}</label>;
}

function OneTime({ c }: { c: { name: string; email: string; password: string } }) {
  return (
    <div className="col g10">
      <div className="notice green"><span><b className="w5">{c.name}</b> can now sign in with <b className="w5">{c.email}</b>.</span></div>
      <Field label="One-time password">
        <div className="row g8"><div className="input fill" style={{ background: "var(--tray)" }}><span className="mono i1">{c.password}</span></div><CopyButton text={c.password} /></div>
      </Field>
      <span className="xs i3">It won’t be shown again. Share it privately — they can change it from Team after signing in.</span>
    </div>
  );
}

function As({ me }: { me: { initials: string; role: string } }) {
  return <span className="row g8 xs i3 fill"><span className="av s k">{me.initials}</span>As {me.role === "owner" ? "owner" : "operator"}</span>;
}

export function InviteTeammate({ me }: { me: { initials: string; role: string } }) {
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  return (
    <>
      <button className="btn dark sm" onClick={() => { setRound(round + 1); setOpen(true); }}>
        <svg width="14" height="14" viewBox="0 0 256 256" fill="#fff"><path d="M224 128a8 8 0 0 1-8 8h-80v80a8 8 0 0 1-16 0v-80H40a8 8 0 0 1 0-16h80V40a8 8 0 0 1 16 0v80h80a8 8 0 0 1 8 8" /></svg>Invite teammate
      </button>
      {open && <InviteModal key={round} me={me} onClose={() => setOpen(false)} />}
    </>
  );
}

function InviteModal({ me, onClose }: { me: { initials: string; role: string }; onClose: () => void }) {
  const [state, action, pending] = useActionState<TeamState, FormData>(addMember, undefined);
  const [role, setRole] = useState<"operator" | "owner">("operator");
  if (state?.created) {
    return (
      <Modal icon={<UserPlus />} title="Teammate added" sub="Send them the password below." onClose={onClose}
        footer={<><As me={me} /><button className="btn dark" onClick={onClose}>Done</button></>}>
        <OneTime c={state.created} />
      </Modal>
    );
  }
  return (
    <Modal icon={<UserPlus />} title="Invite a teammate" sub="They get access to every brand. Kaviar creates a one-time password for them." onClose={onClose}
      footer={<><As me={me} /><button type="button" className="btn" onClick={onClose}>Cancel</button><button form="invite" className="btn dark" disabled={pending}>{pending ? "Inviting…" : "Invite teammate"}</button></>}>
      <form id="invite" action={action} className="col g14">
        <input type="hidden" name="role" value={role} />
        <div className="row g12">
          <div className="fill"><Field label="Name"><div className="input"><input name="name" placeholder="Jina" required autoFocus /></div></Field></div>
          <div className="fill"><Field label="Email"><div className="input"><input name="email" type="email" placeholder="jina@kaviar.ai" required /></div></Field></div>
        </div>
        <Field label="Role">
          <div className="col g8">
            {([["operator", "Operator", "Works on brands: data, signals, ads and stores."], ["owner", "Owner", "Everything operators do, plus managing the team."]] as const).map(([v, t, d]) => (
              <button key={v} type="button" onClick={() => setRole(v)} className="row g10" style={{ padding: "10px 12px", borderRadius: 10, textAlign: "left", border: `1px solid ${role === v ? "var(--ink)" : "var(--line)"}`, boxShadow: role === v ? "0 0 0 1px var(--ink)" : undefined, background: "#fff" }}>
                <span className={`radio${role === v ? " on" : ""}`} />
                <span className="col fill"><span className="sm w5 i1">{t}</span><span className="xs i3">{d}</span></span>
              </button>
            ))}
          </div>
        </Field>
        {state?.error && <div key={state.at} className="notice red" role="alert">{state.error}</div>}
      </form>
    </Modal>
  );
}

type Dialog = null | "reset" | "remove" | "password";

/** The "⋯" at the end of each row. */
export function RowMenu({ id, name, email, self, me }: { id: string; name: string; email: string; self: boolean; me: { initials: string; role: string } }) {
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const owner = me.role === "owner";
  if (!self && !owner) return null;
  const pick = (d: Dialog) => { setOpen(false); setDialog(d); };
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="btn quiet sm ic" aria-label={`Actions for ${name}`} onClick={() => setOpen(!open)}>⋯</button>
      {open && (
        <div className="menu" role="menu">
          {self ? <button role="menuitem" onClick={() => pick("password")}><Key />Change password</button> : (
            <>
              <button role="menuitem" onClick={() => pick("reset")}><Key />Reset password</button>
              <button role="menuitem" className="danger" onClick={() => pick("remove")}><Trash />Remove from team</button>
            </>
          )}
        </div>
      )}
      {dialog === "reset" && <ResetModal id={id} name={name} email={email} me={me} onClose={() => setDialog(null)} />}
      {dialog === "remove" && <RemoveModal id={id} name={name} me={me} onClose={() => setDialog(null)} />}
      {dialog === "password" && <PasswordModal me={me} onClose={() => setDialog(null)} />}
    </div>
  );
}

function ResetModal({ id, name, email, me, onClose }: { id: string; name: string; email: string; me: { initials: string; role: string }; onClose: () => void }) {
  const [res, setRes] = useState<TeamState>();
  const [pending, start] = useTransition();
  return (
    <Modal icon={<Key />} title={`Reset ${name.split(" ")[0]}’s password`} sub={res?.created ? "Send them the new password." : `${email} will be signed out everywhere and get a new one-time password.`} onClose={onClose}
      footer={res?.created ? <><As me={me} /><button className="btn dark" onClick={onClose}>Done</button></> :
        <><As me={me} /><button className="btn" onClick={onClose}>Cancel</button><button className="btn dark" disabled={pending} onClick={() => start(async () => setRes(await resetPassword(id)))}>{pending ? "Resetting…" : "Reset password"}</button></>}>
      {res?.created ? <OneTime c={res.created} /> : <span className="sm i2">Their current password stops working right away.</span>}
      {res?.error && <div className="notice red">{res.error}</div>}
    </Modal>
  );
}

function RemoveModal({ id, name, me, onClose }: { id: string; name: string; me: { initials: string; role: string }; onClose: () => void }) {
  const [pending, start] = useTransition();
  return (
    <Modal icon={<Trash />} title={`Remove ${name} from the team?`} sub="They lose access to every brand immediately." onClose={onClose}
      footer={<><As me={me} /><button className="btn" onClick={onClose}>Cancel</button><button className="btn" style={{ color: "var(--red)", borderColor: "#F3D3CF" }} disabled={pending} onClick={() => start(async () => { await removeMember(id); onClose(); })}>{pending ? "Removing…" : "Remove"}</button></>}>
      <span className="sm i2">Brands, data and connections stay as they are. You can invite them again later.</span>
    </Modal>
  );
}

function PasswordModal({ me, onClose }: { me: { initials: string; role: string }; onClose: () => void }) {
  const [state, action, pending] = useActionState<TeamState, FormData>(changePassword, undefined);
  return (
    <Modal icon={<Key />} title="Change your password" sub="Other devices are signed out after the change." onClose={onClose}
      footer={state?.ok ? <><As me={me} /><button className="btn dark" onClick={onClose}>Done</button></> :
        <><As me={me} /><button type="button" className="btn" onClick={onClose}>Cancel</button><button form="pw" className="btn dark" disabled={pending}>{pending ? "Saving…" : "Save password"}</button></>}>
      {state?.ok ? <div className="notice green">{state.ok}</div> : (
        <form id="pw" action={action} className="col g14">
          <Field label="Current password"><div className="input"><input name="current" type="password" autoComplete="current-password" required autoFocus /></div></Field>
          <Field label="New password"><div className="input"><input name="next" type="password" autoComplete="new-password" minLength={10} required /></div></Field>
          <span className="xs i3">At least 10 characters.</span>
          {state?.error && <div key={state.at} className="notice red" role="alert">{state.error}</div>}
        </form>
      )}
    </Modal>
  );
}

const LinkIcon = () => <svg width="17" height="17" viewBox="0 0 256 256" fill="currentColor"><path d="M240 88.23a54.43 54.43 0 0 1-16 37L189.25 160a54.27 54.27 0 0 1-38.63 16h-.05A54.63 54.63 0 0 1 96 119.84a8 8 0 0 1 16 .45A38.62 38.62 0 0 0 150.58 160a38.4 38.4 0 0 0 27.31-11.31l34.75-34.75a38.63 38.63 0 0 0-54.63-54.63l-11 11A8 8 0 0 1 135.7 59l11-11a54.65 54.65 0 0 1 77.3 0 54.86 54.86 0 0 1 16 40.23M109 185.66l-11 11A38.4 38.4 0 0 1 70.6 208a38.63 38.63 0 0 1-27.29-65.94L78 107.31a38.63 38.63 0 0 1 66 28.4 8 8 0 0 0 7.78 8.22h.22a8 8 0 0 0 8-7.78A54.86 54.86 0 0 0 144 96a54.65 54.65 0 0 0-77.27 0L32 130.75A54.62 54.62 0 0 0 70.56 224a54.28 54.28 0 0 0 38.64-16l11-11a8 8 0 0 0-11.2-11.34" /></svg>;

export function InviteLinkButton({ me }: { me: { initials: string; role: string } }) {
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  return (
    <>
      <button className="btn sm" onClick={() => { setRound(round + 1); setOpen(true); }}><LinkIcon />Invite link</button>
      {open && <InviteLinkModal key={round} me={me} onClose={() => setOpen(false)} />}
    </>
  );
}

function InviteLinkModal({ me, onClose }: { me: { initials: string; role: string }; onClose: () => void }) {
  const [state, action, pending] = useActionState<InviteState, FormData>(createInvite, undefined);
  const [role, setRole] = useState<"operator" | "owner">("operator");
  if (state?.url) {
    return (
      <Modal icon={<LinkIcon />} title="Invite link ready" sub="Share it privately. Anyone with the link can create an account." onClose={onClose}
        footer={<><As me={me} /><button className="btn dark" onClick={onClose}>Done</button></>}>
        <div className="row g8"><div className="input fill" style={{ background: "var(--tray)" }}><span className="mono i1 ell">{state.url}</span></div><CopyButton text={state.url} label="Copy link" /></div>
        <span className="xs i3">Works for 7 days and up to 10 sign-ups. You can revoke it any time from Team.</span>
      </Modal>
    );
  }
  return (
    <Modal icon={<LinkIcon />} title="Create an invite link" sub="People who open it can create their own account and join the team." onClose={onClose}
      footer={<><As me={me} /><button type="button" className="btn" onClick={onClose}>Cancel</button><button form="invite-link" className="btn dark" disabled={pending}>{pending ? "Creating…" : "Create link"}</button></>}>
      <form id="invite-link" action={action} className="col g8">
        <input type="hidden" name="role" value={role} />
        <span className="label">They join as</span>
        {([["operator", "Operator", "Works on brands: data, signals, ads and stores."], ["owner", "Owner", "Everything operators do, plus managing the team."]] as const).map(([v, t, d]) => (
          <button key={v} type="button" onClick={() => setRole(v)} className="row g10" style={{ padding: "10px 12px", borderRadius: 10, textAlign: "left", border: `1px solid ${role === v ? "var(--ink)" : "var(--line)"}`, boxShadow: role === v ? "0 0 0 1px var(--ink)" : undefined, background: "#fff" }}>
            <span className={`radio${role === v ? " on" : ""}`} />
            <span className="col fill"><span className="sm w5 i1">{t}</span><span className="xs i3">{d}</span></span>
          </button>
        ))}
        <span className="xs i3">The link lasts 7 days and allows up to 10 sign-ups.</span>
        {state?.error && <div className="notice red">{state.error}</div>}
      </form>
    </Modal>
  );
}

export function RevokeInvite({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return <button className="btn sm quiet" disabled={pending} onClick={() => start(() => revokeInvite(id))}>{pending ? "Revoking…" : "Revoke"}</button>;
}
