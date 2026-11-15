import type { DirShot, ShotPlan } from "../db/schema";

/**
 * How a professional shooter would film the clip: shooting styles (each with its camera, lens, light and edit),
 * the shot vocabulary, and the rules every plan follows. Remy plans a shot list from this; the Video node shows and edits it;
 * the video model gets it as timed shots with hard cuts.
 */
export const SIZES = ["Extreme close-up", "Close-up", "Medium close-up", "Medium shot", "Wide shot"] as const;
export const ANGLES = ["Eye level", "Slightly above", "Low angle", "High angle", "Overhead", "POV", "Over the shoulder", "Mirror"] as const;
export const CAMERA = ["Locked off", "Handheld", "Push in", "Pull back", "Pan", "Tilt", "Orbit", "Slider", "Whip pan", "Rack focus", "Follow"] as const;
export const SIZE_SHORT: Record<string, string> = { "Extreme close-up": "ECU", "Close-up": "CU", "Medium close-up": "MCU", "Medium shot": "MS", "Wide shot": "WS" };

export type Style = { key: string; name: string; group: "UGC" | "Product"; look: string; camera: string; light: string; edit: string; beats: string[] };

export const STYLES: Style[] = [
  { key: "selfie", name: "Selfie talk", group: "UGC", look: "A real customer filming themselves on their phone's front camera",
    camera: "phone front camera at arm's length, 24mm look, a little above eye level, natural micro-shake",
    light: "window light on the face, home background slightly soft", edit: "jump cuts between sentences, 1.5–3 s per shot",
    beats: ["Hook: face close to the lens, first line straight to camera", "Show: lifts the product beside the face, label to the lens", "Proof: close-up of the product in use or its texture", "Verdict: smiles to camera with the product in frame"] },
  { key: "review", name: "Creator review", group: "UGC", look: "A creator reviewing the product at their desk, phone on a tripod",
    camera: "locked-off phone on a tripod, medium close-up at eye level, plus close-up inserts from a second angle",
    light: "ring-light catchlights in the eyes, a warm lamp in the background", edit: "talking shots cut with product inserts, 2–3 s per shot",
    beats: ["Hook: holds the product up to the lens and gives the verdict first", "Insert: hands open or turn the product", "Talk: medium close-up, why it works", "End: product next to the face, label sharp"] },
  { key: "grwm", name: "Get ready with me", group: "UGC", look: "A get-ready-with-me routine at a bathroom mirror or vanity",
    camera: "phone propped on the vanity plus handheld close-ups and mirror shots", light: "soft bathroom light with a bright window",
    edit: "routine steps, match cuts on the hand movement, 1.5–2.5 s per shot",
    beats: ["Hook: at the mirror, looks into the lens", "Apply: close-up applying the product", "Texture: extreme close-up on skin or formula", "Result: finished look, product in hand"] },
  { key: "unboxing", name: "Unboxing", group: "UGC", look: "An unboxing at home, filmed on a phone",
    camera: "overhead and chest-height point of view, hands in frame, handheld", light: "daylight from a window over the table", edit: "reveal pacing, 1.5–3 s per shot",
    beats: ["Hook: overhead of the package, hands start opening it", "Reveal: hands pull the product out", "Hero: product turned to the lens, label sharp", "Reaction: selfie with the product"] },
  { key: "testimonial", name: "Testimonial", group: "UGC", look: "A seated, interview-style testimonial at home",
    camera: "50mm look, medium close-up slightly off-axis, eyes to the lens for the key line, a second closer angle",
    light: "soft key light at 45 degrees, gentle fill, a practical lamp behind", edit: "two-angle interview cuts with product cutaways, 2–4 s per shot",
    beats: ["Hook: close-up, the most surprising line first", "Before: medium close-up, what it was like before", "Cutaway: the product in their routine", "Close: eyes to the lens, product in hand"] },
  { key: "routine", name: "Day in the life", group: "UGC", look: "A day-in-the-life vlog with the product in a real routine",
    camera: "handheld phone vignettes, point-of-view inserts, one selfie moment", light: "natural light that changes with each place", edit: "fast vignettes 1–2 s each, cut on movement",
    beats: ["Hook: point of view, a hand grabs the product", "Vignette: using it at home", "Vignette: on the go", "End: selfie with the product"] },
  { key: "hero", name: "Product hero", group: "Product", look: "A premium commercial film of the product",
    camera: "85mm look, shallow depth of field, slow motorised push-in, low angle so the product feels big", light: "soft key with a rim light tracing the edges, controlled reflections",
    edit: "slow and confident, 2–5 s per shot", beats: ["Reveal: slow push-in out of soft focus", "Detail: slider along the label", "Hero: low-angle, centred, label sharp"] },
  { key: "macro", name: "Macro texture", group: "Product", look: "A macro beauty film of the product and its texture",
    camera: "100mm macro look, slow slider moves, rack focus from texture to product", light: "hard backlight for sparkle, soft fill", edit: "slow and tactile, 2–4 s per shot",
    beats: ["Texture: extreme close-up of the formula or surface", "Rack focus: from texture to the label", "Hero: product sharp with the texture around it"] },
  { key: "lifestyle", name: "Lifestyle", group: "Product", look: "The product in a styled, lived-in space",
    camera: "gimbal float through the room, a hand may enter the frame", light: "golden morning light through a window", edit: "smooth, 2–4 s per shot",
    beats: ["Establish: wide of the room, the product in place", "Hand: a hand reaches in and lifts it", "Close: label to the camera"] },
];
export const STYLE: Record<string, Style> = Object.fromEntries(STYLES.map((s) => [s.key, s]));

