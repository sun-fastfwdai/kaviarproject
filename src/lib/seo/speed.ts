import "server-only";
import { readGoogle, speedChecks, weigh, type Speed, type SpeedPage, type Vitals } from "./speed-rules";

/**
 * Measure how fast the store's home page and one product page are on a phone. Kaviar's own reading always runs (it opens the pages like
 * a visitor and weighs what they load). Google's speed test is added when a key for it is set — it is the number Google itself uses.
 */
const UA = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36 KaviarStoreCheck/1.0";
const googleKey = () => process.env.PAGESPEED_API_KEY?.trim() || null;
export const googleSpeedReady = () => Boolean(googleKey());

/** How many bytes the page's scripts are on the wire (compressed, as a phone downloads them). */
async function scriptBytes(urls: string[]): Promise<number | null> {
  const list = urls.slice(0, 60);
  let total = 0, read = 0;
  for (let i = 0; i < list.length; i += 12) {
    const sizes = await Promise.all(list.slice(i, i + 12).map(async (u) => {
      try {
        const res = await fetch(u, { cache: "no-store", signal: AbortSignal.timeout(8_000), headers: { "User-Agent": UA, "Accept-Encoding": "gzip, br" } });
        if (!res.ok) return null;
        const stated = Number(res.headers.get("content-length"));
        if (stated > 0) { void res.body?.cancel(); return stated; }
        // No size stated: the text is unpacked here, and scripts pack to roughly a third on the wire.
        return Math.round((await res.arrayBuffer()).byteLength / 3);
      } catch { return null; }
    }));
    for (const s of sizes) if (s != null) { total += s; read++; }
  }
  return read ? total : null;
}

async function google(url: string): Promise<Vitals | null | "failed"> {
  const key = googleKey();
  if (!key) return null;
  try {
    const q = new URLSearchParams({ url, strategy: "mobile", category: "performance", key });
    const res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${q}`, { cache: "no-store", signal: AbortSignal.timeout(75_000) });
    if (!res.ok) { console.error("pagespeed", res.status); return "failed"; }
    return readGoogle(await res.json()) ?? "failed";
  } catch (e) { console.error("pagespeed", (e as Error).message.slice(0, 120)); return "failed"; }
}

/** pages: the HTML already fetched for the store-wide checks, with how long the store took to start answering — nothing is opened twice. */
export async function measureSpeed(pages: { key: SpeedPage["key"]; name: string; url: string; html: string; ms: number }[]): Promise<Speed> {
  let failed = false;
  const out = await Promise.all(pages.map(async (p): Promise<SpeedPage> => {
    const w = weigh(p.html, p.url);
    const [bytes, g] = await Promise.all([scriptBytes(w.scripts), google(p.url)]);
    if (g === "failed") failed = true;
    return { key: p.key, name: p.name, url: p.url, checks: speedChecks(w, { answerMs: p.ms, scriptBytes: bytes }), google: g === "failed" ? null : g };
  }));
  return { pages: out, google: !googleKey() ? "off" : failed && out.every((p) => !p.google) ? "failed" : "on" };
}
