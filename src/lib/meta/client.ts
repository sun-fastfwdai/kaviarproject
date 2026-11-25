import "server-only";
import { env } from "../env";
import { hmacHex } from "../crypto";

export class MetaAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MetaAuthError";
  }
}

type MetaError = { error?: { message: string; code: number; error_subcode?: number; type?: string; error_user_title?: string; error_user_msg?: string } };
/**
 * Meta's refusal, whole: its plain-words explanation when it gives one ("Invalid parameter" alone says nothing), then the code and
 * sub-code, which name the exact rule.
 */
const refusal = (err: MetaError["error"], status: number, statusText: string) => {
  const said = [err?.error_user_title, err?.error_user_msg].filter(Boolean).join(": ") || err?.message || statusText;
  return `Meta API: ${said} (${err?.code ?? status}${err?.error_subcode ? `/${err.error_subcode}` : ""})`;
};
const RATE_LIMIT = new Set([4, 17, 32, 613, 80000, 80001, 80002, 80003, 80004, 80005, 80006, 80008, 80009, 80014]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const graphBase = () => `https://graph.facebook.com/${env.meta().apiVersion}`;

/** GET on the Graph API with appsecret_proof and rate-limit backoff. `path` may be a full paging URL. */
export async function metaGet<T>(path: string, params: Record<string, string>, token: string): Promise<T> {
  const url = path.startsWith("https://") ? new URL(path) : new URL(`${graphBase()}/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);
  url.searchParams.set("appsecret_proof", hmacHex(env.meta().appSecret, token));

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { cache: "no-store" });
    const body = (await res.json()) as T & MetaError;
    const err = body.error;
    if (!err && res.ok) return body;
    if (err?.code === 190 || err?.code === 102) throw new MetaAuthError(err.message);
    if (err && RATE_LIMIT.has(err.code) && attempt < 4) {
      await sleep(15_000 * 2 ** attempt);
      continue;
    }
    if (res.status >= 500 && attempt < 3) {
      await sleep(3000 * (attempt + 1));
      continue;
    }
    throw new Error(refusal(err, res.status, res.statusText));
  }
}

/** Follows paging.next until done. */
export async function metaGetAll<T>(path: string, params: Record<string, string>, token: string, max = 50_000): Promise<T[]> {
  const out: T[] = [];
  let page = await metaGet<{ data: T[]; paging?: { next?: string } }>(path, params, token);
  out.push(...page.data);
  while (page.paging?.next && out.length < max) {
    page = await metaGet<{ data: T[]; paging?: { next?: string } }>(page.paging.next, {}, token);
    out.push(...page.data);
  }
  return out;
}

/**
 * A write on the Graph API: POST to change an object, DELETE to remove one. Meta allows this app only about one change every thirty
 * seconds, so a rate-limit answer is waited out and tried again (twice at most). Any other failure is reported, never retried blind.
 */
export async function metaWrite<T = { success?: boolean; id?: string }>(method: "POST" | "DELETE", path: string, params: Record<string, string>, token: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const body = new URLSearchParams({ ...params, access_token: token, appsecret_proof: hmacHex(env.meta().appSecret, token) });
    const res = await fetch(`${graphBase()}/${path.replace(/^\//, "")}`, { method, body, cache: "no-store" });
    const out = (await res.json()) as T & MetaError;
    if (out.error?.code === 190 || out.error?.code === 102) throw new MetaAuthError(out.error.message);
    if (out.error && RATE_LIMIT.has(out.error.code) && attempt < 2) { await sleep(32_000); continue; }
    if (out.error || !res.ok) throw new Error(refusal(out.error, res.status, res.statusText));
    return out;
  }
}
