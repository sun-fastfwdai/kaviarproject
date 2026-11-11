import { getTableColumns, sql, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

/** `on conflict do update set col = excluded.col` for every column except the conflict keys. */
export function excludedSet<T extends PgTable>(table: T, keep: string[] = []): Record<string, SQL> {
  const cols = getTableColumns(table) as Record<string, { name: string; primary: boolean }>;
  const set: Record<string, SQL> = {};
  for (const [key, col] of Object.entries(cols)) {
    if (keep.includes(key)) continue;
    set[key] = sql.raw(`excluded."${col.name}"`);
  }
  return set;
}
