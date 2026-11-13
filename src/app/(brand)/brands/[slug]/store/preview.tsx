/* eslint-disable @next/next/no-img-element -- product photos from Shopify */
import type { StoreContent } from "@/lib/db/schema";
import type { StoreProduct } from "@/lib/store/build";

export type Look = { bg: string; text: string; accent: string; soft: string; serif: boolean };
const SERIF = "Georgia, 'Times New Roman', serif";
const money = (v: number | null, c: string) => (v == null ? "" : new Intl.NumberFormat("en-US", { style: "currency", currency: c, maximumFractionDigits: v % 1 ? 2 : 0 }).format(v));

/** The generated storefront, rendered from Remy's copy, the brand palette and real Shopify products. */
export function StorePreview({ brand, c, products, look, hero, width, currency }: { brand: string; c: StoreContent; products: StoreProduct[]; look: Look; hero: string | null; width: number; currency: string }) {
  const mobile = width < 600;
  const head = look.serif ? SERIF : "inherit";
  const pad = mobile ? 16 : 40;
  const cols = mobile ? 2 : width < 900 ? 3 : 4;
  return (
    <div style={{ width, background: look.bg, color: look.text, fontSize: 13, lineHeight: 1.5, borderRadius: 10, overflow: "hidden", boxShadow: "0 0 0 1px var(--line), 0 10px 30px rgba(18,18,18,.08)" }}>
      <div style={{ background: look.text, color: look.bg, textAlign: "center", fontSize: 10.5, letterSpacing: ".06em", padding: "6px 10px", textTransform: "uppercase" }}>{c.announcement}</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: `14px ${pad}px`, borderBottom: `1px solid ${look.soft}` }}>
        {!mobile && <div style={{ display: "flex", gap: 16, fontSize: 12 }}>{c.nav.slice(0, 4).map((n) => <span key={n}>{n}</span>)}</div>}
        <span style={{ fontFamily: head, fontSize: mobile ? 20 : 24, letterSpacing: ".02em" }}>{brand}</span>
        <span style={{ fontSize: 12 }}>{mobile ? "☰" : "Search · Cart"}</span>
      </div>
      <div style={{ display: "flex", flexDirection: mobile ? "column" : "row", minHeight: mobile ? 0 : 340 }}>
        <div style={{ flex: 1, padding: `${mobile ? 28 : 56}px ${pad}px`, display: "flex", flexDirection: "column", justifyContent: "center", gap: 14 }}>
          <span style={{ fontSize: 10.5, letterSpacing: ".12em", textTransform: "uppercase", opacity: 0.6 }}>{brand}</span>
          <span style={{ fontFamily: head, fontSize: mobile ? 30 : 46, lineHeight: 1.05 }}>{c.hero}</span>
          <span style={{ maxWidth: 380, opacity: 0.8 }}>{c.subline}</span>
          <span style={{ alignSelf: "flex-start", background: look.text, color: look.bg, borderRadius: 99, padding: "9px 18px", fontSize: 12, fontWeight: 600 }}>{c.cta}</span>
        </div>
        <div style={{ flex: 1, minHeight: mobile ? 240 : 0, background: hero ? `center/cover url("${hero}")` : look.soft }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${mobile ? 1 : 3}, 1fr)`, gap: 12, padding: `18px ${pad}px`, background: look.soft }}>
        {c.promises.map((p) => <div key={p.title}><b style={{ display: "block", fontSize: 12.5 }}>{p.title}</b><span style={{ fontSize: 11.5, opacity: 0.75 }}>{p.body}</span></div>)}
      </div>
      <div style={{ padding: `${mobile ? 24 : 40}px ${pad}px` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}><span style={{ fontFamily: head, fontSize: mobile ? 22 : 28 }}>{c.bestsellersTitle}</span><span style={{ fontSize: 11.5, textDecoration: "underline" }}>Shop all</span></div>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 14 }}>
          {products.slice(0, cols * (mobile ? 2 : 1)).map((p) => (
            <div key={p.title}>
              <div style={{ aspectRatio: "4 / 5", background: p.image ? `center/cover url("${p.image}")` : look.soft, borderRadius: 4, marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10.5, color: "#B7791F" }}>{!p.image && "Photo needed"}</div>
              <div style={{ fontSize: 12, fontWeight: 500 }}>{p.title}</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>{money(p.price, currency)}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: mobile ? "column" : "row", gap: 24, padding: `${mobile ? 24 : 40}px ${pad}px`, background: look.soft }}>
        <span style={{ flex: 1, fontFamily: head, fontSize: mobile ? 22 : 28 }}>{c.story.title}</span>
        <span style={{ flex: 1.4, opacity: 0.85 }}>{c.story.body}</span>
      </div>
      <div style={{ padding: `${mobile ? 24 : 40}px ${pad}px` }}>
        <span style={{ fontFamily: head, fontSize: mobile ? 22 : 28, display: "block", marginBottom: 10 }}>Questions</span>
        {c.faq.map((f) => (
          <details key={f.q} style={{ borderTop: `1px solid ${look.soft}`, padding: "10px 0" }}><summary style={{ cursor: "pointer", fontWeight: 500 }}>{f.q}</summary><p style={{ marginTop: 6, opacity: 0.8 }}>{f.a}</p></details>
        ))}
      </div>
      <div style={{ textAlign: "center", padding: `${mobile ? 24 : 40}px ${pad}px`, background: look.text, color: look.bg }}>
        <span style={{ fontFamily: head, fontSize: mobile ? 20 : 26, display: "block" }}>{c.newsletter.title}</span>
        <span style={{ fontSize: 12, opacity: 0.8 }}>{c.newsletter.body}</span>
        <div style={{ margin: "14px auto 0", maxWidth: 320, display: "flex", border: `1px solid ${look.bg}`, borderRadius: 99, overflow: "hidden" }}><span style={{ flex: 1, padding: "8px 14px", fontSize: 12, opacity: 0.6, textAlign: "left" }}>Email</span><span style={{ background: look.bg, color: look.text, padding: "8px 14px", fontSize: 12, fontWeight: 600 }}>Sign up</span></div>
      </div>
    </div>
  );
}
