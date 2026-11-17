import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";
import { runScheduledSync } from "@/lib/sync/run";
import { purgePendingBrands } from "@/lib/brands/remove";
import { moveToStorage } from "@/lib/assets/storage";

/** Hourly (vercel.json). Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: NextRequest) {
  const secret = env.cronSecret();
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return new NextResponse("unauthorized", { status: 401 });
  const purged = await purgePendingBrands();
  const result = await runScheduledSync();
  // Files saved before storage was switched on: move a few each hour until none are left in the database.
  const filesLeft = await moveToStorage(null, 120_000).catch(() => null);
  return NextResponse.json({ ok: true, brands: Object.keys(result).length, purged, filesLeft, result });
}

export const maxDuration = 800;
