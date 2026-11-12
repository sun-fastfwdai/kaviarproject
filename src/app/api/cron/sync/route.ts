import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";
import { runScheduledSync } from "@/lib/sync/run";
import { purgePendingBrands } from "@/lib/brands/remove";

/** Hourly (vercel.json). Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: NextRequest) {
  const secret = env.cronSecret();
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return new NextResponse("unauthorized", { status: 401 });
  const purged = await purgePendingBrands();
  const result = await runScheduledSync();
  return NextResponse.json({ ok: true, brands: Object.keys(result).length, purged, result });
}

export const maxDuration = 800;
