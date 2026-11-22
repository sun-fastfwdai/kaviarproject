import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";
import { runScheduledSync } from "@/lib/sync/run";
import { purgePendingBrands } from "@/lib/brands/remove";
import { moveToStorage } from "@/lib/assets/storage";
import { runAutopilotAll } from "@/lib/growth/autopilot";
import { runStoreAll } from "@/lib/seo/run";

/** Hourly (vercel.json). Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: NextRequest) {
  const secret = env.cronSecret();
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return new NextResponse("unauthorized", { status: 401 });
  const purged = await purgePendingBrands();
  const result = await runScheduledSync();
  // Files saved before storage was switched on: move a few each hour until none are left in the database.
  const filesLeft = await moveToStorage(null, 120_000).catch(() => null);
  // After the data is fresh: each brand's one Autopilot check of the day (it skips brands already checked today).
  const autopilot = await runAutopilotAll().catch(() => null);
  // And each store's one check of the day: what Google and AI assistants can't read, written up and — where the brand allows — fixed.
  const store = await runStoreAll().catch(() => null);
  return NextResponse.json({ ok: true, brands: Object.keys(result).length, purged, filesLeft, autopilot, store, result });
}

export const maxDuration = 800;
