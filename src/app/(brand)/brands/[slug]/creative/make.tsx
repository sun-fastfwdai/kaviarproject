"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { AgentFace } from "@/components/agent";
import { AdsBlock, useAds } from "../campaigns/[key]/ads";
import { addReference, saveBrief, studioAds, studioTarget, type StudioAds } from "../campaigns/actions";
import { makeAds } from "../plan/actions";

/**
 * The studio's first screen: ask Remy for ads the way you would ask a person. Say what you want, type @ to pick the product, attach
 * your own pictures — and the ads come back in this thread, each with its yes or no. Say more ("shorter", "lead with free shipping")
 * and Remy writes them again. Where the ads are filed is Kaviar's job: the campaign that product already has, or a new one of the
 * brand's own. Its budget is never approved from here — that yes is given on the campaign, before anything runs.
 */
export type StudioProduct = { title: string; price: string; stock: number; image: string | null };
export type StudioCampaign = { key: string; title: string; product: string; image: string | null; onMeta: boolean; review: number; ads: number; needsAds: boolean; when: string | null; thumbs: string[] };
type Target = { plan?: string; product?: string; fresh?: boolean };
type Option = { label: string; sub?: string; image?: string | null; to: Target };
type Turn = { who: "you"; text: string; pics?: string[] } | { who: "remy"; text: string; bad?: boolean; options?: Option[] };
type Pick = { kind: "product" | "campaign"; value: string; label: string; sub: string; image: string | null };

