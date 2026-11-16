import type { IconName } from "@/components/icon";
import type { ShootEdge, ShootFlow, ShootFlowV1, ShootNode, ShootNodeCfg, ShootSource } from "@/lib/db/schema";

/** Board 17c colours: node categories (Cleo · Remy · Otto) and the four inputs a prompt phrase can come from. */
export const SEL = "#1AA7C8";
export const CAT = { in: "#22A46E", make: "#1AA7C8", edit: "#8B8883", fin: "#EB7A3C" } as const;
export const TOK: Record<Exclude<ShootSource, "none">, string> = { product: "#22A46E", data: "#6A8FD6", brand: "#B7791F", wins: "#1AA7C8", character: "#C2577D" };

export type NodeKey = ShootNode["type"];
type Agent = "builder" | "catalog" | "qa" | "analyst";
export type NodeDef = { cat: keyof typeof CAT; icon: IconName; kind: string; name: string; does: string; sub: string; lib: string; agent: Agent | null; optional?: boolean;
  ins: string; outs: string; settings: string; example: string; cost: string };

/** Every node type, defined once: the canvas, the inspector, the library and the node-types page all read this. */
export const NODES: Record<NodeKey, NodeDef> = {
  product: { cat: "in", icon: "bag", kind: "PRODUCT", name: "Product", sub: "Input · Cleo brings it from Shopify", lib: "Shopify photo, price, stock", agent: "catalog",
    does: "Brings a Shopify product into the shoot and keeps its label and shape exact.", ins: "—", outs: "photo · price · stock", settings: "product · lock (always on)", example: "Best-seller · its Shopify photo", cost: "free" },
  character: { cat: "in", icon: "user", kind: "CHARACTER", name: "Character", sub: "Input · the person in the ad", lib: "a person for UGC and lifestyle", agent: "builder", optional: true,
    does: "A consistent person for the ads: a character sheet Kaviar makes, or photos of a real creator. Wire it in and they hold or use the product.", ins: "—", outs: "the same face, hair and look", settings: "who they are · sheet or real photos", example: "Woman, early 30s, natural makeup → holds the serum to camera", cost: "one photo per sheet" },
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
  story: { cat: "make", icon: "rows", kind: "STORYBOARD", name: "Storyboard", sub: "Make · Remy directs it", lib: "a full ad: script, scenes, keyframes", agent: "builder", optional: true,
    does: "Writes a whole ad from every input — hook, story, what’s said, captions and end card — then makes a keyframe for each scene with the real product and person.", ins: "product · person · data · brand · wins", outs: "scenes", settings: "length · story · look · hooks", example: "30s · Problem → solution · 5 scenes", cost: "keyframes, one photo each" },
  photo: { cat: "make", icon: "image", kind: "PHOTO", name: "Photo", sub: "Make · Remy runs it", lib: "product photo locked", agent: "builder",
    does: "Makes product photos from the prompt with the real product as reference.", ins: "prompt · product", outs: "photos", settings: "scene · size · count", example: "In hand · 4:5 × 4", cost: "" },
  video: { cat: "make", icon: "video", kind: "VIDEO", name: "Video", sub: "Make · Remy runs it", lib: "a clip from a photo", agent: "builder", optional: true,
    does: "Turns a start frame into a short clip, shot by shot like a professional shooter would film it. The product’s label and shape stay exact.", ins: "start frame · prompt · sound", outs: "clips", settings: "shooting style · shots · length · quality · count", example: "Selfie talk · 4 shots · 10s", cost: "" },
  sound: { cat: "make", icon: "music", kind: "SOUND", name: "Voice + music", sub: "Make · made with the clip", lib: "sound for clips", agent: null, optional: true,
    does: "Gives a wired Video node its sound: a music mood and an optional voice line, made together with the clip.", ins: "—", outs: "voice · music", settings: "music mood · voice line", example: "Calm morning music · “Back for your next bottle?”", cost: "a little extra per clip" },
  cut: { cat: "fin", icon: "play", kind: "FINAL CUT", name: "Final cut", sub: "Finish · Kaviar edits it", lib: "the finished ad", agent: null, optional: true,
    does: "Cuts the scene clips into one ad: each scene to its length, captions for sound-off viewing, and an end card with the real product photo, headline and button.", ins: "scene clips · storyboard", outs: "the ad", settings: "captions · end card · sound", example: "5 scenes + end card → one 30s ad", cost: "free" },
  check: { cat: "fin", icon: "seal-check", kind: "CHECK", name: "Check", sub: "Finish · Otto checks every result", lib: "Otto: label, shape, brand", agent: "qa",
    does: "Otto checks every photo next to the real product before a person sees it.", ins: "photos", outs: "passed · flagged", settings: "label · shape · colours · no added text", example: "Photo 3 flagged: label off → re-run", cost: "included" },
  send: { cat: "fin", icon: "squares", kind: "SEND TO", name: "Send to", sub: "Finish · you decide", lib: "a batch or brand assets", agent: null,
    does: "Decides where finished results go: a batch’s ads, or brand assets for the Editor.", ins: "passed results", outs: "a batch · brand assets", settings: "destination · which photos", example: "5 photos → Win-back batch", cost: "free" },
};