/** The rules every shot list follows — what separates a shot list from a prompt. */
export const PRO_RULES = [
  "Hook in the first 1–2 seconds: open on movement, a face close to the lens, or the product in motion — never a still, empty frame.",
  "Shot 1 starts from the start photo's framing, then moves.",
  "Every cut changes shot size or angle so it feels intentional; same-framing jump cuts only in selfie and vlog styles.",
  "Every camera move has a reason: push in to build attention, pull back to reveal, handheld for authenticity, locked off for trust.",
  "In at least one shot the label faces the lens, sharp and well lit, filling a third of the frame or more.",
  "Vertical 9:16: faces and the product in the centre and upper two-thirds; keep the bottom fifth and top tenth clear for captions and app buttons.",
  "Eyes to the lens on lines meant for the viewer; hands in frame whenever the product is used.",
  "Light comes from a believable source (window, lamp, ring light) and stays consistent across shots.",
  "End on a payoff frame — the product, with the person or alone, label visible — held for at least a second.",
  "UGC looks like real phone footage: no studio polish, no slow motion, natural skin texture. Product films may use smooth motion and slow-motion details.",
];

const SCENE_STYLE: Record<string, string> = {
  "Selfie talking to camera": "selfie", "Holding it up to camera": "selfie", "Unboxing at home": "unboxing", "Get ready with me": "grwm",
  "Applying it in the mirror": "grwm", "Couch testimonial": "testimonial", "Car review": "review", "Morning routine": "routine",
  "In hand": "lifestyle", "On a vanity": "hero", "Bathroom shelf": "lifestyle", "Flat lay": "macro", "Morning window light": "lifestyle", "Studio": "hero",
};
/** Auto: the style that fits the scene; a person on a product scene becomes a creator review. */
export function autoStyle(scene: string, person: boolean): string {
  const s = SCENE_STYLE[scene] ?? (person ? "review" : "hero");
  return person && STYLE[s].group === "Product" ? "review" : s;
}
/** How many shots a pro would cut a clip into. */
export const autoShots = (key: string, seconds: number) => (STYLE[key]?.group === "UGC" ? (seconds <= 5 ? 2 : seconds <= 10 ? 4 : 5) : seconds <= 5 ? 2 : seconds <= 10 ? 3 : 4);

/** Whole seconds, back to back from 0 to the clip length, each shot at least a second. */
export function fitTimes(shots: DirShot[], seconds: number): DirShot[] {
  const list = shots.slice(0, Math.max(1, Math.min(6, seconds)));
  const want = list.map((s) => Math.max(0.5, (Number(s.to) || 0) - (Number(s.from) || 0)));
  const total = want.reduce((a, b) => a + b, 0) || 1;
  let t = 0;
  return list.map((s, i) => {
    const left = list.length - 1 - i;
    const d = i === list.length - 1 ? seconds - t : Math.max(1, Math.min(seconds - t - left, Math.round((want[i] / total) * seconds)));
    const out = { ...s, from: t, to: t + d };
    t += d;
    return out;
  });
}

/** The words a plan's shots say, to compare with the voice line. */
export const planLines = (p: ShotPlan) => p.shots.map((s) => s.line?.trim() ?? "").filter(Boolean).join(" ");
const words = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").split(/\s+/).filter(Boolean).join(" ");
export const sameWords = (a: string, b: string) => words(a) === words(b) && words(a).length > 0;

/** The shot list as the video model reads it: style, camera and light, then timed shots with hard cuts. */
export function directionText(p: ShotPlan, o: { lines: boolean }): string {
  const s = STYLE[p.style] ?? STYLE.hero;
  const shots = p.shots.map((x, i) => `Shot ${i + 1} (${x.from}–${x.to}s), ${x.size.toLowerCase()}, ${x.angle.toLowerCase()}, ${x.move.toLowerCase()}: ${x.action.trim()}${o.lines && x.line?.trim() ? ` They say: "${x.line.trim()}"` : ""}`);
  return [
    `${s.look}. Camera: ${s.camera}. Light: ${s.light}. Edit: ${s.edit}.`,
    ...shots,
    `Hard cuts between shots. The same ${s.group === "UGC" ? "person, outfit and " : ""}product in every shot. No on-screen text or captions.`,
  ].join("\n");
}
