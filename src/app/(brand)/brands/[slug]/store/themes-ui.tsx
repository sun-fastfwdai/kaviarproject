"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { applyToTheme, installKaviarStarter, publishStore, uploadStarterZip } from "./actions";
import { Icon } from "@/components/icon";
import { Modal } from "@/components/modal";

export type ThemeView = { id: string; name: string; role: string; processing: boolean; fromThemeStore?: boolean; preview?: string | null };
export type ThemeState = {
  starter: { size: number; updatedAt: string } | null; storageReady: boolean; canRead: boolean; canWrite: boolean;
  themes: ThemeView[]; themesError: string | null; shop: string | null; owner: boolean;
};

/** A tiny storefront drawn in the brand's style — Kaviar Starter's preview until a build exists. */
function StarterArt() {
  return (
    <div style={{ position: "absolute", inset: 0, background: "#FBF9F6", display: "flex", flexDirection: "column" }}>
      <div style={{ height: 10, background: "#1A1714" }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", fontSize: 7, color: "#1A1714" }}><span>Shop · Story</span><b style={{ fontFamily: "Georgia, serif", fontSize: 11 }}>Brand</b><span>Cart</span></div>
      <div style={{ flex: 1, display: "flex" }}>
        <div style={{ flex: 1, padding: "10px 12px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 6 }}>
          <span style={{ fontFamily: "Georgia, serif", fontSize: 17, lineHeight: 1.05, color: "#1A1714" }}>Your hero,<br />by Remy.</span>
          <span style={{ width: 46, height: 12, borderRadius: 99, background: "#1A1714" }} />
        </div>
        <div style={{ flex: 1, background: "linear-gradient(160deg,#E9DCC8,#B79B78)" }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 4, padding: "6px 12px 10px" }}>{["#E6DCCF", "#D8CBB8", "#E9E2D8", "#CFC2AE"].map((c) => <span key={c} style={{ height: 22, borderRadius: 3, background: c }} />)}</div>
    </div>
  );
}

function ThemeCard({ k, on, title, tag, tone, sub, img, art, onPick }: { k: string; on: boolean; title: string; tag: string; tone: string; sub: string; img?: string | null; art?: React.ReactNode; onPick: (k: string) => void }) {
  return (
    <button type="button" onClick={() => onPick(k)} className="col" aria-pressed={on}
      style={{ width: 236, flexShrink: 0, scrollSnapAlign: "start", textAlign: "left", cursor: "pointer", borderRadius: 14, overflow: "hidden", background: "#fff", border: on ? "1.5px solid var(--ink)" : "1px solid var(--line)", boxShadow: on ? "0 0 0 3px rgba(18,18,18,.06)" : "0 2px 8px rgba(18,18,18,.04)" }}>
      <div style={{ position: "relative", aspectRatio: "4 / 3", background: "var(--tray-2)", overflow: "hidden" }}>
        {img ? <img src={img} alt={`${title} preview`} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} /> : art}
        <span className={`pill ${tone}`} style={{ position: "absolute", top: 8, right: 8, height: 20, fontSize: 10.5, boxShadow: "0 1px 4px rgba(0,0,0,.12)" }}>{tag}</span>
        {on && <span style={{ position: "absolute", top: 8, left: 8, width: 20, height: 20, borderRadius: 99, background: "var(--ink)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="check" size={11} color="#fff" weight="bold" /></span>}
      </div>
      <div className="col g2" style={{ padding: "10px 12px" }}>
        <span className="sm w5 i1 ell">{title}</span>
        <span className="xs i3 ell">{sub}</span>
      </div>
    </button>
  );
}

function Placeholder({ name }: { name: string }) {
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, background: "linear-gradient(160deg,#F2EFEA,#DAD3C8)" }}>
      <span style={{ fontFamily: "Georgia, serif", fontSize: 30, color: "#8B8883" }}>{name.charAt(0).toUpperCase()}</span>
      <span className="xs i3">Custom theme · no screenshot</span>
    </div>
  );
}

/** Setup: one scrollable row — Kaviar Starter, the store's live theme, its other themes, then the Theme Store. */
export function ThemePicker({ theme, setTheme, t }: { theme: string; setTheme: (v: string) => void; t: ThemeState }) {
  const router = useRouter();
  const file = useRef<HTMLInputElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "store" | "custom">("all");
  const shopHandle = t.shop?.replace(/\.myshopify\.com$/, "");
  const admin = shopHandle ? `https://admin.shopify.com/store/${shopHandle}/themes` : null;
  const preview = (id: string) => (t.shop ? `https://${t.shop}/?preview_theme_id=${id.split("/").pop()}` : null);
  const sorted = [...t.themes].sort((a, b) => Number(b.role === "MAIN") - Number(a.role === "MAIN"));
  const shown = sorted.filter((x) => filter === "all" || (filter === "store" ? x.fromThemeStore : !x.fromThemeStore));
  const selected = theme === "kaviar-starter" ? null : t.themes.find((x) => `shopify:${x.id}` === theme) ?? null;
  const scroll = (dir: number) => rail.current?.scrollBy({ left: dir * 600, behavior: "smooth" });

  return (
    <div className="col g10">
      <div className="row g8">
        <div className="seg">
          {([["all", `All · ${t.themes.length + 1}`], ["store", "From Theme Store"], ["custom", "Custom"]] as const).map(([k, l]) => <button key={k} type="button" className={`o${filter === k ? " on" : ""}`} onClick={() => setFilter(k)}>{l}</button>)}
        </div>
        <span className="fill" />
        <button type="button" className="btn sm ic" onClick={() => scroll(-1)} aria-label="Scroll left"><Icon name="chev-l" size={13} /></button>
        <button type="button" className="btn sm ic" onClick={() => scroll(1)} aria-label="Scroll right"><Icon name="chev-r" size={13} /></button>
      </div>
      <div ref={rail} className="row top g12 theme-rail" style={{ overflowX: "auto", scrollSnapType: "x mandatory", paddingBottom: 6 }}>
        {filter !== "store" && <ThemeCard onPick={setTheme} k="kaviar-starter" on={theme === "kaviar-starter"} title="Kaviar Starter" tag="Best fit" tone="green" art={<StarterArt />}
          sub={t.starter ? `Remy edits it directly · updated ${new Date(t.starter.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : t.storageReady ? "Remy edits it directly · not uploaded yet" : "Remy edits it directly"} />}
        {shown.map((x) => (
          <ThemeCard onPick={setTheme} key={x.id} k={`shopify:${x.id}`} on={theme === `shopify:${x.id}`} title={x.name} tag={x.role === "MAIN" ? "Live" : x.processing ? "Processing" : "In store"} tone={x.role === "MAIN" ? "green" : ""}
            sub={x.fromThemeStore ? "Shopify Theme Store · installed" : "Custom · installed"} img={x.preview} art={<Placeholder name={x.name} />} />
        ))}
        {filter !== "custom" && (
          <a href="https://themes.shopify.com/themes?sort_by=most_popular" target="_blank" rel="noreferrer" className="col" style={{ width: 236, flexShrink: 0, scrollSnapAlign: "start", borderRadius: 14, overflow: "hidden", border: "1px dashed var(--line-2)", background: "var(--tray)" }}>
            <div style={{ aspectRatio: "4 / 3", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, background: "linear-gradient(160deg,#2B241E,#6E5A45)", color: "#fff" }}>
              <Icon name="store" size={22} color="#fff" /><span className="sm w5">Shopify Theme Store</span>
            </div>
            <div className="col g2" style={{ padding: "10px 12px" }}><span className="sm w5 i1 row g4">Browse more themes<Icon name="external" size={11} /></span><span className="xs i3">The merchant buys it in their admin — it then shows up here.</span></div>
          </a>
        )}
      </div>
      <div className="row g10" style={{ padding: "10px 12px", background: "var(--tray)", border: "1px solid var(--line)", borderRadius: 12, flexWrap: "wrap" }}>
        <Icon name={selected ? "store" : "sparkle"} size={15} />
        <span className="sm i1 fill">{selected ? <><b className="w5">{selected.name}</b> — {selected.role === "MAIN" ? "the store’s live theme. Remy writes into a copy, never the live one." : "already in the store. Remy writes the homepage into it."}</> : <><b className="w5">Kaviar Starter</b> — Kaviar’s own theme. It’s installed as a draft and Remy edits every section.</>}</span>
        {selected && preview(selected.id) && <a className="btn sm" href={preview(selected.id)!} target="_blank" rel="noreferrer"><Icon name="eye" size={12} />Preview in store</a>}
        {selected?.fromThemeStore && <a className="btn sm" href={`https://themes.shopify.com/themes/${selected.name.toLowerCase().replace(/^copy of\s+/, "").replace(/[^a-z0-9]+/g, "-")}`} target="_blank" rel="noreferrer"><Icon name="external" size={12} />Theme Store page</a>}
        {!selected && t.owner && t.storageReady && <button type="button" className="btn sm" disabled={busy} onClick={() => file.current?.click()}><Icon name="upload" size={12} />{busy ? "Uploading…" : t.starter ? "Replace .zip" : "Upload .zip"}</button>}
        {admin && <a className="btn quiet sm" href={admin} target="_blank" rel="noreferrer">Themes in Shopify admin</a>}
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
