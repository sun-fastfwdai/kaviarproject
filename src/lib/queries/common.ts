import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { db } from "../db";

export async function rows<T>(q: SQL): Promise<T[]> {
  return (await db.execute(q)).rows as T[];
}
export async function one<T>(q: SQL): Promise<T> {
  return (await rows<T>(q))[0];
}

/** First instant of the window [today - days + 1, now] in the brand's time zone. */
export const since = (tz: string, days: number) =>
  sql`(((now() at time zone ${tz})::date - ${days - 1}::int)::timestamp at time zone ${tz})`;
export const sinceDate = (tz: string, days: number) => sql`((now() at time zone ${tz})::date - ${days - 1}::int)`;

/** Orders that count as sales. */
export const SALE = sql`not o.test and o.cancelled_at is null`;

export const RANGES = [7, 30, 90] as const;
export const parseRange = (v: string | string[] | undefined): number => {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return (RANGES as readonly number[]).includes(n) ? n : 30;
};
