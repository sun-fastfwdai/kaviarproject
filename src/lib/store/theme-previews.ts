import { cacheLife } from "next/cache";

/**
 * The official screenshot of a Theme Store theme (Dawn, Pitch, Monaco…), read from its public page on
 * themes.shopify.com. Custom themes return null. Cached for days — theme screenshots rarely change.
 */
export async function themeStorePreview(name: string): Promise<string | null> {
  "use cache";
  cacheLife("days");
  const handle = name.replace(/^copy of\s+/i, "").replace(/\s*[\d.]+\s*$/, "").replace(/\s*\(.*\)\s*$/, "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!handle || handle.length > 40) return null;
  try {
    const res = await fetch(`https://themes.shopify.com/themes/${handle}/styles/default`, { headers: { "User-Agent": "Mozilla/5.0 (KaviarBot theme previews)" }, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const html = await res.text();
    // The main preview is the first theme-store image Shopify loads with high priority.
    const hero = html.match(/src="(https:\/\/cdn\.shopify\.com\/theme-store\/[a-z0-9]+\.(?:jpg|png|webp))\?[^"]*"[^>]*fetchpriority="high"/i)
      ?? html.match(/(https:\/\/cdn\.shopify\.com\/theme-store\/[a-z0-9]+\.(?:jpg|png|webp))\?width=\d+/i);
    return hero ? `${hero[1]}?width=640` : null;
  } catch {
    return null;
  }
}
