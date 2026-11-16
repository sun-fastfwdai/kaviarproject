import type { Story, StoryScene } from "../db/schema";

/**
 * A full ad, the way ad studios build one: a storyboard (hook → story → product → proof → ask) written from the brand's data,
 * a keyframe per scene (the product and person locked in a still), each scene animated on its own, then one cut with captions
 * and an end card that uses the real product photo. Shared by Remy (server), the Storyboard node and the Final cut (client + server).
 */
export const LENGTHS = [15, 30, 45, 60] as const;
export const END_SECONDS = 3;
export const SCENE_MIN = 4; // the video model's shortest clip
export const SCENE_MAX = 10;

export const FRAMEWORKS: [string, string, string][] = [
  ["auto", "Auto", "Remy picks from the product, the buyer and what already sells"],
  ["pas", "Problem → solution", "Name the problem, show the product fixing it, prove it, ask"],
  ["demo", "Hook → demo → proof", "Stop the scroll, show it working, give a reason to believe"],
  ["testimonial", "Testimonial", "A real-feeling customer tells their story on camera"],
  ["routine", "Routine", "The product inside a daily ritual, step by step"],
  ["unboxing", "Unboxing", "First impressions, from the box to the first use"],
  ["reasons", "3 reasons", "Three quick reasons to buy, one per scene"],
  ["compare", "Switch story", "Why they switched from what they used before — no rivals named"],
];
export const LOOKS: [string, string, string][] = [
  ["mixed", "UGC + product shots", "A person filming on their phone, cut with clean product shots — usually the best performer"],
  ["ugc", "All UGC", "Phone footage only, as if a customer made it"],
  ["commercial", "Commercial", "Polished and cinematic, a brand film"],
];
export const PURPOSES = ["Hook", "Problem", "Solution", "Demo", "Proof", "Offer", "CTA"] as const;
export const CTAS = ["Shop now", "Learn more", "Get offer", "Order now", "See more"] as const;

export const frameworkName = (k: string) => FRAMEWORKS.find(([x]) => x === k)?.[1] ?? "Auto";
export const lookName = (k: string) => LOOKS.find(([x]) => x === k)?.[1] ?? "UGC + product shots";
export const storySeconds = (s: Story) => s.scenes.reduce((a, x) => a + x.seconds, 0) + END_SECONDS;
/** How many scenes a pro would cut this length into (each 4–10 s, plus the end card). */
export const sceneCount = (length: number) => (length <= 15 ? 3 : length <= 30 ? 5 : length <= 45 ? 7 : 9);
/** Scenes where the person speaks on camera — the rest carry the story in captions (most people watch muted). */
export const talkingScenes = (length: number) => (length <= 15 ? 1 : length <= 30 ? 2 : 3);

const LOOK_LINE: Record<string, (person: boolean) => string> = {
  ugc: () => "Vertical 9:16 smartphone footage, handheld with natural micro-shake, real home light, authentic and unpolished.",
  commercial: () => "Vertical 9:16 cinematic commercial, smooth gimbal and slider moves, shallow depth of field, soft key light with a rim light.",
  mixed: (person) => (person ? "Vertical 9:16 smartphone footage of a real customer, handheld, natural home light, authentic." : "Vertical 9:16 clean product shot, smooth slow camera move, soft studio-quality light, shallow depth of field."),
};

/** The still the scene starts from: the person and the real product locked in, framed for the move that follows. */
export function keyframePrompt(s: Story, x: StoryScene, withCharacter: boolean): string {
  const look = s.look === "commercial" ? "Cinematic advertising photograph" : x.person || s.look === "ugc" ? "Candid smartphone photo" : "Clean product photograph";
  return [
    `${look}, vertical 9:16. ${x.keyframe}`,
    `Continuity: ${s.bible}`,
    "The product exactly as in the first reference image — same shape, label and colours, label readable when it faces the camera.",
    withCharacter && x.person ? "The person is exactly the one in the character sheet: same face, hair and outfit." : "",
    "Photorealistic. No added text, captions, logos or watermarks.",
  ].filter(Boolean).join("\n");
}

/** What the video model is asked to film for one scene (it starts from the keyframe). */
export function scenePrompt(s: Story, x: StoryScene): string {
  return [
    LOOK_LINE[s.look]?.(x.person) ?? LOOK_LINE.mixed(x.person),
    `Camera: ${x.camera}.`,
    `Action: ${x.motion}`,
    x.line.trim() ? `The person says to camera, lips in sync, natural and unscripted-sounding: "${x.line.trim()}"` : "Nobody speaks.",
    `Continuity: ${s.bible}`,
    "Keep the product exactly as in the first frame — same label, shape and colours. No on-screen text.",
  ].join("\n");
}

/** The scene's sound: the line in the person's voice, or room tone only. Music goes on in the cut, not per scene. */
export const sceneSound = (s: Story, x: StoryScene, brandVoice: boolean) =>
  x.line.trim() ? `natural room sound, no music; ${brandVoice ? "the reference voice" : s.voice || "a warm, natural voice"} says: "${x.line.trim().slice(0, 160)}"` : "natural ambient sound of the place only, no speech, no music";

/** Split caption text into 2–4 word chunks timed across the scene (sound-off viewers read the story). */
export function captionChunks(text: string, seconds: number): { text: string; from: number; to: number }[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (!words.length) return [];
  const per = words.length <= 4 ? words.length : words.length <= 8 ? Math.ceil(words.length / 2) : 3;
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += per) chunks.push(words.slice(i, i + per).join(" "));
  const start = 0.25, end = Math.max(start + 0.8, seconds - 0.2), step = (end - start) / chunks.length;
  return chunks.map((t, i) => ({ text: t, from: +(start + i * step).toFixed(2), to: +(start + (i + 1) * step).toFixed(2) }));
}
