import "server-only";
import { env } from "../env";
import { hmacHex } from "../crypto";

export class MetaAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MetaAuthError";
  }
}

type MetaError = { error?: { message: string; code: number; error_subcode?: number; type?: string } };
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
    throw new Error(`Meta API: ${err?.message ?? res.statusText} (${err?.code ?? res.status})`);
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
