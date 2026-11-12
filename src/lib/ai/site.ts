import "server-only";
import { publicHost } from "../shopify/resolve";

/** A fetched page, reduced to what the agents read. Only public hosts are fetched, and every redirect is re-checked. */
export type Page = {
  url: string;
  host: string;
  html: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  lang: string | null;
  hreflangs: string[];
  links: { href: string; text: string; inNav: boolean }[];
  text: string;
};

const UA = "Mozilla/5.0 (compatible; KaviarBot/1.0; +brand onboarding)";

export function toUrl(input: string): URL | null {
  const raw = input.trim();
  if (!raw) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return publicHost(u.hostname) ? u : null;
  } catch {
    return null;
  }
}

/** GET with manual redirects so a public URL can't bounce us onto a private host. */
export async function fetchPublic(url: string, ms = 8000, accept = "text/html,application/json"): Promise<Response | null> {
  let current = url;
  for (let hop = 0; hop < 5; hop++) {
    const u = toUrl(current);
    if (!u) return null;
    let res: Response;
    try {
      res = await fetch(u, { redirect: "manual", signal: AbortSignal.timeout(ms), headers: { "User-Agent": UA, Accept: accept }, cache: "no-store" });
    } catch {
      return null;
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      current = new URL(res.headers.get("location")!, u).toString();
      continue;
    }
    return res;
  }
  return null;
}

const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
const meta = (html: string, key: string) => {
  const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*>`, "i"))?.[0];
  return m ? decode(m.match(/content=["']([^"']*)["']/i)?.[1] ?? "").trim() || null : null;
};

export async function readPage(url: string): Promise<Page | null> {
  const res = await fetchPublic(url);
  if (!res || !res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return null;
  const final = toUrl(res.url || url) ?? toUrl(url)!;
  const html = (await res.text()).slice(0, 1_500_000);
  const abs = (h: string) => { try { return new URL(decode(h), final).toString(); } catch { return null; } };
  const navHtml = (html.match(/<(nav|header)[\s\S]*?<\/\1>/gi) ?? []).join(" ");
  const linkRe = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const links: Page["links"] = [];
  const seen = new Set<string>();
  for (const [src, inNav] of [[navHtml, true], [html, false]] as const) {
    for (const m of src.matchAll(linkRe)) {
      const href = abs(m[1]);
      if (!href || seen.has(href)) continue;
      seen.add(href);
      links.push({ href, text: decode(m[2].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim().slice(0, 60), inNav });
    }
  }
  const body = html.replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ");
  const text = decode(body.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  const img = meta(html, "og:image");
  return {
    url: final.toString(),
    host: final.hostname,
    html,
    title: decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim() || null,
    description: meta(html, "description") ?? meta(html, "og:description"),
    image: img ? abs(img) : null,
    siteName: meta(html, "og:site_name"),
    lang: html.match(/<html[^>]*\blang=["']([^"']+)["']/i)?.[1] ?? null,
    hreflangs: [...new Set([...html.matchAll(/hreflang=["']([a-zA-Z-]+)["']/g)].map((m) => m[1].toLowerCase()).filter((l) => l !== "x-default"))],
    links,
    text: text.slice(0, 20_000),
  };
}

export function detectPlatform(html: string): string | null {
  if (/cdn\.shopify\.com|Shopify\.shop\s*=/i.test(html)) return "Shopify";
  if (/cafe24/i.test(html)) return "Cafe24";
  if (/woocommerce/i.test(html)) return "WooCommerce";
  if (/wp-content/i.test(html)) return "WordPress";
  if (/static\.wixstatic|wix\.com/i.test(html)) return "Wix";
  if (/squarespace/i.test(html)) return "Squarespace";
  if (/bigcommerce/i.test(html)) return "BigCommerce";
  if (/imweb/i.test(html)) return "imweb";
  return null;
}

export type ShopProduct = { title: string; type: string; prices: number[]; images: { src: string; width: number | null; height: number | null }[] };

/** Shopify storefronts publish their catalog at /products.json. Returns null on any other platform. */
export async function shopifyProducts(origin: string): Promise<ShopProduct[] | null> {
  const res = await fetchPublic(`${origin}/products.json?limit=250`, 10_000, "application/json");
  if (!res || !res.ok) return null;
  try {
    const j = (await res.json()) as { products?: { title: string; product_type: string; variants: { price: string }[]; images: { src: string; width?: number; height?: number }[] }[] };
    if (!Array.isArray(j.products)) return null;
    return j.products.map((p) => ({
      title: p.title,
      type: p.product_type || "Other",
      prices: p.variants.map((v) => Number(v.price)).filter((n) => Number.isFinite(n) && n > 0),
      images: p.images.map((i) => ({ src: i.src, width: i.width ?? null, height: i.height ?? null })),
    }));
  } catch {
    return null;
  }
}

/** Colour and font evidence from the page's own CSS and its first stylesheets. */
export async function styleEvidence(page: Page): Promise<{ colors: [string, number][]; fonts: [string, number][] }> {
  let css = (page.html.match(/<style[\s\S]*?<\/style>/gi) ?? []).join("\n") + (page.html.match(/style=["'][^"']*["']/gi) ?? []).join("\n");
  const sheets = [...page.html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi)]
    .map((m) => m[0].match(/href=["']([^"']+)["']/i)?.[1])
    .filter(Boolean)
    .slice(0, 3)
    .map((h) => { try { return new URL(decode(h!), page.url).toString(); } catch { return null; } })
    .filter(Boolean) as string[];
  for (const s of sheets) {
    const res = await fetchPublic(s, 6000, "text/css");
    if (res?.ok) css += "\n" + (await res.text()).slice(0, 600_000);
  }
  const colors = new Map<string, number>();
  for (const m of css.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
    let h = m[1].toUpperCase();
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    colors.set(`#${h}`, (colors.get(`#${h}`) ?? 0) + 1);
  }
  const fonts = new Map<string, number>();
  for (const m of css.matchAll(/font-family\s*:\s*([^;}{]+)/gi)) {
    const f = m[1].split(",")[0].replace(/["']/g, "").trim();
    if (f && !/^(inherit|var\(|initial|sans-serif|serif|monospace|system-ui|-apple-system)/i.test(f)) fonts.set(f, (fonts.get(f) ?? 0) + 1);
  }
  return {
    colors: [...colors].sort((a, b) => b[1] - a[1]).slice(0, 24),
    fonts: [...fonts].sort((a, b) => b[1] - a[1]).slice(0, 8),
  };
}

/** Is name.myshopify.com free? Shopify answers 404 for store names nobody has taken. */
export async function shopNameFree(name: string): Promise<boolean | null> {
  try {
    const res = await fetch(`https://${name}.myshopify.com/`, { redirect: "manual", signal: AbortSignal.timeout(5000), headers: { "User-Agent": UA }, cache: "no-store" });
    return res.status === 404;
  } catch {
    return null;
  }
}
