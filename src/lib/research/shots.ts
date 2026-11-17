import "server-only";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { schema } from "../db";
import { ask } from "../ai/client";
import { imageSize, toJpeg } from "../audience/media";
import type { LibAd } from "./types";
import { readAssets, saveAsset } from "@/lib/assets/storage";

/**
 * US-only ads aren't in Meta's API, but they are on the Ad Library website. The team screenshots a results page (or one ad);
 * Iris transcribes each ad card exactly as printed — Library ID, start date, platforms, who ran it, the text and link — and we cut
 * each card's picture out of the screenshot. Nothing is estimated: what isn't legible stays empty, and every ad links back to Meta.
 */
const Ad = z.object({
  libraryId: z.string().describe("The digits after 'Library ID:' exactly as printed; empty if not shown or not fully legible"),
  advertiser: z.string().describe("The Page that ran it (the name before 'with', or the only name)"),
  partner: z.string().describe("The brand after 'with' in a partnership ad; empty if none"),
  status: z.enum(["active", "inactive", "unknown"]),
  started: z.string().describe("The 'Started running on' date as YYYY-MM-DD; empty if not shown"),
  platforms: z.array(z.enum(["facebook", "instagram", "messenger", "audience_network", "threads", "whatsapp"])).describe("From the Platforms icons"),
  copies: z.number().describe("N from 'N ads use this creative and text'; 1 if that line isn't shown"),
  text: z.string().describe("The ad's own text, word for word as far as it is visible (keep emojis and hashtags)"),
  headline: z.string().describe("The bold headline under the picture, if any"),
  cta: z.string().describe("The button text, e.g. Shop now"),
  domain: z.string().describe("The small link caption under the picture, e.g. WWW.AMAZON.COM"),
  format: z.enum(["image", "video", "carousel", "text", "unknown"]).describe("video if there's a play button; carousel if several pictures side by side"),
  box: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).describe("The ad's picture or video area as fractions (0–1) of the image's width and height: left, top, width, height"),
  cut: z.boolean().describe("True when the card's picture is cut off by the image's edge"),
});
const ShotOut = z.object({
  kind: z.enum(["ad library", "single ad", "not an ad"]).describe("An Ad Library results page, one ad (Ad Library details, a feed, a story), or something else"),
  ads: z.array(Ad),
});

const SYSTEM = `You transcribe screenshots of Meta ads — usually the Meta Ad Library website — for Kaviar's research analyst. You are a careful copyist, not an analyst:
- Copy what is printed. Never guess, complete or "fix" text. A field you can't read fully stays empty.
- One entry per ad card, in reading order (left to right, then top to bottom). Skip cards whose text and picture are both cut off.
- Library IDs are long numbers: copy every digit or leave it empty.
- The box is the picture or video area of the card only (not the header with the Library ID), in fractions of the whole image.`;

/** Tall full-page screenshots are read in overlapping slices, so small print stays legible. */
function slices(w: number, h: number): { y: number; h: number }[] {
  if (h <= w * 1.35) return [{ y: 0, h: 1 }];
  const step = (w * 1.05) / h, span = (w * 1.25) / h, out: { y: number; h: number }[] = [];
  for (let y = 0; y < 1; y += step) { out.push({ y, h: Math.min(span, 1 - y) }); if (y + span >= 1) break; }
  return out;
}

const iso = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)) ? `${d}T00:00:00+0000` : null);
const A = schema.brandAssets;

/** Reads one screenshot (a brand asset) into ad cards; each card's picture is stored as its own copy. */
export async function readShot(brandId: string, assetId: string, competitor: string): Promise<{ ads: LibAd[]; note: string }> {
  const [shot] = await readAssets(and(eq(A.id, assetId), eq(A.brandId, brandId)));
  if (!shot) throw new Error("The screenshot is gone.");
  const buf = Buffer.from(shot.data);
  const size = await imageSize(buf);
  const parts = size ? slices(size.w, size.h) : [{ y: 0, h: 1 }];
  const seen = new Set<string>(), ads: LibAd[] = [];
  let kind = "";
  for (const [pi, p] of parts.entries()) {
    const img = parts.length === 1 && buf.length < 3_500_000 && /^image\/(png|jpeg|webp)$/.test(shot.mime) ? { data: buf, mime: shot.mime } : { data: await toJpeg(buf, 1600, { x: 0, y: p.y, w: 1, h: p.h }), mime: "image/jpeg" };
    if (!img.data) continue;
    const out = await ask("iris", {
      system: SYSTEM,
      content: [
        { type: "image", source: { type: "base64", media_type: img.mime as "image/png", data: img.data.toString("base64") } },
        { type: "text", text: `Transcribe every ad card in this ${parts.length > 1 ? `slice (${pi + 1} of ${parts.length}) of a tall screenshot` : "screenshot"}.${competitor ? ` The team filed it under “${competitor}”.` : ""}` },
      ],
      schema: ShotOut, maxTokens: 12000,
    });
    if (!out) continue;
    kind ||= out.kind;
    for (const a of out.ads) {
      const key = a.libraryId.replace(/\D/g, "") || `${a.advertiser}|${a.text.slice(0, 60)}`.toLowerCase();
      if (!a.text && !a.libraryId) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      const id = /^\d{8,20}$/.test(a.libraryId.replace(/\D/g, "")) ? a.libraryId.replace(/\D/g, "") : `shot-${assetId.slice(0, 8)}-${ads.length + 1}`;
      // The picture, cut from this slice: a little margin, never past the edges.
      let media: LibAd["media"] = a.format === "text" ? { kind: "text", asset: null } : null;
      const b = a.box;
      if (!a.cut && a.format !== "text" && b.w > 0.04 && b.h > 0.03 && b.x >= 0 && b.y >= 0 && b.x + b.w <= 1.02 && b.y + b.h <= 1.02) {
        const crop = { x: b.x, y: p.y + b.y * p.h, w: Math.min(b.w, 1 - b.x), h: Math.min(b.h * p.h, 1 - (p.y + b.y * p.h)) };
        const jpg = await toJpeg(buf, 640, crop);
        if (jpg) {
          const [row] = await saveAsset({ brandId, kind: "competitor", name: `${a.advertiser || competitor || "Ad"} · from a screenshot`.slice(0, 80), mime: "image/jpeg", size: jpg.length, data: jpg,
            meta: { competitor, libId: id, format: a.format, source: "shot", tile: pi } });
          media = { kind: a.format === "unknown" ? "image" : a.format, asset: row.id };
        }
      }
      ads.push({
        id, page: a.advertiser || competitor || "Unknown", partner: a.partner || null, start: iso(a.started), stop: null,
        bodies: a.text ? [a.text.slice(0, 1200)] : [], titles: a.headline ? [a.headline] : [], descriptions: [], captions: a.domain ? [a.domain.toLowerCase()] : [],
        platforms: a.platforms.map((x) => x.toUpperCase()), languages: [], reach: null, copies: Math.max(1, Math.round(a.copies || 1)),
        media, from: "shot", shot: assetId, rank: ads.length + 1, cta: a.cta || null, status: a.status === "unknown" ? null : a.status,
      });
    }
  }
  const note = !ads.length ? (kind === "not an ad" ? "This doesn’t look like an ad — try a screenshot of the Ad Library." : "No ad cards could be read — try a sharper or closer screenshot.")
    : `${ads.length} ad${ads.length === 1 ? "" : "s"} read · ${ads.filter((a) => /^\d+$/.test(a.id)).length} with a Library ID`;
  return { ads, note };
}
