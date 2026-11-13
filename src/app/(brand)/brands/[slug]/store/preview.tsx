/* eslint-disable @next/next/no-img-element -- product photos from Shopify */
"use client";
import type { StoreContent } from "@/lib/db/schema";
import type { StoreProduct } from "@/lib/store/build";

export type Look = { bg: string; text: string; accent: string; soft: string; serif: boolean };
import { SECTION_LABEL, type StorePage } from "./store-pages";
export { DEVICE_W, PAGES, SECTION_LABEL, type StorePage } from "./store-pages";
const SERIF = "var(--font-serif), 'Instrument Serif', Georgia, serif";
const money = (v: number | null, c: string) => (v == null ? "" : new Intl.NumberFormat("en-US", { style: "currency", currency: c, maximumFractionDigits: v % 1 ? 2 : 0 }).format(v));
const AGENT_C = { remy: "#1AA7C8", cleo: "#22A46E", otto: "#EB7A3C" } as const;

export type Pick = { selected: string | null; hover: string | null; onHover: (s: string | null) => void; onPick: (s: string) => void; comments: Record<string, number>; tool: "select" | "hand" | "comment"; status?: Record<string, string> };

/** One selectable section — dashed on hover; selected gets board 05's selection box, label and handles. */
function Sec({ id, pick, children, style, pin }: { id: string; pick?: Pick; children: React.ReactNode; style?: React.CSSProperties; pin?: number }) {
  const n = pick?.comments[id] ?? 0;
  const badge = (n > 0 || pin) && (
    <span style={{ position: "absolute", right: 10, top: 10, width: 22, height: 22, borderRadius: "99px 99px 99px 3px", background: "#B7791F", color: "#fff", fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 0 2px #fff, 0 2px 6px rgba(0,0,0,.18)", zIndex: 3 }}>{pin ?? n}</span>
  );
  if (!pick || pick.tool === "hand") return <div style={{ ...style, position: "relative" }}>{children}{badge}</div>;
  const on = pick.selected === id, hov = pick.hover === id && !on;
  return (
    <div className={on ? "selbox" : undefined} data-section={id} onMouseEnter={() => pick.onHover(id)} onMouseLeave={() => pick.onHover(null)} onClick={(e) => { e.stopPropagation(); pick.onPick(id); }}
      style={{ ...style, position: "relative", cursor: pick.tool === "comment" ? "copy" : "pointer", ...(on ? { zIndex: 2 } : hov ? { outline: "1.5px dashed #1AA7C8", outlineOffset: -1.5 } : {}) }}>
      {children}
      {on && <>
        <span className="sel-label" style={{ zIndex: 4 }}>
          <svg width="11" height="11" viewBox="0 0 256 256" fill="#fff"><path d="M230.91 172a8 8 0 0 1-2.91 10.91l-96 56a8 8 0 0 1-8.06 0l-96-56A8 8 0 0 1 36 169.09l92 53.65 92-53.65a8 8 0 0 1 10.91 2.91ZM220 121.09l-92 53.65-92-53.65a8 8 0 0 0-8 13.82l96 56a8 8 0 0 0 8.06 0l96-56a8 8 0 1 0-8.06-13.82ZM24 80a8 8 0 0 1 4-6.91l96-56a8 8 0 0 1 8.06 0l96 56a8 8 0 0 1 0 13.82l-96 56a8 8 0 0 1-8.06 0l-96-56A8 8 0 0 1 24 80Z" /></svg>
          {SECTION_LABEL[id] ?? id}{pick.status?.[id] ? ` · ${pick.status[id]}` : ""}
        </span>
        <span className="handle h-tl" /><span className="handle h-tr" /><span className="handle h-bl" /><span className="handle h-br" />
      </>}
      {hov && <span className="sel-label" style={{ background: "rgba(26,167,200,.85)", zIndex: 4 }}>{SECTION_LABEL[id] ?? id}</span>}
      {badge}
    </div>
  );
}

function Icn({ d, c }: { d: string; c: string }) {
  return <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
}

/** An agent's live cursor on the canvas while it works on a section (board 05). */
export function AgentCursor({ agent, left, top }: { agent: keyof typeof AGENT_C; left: number | string; top: number | string }) {
  const c = AGENT_C[agent];
  return (
    <div className="cursor" style={{ left, top, zIndex: 5, pointerEvents: "none" }}>
      <svg width="16" height="16" viewBox="0 0 24 24"><path d="M4 3l16 7-7 2.5L10.5 20z" fill={c} stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" /></svg>
      <span className="tagname" style={{ background: c }}>{agent[0].toUpperCase() + agent.slice(1)}</span>
    </div>
  );
}

/** The generated storefront — Remy's copy, the brand palette and real Shopify products — styled like board 05's store mock. */
export function StorePreview({ brand, c, products, look, hero, width, currency, page = "home", pick, category, pins, cursor }: {
  brand: string; c: StoreContent; products: StoreProduct[]; look: Look; hero: string | null; width: number; currency: string; page?: StorePage; pick?: Pick;
  category?: string | null; pins?: Record<string, number>; cursor?: { section: string; agent: keyof typeof AGENT_C } | null;
}) {
  const mobile = width < 500;
  const k = Math.min(1.4, Math.max(1, width / 600));     // board sizes × k
  const px = (n: number) => Math.round(n * k * 10) / 10;
  const pad = mobile ? 18 : px(28);
  const head: React.CSSProperties = { fontFamily: look.serif ? SERIF : "inherit", fontWeight: 400, letterSpacing: "-0.01em" };
  const ink = look.text, muted = "#8A7A69", body = "#5E554C";
  const withImg = products.filter((p) => p.image);
  const cols = mobile ? 2 : 4;
  const story = withImg[1]?.image ?? withImg[0]?.image ?? hero;
  const tile = (p: StoreProduct, i: number) => (
    <div key={`${p.title}${i}`} style={{ display: "flex", flexDirection: "column", gap: px(8), minWidth: 0 }}>
      {p.image
        ? <div style={{ aspectRatio: "1 / 1.18", overflow: "hidden", background: "#F1ECE6" }}><img src={p.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /></div>
        : <div style={{ aspectRatio: "1 / 1.18", background: "#F6F2ED", border: "1px dashed #DCD2C6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: px(10), color: "#B7791F" }}>Photo needed</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: px(11.5), color: ink, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</span>
        <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: px(10.5), color: muted }}>{p.units ? `${p.units} sold · 90 days` : ""}</span><span style={{ fontSize: px(11), color: ink }}>{money(p.price, currency)}</span></div>
      </div>
    </div>
  );
  const grid = (list: StoreProduct[]) => <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: px(14) }}>{list.map(tile)}</div>;
  const first = withImg[0] ?? products[0];
  const btn = (t: string, dark: boolean) => (
    <span style={{ height: px(34), padding: `0 ${px(15)}px`, display: "inline-flex", alignItems: "center", fontSize: px(11.5), borderRadius: 99, whiteSpace: "nowrap", ...(dark ? { background: ink, color: "#fff" } : { border: "1px solid #CFC5B8", color: ink }) }}>{t}</span>
  );
  const eyebrow = (t: string, color = muted) => <span style={{ fontSize: px(10), letterSpacing: ".12em", textTransform: "uppercase", color }}>{t}</span>;
  const cur = (s: string) => cursor?.section === s ? <AgentCursor agent={cursor.agent} left="62%" top="58%" /> : null;

  return (
    <div style={{ width, background: "#fff", color: ink, fontSize: px(12), lineHeight: 1.5, borderRadius: "8px 8px 0 0", boxShadow: "0 0 0 1px rgba(18,18,18,.06), 0 12px 32px rgba(18,18,18,.08)", position: "relative" }}>
      <Sec id="announcement" pick={pick} style={{ height: px(26), display: "flex", alignItems: "center", justifyContent: "center", background: look.text, color: "#EDE7DF", fontSize: px(10), letterSpacing: ".08em", textTransform: "uppercase", borderRadius: "8px 8px 0 0", padding: "0 10px", textAlign: "center" }}>{c.announcement}</Sec>
      <Sec id="header" pick={pick} style={{ height: px(52), display: "flex", alignItems: "center", justifyContent: "space-between", padding: `0 ${pad}px`, borderBottom: "1px solid #EEE9E3", background: "#fff" }}>
        {mobile ? <span style={{ fontSize: 18 }}>☰</span> : <div style={{ display: "flex", gap: px(20), fontSize: px(11), color: "#3A342E" }}>{c.nav.slice(0, 4).map((n) => <span key={n}>{n}</span>)}</div>}
        <span style={{ ...head, fontSize: px(24), color: ink }}>{brand}</span>
        <div style={{ display: "flex", alignItems: "center", gap: px(16), fontSize: px(11), color: "#3A342E" }}>
          {!mobile && <span>{c.nav[4] ?? "Our story"}</span>}
          <span style={{ fontSize: px(14), display: "flex", gap: px(16) }}>
            {!mobile && <Icn c="#3A342E" d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.35-4.35" />}
            {!mobile && <Icn c="#3A342E" d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 9a8 8 0 0 1 16 0" />}
            <Icn c="#3A342E" d="M5 7h14l-1 13H6L5 7Zm4 0a3 3 0 0 1 6 0" />
          </span>
        </div>
      </Sec>

      {page === "home" && <>
        <Sec id="hero" pick={pick} style={{ display: "flex", flexDirection: mobile ? "column-reverse" : "row", minHeight: mobile ? 0 : px(262), background: look.soft }}>
          <div style={{ flex: 1, padding: mobile ? "24px 18px 28px" : `${px(24)}px ${px(30)}px`, display: "flex", flexDirection: "column", justifyContent: "center", gap: px(14) }}>
            {eyebrow(category ?? `${brand} collection`)}
            <div style={{ position: "relative", alignSelf: "flex-start", ...(pins?.hero ? { outline: "1.5px dashed #D49A3A", outlineOffset: 5, borderRadius: 2 } : {}) }}>
              <span style={{ ...head, fontSize: mobile ? 34 : px(44), lineHeight: 1.05, color: ink, display: "block" }}>{c.hero}</span>
              {pins?.hero ? <span style={{ position: "absolute", right: -20, top: -17, width: 22, height: 22, borderRadius: "99px 99px 99px 3px", background: "#B7791F", color: "#fff", fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 0 2px #fff, 0 2px 6px rgba(0,0,0,.18)" }}>{pins.hero}</span> : null}
            </div>
            <span style={{ fontSize: px(12), lineHeight: 1.6, color: body, maxWidth: px(250) * 1.3 }}>{c.subline}</span>
            <div style={{ display: "flex", gap: px(8), marginTop: 4, flexWrap: "wrap" }}>{btn(c.cta, true)}{btn(c.nav[4] ?? "Our story", false)}</div>
          </div>
          <div style={{ width: mobile ? "100%" : "48%", height: mobile ? 260 : "auto", overflow: "hidden", background: "#EDE6DC" }}>{hero && <img src={hero} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}</div>
          {cur("hero")}
        </Sec>
        <Sec id="promises" pick={pick} style={{ display: "grid", gridTemplateColumns: `repeat(${mobile ? 1 : 3}, 1fr)`, gap: px(14), padding: `${px(16)}px ${pad}px`, background: "#fff", borderBottom: "1px solid #EEE9E3" }}>
          {c.promises.map((p) => <div key={p.title} style={{ display: "flex", flexDirection: "column", gap: 2 }}><span style={{ fontSize: px(11.5), fontWeight: 500 }}>{p.title}</span><span style={{ fontSize: px(10.5), color: muted, lineHeight: 1.5 }}>{p.body}</span></div>)}
        </Sec>
        <Sec id="bestsellers" pick={pick} style={{ padding: `${px(28)}px ${pad}px ${px(30)}px`, display: "flex", flexDirection: "column", gap: px(16), background: "#fff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ ...head, fontSize: px(26), color: ink }}>{c.bestsellersTitle}</span><span style={{ fontSize: px(11), borderBottom: `1px solid ${ink}` }}>Shop all</span></div>
          {grid(products.slice(0, cols))}
          {cur("bestsellers")}
        </Sec>
        <Sec id="story" pick={pick} style={{ display: "flex", flexDirection: mobile ? "column" : "row", minHeight: mobile ? 0 : px(200), background: look.text }}>
          <div style={{ width: mobile ? "100%" : "42%", height: mobile ? 200 : "auto", overflow: "hidden", background: "#2A2520" }}>{story && <img src={story} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", opacity: 0.92 }} />}</div>
          <div style={{ flex: 1, padding: mobile ? "24px 18px" : `${px(24)}px ${px(36)}px`, display: "flex", flexDirection: "column", justifyContent: "center", gap: px(10) }}>
            {eyebrow("Our story", "#A89886")}
            <span style={{ ...head, fontSize: mobile ? 26 : px(28), lineHeight: 1.15, color: "#F4EFE8" }}>{c.story.title}</span>
            <span style={{ fontSize: px(11), lineHeight: 1.6, color: "#CFC5B8", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{c.story.body}</span>
          </div>
        </Sec>
        <Sec id="faq" pick={pick} style={{ padding: `${px(28)}px ${pad}px`, background: "#fff" }}>
          <span style={{ ...head, fontSize: px(26), display: "block", marginBottom: px(10) }}>Questions</span>
          {c.faq.slice(0, 4).map((f) => <div key={f.q} style={{ borderTop: "1px solid #EEE9E3", padding: `${px(10)}px 0`, fontSize: px(11.5), fontWeight: 500, display: "flex", justifyContent: "space-between" }}>{f.q}<span style={{ color: muted }}>+</span></div>)}
        </Sec>
      </>}

      {page === "collection" && (
        <Sec id="bestsellers" pick={pick} style={{ padding: `${px(28)}px ${pad}px`, display: "flex", flexDirection: "column", gap: px(16), background: "#fff" }}>
          {eyebrow("Collection")}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}><span style={{ ...head, fontSize: px(34) }}>Shop all</span><span style={{ fontSize: px(11), color: muted }}>{products.length} products · Best selling</span></div>
          {grid(products.slice(0, cols * 3))}
        </Sec>
      )}

      {page === "product" && first && (
        <div style={{ display: "flex", flexDirection: mobile ? "column" : "row", gap: px(28), padding: `${px(28)}px ${pad}px`, background: "#fff" }}>
          <div style={{ flex: 1.1, aspectRatio: "1", overflow: "hidden", background: "#F1ECE6" }}>{first.image ? <img src={first.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#B7791F", fontSize: 12 }}>Photo needed</div>}</div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: px(12) }}>
            {eyebrow(brand)}
            <span style={{ ...head, fontSize: px(32), lineHeight: 1.1 }}>{first.title}</span>
            <span style={{ fontSize: px(15) }}>{money(first.price, currency)}</span>
            <span style={{ background: ink, color: "#fff", borderRadius: 99, height: px(38), display: "flex", alignItems: "center", justifyContent: "center", fontSize: px(12) }}>Add to cart</span>
            <Sec id="promises" pick={pick} style={{ display: "flex", flexDirection: "column", gap: px(8), padding: `${px(12)}px 0`, borderTop: "1px solid #EEE9E3" }}>
              {c.promises.map((p) => <span key={p.title} style={{ fontSize: px(11) }}><b className="w5">{p.title}</b> — {p.body}</span>)}
            </Sec>
          </div>
        </div>
      )}

      {page === "story" && (
        <Sec id="about" pick={pick} style={{ padding: `${px(40)}px ${pad}px`, background: look.soft }}>
          <div style={{ maxWidth: px(460), margin: "0 auto", display: "flex", flexDirection: "column", gap: px(12) }}>
            {eyebrow("Our story")}
            <span style={{ ...head, fontSize: px(36), lineHeight: 1.1 }}>{c.story.title}</span>
            {c.aboutPage.split(/\n+/).map((para, i) => <p key={i} style={{ fontSize: px(12), lineHeight: 1.7, color: body }}>{para}</p>)}
          </div>
        </Sec>
      )}

      {page === "faq" && (
        <Sec id="faq" pick={pick} style={{ padding: `${px(40)}px ${pad}px`, background: "#fff" }}>
          <div style={{ maxWidth: px(460), margin: "0 auto" }}>
            <span style={{ ...head, fontSize: px(36), display: "block", marginBottom: px(14) }}>Questions</span>
            {c.faq.map((f) => <div key={f.q} style={{ borderTop: "1px solid #EEE9E3", padding: `${px(12)}px 0` }}><div style={{ fontSize: px(12), fontWeight: 500 }}>{f.q}</div><p style={{ marginTop: 4, fontSize: px(11.5), color: body }}>{f.a}</p></div>)}
          </div>
        </Sec>
      )}

      <Sec id="newsletter" pick={pick} style={{ textAlign: "center", padding: `${px(30)}px ${pad}px`, background: look.text, color: "#F4EFE8" }}>
        <span style={{ ...head, fontSize: px(24), display: "block" }}>{c.newsletter.title}</span>
        <span style={{ fontSize: px(11), color: "#CFC5B8" }}>{c.newsletter.body}</span>
        <div style={{ margin: `${px(14)}px auto 0`, maxWidth: px(300), display: "flex", border: "1px solid #5E554C", borderRadius: 99, overflow: "hidden" }}><span style={{ flex: 1, padding: `${px(8)}px ${px(14)}px`, fontSize: px(11), color: "#A89886", textAlign: "left" }}>Email</span><span style={{ background: look.soft, color: ink, padding: `${px(8)}px ${px(14)}px`, fontSize: px(11), fontWeight: 600 }}>Sign up</span></div>
      </Sec>
    </div>
  );
}
