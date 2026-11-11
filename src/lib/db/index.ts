import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool, type PoolConfig } from "pg";
import * as schema from "./schema";

// One pool per server instance (kept across dev hot reloads).
const g = globalThis as unknown as { __kaviarPool?: Pool };
/** sslrootcert=<file> → verified TLS with that CA (Supabase's root), resolved from the app root on any host. */
function config(): PoolConfig {
  const url = new URL(process.env.DATABASE_URL ?? "postgres://localhost:5432/kaviar");
  const ca = url.searchParams.get("sslrootcert");
  const max = process.env.VERCEL ? 5 : 10;
  if (!ca) return { connectionString: url.toString(), max };
  url.searchParams.delete("sslrootcert");
  url.searchParams.delete("sslmode");
  return { connectionString: url.toString(), max, ssl: { ca: readFileSync(join(process.cwd(), ca), "utf8"), rejectUnauthorized: true } };
}

const pool = g.__kaviarPool ?? new Pool(config());
if (process.env.NODE_ENV !== "production") g.__kaviarPool = pool;

export const db = drizzle(pool, { schema });
export type DB = typeof db;
export { schema };
