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

/** A product alone on a plain background: the background (`bg`, null when see-through) and where the product sits in the picture. */
export type Packshot = { bg: string | null; crop: { x: number; y: number; w: number; h: number } };
/**
 * Reads a small RGBA copy of a picture. A store's product photo — every corner see-through, or every corner the same near-white —
 * comes back with the box the product fills, so a card can set the product large instead of carrying the photo's empty margins.
 * Anything else (a scene, a person, a coloured backdrop) is null and fills the card as a photo.
 */
export function packshotOf(px: Uint8Array, w: number, h: number): Packshot | null {
  if (w < 8 || h < 8 || px.length < w * h * 4) return null;
  const at = (x: number, y: number) => { const i = (y * w + x) * 4; return { r: px[i], g: px[i + 1], b: px[i + 2], a: px[i + 3] }; };
  const k = Math.max(2, Math.round(w * 0.05));
  const corner = (x0: number, y0: number) => {
    let r = 0, g = 0, b = 0, a = 0;
    for (let y = y0; y < y0 + k; y++) for (let x = x0; x < x0 + k; x++) { const p = at(x, y); r += p.r; g += p.g; b += p.b; a += p.a; }
    const n = k * k; return { r: r / n, g: g / n, b: b / n, a: a / n };
  };
  const cs = [corner(0, 0), corner(w - k, 0), corner(0, h - k), corner(w - k, h - k)];
  const clear = cs.every((c) => c.a < 40);
  let bg: { r: number; g: number; b: number } | null = null;
  if (!clear) {
    if (cs.some((c) => c.a < 215)) return null;
    const ls = cs.map((c) => (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255);
    if (Math.min(...ls) < 0.84 || Math.max(...ls) - Math.min(...ls) > 0.05) return null;
    bg = { r: cs.reduce((n, c) => n + c.r, 0) / 4, g: cs.reduce((n, c) => n + c.g, 0) / 4, b: cs.reduce((n, c) => n + c.b, 0) / 4 };
  }
  // The product: every pixel that is not background. A row or column counts once a few of its pixels are product, so specks don't widen the box.
  const rows = new Uint16Array(h), cols = new Uint16Array(w);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = at(x, y);
    const on = bg ? p.a > 128 && Math.abs(p.r - bg.r) + Math.abs(p.g - bg.g) + Math.abs(p.b - bg.b) > 36 : p.a > 48;
    if (on) { rows[y]++; cols[x]++; }
  }
  const need = 2, first = (v: Uint16Array) => v.findIndex((n) => n >= need), last = (v: Uint16Array) => { for (let i = v.length - 1; i >= 0; i--) if (v[i] >= need) return i; return -1; };
  const x0 = first(cols), x1 = last(cols), y0 = first(rows), y1 = last(rows);
  if (x0 < 0 || y0 < 0 || x1 - x0 < w * 0.06 || y1 - y0 < h * 0.06) return null;
  // A product that fills the frame edge to edge is a crop of a scene, not a product shot.
  const touches = [x0 === 0, x1 === w - 1, y0 === 0, y1 === h - 1].filter(Boolean).length;
  if (touches >= 3) return null;
  const pad = 0.012, cl = (n: number) => Math.min(1, Math.max(0, n));
  const cx = cl(x0 / w - pad), cy = cl(y0 / h - pad);
  const hex = bg ? `#${[bg.r, bg.g, bg.b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}` : null;
  return { bg: hex, crop: { x: cx, y: cy, w: cl((x1 + 1) / w + pad) - cx, h: cl((y1 + 1) / h + pad) - cy } };
}

/**
 * Where a product shot is drawn: the picture (`ar` = its width ÷ height) scaled so its `crop` fills `box` without distortion, centred
 * and standing on the box's floor. All in pixels: `clip` is the window, `img` the whole picture placed inside that window.
 */
export function placeProduct(box: { x: number; y: number; w: number; h: number }, crop: { x: number; y: number; w: number; h: number } | null | undefined, ar: number, W: number, H: number) {
  const c = crop ?? { x: 0, y: 0, w: 1, h: 1 }, bw = box.w * W, bh = box.h * H;
  // the picture's size at scale 1 is (ar, 1): the crop is (c.w·ar, c.h)
  const s = Math.min(bw / (c.w * ar), bh / c.h), cw = c.w * ar * s, ch = c.h * s;
  const left = box.x * W + (bw - cw) / 2, top = box.y * H + (bh - ch);
  return { clip: { left, top, width: cw, height: ch }, img: { left: -c.x * ar * s, top: -c.y * s, width: ar * s, height: s } };
}
