import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";
import { runScheduledSync } from "@/lib/sync/run";

/** Hourly (vercel.json). Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: NextRequest) {
  const secret = env.cronSecret();
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return new NextResponse("unauthorized", { status: 401 });
  const result = await runScheduledSync();
  return NextResponse.json({ ok: true, brands: Object.keys(result).length, result });
}

export const maxDuration = 800;
