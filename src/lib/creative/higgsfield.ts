import "server-only";
import { randomUUID } from "node:crypto";
import { cacheLife } from "next/cache";
import { env } from "../env";

/**
 * Higgsfield Cloud (docs.higgsfield.ai): submit a job to a model, poll it, download the result.
 * Auth is `Authorization: Key <id>:<secret>` — server-side only. Outputs expire after 7 days, so we copy them into brand assets.
 */
const API = "https://api.higgsfield.ai";
export const HF_PHOTO = "marketing-studio/image/flare"; // product-ad images; the product photo goes in first
export const HF_VIDEO = "bytedance/seedance-2.5/image-to-video"; // 4–30 s, generates sound with the clip; starts from our frame
export const HF_VIDEO_REF = "bytedance/seedance-2.5/reference-to-video"; // same model, with a brand voice sample (and the character sheet) as references

/**
 * The clip models Shoots offers, best first. Both make up to 30 s in one take from our start frame, with sound, and take a brand voice as a reference.
 * Wan 3.0 Prime (Alibaba's top tier) renders 1080p and can reason over the shot list before rendering; Seedance 2.5 is the faster fallback.
 */
export type VideoModel = "wan" | "seedance";
export const VIDEO_MODELS: Record<VideoModel, { name: string; i2v: string; ref: string; note: string }> = {
  wan: { name: "Wan 3.0 Prime", i2v: "alibaba/wan-3.0-prime/image-to-video", ref: "alibaba/wan-3.0-prime/reference-to-video", note: "Sharpest detail and motion · up to 1080p · 30 s" },
  seedance: { name: "Seedance 2.5", i2v: HF_VIDEO, ref: HF_VIDEO_REF, note: "Faster renders · up to 1080p · 30 s" },
};
export const DEFAULT_VIDEO: VideoModel = "wan";
export const isVideoModel = (m: unknown): m is VideoModel => typeof m === "string" && m in VIDEO_MODELS;
export type Rate = { second: number; sound: number; res: Record<"480p" | "720p" | "1080p", number> };
export const hfReady = () => Boolean(env.higgsfield());

type Status = { status: "queued" | "in_progress" | "completed" | "failed" | "nsfw" | "canceled"; request_id: string; error?: string | null;
  images?: { url: string }[]; video?: { url: string }; audio?: { url: string } };

const headers = (json = true): HeadersInit => {
  const key = env.higgsfield();
  if (!key) throw new Error("Higgsfield isn’t connected.");
  return { Authorization: `Key ${key}`, ...(json ? { "Content-Type": "application/json" } : {}) };
};

async function hfFetch(path: string, init: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(`${API}${path}`, { ...init, cache: "no-store" });
    if (r.status < 500 && r.status !== 429) return r;
    if (attempt >= 2) return r;
    await new Promise((res) => setTimeout(res, 800 * 2 ** attempt + Math.random() * 300));
  }
}

const reason = async (r: Response) => {
  const body = await r.json().catch(() => null) as { detail?: string | { msg?: string }[] } | null;
  const d = typeof body?.detail === "string" ? body.detail : Array.isArray(body?.detail) ? body.detail.map((x) => x.msg).join("; ") : "";
  if (r.status === 401 || r.status === 403) return "Higgsfield refused the key — check the Higgsfield API key in the project settings.";
  if (r.status === 402 || /credit|balance|insufficient/i.test(d)) return "Higgsfield is out of credits — top up in the Higgsfield console.";
  if (r.status === 429) return "Higgsfield is busy (rate limit) — try again in a minute.";
  return `Higgsfield said: ${d || r.statusText}`.slice(0, 160);
};