const bubble = { padding: "10px 14px", lineHeight: "20px" } as const;
function Pic({ src, size, radius = 8 }: { src: string | null | undefined; size: number; radius?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt="" loading="lazy" style={{ width: size, height: size, borderRadius: radius, objectFit: "cover", flexShrink: 0, background: "#fff", boxShadow: "0 0 0 1px var(--line)" }} />
    : <span style={{ width: size, height: size, borderRadius: radius, flexShrink: 0, background: "var(--tray-2)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="box" size={Math.round(size / 2.2)} color="#8B8883" /></span>;
}

/** What @ offers: products with their picture, then campaigns. */
function Mentions({ items, q, hi, up, onHover, onPick }: { items: Pick[]; q: string; hi: number; up: boolean; onHover: (i: number) => void; onPick: (x: Pick) => void }) {
  return (
    <div role="listbox" aria-label="Products and campaigns" className="col" style={{ position: "absolute", left: 10, right: 10, ...(up ? { bottom: "calc(100% + 8px)" } : { top: "calc(100% + 8px)" }), zIndex: 30, padding: 4, borderRadius: 14, background: "#fff", boxShadow: "0 0 0 1px var(--line), 0 18px 44px rgba(18,18,18,.16)", maxHeight: 340, overflowY: "auto" }}>
      {items.length ? items.map((x, i) => (
        <button key={`${x.kind}:${x.value}`} type="button" role="option" aria-selected={i === hi} onMouseEnter={() => onHover(i)} onMouseDown={(e) => { e.preventDefault(); onPick(x); }} className="row g10" style={{ padding: "6px 10px 6px 6px", borderRadius: 10, textAlign: "left", background: i === hi ? "var(--tray)" : "transparent" }}>
          <Pic src={x.image} size={38} /><span className="col fill" style={{ minWidth: 0, lineHeight: 1.3 }}><span className="sm w5 ell">{x.label}</span><span className="xs i3 ell">{x.sub}</span></span>
          {x.kind === "campaign" && <Icon name="megaphone" size={13} color="#8B8883" />}
        </button>)) : <span className="sm i3" style={{ padding: "12px 10px" }}>Nothing matches “{q}”</span>}
    </div>);
}

export function MakeAds({ slug, brand, products, campaigns, initial, aiOk }: { slug: string; brand: string; products: StudioProduct[]; campaigns: StudioCampaign[]; initial: StudioAds | null; aiOk: boolean }) {
  const base = `/brands/${slug}`;
  const [turns, setTurns] = useState<Turn[]>(() => (initial ? [{ who: "remy", text: initial.ads.length ? `“${initial.plan.title}” — ${initial.ads.length} ad${initial.ads.length === 1 ? "" : "s"} for ${initial.plan.product}.` : `“${initial.plan.title}” has no ads yet. Tell me what they should say.` }] : []));
  const [shown, setShown] = useState<StudioAds | null>(initial);
  const [thread, setThread] = useState<string | null>(initial?.plan.key ?? null); // the campaign this conversation is about, so "make them shorter" needs no @
  const [text, setText] = useState("");
  const [target, setTarget] = useState<Pick | null>(null);
  const [files, setFiles] = useState<{ file: File; url: string }[]>([]);
  const [shoot, setShoot] = useState(initial?.brief.shoot ?? false);
  const [working, setWorking] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ q: string; from: number } | null>(null);
  const [hi, setHi] = useState(0);
  const held = useRef<{ note: string; files: File[] } | null>(null); // what was asked, kept while Remy's question is open
  const area = useRef<HTMLTextAreaElement>(null), fileIn = useRef<HTMLInputElement>(null), end = useRef<HTMLDivElement>(null), caretTo = useRef<number | null>(null);
  const started = turns.length > 0, busy = working != null;

  // ---- @: products first, then the campaigns not yet on Meta
  const all: Pick[] = useMemo(() => [
    ...products.map((p) => ({ kind: "product" as const, value: p.title, label: p.title, sub: `${p.price} · ${p.stock > 0 ? `${p.stock.toLocaleString("en-US")} in stock` : "out of stock"}`, image: p.image })),
    ...campaigns.filter((c) => !c.onMeta).map((c) => ({ kind: "campaign" as const, value: c.key, label: c.title, sub: `Campaign · ${c.product}`, image: c.image })),
  ], [products, campaigns]);
  const found = useMemo(() => { if (!menu) return []; const k = menu.q.toLowerCase(); return all.filter((x) => !k || x.label.toLowerCase().includes(k)).slice(0, 7); }, [menu, all]);
  const typed = (v: string, caret: number) => {
    setText(v);
    const m = /(^|\s)@([^@\n]{0,40})$/.exec(v.slice(0, caret));
    if (m) { setMenu({ q: m[2], from: caret - m[2].length - 1 }); setHi(0); } else setMenu(null);
  };
  const choose = (x: Pick) => {
    const at = menu?.from ?? text.length, caret = area.current?.selectionStart ?? text.length;
    const next = `${text.slice(0, at)}@${x.label} ${text.slice(Math.max(caret, at + 1 + (menu?.q.length ?? 0)))}`;
    caretTo.current = at + x.label.length + 2;
    setText(next); setTarget(x); setMenu(null);
  };
  const openMenu = () => { const caret = area.current?.selectionStart ?? text.length, pad = text.length && !/\s$/.test(text.slice(0, caret)) ? " " : ""; caretTo.current = caret + pad.length + 1; setText(`${text.slice(0, caret)}${pad}@${text.slice(caret)}`); setMenu({ q: "", from: caret + pad.length }); setHi(0); };
  // The caret goes where the name ended before the next key lands, so fast typing carries on in the right place.
  useLayoutEffect(() => { const el = area.current, at = caretTo.current; if (el && at != null) { caretTo.current = null; el.focus(); el.setSelectionRange(at, at); } }, [text]);
  const addFiles = (list: File[]) => {
    const ok = list.filter((f) => /^image\/(png|jpeg|webp)$/.test(f.type) && f.size <= 4 * 1024 * 1024), room = Math.max(0, 8 - files.length);
    if (ok.length < list.length) setErr("Pictures must be PNG, JPG or WebP, under 4 MB each."); else setErr(null);
    setFiles((cur) => [...cur, ...ok.slice(0, room).map((file) => ({ file, url: URL.createObjectURL(file) }))]);
  };

  const say = (t: Turn) => setTurns((cur) => [...cur, t]);
  const reload = useCallback(async (key: string) => { const r = await studioAds(slug, key).catch(() => null); if (r) setShown(r); return r; }, [slug]);
  // The words Remy should follow: what was typed, without the @names (those say where the ads go, not what they say).
  const clean = (t: string) => all.reduce((v, x) => v.split(`@${x.label}`).join(""), t).replace(/\s+/g, " ").trim();

  /** Find where the ads belong, hand Remy the pictures and the words, and have him write. */
  const run = async (to: Target, note: string, pics: File[]) => {
    setErr(null); setWorking("Finding where these ads belong…");
    try {
      const t = await studioTarget(slug, to);
      if ("error" in t) { say({ who: "remy", text: t.error, bad: true }); return; }
      if ("ask" in t) {
        held.current = { note, files: pics };
        say({ who: "remy", text: `What are these ads for? ${t.product} has ${t.ask.length} campaigns — the occasion changes what the ads say.`,
          options: [...t.ask.map((x) => ({ label: x.title, sub: x.sub, to: { plan: x.key } })), { label: "Something new", sub: "A campaign of its own", to: { product: t.product, fresh: true } }] });
        return;
      }
      held.current = null;
      const before = thread === t.key ? shown?.brief.note ?? "" : (await studioAds(slug, t.key).catch(() => null))?.brief.note ?? "";
      const words = [thread === t.key ? before : "", note].filter(Boolean).join(" · ").slice(-600) || before;
      for (const [i, f] of pics.entries()) {
        setWorking(`Adding your picture${pics.length > 1 ? ` ${i + 1} of ${pics.length}` : ""}…`);
        const fd = new FormData(); fd.set("file", f);
        const up = await addReference(slug, t.key, fd);
        if (up.error) { say({ who: "remy", text: up.error, bad: true }); return; }
      }
      const shooting = shoot && (pics.length > 0 || (thread === t.key && (shown?.brief.refs.length ?? 0) > 0));
      await saveBrief(slug, t.key, words, shooting);
      setWorking(shooting ? `Writing 3 ads for ${t.product} and shooting their pictures…` : `Writing 3 ads for ${t.product}…`);
      const made = await makeAds(slug, t.key, true, true);
      if (made?.error) { say({ who: "remy", text: made.error, bad: true }); return; }
      setThread(t.key); setTarget(null);
      const now = await reload(t.key);
      say({ who: "remy", text: `${now?.ads.length ?? 3} ads for ${t.product}${t.started ? ". I started a campaign for it — its budget waits for your yes" : ` — filed under “${t.title}”`}.${made?.note ? ` ${made.note}.` : ""} Say yes or no to each, or tell me what to change.` });
    } catch { say({ who: "remy", text: "That didn’t go through — try again.", bad: true }); }
    finally { setWorking(null); }
  };

  const send = (words?: string, to?: Target) => {
    const q = (words ?? text).trim();
    if (busy || (!q && !files.length && !to)) return;
    const pics = files.map((x) => x.file), urls = files.map((x) => x.url);
    say({ who: "you", text: q || (pics.length ? "Use these pictures" : ""), pics: urls });
    setText(""); setFiles([]); setMenu(null);
    const where: Target | null = to ?? (target ? (target.kind === "product" ? { product: target.value } : { plan: target.value }) : thread ? { plan: thread } : null);
    const note = clean(q);
    if (!where) {
      held.current = { note, files: pics };
      say({ who: "remy", text: "Which product are these for?", options: products.slice(0, 4).map((p) => ({ label: p.title, sub: p.price, image: p.image, to: { product: p.title } })) });
      return;
    }
    void run(where, note, pics);
  };
  const answer = (o: Option) => { if (busy) return; const h = held.current ?? { note: "", files: [] }; say({ who: "you", text: o.label }); void run(o.to, h.note, h.files); };

  const m = useAds({ slug, planKey: shown?.plan.key ?? "", title: shown?.plan.title ?? "", brief: shown?.brief ?? { note: "", shoot: false, refs: [] }, ads: shown?.ads ?? [], onWork: (w) => { if (w && "done" in w && w.bad) setErr(w.done); }, onChanged: () => { if (shown) void reload(shown.plan.key); } });
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [turns.length, working, shown?.ads.length]);

  const waiting = campaigns.filter((c) => c.review > 0 && !c.onMeta).slice(0, 3);
  const ideas: { text: string; image: string | null; to: Target }[] = [
    ...campaigns.filter((c) => c.needsAds && !c.onMeta).slice(0, 2).map((c) => ({ text: `Ads for ${c.title}`, image: c.image, to: { plan: c.key } })),
    ...products.slice(0, 3).map((p) => ({ text: `Ads for ${p.title}`, image: p.image, to: { product: p.title } })),
  ].slice(0, 4);
  const approved = shown?.ads.filter((x) => x.status === "approved").length ?? 0, hasRefs = files.length > 0 || (thread != null && thread === shown?.plan.key && shown.brief.refs.length > 0);
  const lastAsk = turns.length - 1;

  return (
    <div className="scroll col" style={{ alignItems: "center", padding: started ? "26px 24px 40px" : "52px 24px 40px",
      background: "radial-gradient(60% 42% at 50% 0%, rgba(106,143,214,.14), transparent 70%), radial-gradient(38% 34% at 88% 18%, rgba(26,167,200,.10), transparent 70%), radial-gradient(36% 32% at 10% 30%, rgba(235,207,159,.24), transparent 70%), var(--sheet)" }}>
      <div className="col g16" style={{ width: "100%", maxWidth: 860 }}>
        {!started && <div className="col g8" style={{ alignItems: "center", textAlign: "center" }}>
          <AgentFace kind="builder" size={38} mood="happy" />
          <h1 className="h1">What should we make for {brand}?</h1>
          <p className="sm i3">Say it in your own words. Type <b className="i1 w5">@</b> to pick a product, add your own pictures, and Remy writes the ads here.</p>
        </div>}

        {started && <div className="col g12">
          <div className="row between"><span className="row g6 sm w5"><AgentFace kind="builder" size={18} />Remy</span>
            <Link className="lnk xs i3" href={`${base}/creative`} onClick={() => { setTurns([]); setShown(null); setThread(null); setTarget(null); setFiles([]); held.current = null; }}>Start something new</Link></div>
          {turns.map((t, i) => t.who === "you"
            ? <div key={i} className="col g6" style={{ alignItems: "flex-end" }}>
                {t.pics && t.pics.length > 0 && <span className="row g6" style={{ flexWrap: "wrap", justifyContent: "flex-end" }}>{t.pics.map((u) => <Pic key={u} src={u} size={64} radius={12} />)}</span>}
                {t.text && <span className="sm" style={{ ...bubble, maxWidth: "78%", borderRadius: "16px 16px 4px 16px", background: "var(--ink)", color: "#fff" }}>{t.text}</span>}
              </div>
            : <div key={i} className="col g8">
                <div className="row top g8"><AgentFace kind="builder" size={26} mood={t.bad ? "worried" : "focus"} />
                  <span className="sm" style={{ ...bubble, maxWidth: "84%", borderRadius: "16px 16px 16px 4px", background: t.bad ? "#FBEDE6" : "#fff", color: t.bad ? "#B4532A" : "var(--ink)", boxShadow: t.bad ? "none" : "0 0 0 1px var(--line), 0 4px 14px rgba(18,18,18,.05)" }}>{t.text}</span></div>
                {t.options && i === lastAsk && !busy && <div className="row g6" style={{ flexWrap: "wrap", paddingLeft: 34 }}>
                  {t.options.map((o, j) => (
                    <button key={o.label} type="button" onClick={() => answer(o)} className="row g8 hv-card" style={{ minHeight: 44, padding: o.image !== undefined ? "5px 14px 5px 5px" : "5px 14px", borderRadius: 14, background: "#fff", textAlign: "left", boxShadow: j === 0 ? "0 0 0 1.5px var(--ink)" : "0 0 0 1px var(--line-2)" }}>
                      {o.image !== undefined && <Pic src={o.image} size={34} />}
                      <span className="col" style={{ lineHeight: 1.25, minWidth: 0 }}><span className="sm w5 ell" style={{ maxWidth: 260 }}>{o.label}</span>{o.sub && <span className="xs i3 ell" style={{ maxWidth: 260 }}>{o.sub}</span>}</span>
                    </button>))}
                </div>}
              </div>)}

          {working && <div className="row top g8"><AgentFace kind="builder" size={26} />
            <span className="sm i2 row g8" style={{ ...bubble, borderRadius: "16px 16px 16px 4px", background: "#fff", boxShadow: "0 0 0 1px var(--line)" }}>
              <span className="row g4">{[0, 1, 2].map((i) => <span key={i} className="pulse-dot" style={{ width: 6, height: 6, borderRadius: 99, background: "#1AA7C8", animationDelay: `${i * 0.15}s` }} />)}</span>{working}</span></div>}

          {shown && shown.ads.length > 0 && !working && <div style={{ paddingLeft: 34 }}>
            <AdsBlock plain m={m} base={base} stage="review" locked={shown.plan.onMeta} ads={shown.ads} brief={shown.brief} productPhoto={shown.plan.image} batchId={shown.batchId} placed={shown.placed} heading={shown.plan.title}
              extra={approved > 0 && !shown.plan.onMeta ? <Link className="btn dark sm" href={`${base}/campaigns/${encodeURIComponent(shown.plan.key)}`}>Run {approved === 1 ? "it" : `these ${approved}`} on Meta<Icon name="arrow-r" size={11} color="#fff" /></Link>
                : <Link className="btn sm" href={`${base}/campaigns/${encodeURIComponent(shown.plan.key)}`}>Open campaign<Icon name="arrow-r" size={11} /></Link>} />
          </div>}
          <div ref={end} />
        </div>}

        {/* ---- the one place to ask */}
        <form onSubmit={(e) => { e.preventDefault(); send(); }} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles([...e.dataTransfer.files]); }}
          className="col g10" style={{ position: "relative", padding: "12px 12px 10px 16px", background: "#fff", borderRadius: 20, boxShadow: "0 0 0 1px var(--line), 0 14px 36px rgba(18,18,18,.09)" }}>
          {(target || files.length > 0) && <div className="row g8" style={{ flexWrap: "wrap" }}>
            {target && <span className="row g8" style={{ padding: "4px 8px 4px 4px", borderRadius: 12, background: "var(--tray)" }}>
              <Pic src={target.image} size={30} /><span className="col" style={{ lineHeight: 1.2 }}><span className="xs i3">{target.kind === "product" ? "Selling" : "For the campaign"}</span><span className="sm w5 ell" style={{ maxWidth: 240 }}>{target.label}</span></span>
              <button type="button" aria-label={`Remove ${target.label}`} onClick={() => { setTarget(null); setText((v) => v.split(`@${target.label}`).join("").replace(/\s+/g, " ").trimStart()); }} className="btn quiet sm ic" style={{ width: 22, height: 22 }}><Icon name="x" size={10} /></button></span>}
            {files.map((f) => (
              <span key={f.url} style={{ position: "relative" }} title={f.file.name}><Pic src={f.url} size={38} radius={10} />
                <button type="button" aria-label={`Remove ${f.file.name}`} onClick={() => setFiles((cur) => cur.filter((x) => x.url !== f.url))} style={{ position: "absolute", right: -5, top: -5, width: 16, height: 16, borderRadius: 99, background: "#121212", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="x" size={8} color="#fff" /></button></span>))}
          </div>}
          <textarea ref={area} value={text} rows={started ? 2 : 3} maxLength={600} disabled={busy} aria-label="What to make" aria-autocomplete="list"
            placeholder={shown ? "Change them — e.g. shorter, warmer, lead with free shipping" : "Describe the ads — type @ to pick a product"}
            onChange={(e) => typed(e.target.value, e.target.selectionStart ?? e.target.value.length)}
            onPaste={(e) => { const pics = [...e.clipboardData.files]; if (pics.length) { e.preventDefault(); addFiles(pics); } }}
            onKeyDown={(e) => {
              if (menu && found.length) {
                if (e.key === "ArrowDown") { e.preventDefault(); setHi((i) => Math.min(found.length - 1, i + 1)); return; }
                if (e.key === "ArrowUp") { e.preventDefault(); setHi((i) => Math.max(0, i - 1)); return; }
                if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); choose(found[hi]); return; }
              }
              if (menu && e.key === "Escape") { e.preventDefault(); setMenu(null); return; }
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
            }}
            style={{ border: 0, outline: 0, resize: "none", font: "inherit", fontSize: 15, lineHeight: "22px", width: "100%", background: "transparent" }} />
          {menu && <Mentions items={found} q={menu.q} hi={hi} up={started} onHover={setHi} onPick={choose} />}
          <div className="row g6" style={{ flexWrap: "wrap" }}>
            <button type="button" className="btn quiet sm" disabled={busy} onClick={openMenu} title="Pick the product these ads sell"><span className="w5" style={{ fontSize: 14 }}>@</span>Product</button>
            <button type="button" className="btn quiet sm" disabled={busy || files.length >= 8} onClick={() => fileIn.current?.click()} title="Your own photos, or pictures whose look you like — up to 8, 4 MB each"><Icon name="image" size={13} />Pictures</button>
            <input ref={fileIn} type="file" multiple accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const l = [...(e.target.files ?? [])]; e.target.value = ""; addFiles(l); }} />
            {hasRefs && <div className="seg" role="radiogroup" aria-label="Where the pictures come from">
              {([[false, "Use my pictures"], [true, "Shoot new ones like them"]] as const).map(([v, name]) => <button key={name} type="button" role="radio" aria-checked={shoot === v} className={`o${shoot === v ? " on" : ""}`} title={v ? "New pictures are made from your product photo, lit and composed like yours. Each one is charged by the image service." : "Your pictures go on the ads as they are"} onClick={() => setShoot(v)}>{name}</button>)}
            </div>}
            <span className="fill" />
            {(err || !aiOk) && <span className="xs" style={{ color: "var(--amber)", maxWidth: 320 }}>{err ?? "Remy can’t write right now — the writing service isn’t connected."}</span>}
            <button type="submit" aria-label="Send to Remy" disabled={busy || !aiOk || (!text.trim() && !files.length)}
              style={{ width: 36, height: 36, borderRadius: 99, background: (text.trim() || files.length) && !busy && aiOk ? "var(--ink)" : "var(--tray-2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {busy ? <Icon name="spinner" size={14} className="spin" /> : <Icon name="arrow-up" size={15} color={(text.trim() || files.length) && aiOk ? "#fff" : "#8B8883"} />}
            </button>
          </div>
        </form>

        {!started && <>
          {ideas.length > 0 && <div className="row g8" style={{ flexWrap: "wrap", justifyContent: "center" }}>
            {ideas.map((x) => (
              <button key={x.text} type="button" disabled={!aiOk} onClick={() => send(x.text, x.to)} className="row g8 sm hv-card" style={{ height: 40, padding: "0 14px 0 5px", borderRadius: 99, background: "rgba(255,255,255,.85)", boxShadow: "0 0 0 1px var(--line)", maxWidth: 380 }}>
                <Pic src={x.image} size={30} radius={99} /><span className="ell">{x.text}</span>
              </button>))}
          </div>}
          {waiting.length > 0 && <div className="col g8" style={{ paddingTop: 14 }}>
            <span className="xs i3" style={{ letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>Waiting for your yes</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
              {waiting.map((c) => (
                <Link key={c.key} href={`${base}/creative?for=${encodeURIComponent(c.key)}`} className="row g10 hv-card" style={{ padding: 10, borderRadius: 16, background: "#fff", boxShadow: "0 0 0 1px var(--line)" }}>
                  <span className="row" style={{ flexShrink: 0 }}>{(c.thumbs.length ? c.thumbs.slice(0, 3) : [c.image]).map((u, i) => <span key={i} style={{ marginLeft: i ? -14 : 0, borderRadius: 10, boxShadow: "0 0 0 2px #fff" }}><Pic src={u} size={44} radius={10} /></span>)}</span>
                  <span className="col fill" style={{ minWidth: 0, lineHeight: 1.3 }}><span className="sm w5 ell">{c.title}</span><span className="xs i3">{c.review} ad{c.review === 1 ? "" : "s"} to review</span></span>
                  <Icon name="arrow-r" size={12} color="#8B8883" />
                </Link>))}
            </div>
          </div>}
        </>}
      </div>
    </div>
  );
}
