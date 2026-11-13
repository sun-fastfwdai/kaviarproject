"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { applyToTheme, installKaviarStarter, publishStore, uploadStarterZip } from "./actions";
import { Icon } from "@/components/icon";
import { Modal } from "@/components/modal";

export type ThemeView = { id: string; name: string; role: string; processing: boolean };
export type ThemeState = {
  starter: { size: number; updatedAt: string } | null; storageReady: boolean; canRead: boolean; canWrite: boolean;
  themes: ThemeView[]; themesError: string | null; shop: string | null; owner: boolean;
};

/** Setup: Kaviar Starter from storage, the store's own themes from Shopify, and the Theme Store to buy more. */
export function ThemePicker({ theme, setTheme, t }: { theme: string; setTheme: (v: string) => void; t: ThemeState }) {
  const router = useRouter();
  const file = useRef<HTMLInputElement>(null);
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const admin = t.shop ? `https://admin.shopify.com/store/${t.shop.replace(/\.myshopify\.com$/, "")}/themes` : null;
  const card = (key: string, on: boolean, body: React.ReactNode, bg: string) => (
    <button key={key} type="button" onClick={() => setTheme(key)} className="card col g8" style={{ padding: 12, textAlign: "left", cursor: "pointer", minWidth: 0, borderColor: on ? "var(--ink)" : undefined, boxShadow: on ? "0 0 0 1px var(--ink)" : undefined }}>
      <div style={{ height: 64, borderRadius: 8, background: bg }} />{body}
    </button>
  );
  return (
    <div className="col g10">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 12 }}>
        {card("kaviar-starter", theme === "kaviar-starter", <>
          <span className="row between"><span className="row g6 sm w5"><span className={`radio${theme === "kaviar-starter" ? " on" : ""}`} />Kaviar Starter</span><span className="pill green" style={{ height: 20, fontSize: 10.5 }}>Best fit</span></span>
          <span className="xs i3">{t.starter ? `In Kaviar’s theme storage · updated ${new Date(t.starter.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : t.storageReady ? "Not uploaded yet" : "Theme storage not switched on"} · Remy edits it directly</span>
          {t.owner && t.storageReady && <span className="row g6"><span className="lnk xs i2" onClick={(e) => { e.stopPropagation(); file.current?.click(); }}>{busy ? "Uploading…" : t.starter ? "Replace .zip" : "Upload .zip"}</span></span>}
        </>, "linear-gradient(135deg,#F6F1EA,#C9B49B)")}
        {t.themes.map((x) => card(`shopify:${x.id}`, theme === `shopify:${x.id}`, <>
          <span className="row between"><span className="row g6 sm w5 ell"><span className={`radio${theme === `shopify:${x.id}` ? " on" : ""}`} />{x.name}</span><span className={`pill ${x.role === "MAIN" ? "green" : ""}`} style={{ height: 20, fontSize: 10.5 }}>{x.role === "MAIN" ? "Live" : x.processing ? "Processing" : "In store"}</span></span>
          <span className="xs i3">From {t.shop} · already installed{x.role === "MAIN" ? " and live" : ""}</span>
        </>, "linear-gradient(135deg,#F2EFEA,#D8D2C8)"))}
        <a href="https://themes.shopify.com/themes?sort_by=most_popular" target="_blank" rel="noreferrer" className="card col g8" style={{ padding: 12, minWidth: 0 }}>
          <div style={{ height: 64, borderRadius: 8, background: "linear-gradient(135deg,#2B241E,#6E5A45)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="external" size={18} color="#fff" /></div>
          <span className="sm w5">Shopify Theme Store</span>
          <span className="xs i3">Browse paid and free themes. The merchant buys it{admin ? <> in <span className="lnk" onClick={(e) => { e.preventDefault(); window.open(admin, "_blank"); }}>their admin</span></> : " in their Shopify admin"} — it then shows up here.</span>
        </a>
      </div>
      <input ref={file} type="file" accept=".zip" hidden onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const fd = new FormData(); fd.append("zip", f); start(async () => { const r = await uploadStarterZip(fd); setMsg(r.error ?? "Kaviar Starter updated."); router.refresh(); }); e.target.value = ""; }} />
      {!t.canRead && t.shop && <span className="xs c-amber">To show this store’s own themes, the Kaviar Shopify app needs permission to manage themes — then reconnect the store in Integrations.</span>}
      {t.themesError && t.canRead && <span className="xs c-amber">{t.themesError}</span>}
      {!t.storageReady && <span className="xs i3">Kaviar Starter is kept in Kaviar’s theme storage, which isn’t switched on for this workspace yet — an owner can turn it on.</span>}
      {msg && <span className="xs i2">{msg}</span>}
    </div>
  );
}

/** Review: install Kaviar Starter, write Remy's homepage into the theme, and publish (board 06b). */
export function PublishPanel({ slug, brand, theme, t, approved, hasContent }: { slug: string; brand: string; theme: string; t: ThemeState; approved: string[]; hasContent: boolean }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [typed, setTyped] = useState("");
  const installed = theme.startsWith("shopify:") ? t.themes.find((x) => `shopify:${x.id}` === theme) : null;
  const act = (fn: () => Promise<{ error?: string }>, ok: string) => start(async () => { const r = await fn(); setMsg(r.error ?? ok); router.refresh(); });
  if (!t.canWrite) return (
    <span className="xs i3" style={{ lineHeight: "16px" }}>Publishing from Kaviar needs the Shopify app’s permission to manage themes, then a reconnect. Until then, use the export above.</span>
  );
  return (
    <div className="col g8">
      <span className="row g6 xs i2"><span className={`dot ${theme === "kaviar-starter" ? "" : "green"}`} />{theme === "kaviar-starter" ? "Kaviar Starter isn’t in the store yet" : `Theme: ${installed?.name ?? "selected"}${installed?.processing ? " · Shopify is processing it" : ""}`}</span>
      {theme === "kaviar-starter" && <button type="button" className="btn sm" disabled={busy || !t.starter} onClick={() => act(() => installKaviarStarter(slug), "Installed as an unpublished theme — Shopify takes a minute to process it.")}><Icon name="download" size={12} />Install Kaviar Starter in the store</button>}
      {theme.startsWith("shopify:") && <button type="button" className="btn sm" disabled={busy || !hasContent || installed?.processing} onClick={() => act(() => applyToTheme(slug), "Remy’s homepage is in the theme. Preview it in Shopify before publishing.")}><Icon name="upload" size={12} />{approved.includes("applied") ? "Apply again" : "Apply Remy’s homepage"}</button>}
      {installed && t.shop && <a className="btn sm" href={`https://${t.shop}/?preview_theme_id=${installed.id.split("/").pop()}`} target="_blank" rel="noreferrer"><Icon name="eye" size={12} />Preview in Shopify</a>}
      <button type="button" className="btn dark sm" disabled={busy || !approved.includes("applied") || installed?.role === "MAIN"} onClick={() => setConfirm(true)}><Icon name="globe" size={12} color="#fff" />{installed?.role === "MAIN" ? "Live" : "Publish to production"}</button>
      {msg && <span className="xs i2">{msg}</span>}
      {confirm && (
        <Modal icon={<Icon name="globe" size={18} />} title={`Publish ${brand} to production`} sub="This makes the new theme live for every shopper. The current theme is kept as an unpublished backup." onClose={() => setConfirm(false)}
          footer={<><button type="button" className="btn" onClick={() => setConfirm(false)}>Cancel</button><button type="button" className="btn dark" disabled={busy || typed.trim().toLowerCase() !== brand.toLowerCase()} onClick={() => act(async () => { const r = await publishStore(slug, typed); if (!r.error) setConfirm(false); return r; }, "Published. The previous theme is kept as a backup.")}><Icon name="globe" size={13} color="#fff" />Publish now</button></>}>
          <label className="col g6"><span className="label">Type <b>{brand}</b> to confirm</span><div className="input"><input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus /></div></label>
        </Modal>
      )}
    </div>
  );
}
