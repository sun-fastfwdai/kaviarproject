import "server-only";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "../db";
import { END_SECONDS, captionChunks } from "./story";
import { readAssets, saveAsset } from "@/lib/assets/storage";

/**
 * The final cut, done on our server with ffmpeg: every scene trimmed to its planned length and scaled to one frame size,
 * captions burned in (sound-off viewers read the story), the scene sound kept, and an end card built from the REAL product
 * photo — so the last thing people see is the exact label, not a generated one.
 */
const FONT = join(process.cwd(), "src/lib/creative/fonts/Poppins-Bold.ttf");
const FONT_SEMI = join(process.cwd(), "src/lib/creative/fonts/Poppins-SemiBold.ttf");

export async function ffmpegPath(): Promise<string> {
  const mod = (await import("ffmpeg-static")) as unknown as { default?: string } | string;
  const p = typeof mod === "string" ? mod : mod.default;
  if (!p) throw new Error("The video editor isn’t available on this server.");
  return p;
}
export const run = (bin: string, args: string[], timeoutMs = 600_000) =>
  new Promise<{ stderr: string }>((res, rej) => execFile(bin, args, { timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 }, (err, _out, stderr) => (err ? rej(Object.assign(err, { stderr: String(stderr) })) : res({ stderr: String(stderr) }))));

/** ffmpeg prints stream info for `-i`: we read the size and whether there's audio. */
async function probe(bin: string, file: string): Promise<{ w: number; h: number; audio: boolean }> {
  const out = await run(bin, ["-hide_banner", "-i", file]).catch((e: { stderr?: string }) => ({ stderr: e.stderr ?? "" }));
  const v = /Video:.*?(\d{3,5})x(\d{3,5})/.exec(out.stderr);
  return { w: v ? Number(v[1]) : 720, h: v ? Number(v[2]) : 1280, audio: /Audio:/.test(out.stderr) };
}
const hex = (c: string, fb: string) => (/^#?[0-9a-f]{6}$/i.test(c.trim()) ? `0x${c.trim().replace("#", "")}` : fb);
const lum = (c: string) => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c.trim()); if (!m) return 0.5; const [r, g, b] = [m[1], m[2], m[3]].map((x) => parseInt(x, 16) / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };

export type CutScene = { clip: string; seconds: number; text: string };
export type CutInput = {
  scenes: CutScene[]; captions: boolean; sound: boolean; endCard: boolean;
  end: { headline: string; sub: string; cta: string; offer: string }; productImage: string | null; palette: string[];
  title: string; product: string | null;
};

