/**
 * "Behind the product": which pixels of a photo are the subject (product, hands, props) and which are the backdrop, so type can sit
 * behind the subject. Ad photos are shot on smooth backdrops, so the backdrop at any pixel is predicted from the photo's left and right
 * edges on that row; a pixel is subject when it leaves the backdrop's colour by more than light and shade would explain.
 * Pure — the Editor runs it on canvas pixels, the server on ffmpeg's output — so both draw the same card.
 */
export type Mask = { w: number; h: number; a: Float32Array };
export const MASK_W = 216;

const median = (v: number[]) => { const s = v.slice().sort((a, b) => a - b); return s[s.length >> 1]; };
const step = (lo: number, hi: number, x: number) => { const t = Math.min(1, Math.max(0, (x - lo) / (hi - lo))); return t * t * (3 - 2 * t); };
function blur(a: Float32Array, w: number, h: number, r: number): Float32Array {
  const t = new Float32Array(a.length), o = new Float32Array(a.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0, n = 0; for (let k = -r; k <= r; k++) { const xx = x + k; if (xx >= 0 && xx < w) { s += a[y * w + xx]; n++; } } t[y * w + x] = s / n; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0, n = 0; for (let k = -r; k <= r; k++) { const yy = y + k; if (yy >= 0 && yy < h) { s += t[yy * w + x]; n++; } } o[y * w + x] = s / n; }
  return o;
}

/** Subject mask (0 backdrop … 1 subject) for RGBA pixels of a small copy of the photo (about MASK_W wide). */
export function subjectMask(px: ArrayLike<number>, w: number, h: number): Mask {
  // The backdrop's colour on each row, at the left and right edge: the mean of a thin strip, then a running median down the rows so a
  // prop or a hand touching the edge on a few rows doesn't change it.
  const strip = Math.max(2, Math.round(w * 0.04)), win = Math.max(3, Math.round(h * 0.07));
  const edge = (x0: number) => {
    const raw: number[][] = [[], [], []];
    for (let y = 0; y < h; y++) for (let c = 0; c < 3; c++) { let s = 0; for (let x = x0; x < x0 + strip; x++) s += px[(y * w + x) * 4 + c]; raw[c].push(s / strip); }
    return raw.map((ch) => ch.map((_, y) => median(ch.slice(Math.max(0, y - win), Math.min(h, y + win + 1)))));
  };
  const L = edge(0), R = edge(w - strip);
  const a = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = x / (w - 1), i = (y * w + x) * 4;
    const pr = L[0][y] + (R[0][y] - L[0][y]) * t, pg = L[1][y] + (R[1][y] - L[1][y]) * t, pb = L[2][y] + (R[2][y] - L[2][y]) * t;
    const r = px[i], g = px[i + 1], b = px[i + 2];
    const yp = 0.299 * pr + 0.587 * pg + 0.114 * pb, yc = 0.299 * r + 0.587 * g + 0.114 * b;
    // Light and shade move a backdrop colour toward white or black; measure how far the pixel is from that line, plus any change in
    // brightness beyond what a soft shadow or glow makes.
    const tv = yc >= yp ? 255 : 0, vr = tv - pr, vg = tv - pg, vb = tv - pb, ur = r - pr, ug = g - pg, ub = b - pb;
    const vv = vr * vr + vg * vg + vb * vb || 1, k = Math.min(1, Math.max(0, (ur * vr + ug * vg + ub * vb) / vv));
    const perp = Math.hypot(ur - k * vr, ug - k * vg, ub - k * vb) / 255, dl = Math.abs(yc - yp) / 255;
    a[y * w + x] = perp * 2.2 + Math.max(0, dl - 0.13) * 2.2;
  }
  // Smooth, cut, then smooth and cut again: closes small holes inside the subject and drops specks in the backdrop.
  const first = blur(a, w, h, 1).map((v) => step(0.07, 0.17, v));
  const out = blur(Float32Array.from(first), w, h, 2).map((v) => step(0.32, 0.62, v));
  return { w, h, a: Float32Array.from(out) };
}

/** How much of a horizontal band (y0…y1, fractions of the height) the subject covers — tells whether a word can safely go behind it. */
export function coverage(m: Mask, y0: number, y1: number): number {
  const a = Math.max(0, Math.floor(y0 * m.h)), b = Math.min(m.h, Math.ceil(y1 * m.h));
  let s = 0;
  for (let i = a * m.w; i < b * m.w; i++) s += m.a[i];
  return b > a ? s / ((b - a) * m.w) : 0;
}
/** A band of clean backdrop with some subject in it: the backdrop is readable (not most of the band) and something overlaps the type. */
export const canGoBehind = (cover: number) => cover > 0.015 && cover < 0.5;

/** The band (fractions of the artboard height) that layers set behind the subject occupy. */
export function behindBand(layers: { y: number; size: number; text: string; w: number; behind?: boolean }[], W: number, H: number): { y0: number; y1: number } | null {
  const b = layers.filter((l) => l.behind && l.text.trim());
  if (!b.length) return null;
  const bottom = (l: (typeof b)[number]) => l.y + (Math.max(1, Math.ceil((l.text.length * l.size * 0.5) / (l.w * W))) * l.size * 1.2) / H;
  return { y0: Math.max(0, Math.min(...b.map((l) => l.y)) - 0.01), y1: Math.min(1, Math.max(...b.map(bottom)) + 0.01) };
}
