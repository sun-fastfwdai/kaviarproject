import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// One pool per server instance (kept across dev hot reloads).
const g = globalThis as unknown as { __kaviarPool?: Pool };
const pool =
  g.__kaviarPool ??
  new Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://localhost:5432/kaviar", max: 10 });
if (process.env.NODE_ENV !== "production") g.__kaviarPool = pool;

export const db = drizzle(pool, { schema });
export type DB = typeof db;
export { schema };