export async function cutAd(brandId: string, memberId: string, input: CutInput): Promise<{ id?: string; error?: string; seconds?: number }> {
  if (!input.scenes.length) return { error: "No scene clips to cut yet." };
  const A = schema.brandAssets;
  const rows = await readAssets(and(eq(A.brandId, brandId), inArray(A.id, input.scenes.map((s) => s.clip))));
  const byId = new Map(rows.map((r) => [r.id, r]));
  if (input.scenes.some((s) => !byId.has(s.clip))) return { error: "A scene clip is missing — render the scenes again." };
  const bin = await ffmpegPath();
  const dir = await mkdtemp(join(tmpdir(), "cut-"));
  try {
    const files: string[] = [];
    for (const [i, s] of input.scenes.entries()) { const f = join(dir, `s${i}.mp4`); await writeFile(f, byId.get(s.clip)!.data); files.push(f); }
    const probes = await Promise.all(files.map((f) => probe(bin, f)));
    // One frame size for the whole ad: 1080×1920 if any scene is HD, else 720×1280.
    const W = probes.some((p) => p.h >= 1800) ? 1080 : 720, H = W === 1080 ? 1920 : 1280, k = W / 1080;
    const args: string[] = ["-hide_banner", "-y"];
    files.forEach((f) => args.push("-i", f));
    const filters: string[] = [], labels: string[] = [];
    const total = input.scenes.reduce((a, s) => a + s.seconds, 0) + (input.endCard ? END_SECONDS : 0);

    for (const [i, s] of input.scenes.entries()) {
      const sec = Math.max(1, s.seconds);
      let v = `[${i}:v]trim=0:${sec},setpts=PTS-STARTPTS,scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=30,setsar=1,format=yuv420p`;
      if (input.captions) for (const [j, c] of captionChunks(s.text, sec).entries()) {
        const tf = join(dir, `c${i}_${j}.txt`); await writeFile(tf, c.text);
        v += `,drawtext=fontfile='${FONT}':textfile='${tf}':fontsize=${Math.round(68 * k)}:fontcolor=white:borderw=${Math.round(7 * k)}:bordercolor=black@0.82:x=(w-text_w)/2:y=h*0.66:enable='between(t,${c.from},${c.to})'`;
      }
      filters.push(`${v}[v${i}]`);
      filters.push(input.sound && probes[i].audio
        ? `[${i}:a]atrim=0:${sec},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo[a${i}]`
        : `anullsrc=r=48000:cl=stereo,atrim=0:${sec}[a${i}]`);
      labels.push(`[v${i}][a${i}]`);
    }

    if (input.endCard) {
      // The end card: brand background, the real product photo, headline, sub line and the button.
      const bg = input.palette.find((c) => lum(c) > 0.78) ?? "#F4F1EC", ink = input.palette.find((c) => lum(c) < 0.22) ?? "#121212";
      const n = input.scenes.length;
      let img = -1;
      if (input.productImage) {
        try {
          const r = await fetch(input.productImage, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
          if (r.ok && /^image\//.test(r.headers.get("content-type") ?? "")) { const f = join(dir, "product"); await writeFile(f, Buffer.from(await r.arrayBuffer())); args.push("-i", f); img = n; } // one still frame: zoompan turns it into the end card's seconds
        } catch { /* the card works without the photo */ }
      }
      const t = (name: string, text: string) => { const f = join(dir, `${name}.txt`); return writeFile(f, text).then(() => f); };
      const [fh, fs, fc, fo] = await Promise.all([t("h", input.end.headline), t("s", input.end.sub), t("c", input.end.cta), t("o", input.end.offer)]);
      let card = `color=c=${hex(bg, "0xF4F1EC")}:s=${W}x${H}:r=30:d=${END_SECONDS},format=yuv420p[bg]`;
      let base = "[bg]";
      if (img >= 0) {
        card += `;[${img}:v]scale=${Math.round(W * 0.62)}:${Math.round(H * 0.42)}:force_original_aspect_ratio=decrease,format=yuva420p,zoompan=z='min(zoom+0.0007,1.04)':d=${END_SECONDS * 30}:s=${Math.round(W * 0.62)}x${Math.round(H * 0.42)}:fps=30[p];[bg][p]overlay=(W-w)/2:H*0.13:eof_action=repeat[bgp]`;
        base = "[bgp]";
      }
      const y0 = Math.round(H * 0.62), btnW = Math.round(W * 0.5), btnH = Math.round(104 * k);
      card += `;${base}drawtext=fontfile='${FONT}':textfile='${fh}':fontsize=${Math.round(76 * k)}:fontcolor=${hex(ink, "0x121212")}:x=(w-text_w)/2:y=${y0}`
        + `,drawtext=fontfile='${FONT_SEMI}':textfile='${fs}':fontsize=${Math.round(42 * k)}:fontcolor=${hex(ink, "0x121212")}@0.72:x=(w-text_w)/2:y=${y0 + Math.round(110 * k)}`
        + (input.end.offer.trim() ? `,drawtext=fontfile='${FONT_SEMI}':textfile='${fo}':fontsize=${Math.round(40 * k)}:fontcolor=${hex(ink, "0x121212")}:x=(w-text_w)/2:y=${y0 + Math.round(180 * k)}` : "")
        + `,drawbox=x=(iw-${btnW})/2:y=${y0 + Math.round(270 * k)}:w=${btnW}:h=${btnH}:color=${hex(ink, "0x121212")}:t=fill`
        + `,drawtext=fontfile='${FONT}':textfile='${fc}':fontsize=${Math.round(44 * k)}:fontcolor=white:x=(w-text_w)/2:y=${y0 + Math.round(270 * k)}+(${btnH}-text_h)/2`
        + `,fade=t=in:st=0:d=0.25[vend]`;
      filters.push(card, `anullsrc=r=48000:cl=stereo,atrim=0:${END_SECONDS}[aend]`);
      labels.push("[vend][aend]");
    }

    filters.push(`${labels.join("")}concat=n=${labels.length}:v=1:a=1[v][a]`);
    const out = join(dir, "ad.mp4");
    args.push("-filter_complex", filters.join(";"), "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", out);
    try { await run(bin, args); }
    catch (e) { console.error("cut failed", (e as { stderr?: string }).stderr?.slice(-1200)); return { error: "The cut failed — try again, or render the scenes again." }; }
    const data = await readFile(out);
    const [row] = await saveAsset({
      brandId, kind: "video", name: `${input.title.slice(0, 40) || "Ad"} · full ad`, mime: "video/mp4", size: data.byteLength, data,
      meta: { ai: true, prompt: input.title.slice(0, 500), product: input.product ?? undefined, seconds: total, engine: "Kaviar · final cut", sound: input.sound },
      createdBy: memberId,
    });
    return { id: row.id, seconds: total };
  } finally { await rm(dir, { recursive: true, force: true }).catch(() => undefined); }
}