/** Submit, then poll until the job finishes (or `timeoutMs`). Same idempotency key on retries, so a retry never double-charges. */
export async function hfRun(model: string, input: Record<string, unknown>, timeoutMs = 240_000): Promise<{ out?: Status; error?: string }> {
  const sub = await hfFetch(`/${model}`, { method: "POST", headers: { ...headers(), "Idempotency-Key": randomUUID() }, body: JSON.stringify(input) });
  if (!sub.ok) { const e = await reason(sub); console.error("higgsfield submit", model, sub.status, e); return { error: e }; }
  const { request_id } = (await sub.json()) as { request_id: string };
  const until = Date.now() + timeoutMs;
  let wait = 2000;
  while (Date.now() < until) {
    await new Promise((res) => setTimeout(res, wait));
    wait = Math.min(6000, wait + 1000);
    const r = await hfFetch(`/requests/${request_id}/status`, { headers: headers(false) });
    if (!r.ok) { if (r.status === 404) return { error: "Higgsfield lost the request." }; continue; }
    const s = (await r.json()) as Status;
    if (s.status === "completed") return { out: s };
    if (s.status === "nsfw") { console.error("higgsfield nsfw", model, request_id); return { error: "Higgsfield’s safety filter blocked this one (not charged) — reword the scene." }; }
    if (s.status === "failed" || s.status === "canceled") { console.error("higgsfield failed", model, request_id, s.error); return { error: `Higgsfield couldn’t make it${s.error ? `: ${s.error}` : ""} (not charged).`.slice(0, 180) }; }
  }
  console.error("higgsfield timeout", model, request_id);
  return { error: "Higgsfield is taking longer than usual — try again, or pick fewer photos." };
}

/** Submit without waiting (long renders): the canvas polls `hfStatus` and the finished file is saved then. */
export async function hfSubmit(model: string, input: Record<string, unknown>): Promise<{ requestId?: string; error?: string }> {
  const sub = await hfFetch(`/${model}`, { method: "POST", headers: { ...headers(), "Idempotency-Key": randomUUID() }, body: JSON.stringify(input) });
  if (!sub.ok) { const e = await reason(sub); console.error("higgsfield submit", model, sub.status, e); return { error: e }; }
  const { request_id } = (await sub.json()) as { request_id: string };
  return { requestId: request_id };
}
export async function hfStatus(requestId: string): Promise<Status | { error: string }> {
  const r = await hfFetch(`/requests/${encodeURIComponent(requestId)}/status`, { headers: headers(false) });
  if (!r.ok) return { error: r.status === 404 ? "Higgsfield lost the request." : await reason(r) };
  return (await r.json()) as Status;
}

/** What a job would cost for this account (Higgsfield's /estimate): a flat USD amount, or — for per-second and token-priced models — the rate card as text. */
type Quote = { usd: number | null; note: string | null };
async function hfQuote(model: string, input: Record<string, unknown>): Promise<Quote | null> {
  try {
    const r = await hfFetch(`/estimate/${model}`, { method: "POST", headers: headers(), body: JSON.stringify(input) });
    if (!r.ok) { console.error("higgsfield estimate", model, r.status, await reason(r)); return null; }
    const body = (await r.json()) as { usd?: string | number; pricing_description?: unknown };
    const v = Number(body.usd);
    return { usd: body.usd != null && Number.isFinite(v) ? v : null, note: typeof body.pricing_description === "string" ? body.pricing_description : null };
  } catch (e) { console.error("higgsfield estimate", model, (e as Error).message); return null; }
}
export async function hfEstimate(model: string, input: Record<string, unknown>): Promise<number | null> {
  return (await hfQuote(model, input))?.usd ?? null;
}
/** "480p: $0.0804; 720p: $0.1735; …" → per-second rates. */
const perSecond = (note: string | null) => Object.fromEntries([...(note ?? "").matchAll(/(\d{3,4}p|4K)\s*:\s*\$\s*(\d+(?:\.\d+)?)/gi)].map((m) => [m[1].toLowerCase(), Number(m[2])]).filter(([, v]) => Number.isFinite(v as number))) as Record<string, number>;
/** Marketing Studio bills by tokens; Higgsfield's docs budget about $0.084 per image. */
const PHOTO_APPROX = 0.084;

/** Higgsfield needs public URLs: our assets are private, so a start frame or reference goes up through a presigned upload. */
export async function hfUpload(data: Buffer | Uint8Array, contentType: string): Promise<string> {
  const type = /^(image\/(png|jpe?g|webp|gif)|audio\/(wav|x-wav)|video\/mp4)$/.test(contentType) ? contentType : "image/png";
  const r = await hfFetch("/files/generate-upload-url", { method: "POST", headers: headers(), body: JSON.stringify({ content_type: type }) });
  if (!r.ok) throw new Error(await reason(r));
  const u = (await r.json()) as { public_url: string; upload_url: string; upload_headers?: Record<string, string> };
  // Never send Higgsfield credentials to the storage URL.
  const put = await fetch(u.upload_url, { method: "PUT", headers: u.upload_headers ?? { "Content-Type": type }, body: new Uint8Array(data) });
  if (!put.ok) throw new Error(`Upload to Higgsfield failed (${put.status}).`);
  return u.public_url;
}

