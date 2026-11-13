import "server-only";
import { normalizeShop } from "./oauth";

const HOST_RE = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const MYSHOP_RE = /([a-z0-9][a-z0-9-]*\.myshopify\.com)/i;

/** "percentscience.com" → host only, or null if it isn't a plain public domain (no IPs, no localhost, no ports). */
export function publicHost(input: string): string | null {
  const h = input.trim().toLowerCase().replace(/^https?:\/\//, "").split(/[/?#]/)[0].replace(/\.$/, "");
  if (!HOST_RE.test(h) || /^\d+(\.\d+){3}$/.test(h) || h.endsWith(".local") || h.endsWith(".internal")) return null;
  return h;
}

async function get(url: string, redirect: "follow" | "manual") {
  return fetch(url, { redirect, signal: AbortSignal.timeout(6000), headers: { "User-Agent": "KaviarBot/1.0 (+store lookup)" }, cache: "no-store" });
}

/**
 * Accepts either "brand.myshopify.com" or the store's own domain ("percentscience.com") and returns the
 * .myshopify.com address. Custom domains are looked up from the public storefront: Shopify pages carry
 * `Shopify.shop = "x.myshopify.com"`, and /admin redirects to the store's admin.
 */
export async function resolveShopDomain(input: string | null | undefined): Promise<string | null> {
  if (!input) return null;
  const direct = normalizeShop(input);
  if (direct && (input.includes(".myshopify.com") || /admin\.shopify\.com\/store\//i.test(input))) return direct;
  if (!input.includes(".")) return direct; // bare store name → name.myshopify.com
  const host = publicHost(input);
  if (!host) return null;
  try {
    const res = await get(`https://${host}/`, "follow");
    const html = (await res.text()).slice(0, 400_000);
    const m = html.match(/Shopify\.shop\s*=\s*["']([a-z0-9][a-z0-9-]*\.myshopify\.com)["']/i) ?? html.match(/["']myshopifyDomain["']\s*:\s*["']([a-z0-9][a-z0-9-]*\.myshopify\.com)["']/i);
    if (m) return normalizeShop(m[1]);
  } catch {}
  try {
    const res = await get(`https://${host}/admin`, "manual");
    const loc = res.headers.get("location") ?? "";
    const m = loc.match(MYSHOP_RE);
    if (m) return normalizeShop(m[1]);
    const store = loc.match(/admin\.shopify\.com\/store\/([a-z0-9][a-z0-9-]*)/i);
    if (store) return normalizeShop(store[1]);
  } catch {}
  return null;
}
