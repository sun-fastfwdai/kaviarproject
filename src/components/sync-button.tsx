"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { syncNow } from "@/app/(brand)/brands/[slug]/actions";

/** "Sync now". While any run is in progress the page refreshes itself every few seconds. */
export function SyncButton({ slug, running, disabled }: { slug: string; running: boolean; disabled?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [kicked, setKicked] = useState(false);
  const busy = running || pending || kicked;

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [busy, router]);

  useEffect(() => {
    if (!kicked) return;
    // Covers the gap until the server reports the run; after that `running` keeps the button busy.
    const t = setTimeout(() => setKicked(false), 8000);
    return () => clearTimeout(t);
  }, [kicked]);

  return (
    <button
      className="btn sm"
      disabled={disabled || busy}
      onClick={() =>
        start(async () => {
          await syncNow(slug);
          setKicked(true);
          router.refresh();
        })
      }
    >
      <svg width="14" height="14" viewBox="0 0 256 256" className={busy ? "spin" : undefined} aria-hidden>
        <path fill="currentColor" d="M197.67 186.37a8 8 0 0 1 0 11.29C196.58 198.73 170.82 224 128 224c-37.39 0-64.53-22.4-80-39.85V208a8 8 0 0 1-16 0v-48a8 8 0 0 1 8-8h48a8 8 0 0 1 0 16H55.44C67.76 183.35 93 208 128 208c36 0 58.14-21.46 58.36-21.68a8 8 0 0 1 11.31.05M216 40a8 8 0 0 0-8 8v23.85C192.53 54.4 165.39 32 128 32c-42.82 0-68.58 25.27-69.66 26.34a8 8 0 0 0 11.3 11.34C69.86 69.46 92 48 128 48c35 0 60.24 24.65 72.56 40H184a8 8 0 0 0 0 16h48a8 8 0 0 0 8-8V48a8 8 0 0 0-8-8" />
      </svg>
      {busy ? "Syncing…" : "Sync now"}
    </button>
  );
}
