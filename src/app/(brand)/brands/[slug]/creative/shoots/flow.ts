import type { IconName } from "@/components/icon";
import type { ShootFlow, ShootSource } from "@/lib/db/schema";

/** Board 17c colours: node categories (Cleo · Remy · Otto) and the four inputs a prompt phrase can come from. */
export const SEL = "#1AA7C8";
export const CAT = { in: "#22A46E", make: "#1AA7C8", edit: "#8B8883", fin: "#EB7A3C" } as const;
export const TOK: Record<Exclude<ShootSource, "none">, string> = { product: "#22A46E", data: "#6A8FD6", brand: "#B7791F", wins: "#1AA7C8" };

export type NodeKey = "product" | "data" | "brand" | "wins" | "reference" | "prompt" | "photo" | "video" | "sound" | "check" | "send";
type Agent = "builder" | "catalog" | "qa" | "analyst";
export type NodeDef = { cat: keyof typeof CAT; icon: IconName; kind: string; name: string; does: string; sub: string; lib: string; agent: Agent | null; optional?: boolean;
  ins: string; outs: string; settings: string; example: string; cost: string };

/** Every node type, defined once: the canvas, the inspector, the library and the node-types page all read this. */
export const NODES: Record<NodeKey, NodeDef> = {
  product: { cat: "in", icon: "bag", kind: "PRODUCT", name: "Product", sub: "Input · Cleo brings it from Shopify", lib: "Shopify photo, price, stock", agent: "catalog",
    does: "Brings a Shopify product into the shoot and keeps its label and shape exact.", ins: "—", outs: "photo · price · stock", settings: "product · lock (always on)", example: "Best-seller · its Shopify photo", cost: "free" },
  data: { cat: "in", icon: "lightning", kind: "DATA", name: "Data signal", sub: "Input · Iris reads it", lib: "a Shopify or Meta number", agent: "analyst",
    does: "Brings a Shopify or Meta number into the shoot, so the scene fits the people who will see the ad.", ins: "—", outs: "who it’s for · rules for the scene", settings: "signal · rules · flag when it changes", example: "Lapsed buyers → “already at home”", cost: "free" },
  brand: { cat: "in", icon: "palette", kind: "BRAND", name: "Brand kit", sub: "Input · from the brand profile", lib: "look, tone, rules", agent: null,
    does: "Applies the brand’s look and rules to everything downstream.", ins: "—", outs: "colours · light · tone · don’ts", settings: "strict or loose · rules", example: "Warm palette · no claims", cost: "free" },
  wins: { cat: "in", icon: "chart-bar", kind: "WHAT WINS", name: "What wins", sub: "Input · Iris’s lessons from Insights", lib: "lessons from Insights", agent: "analyst",
    does: "Feeds lessons from Insights so new shoots copy what already sells.", ins: "—", outs: "winning hooks · formats · angles", settings: "strong lessons only", example: "Hook: question openers win", cost: "free" },
  reference: { cat: "in", icon: "image", kind: "REFERENCE", name: "Reference", sub: "Input · Remy reads its style", lib: "any brand photo", agent: "builder", optional: true,
    does: "Adds any brand photo as a style or pose to follow.", ins: "—", outs: "style · pose · composition", settings: "which photo · how closely to follow", example: "A flatlay from the brand deck · loose", cost: "included" },
  prompt: { cat: "make", icon: "pen", kind: "PROMPT", name: "Prompt", sub: "Make · Remy writes it", lib: "Remy writes it from the inputs", agent: "builder",
    does: "Remy writes the prompt from every input and shows where each phrase came from.", ins: "any inputs", outs: "prompt text", settings: "length · edit by hand", example: "“A hand lifts the bottle from a vanity…”", cost: "included" },
  photo: { cat: "make", icon: "image", kind: "PHOTO", name: "Photo", sub: "Make · Remy runs it", lib: "FLUX Kontext · product locked", agent: "builder",
    does: "Makes product photos from the prompt with the real product as reference.", ins: "prompt · product", outs: "photos", settings: "scene · size · count", example: "In hand · 4:5 × 4", cost: "" },
  video: { cat: "make", icon: "video", kind: "VIDEO", name: "Video", sub: "Make · Remy runs it", lib: "Kling · from a photo", agent: "builder", optional: true,
    does: "Turns a start frame into a short clip with a camera move. The product’s label and shape stay exact.", ins: "start frame · prompt", outs: "clips", settings: "move · length · size · count", example: "Dolly in · 5s · 9:16", cost: "" },
  sound: { cat: "make", icon: "music", kind: "SOUND", name: "Voice + music", sub: "Make · ElevenLabs", lib: "ElevenLabs · not connected", agent: null, optional: true,
    does: "Makes the voice-over and music track for videos.", ins: "script · language", outs: "voice · music", settings: "voice · language · mood", example: "Warm voice · calm morning music", cost: "needs ElevenLabs" },
  check: { cat: "fin", icon: "seal-check", kind: "CHECK", name: "Check", sub: "Finish · Otto checks every result", lib: "Otto: label, shape, brand", agent: "qa",
    does: "Otto checks every photo next to the real product before a person sees it.", ins: "photos", outs: "passed · flagged", settings: "label · shape · colours · no added text", example: "Photo 3 flagged: label off → re-run", cost: "included" },
  send: { cat: "fin", icon: "squares", kind: "SEND TO", name: "Send to", sub: "Finish · you decide", lib: "a batch or brand assets", agent: null,
    does: "Decides where finished results go: a batch’s ads, or brand assets for the Editor.", ins: "passed results", outs: "a batch · brand assets", settings: "destination · which photos", example: "5 photos → Win-back batch", cost: "free" },
};

