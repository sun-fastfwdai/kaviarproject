/* eslint-disable @next/next/no-img-element -- product photos come from the brand's Shopify CDN */
import { Icon } from "./icon";

export type AdView = {
  id: string; format: string; hook: string; primaryText: string; headline: string; cta: string; offer: string;
  product: string | null; imageUrl: string | null; why: string; status: "review" | "approved" | "rejected"; note: string | null; edited: boolean;
};

const serif = "Georgia, 'Times New Roman', serif";

/** The creative itself: the brand's product photo with Remy's hook on it, like boards 17a and 19b. */
export function AdArt({ ad, brand, ratio = "4 / 5", big = false, bare = false }: { ad: AdView; brand: string; ratio?: string; big?: boolean; bare?: boolean }) {
  return (
    <div style={{ position: "relative", aspectRatio: ratio, width: "100%", overflow: "hidden", background: "linear-gradient(160deg, #EDE9E2, #D9D3C7)" }}>
      {ad.imageUrl && <img src={ad.imageUrl} alt={ad.product ?? ""} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0) 35%, rgba(0,0,0,.55) 100%)" }} />
      {!bare && (ad.format === "video" || ad.format === "ugc") && (
        <span style={{ position: "absolute", top: "38%", left: "50%", transform: "translate(-50%,-50%)", width: big ? 48 : 30, height: big ? 48 : 30, borderRadius: 99, background: "rgba(255,255,255,.9)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width={big ? 16 : 11} height={big ? 16 : 11} viewBox="0 0 24 24"><path d="M7 4v16l13-8z" fill="#121212" /></svg>
        </span>
      )}
      {!bare && <div style={{ position: "absolute", left: big ? 16 : 10, right: big ? 16 : 10, bottom: big ? 16 : 10, display: "flex", flexDirection: "column", gap: big ? 10 : 6 }}>
        <span style={{ fontFamily: serif, color: "#fff", fontSize: big ? 24 : 15, lineHeight: big ? "28px" : "18px", textShadow: "0 1px 8px rgba(0,0,0,.35)" }}>{ad.hook}</span>
        <span className="row between">
          <span style={{ color: "#fff", fontSize: big ? 12 : 10, fontWeight: 600, letterSpacing: ".02em" }}>{brand}</span>
          <span style={{ background: "#fff", color: "#121212", borderRadius: 99, padding: big ? "5px 12px" : "3px 8px", fontSize: big ? 12 : 9.5, fontWeight: 600 }}>{ad.cta}</span>
        </span>
      </div>}
    </div>
  );
}

/** How the ad looks in the Instagram / Facebook feed. */
export function PhonePreview({ ad, brand, ratio }: { ad: AdView; brand: string; ratio: "9 / 16" | "4 / 5" | "1 / 1" }) {
  return (
    <div style={{ width: 236, borderRadius: 28, border: "6px solid #121212", overflow: "hidden", background: "#fff", boxShadow: "0 10px 30px rgba(18,18,18,.18)" }}>
      <div className="row g6" style={{ padding: "8px 10px" }}>
        <span style={{ width: 22, height: 22, borderRadius: 99, background: "var(--tray-2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>{brand.charAt(0)}</span>
        <div className="col" style={{ lineHeight: "12px" }}><span style={{ fontSize: 10.5, fontWeight: 600 }}>{brand.toLowerCase().replace(/\s+/g, "")}</span><span style={{ fontSize: 9, color: "#8B8883" }}>Sponsored</span></div>
      </div>
      <AdArt ad={ad} brand={brand} ratio={ratio} big />
      <div className="row between" style={{ padding: "8px 10px", background: "var(--tray)" }}>
        <span style={{ fontSize: 10.5, fontWeight: 600 }} className="ell">{ad.headline}</span>
        <span style={{ fontSize: 9.5, border: "1px solid var(--line-2)", borderRadius: 6, padding: "2px 6px", flexShrink: 0 }}>{ad.cta}</span>
      </div>
      <div style={{ padding: "6px 10px 10px", fontSize: 10, lineHeight: "13px", color: "#3A3936", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
        <b>{brand.toLowerCase().replace(/\s+/g, "")}</b> {ad.primaryText}
      </div>
    </div>
  );
}

export function FormatLabel({ ad }: { ad: AdView }) {
  const icon = ad.format === "video" || ad.format === "ugc" ? "video" : ad.format === "carousel" ? "layers" : "image";
  const name = { static: "Static", video: "Video · 15s", ugc: "UGC · 20s", carousel: "Carousel" }[ad.format] ?? ad.format;
  return <span className="row g4 xs i3"><Icon name={icon} size={11} />{name} · 3 sizes{ad.edited && <b className="w5 i2"> · Edited</b>}</span>;
}
