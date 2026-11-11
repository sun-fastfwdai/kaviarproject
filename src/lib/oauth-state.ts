import "server-only";
import { cookies } from "next/headers";
import { randomToken, sign, unsign } from "./crypto";
import { env } from "./env";

type State<T> = T & { state: string; exp: number };
const TTL_MS = 10 * 60_000;

/** Short-lived, signed, httpOnly cookie tying an OAuth round-trip to the browser that started it. */
export async function startOAuth<T extends object>(name: string, data: T): Promise<string> {
  const state = randomToken(18);
  (await cookies()).set(name, sign({ ...data, state, exp: Date.now() + TTL_MS }, env.sessionSecret()), {
    httpOnly: true, secure: env.appUrl().startsWith("https://"), sameSite: "lax", path: "/api", maxAge: TTL_MS / 1000,
  });
  return state;
}

export async function finishOAuth<T extends object>(name: string, state: string | null): Promise<State<T> | null> {
  const jar = await cookies();
  const v = unsign<State<T>>(jar.get(name)?.value, env.sessionSecret());
  jar.delete({ name, path: "/api" });
  if (!v || !state || v.state !== state || v.exp < Date.now()) return null;
  return v;
}