export const LIBRARY: [string, keyof typeof CAT, NodeKey[]][] = [
  ["Inputs", "in", ["product", "data", "brand", "wins", "reference"]],
  ["Make", "make", ["prompt", "photo", "video", "sound"]],
  ["Finish", "fin", ["check", "send"]],
];

/** Templates are built on a data signal: picking one sets the signal and names the shoot. */
export const TEMPLATES: Record<string, string> = {
  lapsed: "Win-back shoot", reorder: "Reorder shoot", "best-sellers": "Best-sellers shoot", "top-customers": "Top customers shoot",
  repeat: "Repeat buyers shoot", bundles: "Bundle shoot", consented: "Retarget shoot",
};
export const templateName = (key: string | null) => (key && TEMPLATES[key]) || "Product shoot";

/** Where each signal's number comes from, in words. */
export const FIELDS: Record<string, string[]> = {
  lapsed: ["Customers · last order date", "Orders · products bought", "Orders · discount codes"],
  reorder: ["Orders · first and second order dates", "Orders · products"],
  "best-sellers": ["Orders · units sold, 30 days", "Products"],
  "top-customers": ["Customers · total spent"],
  repeat: ["Customers · number of orders"],
  bundles: ["Orders · products bought together"],
  consented: ["Customers · email consent"],
};

export const SCENES = ["In hand", "On a vanity", "Bathroom shelf", "Flat lay", "Morning window light", "Studio"];
export const MOVES: [string, string][] = [["Dolly in", "Slow dolly in towards the product."], ["Orbit", "Slow orbit around the product."], ["Macro", "Macro close-up drifting across the label."],
  ["Hand reveal", "A hand reaches in and lifts the product."], ["Slow push", "Very slow push in, almost still."], ["Still", "Locked-off camera, only light and small details move."]];

export const defaultFlow = (template: string | null, product: string | null): ShootFlow => ({
  template, product, off: ["reference"], rules: [], brandRules: ["no claims", "no before/after"], strict: true, strongOnly: false, rerun: true, reference: null,
  prompt: "", segments: null, promptFor: null, length: "medium", scene: "In hand", aspect: "4:5", n: 4,
  video: { move: "Dolly in", seconds: 5, aspect: "9:16", n: 1, from: null }, send: null, picked: null, last: null,
});

// ---------------------------------------------------------------- canvas geometry (board 17c, canvas pixels)
const C1 = 18, C2 = 232, C3 = 446, C4 = 664;
export const BOX: Record<NodeKey, [number, number, number, number]> = {
  product: [C1, 18, 186, 176], data: [C1, 210, 186, 136], brand: [C1, 362, 186, 114], wins: [C1, 492, 186, 140], reference: [C1, 648, 186, 120],
  prompt: [C2, 150, 186, 300], sound: [C2, 486, 186, 116],
  photo: [C3, 18, 192, 246], video: [C3, 296, 192, 266],
  check: [C4, 120, 196, 186], send: [C4, 346, 196, 146],
};
export const CANVAS = { w: 880, h: 660, hRef: 790 };
/** from, to, where on the target's left edge, token colour */
export const WIRES: [NodeKey, NodeKey, number | null, Exclude<ShootSource, "none"> | "make" | "fin"][] = [
  ["product", "prompt", 70, "product"], ["data", "prompt", 125, "data"], ["brand", "prompt", 180, "brand"], ["wins", "prompt", 235, "wins"], ["reference", "prompt", 270, "brand"],
  ["prompt", "photo", null, "make"], ["prompt", "video", 100, "make"], ["sound", "video", 216, "make"],
  ["photo", "check", 60, "fin"], ["video", "check", 130, "fin"],
];
