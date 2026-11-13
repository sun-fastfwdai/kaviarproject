"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteVoice, saveVoice } from "./actions";
import { Icon } from "@/components/icon";

export type Voice = { id: string; name: string; seconds: number | null; by: string | null };

/** Any recording or audio file → a mono 24 kHz WAV, trimmed to 15 s (what the video model takes as a voice reference). */
async function toWav(blob: Blob): Promise<{ wav: Blob; seconds: number }> {
  const ctx = new AudioContext();
  try {
    const src = await ctx.decodeAudioData(await blob.arrayBuffer());
    const rate = 24000, seconds = Math.min(15, src.duration);
    const off = new OfflineAudioContext(1, Math.ceil(seconds * rate), rate);
    const node = off.createBufferSource();
    node.buffer = src; node.connect(off.destination); node.start(0);
    const pcm = (await off.startRendering()).getChannelData(0);
    const v = new DataView(new ArrayBuffer(44 + pcm.length * 2));
    const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, "RIFF"); v.setUint32(4, 36 + pcm.length * 2, true); str(8, "WAVE"); str(12, "fmt ");
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, "data"); v.setUint32(40, pcm.length * 2, true);
    for (let i = 0; i < pcm.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 0x7fff, true);
    return { wav: new Blob([v], { type: "audio/wav" }), seconds };
  } finally { await ctx.close(); }
}

/** Voice picker for the Voice + music node: the model's own voice, or a brand voice the team recorded or uploaded (with permission). */
export function VoicePicker({ slug, voices, value, onChange, enabled }: { slug: string; voices: Voice[]; value: string | null; onChange: (id: string | null) => void; enabled: boolean }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [rec, setRec] = useState<{ r: MediaRecorder; t0: number } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [draft, setDraft] = useState<{ wav: Blob; seconds: number; url: string } | null>(null);
  const [name, setName] = useState("");
  const [consent, setConsent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const chunks = useRef<Blob[]>([]);

  useEffect(() => {
    if (!rec) return;
    const t = setInterval(() => {
      const s = (Date.now() - rec.t0) / 1000;
      setElapsed(s);
      if (s >= 15) rec.r.stop();
    }, 200);
    return () => clearInterval(t);
  }, [rec]);
  useEffect(() => () => { if (draft) URL.revokeObjectURL(draft.url); }, [draft]);

  const take = async (blob: Blob) => {
    setErr(null);
    try {
      const w = await toWav(blob);
      if (w.seconds < 2) { setErr("Make it at least 2 seconds."); return; }
      setDraft({ ...w, url: URL.createObjectURL(w.wav) });
    } catch { setErr("Couldn’t read that audio — try a WAV, MP3 or M4A file."); }
  };
  const record = async () => {
    setErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      chunks.current = [];
      r.ondataavailable = (e) => chunks.current.push(e.data);
      r.onstop = () => { stream.getTracks().forEach((t) => t.stop()); setRec(null); void take(new Blob(chunks.current, { type: r.mimeType })); };
      r.start();
      setRec({ r, t0: Date.now() }); setElapsed(0);
    } catch { setErr("The browser didn’t allow the microphone."); }
  };
  const save = () => start(async () => {
    if (!draft) return;
    const f = new FormData();
    f.set("file", new File([draft.wav], "voice.wav", { type: "audio/wav" }));
    f.set("name", name); f.set("consent", consent ? "yes" : "no");
    const r = await saveVoice(slug, f);
    if (r.error) { setErr(r.error); return; }
    if (r.id) onChange(r.id);
    setDraft(null); setName(""); setConsent(false); setAdding(false);
    router.refresh();
  });
  const remove = (id: string) => start(async () => { await deleteVoice(slug, id); if (value === id) onChange(null); router.refresh(); });

  const row = (id: string | null, label: string, sub: string) => (
    <label key={id ?? "model"} className="row g8" style={{ minHeight: 34, borderTop: "1px solid var(--line)", cursor: enabled ? "pointer" : "default", opacity: enabled ? 1 : 0.5 }}>
      <input type="radio" name="voice" disabled={!enabled} checked={value === id} onChange={() => onChange(id)} style={{ accentColor: "#121212", margin: 0 }} />
      <span className="col fill" style={{ minWidth: 0 }}><span className="xs i1 ell">{label}</span><span className="xs i3 ell">{sub}</span></span>
      {id && <audio src={`/api/assets/${id}`} controls preload="none" style={{ width: 92, height: 26 }} />}
      {id && <button type="button" aria-label={`Delete ${label}`} title="Delete this voice" onClick={() => remove(id)} style={{ display: "flex" }}><Icon name="x" size={11} color="#B5B2AC" /></button>}
    </label>
  );

  return (
    <div className="col" style={{ flexShrink: 0 }}>
      <span className="xs w5 i3" style={{ paddingBottom: 4 }}>Voice</span>
      {row(null, "The model’s own voice", "Pick the style below")}
      {voices.map((v) => row(v.id, v.name, `Brand voice · ${v.seconds ?? "?"} s${v.by ? ` · added by ${v.by}` : ""}`))}
      {!adding ? (
        <button type="button" className="row g4 xs i2" disabled={!enabled} onClick={() => setAdding(true)} style={{ paddingTop: 8, borderTop: "1px solid var(--line)" }}><Icon name="plus" size={11} />Add a brand voice</button>
      ) : (
        <div className="col g8" style={{ marginTop: 6, padding: 10, borderRadius: 10, border: "1px solid var(--line)" }}>
          <span className="xs i2" style={{ lineHeight: "16px" }}>Record or upload 5–15 seconds of one person speaking clearly, no music. The clip’s voice-over will sound like them.</span>
          {!draft && (
            <div className="row g6">
              {rec ? <button type="button" className="btn dark sm" onClick={() => rec.r.stop()}><span style={{ width: 8, height: 8, borderRadius: 2, background: "#fff" }} />Stop · {elapsed.toFixed(0)} s</button>
                : <button type="button" className="btn sm" onClick={record}><span style={{ width: 8, height: 8, borderRadius: 99, background: "#C0392B" }} />Record</button>}
              <label className="btn sm" style={{ position: "relative" }}><Icon name="upload" size={12} />Upload
                <input type="file" accept="audio/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) void take(f); e.target.value = ""; }} style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }} /></label>
            </div>
          )}
          {draft && <>
            <audio src={draft.url} controls style={{ width: "100%", height: 30 }} />
            <span className="xs i3">{draft.seconds.toFixed(1)} s · mono WAV</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. Founder’s voice" aria-label="Voice name" className="input sm" style={{ height: 30, fontSize: 12 }} />
            <label className="row top g6 xs i2" style={{ lineHeight: "16px", cursor: "pointer" }}>
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ accentColor: "#121212", marginTop: 2 }} />
              This is my voice, or I have the speaker’s written permission to use it in this brand’s ads.
            </label>
          </>}
          {err && <span className="xs c-amber">{err}</span>}
          <div className="row g6">
            {draft && <button type="button" className="btn dark sm" disabled={busy || !consent} onClick={save}>{busy ? <Icon name="spinner" size={12} className="spin" color="#fff" /> : null}Save voice</button>}
            {draft && <button type="button" className="btn quiet sm" onClick={() => setDraft(null)}>Redo</button>}
            <button type="button" className="btn quiet sm" onClick={() => { rec?.r.stop(); setDraft(null); setAdding(false); setErr(null); }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