export const LIBRARY: [string, keyof typeof CAT, NodeKey[]][] = [
  ["Inputs", "in", ["product", "character", "data", "brand", "wins", "reference"]],
  ["Make", "make", ["prompt", "story", "photo", "video", "sound"]],
  ["Finish", "fin", ["cut", "check", "send"]],
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

/** Scenes: product-only shots, and UGC scenes with a person (wire a Character in to keep the same person). */
export const SCENE_GROUPS: [string, string[]][] = [
  ["Product", ["In hand", "On a vanity", "Bathroom shelf", "Flat lay", "Morning window light", "Studio"]],
  ["UGC · with a person", ["Selfie talking to camera", "Holding it up to camera", "Unboxing at home", "Get ready with me", "Applying it in the mirror", "Couch testimonial", "Car review", "Morning routine"]],
];
export const SCENES = SCENE_GROUPS.flatMap(([, x]) => x);
export const isUgc = (scene: string) => SCENE_GROUPS[1][1].includes(scene);

// ---------------------------------------------------------------- the graph
/** What each node can feed. Inputs → Prompt → Photo → Video / Check → Send, so a flow can never loop. */
export const ALLOWED: Record<NodeKey, NodeKey[]> = {
  product: ["prompt", "story", "photo"], character: ["prompt", "story", "photo", "video"], data: ["prompt", "story"], brand: ["prompt", "story"], wins: ["prompt", "story"], reference: ["prompt", "story"],
  prompt: ["photo", "video"], story: ["video", "cut"], sound: ["video"], photo: ["video", "check", "send"], video: ["cut", "check", "send"], cut: ["send"], check: ["send"], send: [],
};
/** Ports: [id, side, offset from the top (px) or null = middle]. Prompt has one typed port per input, as on the board. */
export const PORTS: Record<NodeKey, { ins: [string, "left" | "top", number | null][]; outs: [string, "right" | "bottom"][] }> = {
  product: { ins: [], outs: [["out", "right"]] }, character: { ins: [], outs: [["out", "right"]] }, data: { ins: [], outs: [["out", "right"]] }, brand: { ins: [], outs: [["out", "right"]] },
  wins: { ins: [], outs: [["out", "right"]] }, reference: { ins: [], outs: [["out", "right"]] }, sound: { ins: [], outs: [["out", "right"]] },
  prompt: { ins: [["product", "left", 60], ["char", "left", 100], ["data", "left", 140], ["brand", "left", 180], ["wins", "left", 220], ["ref", "left", 260]], outs: [["out", "right"]] },
  story: { ins: [["product", "left", 60], ["char", "left", 100], ["data", "left", 140], ["brand", "left", 180], ["wins", "left", 220], ["ref", "left", 260]], outs: [["out", "right"]] },
  cut: { ins: [["in", "left", null]], outs: [["out", "right"]] },
  photo: { ins: [["in", "left", null]], outs: [["out", "right"], ["frame", "bottom"]] },
  video: { ins: [["in", "left", null], ["frame", "top", null]], outs: [["out", "right"]] },
  check: { ins: [["in", "left", null]], outs: [["out", "bottom"]] },
  send: { ins: [["in", "top", null], ["side", "left", null]], outs: [] },
};
/** Which ports a wire between two node types uses (whatever port it was dropped on). */
export function handlesFor(a: NodeKey, b: NodeKey): [string, string] {
  if (b === "prompt" || b === "story") return ["out", a === "reference" ? "ref" : a === "character" ? "char" : a];
  if (a === "photo" && b === "video") return ["frame", "frame"];
  if (a === "check" && b === "send") return ["out", "in"];
  if (b === "send") return ["out", "side"];
  return ["out", "in"];
}
/** Wire colour: the input it carries (board 17c), grey for make → finish. */
export const wireColor = (a: NodeKey): string => (a === "character" ? TOK.character : a === "product" ? TOK.product : a === "data" ? TOK.data : a === "brand" || a === "reference" ? TOK.brand : a === "wins" ? TOK.wins : "#C9C5BF");
export const NODE_W: Record<NodeKey, number> = { character: 186, product: 186, data: 186, brand: 186, wins: 186, reference: 186, prompt: 186, story: 210, sound: 186, photo: 192, video: 192, cut: 200, check: 196, send: 196 };
export const NODE_H: Record<NodeKey, number> = { character: 176, product: 176, data: 136, brand: 114, wins: 140, reference: 120, prompt: 300, story: 300, sound: 116, photo: 246, video: 266, cut: 260, check: 186, send: 146 };

export const DEFAULTS: Record<NodeKey, ShootNodeCfg> = {
  product: { product: null }, character: { characterId: null }, data: { signal: null, rules: [], rerun: true, value: null }, brand: { strict: true, brandRules: ["no claims", "no before/after"] },
  wins: { strongOnly: false }, reference: { reference: null }, sound: { music: "Calm morning", voice: "", voiceStyle: "warm, natural", voiceId: null },
  prompt: { prompt: "", segments: null, promptFor: null, length: "medium", scene: "In hand" },
  photo: { aspect: "4:5", n: 4, out: [], at: null },
  video: { style: "auto", shotCount: null, plan: null, seconds: 5, aspect: "9:16", n: 1, from: null, out: [], at: null, res: "720p", jobs: [] },
  story: { storyboard: null, adLength: 30, framework: "auto", look: "mixed", hookCount: 1 },
  cut: { captions: true, endCard: true, keepSound: true, out: [], at: null },
  check: {}, send: { send: null, picked: null },
};
export const cfgOf = (n: ShootNode) => ({ ...DEFAULTS[n.type], ...n.cfg }) as Required<ShootNodeCfg>;
export const newId = (t: NodeKey) => `${t}-${Math.random().toString(36).slice(2, 7)}`;
export const edgeOf = (from: ShootNode, to: ShootNode): ShootEdge => { const [fh, th] = handlesFor(from.type, to.type); return { id: `e-${from.id}-${to.id}`, from: from.id, to: to.id, fh, th }; };

// The board's starting layout (canvas pixels).
const C1 = 18, C2 = 232, C3 = 446, C4 = 664;
const AT: Record<NodeKey, [number, number]> = {
  character: [C1, 800], product: [C1, 18], data: [C1, 210], brand: [C1, 362], wins: [C1, 492], reference: [C1, 648], prompt: [C2, 150], sound: [C2, 486],
  photo: [C3, 18], video: [C3, 296], check: [C4, 120], send: [C4, 346], story: [C2, 150], cut: [C4, 120],
};
const BOARD_WIRES: [NodeKey, NodeKey][] = [
  ["product", "prompt"], ["data", "prompt"], ["brand", "prompt"], ["wins", "prompt"], ["reference", "prompt"], ["product", "photo"],
  ["prompt", "photo"], ["prompt", "video"], ["sound", "video"], ["photo", "video"], ["photo", "check"], ["video", "check"], ["check", "send"],
];
function boardGraph(cfg: Partial<Record<NodeKey, ShootNodeCfg>>, off: string[] = ["reference"]): ShootFlow {
  const nodes: ShootNode[] = (Object.keys(AT) as NodeKey[]).filter((k) => !off.includes(k) && k !== "story" && k !== "cut").map((k) => ({ id: k, type: k, x: AT[k][0], y: AT[k][1], cfg: { ...DEFAULTS[k], ...cfg[k] } }));
  const by = new Map(nodes.map((n) => [n.id, n]));
  const edges = BOARD_WIRES.filter(([a, b]) => by.has(a) && by.has(b)).map(([a, b]) => edgeOf(by.get(a)!, by.get(b)!));
  return { v: 2, nodes, edges, last: null };
}
export const defaultFlow = (template: string | null, product: string | null): ShootFlow => boardGraph({ data: { ...DEFAULTS.data, signal: template }, product: { product } }, ["reference", "character"]);

/** UGC video: a person (Character) holds the product in a vertical selfie photo, then talks to camera in a clip with a voice line. */
export function ugcFlow(template: string | null, product: string | null, characterId: string | null = null): ShootFlow {
  const g = boardGraph({
    data: { ...DEFAULTS.data, signal: template }, product: { product }, character: { characterId },
    prompt: { ...DEFAULTS.prompt, scene: "Holding it up to camera" }, photo: { ...DEFAULTS.photo, aspect: "9:16", n: 2 },
    video: { ...DEFAULTS.video, style: "selfie", seconds: 10 }, sound: { ...DEFAULTS.sound, music: "No music", voice: "" },
  }, ["reference"]);
  const nodes = g.nodes.map((n) => (n.type === "character" ? { ...n, x: C1, y: 18 } : n.type === "product" ? { ...n, y: 210 } : n.type === "data" ? { ...n, y: 402 } : n.type === "brand" ? { ...n, y: 554 } : n.type === "wins" ? { ...n, y: 684 } : n));
  const by = new Map(nodes.map((n) => [n.id, n]));
  return { ...g, nodes, edges: [...g.edges, edgeOf(by.get("character")!, by.get("prompt")!), edgeOf(by.get("character")!, by.get("photo")!)] };
}

/** Full ad: inputs → Storyboard (Remy writes the ad, a keyframe per scene) → Video renders every scene → Final cut with captions and end card. */
export function fullAdFlow(template: string | null, product: string | null, characterId: string | null = null): ShootFlow {
  const at: [NodeKey, number, number, ShootNodeCfg][] = [
    ["character", C1, 18, { characterId }], ["product", C1, 210, { product }], ["data", C1, 402, { ...DEFAULTS.data, signal: template }], ["brand", C1, 554, DEFAULTS.brand], ["wins", C1, 684, DEFAULTS.wins],
    ["story", C2, 120, DEFAULTS.story], ["sound", C2, 460, { ...DEFAULTS.sound, music: "No music", voice: "" }],
    ["video", C3 + 30, 120, { ...DEFAULTS.video, res: "720p" }], ["cut", C4 + 50, 120, DEFAULTS.cut], ["send", C4 + 50, 420, DEFAULTS.send],
  ];
  const nodes: ShootNode[] = at.map(([k, x, y, cfg]) => ({ id: k, type: k, x, y, cfg: { ...cfg } }));
  const by = new Map(nodes.map((n) => [n.id, n]));
  const wires: [NodeKey, NodeKey][] = [["character", "story"], ["product", "story"], ["data", "story"], ["brand", "story"], ["wins", "story"], ["story", "video"], ["sound", "video"], ["character", "video"], ["video", "cut"], ["story", "cut"], ["cut", "send"]];
  return { v: 2, nodes, edges: wires.map(([a, b]) => edgeOf(by.get(a)!, by.get(b)!)), last: null };
}

/** Flows saved before the canvas was a real graph. */
function fromV1(o: ShootFlowV1): ShootFlow {
  return boardGraph({
    product: { product: o.product }, data: { signal: o.template, rules: o.rules, rerun: o.rerun, value: o.last?.value ?? null },
    brand: { strict: o.strict, brandRules: o.brandRules }, wins: { strongOnly: o.strongOnly }, reference: { reference: o.reference },
    prompt: { prompt: o.prompt, segments: o.segments, promptFor: null, length: o.length, scene: o.scene },
    photo: { aspect: o.aspect, n: o.n, out: o.last?.photos ?? [], at: o.last?.at ?? null },
    video: { move: o.video.move, seconds: o.video.seconds, aspect: o.video.aspect, n: o.video.n, from: o.video.from, out: o.last?.clips ?? [], at: o.last?.at ?? null },
    send: { send: o.send, picked: o.picked },
  }, [...o.off, "character"]);
}
export const asFlow = (f: ShootFlow | ShootFlowV1): ShootFlow => ("v" in f && f.v === 2 ? f : fromV1(f as ShootFlowV1));

/** The shoot's data signal: the first Data node's. */
export const flowSignal = (f: ShootFlow) => { const d = f.nodes.find((n) => n.type === "data"); return d ? cfgOf(d).signal : null; };

/** Handoff from Plan or a batch (?signal=&batch=&product=): set the first Data, Send to and Product nodes (adding them if needed). */
export function applyPreset(f: ShootFlow, p: { template?: string | null; batch?: string | null; product?: string | null }): ShootFlow {
  let g: ShootFlow = { ...f, nodes: [...f.nodes], edges: [...f.edges] };
  const ensure = (t: NodeKey): ShootNode => {
    const have = g.nodes.find((n) => n.type === t);
    if (have) return have;
    const n: ShootNode = { id: newId(t), type: t, x: AT[t][0], y: AT[t][1], cfg: { ...DEFAULTS[t] } };
    const prompt = g.nodes.find((x) => x.type === "prompt"), check = g.nodes.find((x) => x.type === "check"), photo = g.nodes.find((x) => x.type === "photo");
    const link = t === "data" || t === "product" ? prompt : t === "send" ? check ?? photo : null;
    g = { ...g, nodes: [...g.nodes, n], edges: link ? [...g.edges, t === "send" ? edgeOf(link, n) : edgeOf(n, link)] : g.edges };
    return n;
  };
  const set = (n: ShootNode, c: ShootNodeCfg) => { g = { ...g, nodes: g.nodes.map((x) => (x.id === n.id ? { ...x, cfg: { ...x.cfg, ...c } } : x)) }; };
  if (p.template !== undefined && p.template !== null) { const d = ensure("data"); if (cfgOf(d).signal !== p.template) set(d, { signal: p.template, rules: [] }); }
  if (p.batch) set(ensure("send"), { send: p.batch, picked: null });
  if (p.product) set(ensure("product"), { product: p.product });
  return g;
}

/** A clip model's price: per second (720p), extra per second of sound, and quality multipliers. */
export type Rate = { second: number; sound: number; res: Partial<Record<string, number>> };
export type ClipModel = { key: string; name: string; note: string; rate: Rate };
type Engines = { model?: string; models?: ClipModel[]; perSoundSecond: number; res?: Partial<Record<string, number>>; video: string };
/** The model a Video node uses (the default when it has none) and its price. */
export const clipModel = (e: Engines, perVideoSecond: number, key?: string | null): ClipModel =>
  e.models?.find((m) => m.key === (key || e.model)) ?? { key: e.model ?? "", name: e.video, note: "", rate: { second: perVideoSecond, sound: e.perSoundSecond, res: e.res ?? {} } };
export const clipCost = (r: Rate, seconds: number, res?: string, sound = false) => seconds * (r.second * (r.res[res ?? "720p"] ?? 1) + (sound ? r.sound : 0));

/** What one Run flow costs: every Photo node's photos and every Video node's clips, at each node's model price. */
export const runCost = (f: ShootFlow, perImage: number, rateOf: (model?: string) => Rate) =>
  f.nodes.reduce((a, n) => {
    const c = cfgOf(n);
    const from = (t: NodeKey) => f.edges.filter((e) => e.to === n.id).map((e) => f.nodes.find((x) => x.id === e.from)).find((x) => x?.type === t);
    const sound = n.type === "video" && Boolean(from("sound"));
    const story = n.type === "video" ? from("story") : undefined;
    if (n.type === "story") { const sc = c.storyboard?.scenes ?? []; return a + (sc.length ? sc.filter((x) => !x.frame).length : Math.round((c.adLength ?? 30) / 6)) * perImage; }
    if (story) { const sb = cfgOf(story).storyboard; const secs = sb ? sb.scenes.reduce((t, x) => t + x.seconds, 0) : (cfgOf(story).adLength ?? 30) - 3; return a + clipCost(rateOf(c.model), secs, c.res, sound); }
    return a + (n.type === "photo" ? c.n * perImage : n.type === "video" ? c.n * clipCost(rateOf(c.model), c.seconds, c.res, sound) : 0);
  }, 0);
/** How long a clip takes on Higgsfield: roughly in step with its length (sound and shots included). */
export const renderTime = (seconds: number) => (seconds <= 5 ? "1–3 min" : seconds <= 15 ? "3–6 min" : "5–10 min");
export const MUSIC = ["Calm morning", "Upbeat", "Luxurious", "Playful", "No music"];
/** What the Voice + music node asks the video model for. */
export const soundDirection = (c: { music?: string; voice?: string; voiceStyle?: string; voiceId?: string | null }, linesInShots = false) => {
  const music = c.music && c.music !== "No music" ? `${c.music.toLowerCase()} music bed` : "natural ambient sound, no music";
  if (!c.voice?.trim()) return music;
  const who = c.voiceId ? "the reference voice" : `a ${c.voiceStyle?.trim() || "warm, natural"} voice`;
  // With a shot list, each line sits in the shot where it's said — lip-synced to the person on camera.
  if (linesInShots) return `${music}; ${who} speaks the lines written in the shots, lip-synced`;
  return `${music}; ${who} says: "${c.voice.trim().slice(0, 140)}"`;
};
