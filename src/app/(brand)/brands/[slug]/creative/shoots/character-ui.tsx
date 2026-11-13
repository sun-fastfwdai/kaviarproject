"use client";
/* eslint-disable @next/next/no-img-element -- character sheets */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createCharacter, deleteCharacter, suggestCasting, uploadCharacter } from "./actions";
import { Icon } from "@/components/icon";
import { AgentFace } from "@/components/agent";

export type Character = { id: string; name: string; description: string; uploaded: boolean };

/** Character node panel: pick a saved person, cast a new one (Remy can suggest who), or use a real creator's photo with their permission. */
export function CharacterPicker({ slug, characters, value, onChange, price, signal, product, onView }: {
  slug: string; characters: Character[]; value: string | null; onChange: (id: string | null) => void; price: number; signal: string | null; product: string | null; onView: (id: string) => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"none" | "make" | "upload">(characters.length ? "none" : "make");
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState<"suggest" | "make" | "upload" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const cur = characters.find((c) => c.id === value) ?? null;

  const run = async (k: "suggest" | "make" | "upload", fn: () => Promise<void>) => { setBusy(k); setErr(null); try { await fn(); } catch (e) { setErr((e as Error).message); } finally { setBusy(null); } };
  const suggest = () => run("suggest", async () => { const r = await suggestCasting(slug, { signal, product }); if (r.error) setErr(r.error); else { setName(r.name ?? ""); setDesc(r.description ?? ""); } });
  const make = () => run("make", async () => {
    const r = await createCharacter(slug, { name, description: desc });
    if (r.error) { setErr(r.error); return; }
    if (r.id) onChange(r.id);
    setMode("none"); setName(""); setDesc(""); router.refresh();
  });
  const upload = () => run("upload", async () => {
    if (!file) return;
    const f = new FormData(); f.set("file", file); f.set("name", name); f.set("note", desc); f.set("consent", consent ? "yes" : "no");
    const r = await uploadCharacter(slug, f);
    if (r.error) { setErr(r.error); return; }
    if (r.id) onChange(r.id);
    setMode("none"); setName(""); setDesc(""); setFile(null); setConsent(false); router.refresh();
  });
  const remove = (id: string) => run("upload", async () => { await deleteCharacter(slug, id); if (value === id) onChange(null); router.refresh(); });

  return (
    <div className="col g10" style={{ flexShrink: 0 }}>
      {cur && (
        <button type="button" onClick={() => onView(cur.id)} title="Open" style={{ borderRadius: 10, overflow: "hidden", boxShadow: "0 0 0 1px var(--line)", background: "var(--tray)", padding: 0 }}>
          <img src={`/api/assets/${cur.id}`} alt="" style={{ width: "100%", maxHeight: 160, objectFit: "cover", display: "block" }} />
        </button>
      )}
      <div className="col">
        <span className="xs w5 i3" style={{ paddingBottom: 4 }}>People for {characters.length ? "this brand" : "this brand — none yet"}</span>
        {characters.map((c) => (
          <label key={c.id} className="row g8" style={{ minHeight: 44, borderTop: "1px solid var(--line)", cursor: "pointer" }}>
            <input type="radio" name="character" checked={value === c.id} onChange={() => onChange(c.id)} style={{ accentColor: "#121212", margin: 0 }} />
            <img src={`/api/assets/${c.id}`} alt="" width={36} height={36} style={{ borderRadius: 7, objectFit: "cover", flexShrink: 0 }} />
            <span className="col fill" style={{ minWidth: 0 }}><span className="xs w5 i1 ell">{c.name}</span><span className="xs i3 ell" title={c.description}>{c.uploaded ? "Real creator · photo" : "Character sheet"} · {c.description}</span></span>
            <button type="button" aria-label={`Delete ${c.name}`} title="Delete" onClick={(e) => { e.preventDefault(); remove(c.id); }} style={{ display: "flex" }}><Icon name="x" size={11} color="#B5B2AC" /></button>
          </label>
        ))}
      </div>

      <div className="row g6">
        <button type="button" className={`btn sm${mode === "make" ? " dark" : ""}`} onClick={() => setMode(mode === "make" ? "none" : "make")}><Icon name="sparkle" size={12} color={mode === "make" ? "#fff" : undefined} />New person</button>
        <button type="button" className={`btn sm${mode === "upload" ? " dark" : ""}`} onClick={() => setMode(mode === "upload" ? "none" : "upload")}><Icon name="upload" size={12} color={mode === "upload" ? "#fff" : undefined} />Real creator</button>
      </div>

      {mode === "make" && (
        <div className="col g8" style={{ padding: 10, borderRadius: 10, border: "1px solid var(--line)" }}>
          <span className="xs i2" style={{ lineHeight: "16px" }}>Describe who should be in the ads. Kaviar makes a character sheet — the same person from four angles — that every shoot reuses.</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. Mina" aria-label="Name" className="input sm" style={{ height: 30, fontSize: 12 }} />
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} maxLength={600} placeholder="e.g. Woman in her early 30s, warm smile, natural makeup, shoulder-length dark hair, linen shirt, relaxed Seoul-apartment vibe"
            style={{ border: "1px solid var(--line-2)", borderRadius: 8, padding: 8, resize: "vertical", font: "inherit", fontSize: 12, lineHeight: "17px" }} />
          <button type="button" className="btn quiet sm" style={{ alignSelf: "flex-start" }} disabled={busy != null} onClick={suggest}>{busy === "suggest" ? <Icon name="spinner" size={12} className="spin" /> : <AgentFace kind="builder" size={14} />}Suggest from the audience</button>
          <button type="button" className="btn dark sm" style={{ justifyContent: "center" }} disabled={busy != null || desc.trim().length < 12} onClick={make}>{busy === "make" ? <Icon name="spinner" size={12} className="spin" color="#fff" /> : <Icon name="sparkle" size={12} color="#fff" />}Make character sheet · ${price.toFixed(2)}</button>
          {busy === "make" && <span className="xs i3">Usually 20–40 seconds.</span>}
        </div>
      )}

      {mode === "upload" && (
        <div className="col g8" style={{ padding: 10, borderRadius: 10, border: "1px solid var(--line)" }}>
          <span className="xs i2" style={{ lineHeight: "16px" }}>A clear photo of a real creator or model — face and upper body, good light. They become the person in the ads.</span>
          <label className="btn sm" style={{ position: "relative", alignSelf: "flex-start" }}><Icon name="upload" size={12} />{file ? file.name.slice(0, 28) : "Choose a photo"}
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }} /></label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Their name" aria-label="Name" className="input sm" style={{ height: 30, fontSize: 12 }} />
          <label className="row top g6 xs i2" style={{ lineHeight: "16px", cursor: "pointer" }}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ accentColor: "#121212", marginTop: 2 }} />
            I have this person’s written permission to use their likeness in this brand’s ads.
          </label>
          <button type="button" className="btn dark sm" style={{ alignSelf: "flex-start" }} disabled={busy != null || !file || !consent} onClick={upload}>{busy === "upload" ? <Icon name="spinner" size={12} className="spin" color="#fff" /> : null}Save person</button>
        </div>
      )}
      {err && <span className="xs c-amber">{err}</span>}
    </div>
  );
}