/** Download a finished output before it expires. */
/** A generated picture, kept small: 2K PNGs (5–7 MB) are stored as high-quality JPEGs so they open fast and fit a response. */
export async function hfImage(url: string): Promise<{ data: Buffer; mime: string }> {
  const img = await hfDownload(url);
  if (!img.mime.startsWith("image/") || img.data.length <= 3_000_000) return img;
  const { toJpeg } = await import("../audience/media");
  const jpg = await toJpeg(img.data, 2400);
  return jpg ? { data: jpg, mime: "image/jpeg" } : img;
}

export async function hfDownload(url: string): Promise<{ data: Buffer; mime: string }> {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`Couldn’t download the result (${r.status}).`);
  return { data: Buffer.from(await r.arrayBuffer()), mime: r.headers.get("content-type")?.split(";")[0] ?? "application/octet-stream" };
}

/** One clip model's price: per second at 720p, extra per second of sound, and the 480p / 1080p multipliers — from Higgsfield's own estimates. */
async function videoRate(model: string): Promise<Rate | null> {
  const clip = (resolution: string, audio: boolean) => ({ image_url: "https://example.com/a.jpg", prompt: "A product on a table", duration: 5, resolution, generate_audio: audio });
  const v = await hfQuote(model, clip("720p", true));
  if (!v) return null;
  const rates = perSecond(v.note);
  if (rates["720p"]) {
    // Per-second rate card: sound is included in the rate.
    const base = rates["720p"];
    return { second: base, sound: 0, res: { "480p": rates["480p"] ? rates["480p"] / base : 0.46, "720p": 1, "1080p": rates["1080p"] ? rates["1080p"] / base : 2.47 } };
  }
  if (v.usd == null) { console.error("higgsfield estimate: no price for", model, (v.note ?? "").slice(0, 200)); return null; }
  // Flat quotes: price the silent clip and each quality separately.
  const [silent, low, high] = await Promise.all([hfEstimate(model, clip("720p", false)), hfEstimate(model, clip("480p", false)), hfEstimate(model, clip("1080p", false))]);
  const base = silent ?? v.usd;
  return { second: base / 5, sound: Math.max(0, v.usd - base) / 5, res: { "480p": low != null && base ? low / base : 0.6, "720p": 1, "1080p": high != null && base ? high / base : 1.8 } };
}

/** Prices for the canvas (per photo; per clip model: per second, sound, quality multipliers), from Higgsfield's estimates; cached for a few hours. */
export async function hfPrices(): Promise<{ photo: number; video: Partial<Record<VideoModel, Rate>>; videoSecond: number; soundSecond: number; res: Rate["res"] } | null> {
  "use cache";
  cacheLife("hours");
  if (!hfReady()) return null;
  const keys = Object.keys(VIDEO_MODELS) as VideoModel[];
  const [p, ...rates] = await Promise.all([hfQuote(HF_PHOTO, { prompt: "A product on a table", resolution: "2k", aspect_ratio: "3:4", quality: "high" }), ...keys.map((k) => videoRate(VIDEO_MODELS[k].i2v).catch(() => null))]);
  const video = Object.fromEntries(keys.flatMap((k, i) => (rates[i] ? [[k, rates[i]]] : []))) as Partial<Record<VideoModel, Rate>>;
  const main = video[DEFAULT_VIDEO] ?? video.seedance;
  // A failed estimate is thrown, not returned, so it isn't cached for hours — the next request asks again.
  if (!p || !main) throw new Error("Higgsfield prices unavailable");
  return { photo: p.usd ?? PHOTO_APPROX, video, videoSecond: main.second, soundSecond: main.sound, res: main.res };
}

/** Width/height of a PNG or JPEG, to keep an edit's framing. */
export function imageSize(b: Buffer): { w: number; h: number } | null {
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1], len = b.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
      i += 2 + len;
    }
  }
  return null;
}
const RATIOS: [string, number][] = [["1:1", 1], ["3:4", 0.75], ["2:3", 0.667], ["9:16", 0.5625], ["4:3", 1.333], ["3:2", 1.5], ["16:9", 1.778]];
/** Nearest aspect ratio Higgsfield's image models accept (4:5 → 3:4; the Editor crops to the exact Meta size). */
export const nearestRatio = (r: number) => RATIOS.reduce((a, b) => (Math.abs(b[1] - r) < Math.abs(a[1] - r) ? b : a))[0];
