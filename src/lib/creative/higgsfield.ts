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
export const HF_VIDEO = "bytedance/seedance-2.0/image-to-video"; // up to 15 s, generates sound with the clip
export const HF_VIDEO_REF = "bytedance/seedance-2.0/reference-to-video"; // same model, with a brand voice sample as audio reference
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
  if (!sub.ok) return { error: await reason(sub) };
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
    if (s.status === "nsfw") return { error: "Higgsfield’s safety filter blocked this one (not charged) — reword the scene." };
    if (s.status === "failed" || s.status === "canceled") return { error: `Higgsfield couldn’t make it${s.error ? `: ${s.error}` : ""} (not charged).`.slice(0, 180) };
  }
  return { error: "Higgsfield is taking longer than usual — it’ll show up in the next run." };
}

/** Submit without waiting (long renders): the canvas polls `hfStatus` and the finished file is saved then. */
export async function hfSubmit(model: string, input: Record<string, unknown>): Promise<{ requestId?: string; error?: string }> {
  const sub = await hfFetch(`/${model}`, { method: "POST", headers: { ...headers(), "Idempotency-Key": randomUUID() }, body: JSON.stringify(input) });
  if (!sub.ok) return { error: await reason(sub) };
  const { request_id } = (await sub.json()) as { request_id: string };
  return { requestId: request_id };
}
export async function hfStatus(requestId: string): Promise<Status | { error: string }> {
  const r = await hfFetch(`/requests/${encodeURIComponent(requestId)}/status`, { headers: headers(false) });
  if (!r.ok) return { error: r.status === 404 ? "Higgsfield lost the request." : await reason(r) };
  return (await r.json()) as Status;
}

/** What a job would cost in USD for this account (Higgsfield's /estimate). */
export async function hfEstimate(model: string, input: Record<string, unknown>): Promise<number | null> {
  try {
    const r = await hfFetch(`/estimate/${model}`, { method: "POST", headers: headers(), body: JSON.stringify(input) });
    if (!r.ok) return null;
    const { usd } = (await r.json()) as { usd?: string | number };
    const v = Number(usd);
    return Number.isFinite(v) ? v : null;
  } catch { return null; }
}

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
export async function hfDownload(url: string): Promise<{ data: Buffer; mime: string }> {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`Couldn’t download the result (${r.status}).`);
  return { data: Buffer.from(await r.arrayBuffer()), mime: r.headers.get("content-type")?.split(";")[0] ?? "application/octet-stream" };
}

/** Prices for the canvas (per photo, per video second), from Higgsfield's estimate; cached for a few hours. */
export async function hfPrices(): Promise<{ photo: number; videoSecond: number; soundSecond: number; res: Record<"480p" | "720p" | "1080p", number> } | null> {
  "use cache";
  cacheLife("hours");
  if (!hfReady()) return null;
  const v = (resolution: string, audio: boolean) => hfEstimate(HF_VIDEO, { image_url: "https://example.com/a.jpg", duration: 5, resolution, generate_audio: audio });
  const [photo, video, silent, low, high] = await Promise.all([
    hfEstimate(HF_PHOTO, { prompt: "A product on a table", resolution: "2k", aspect_ratio: "3:4", quality: "high" }),
    v("720p", true), v("720p", false), v("480p", false), v("1080p", false),
  ]);
  if (photo == null || video == null) return null;
  const base = silent ?? video;
  // Price multiplier per quality tier, relative to 720p.
  return { photo, videoSecond: base / 5, soundSecond: Math.max(0, video - base) / 5, res: { "480p": low != null && base ? low / base : 0.6, "720p": 1, "1080p": high != null && base ? high / base : 1.8 } };
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
