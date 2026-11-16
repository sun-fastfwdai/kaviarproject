"use client";
import { Combo } from "./combo";
import { Field, Pills } from "./bits";
import { Thumb, asset, usd, type Shot } from "./canvas-nodes";
import { Icon } from "@/components/icon";
import { AgentFace } from "@/components/agent";
import { CTAS, END_SECONDS, FRAMEWORKS, LENGTHS, LOOKS, SCENE_MAX, SCENE_MIN, storySeconds } from "@/lib/creative/story";
import type { ShootNodeCfg, Story, StoryScene } from "@/lib/db/schema";

const area = { border: "1px solid var(--line-2)", borderRadius: 8, padding: "6px 8px", resize: "vertical" as const, font: "inherit", fontSize: 12, lineHeight: "17px" };
const PURPOSE_TONE: Record<string, string> = { Hook: "#C2577D", Problem: "#B7791F", Solution: "#1F8A5B", Demo: "#1AA7C8", Proof: "#6A8FD6", Offer: "#B7791F", CTA: "#121212" };

/** Storyboard node: the ad's settings, then Remy's script — scenes with keyframes, lines, captions — and the end card. */
export function StoryPanel({ cfg, story, busy, working, perImage, hasProduct, hasPerson, byId, onPatch, onWrite, onFrames, onView }: {
  cfg: Required<ShootNodeCfg>; story: Story | null; busy: boolean; working: "write" | "frames" | null; perImage: number; hasProduct: boolean; hasPerson: boolean; byId: Map<string, Shot>;
  onPatch: (c: Partial<ShootNodeCfg>, save?: boolean) => void; onWrite: () => void; onFrames: (ids?: string[]) => void; onView: (id: string) => void;
}) {
  const set = (p: Partial<Story>, save = true) => story && onPatch({ storyboard: { ...story, ...p } }, save);
  const setScene = (id: string, p: Partial<StoryScene>, save = true) => story && set({ scenes: story.scenes.map((x) => (x.id === id ? { ...x, ...p } : x)) }, save);
  const missing = story ? story.scenes.filter((x) => !x.frame || !byId.has(x.frame)) : [];
  const off = story && story.length !== cfg.adLength;

  return (
    <>
      <div className="row g6" style={{ flexShrink: 0, flexWrap: "wrap" }}>
        <Pills label="Length" value={cfg.adLength} options={LENGTHS.map((l) => [l, `${l}s`] as [number, string])} onChange={(v) => onPatch({ adLength: v })} />
      </div>
      <Field label="Story">
        <Combo label="Story" value={cfg.framework} onChange={(v) => onPatch({ framework: v })} options={FRAMEWORKS.map(([value, label, sub]) => ({ value, label, sub }))} />
      </Field>
      <Field label="Look" sub={LOOKS.find(([k]) => k === cfg.look)?.[2]}>
        <Pills label="Look" value={cfg.look} options={LOOKS.map(([k, l]) => [k, l] as [string, string])} onChange={(v) => onPatch({ look: v })} />
      </Field>
      <Field label="Hooks to test" sub={cfg.hookCount > 1 ? "Remy writes extra openings — swap one in to make a variation" : undefined}>
        <Pills label="Hooks" value={cfg.hookCount} options={[[1, "1"], [2, "2"], [3, "3"]]} onChange={(v) => onPatch({ hookCount: v })} />
      </Field>
      <button type="button" className={`btn ${story ? "" : "dark"}`} disabled={busy} onClick={onWrite} style={{ justifyContent: "center", flexShrink: 0 }}>
        {working === "write" ? <Icon name="spinner" size={13} className="spin" color={story ? undefined : "#fff"} /> : <AgentFace kind="builder" size={15} />}
        {working === "write" ? "Remy is writing…" : story ? "Rewrite the storyboard" : "Write the storyboard"}
      </button>
      {!story && <span className="xs i3" style={{ lineHeight: "16px", flexShrink: 0 }}>Remy reads the product, the brand profile, the buyer (Data signal or Market research), competitors’ gaps and what already sells — then writes the hook, every scene, what’s said, captions and the end card. About 30 seconds.</span>}

      {story && (
        <>
          <div className="col g6" style={{ padding: "10px 12px", borderRadius: 10, background: "var(--tray)", flexShrink: 0 }}>
            <span className="sm w5 i1">{story.title}</span>
            <span className="xs i2" style={{ lineHeight: "16px" }}>{story.logline}</span>
            <span className="row top g6 xs i3" style={{ lineHeight: "16px" }}><AgentFace kind="builder" size={14} />{story.why}</span>
            <span className="xs i3">{story.framework} · {storySeconds(story)}s with the {END_SECONDS}s end card</span>
          </div>
          {off && <span className="xs c-amber" style={{ flexShrink: 0 }}>Written for {story.length}s — rewrite it for {cfg.adLength}s.</span>}

          <Field label="Continuity — every scene repeats it">
            <textarea value={story.bible} rows={3} maxLength={500} onChange={(e) => set({ bible: e.target.value }, false)} style={area} />
          </Field>
          <Field label="Voice" sub="Pick a brand voice in Voice + music to hear the same voice in every scene">
            <input value={story.voice} maxLength={160} onChange={(e) => set({ voice: e.target.value }, false)} className="input sm" style={{ height: 30, fontSize: 12 }} />
          </Field>

          <div className="row between" style={{ flexShrink: 0 }}>
            <span className="xs w5 i3">Scenes</span>
            {missing.length > 0 && hasProduct && (
              <button type="button" className="btn sm dark" disabled={busy} onClick={() => onFrames(missing.map((x) => x.id))}>
                {working === "frames" ? <Icon name="spinner" size={12} className="spin" color="#fff" /> : <Icon name="image" size={12} color="#fff" />}Make {missing.length} keyframe{missing.length > 1 ? "s" : ""} · {usd(missing.length * perImage)}
              </button>
            )}
          </div>
          {!hasProduct && <span className="xs c-amber" style={{ flexShrink: 0 }}>Wire a Product node in — keyframes start from its photo.</span>}
          {story.scenes.map((x, i) => (
            <div key={x.id} className="col g6" style={{ padding: 10, borderRadius: 10, border: "1px solid var(--line)", flexShrink: 0 }}>
              <div className="row g6">
                <span className="tnum" style={{ width: 18, height: 18, borderRadius: 5, background: "var(--ink)", color: "#fff", fontSize: 10, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</span>
                <span className="xs w5" style={{ color: PURPOSE_TONE[x.purpose] ?? "var(--ink)" }}>{x.purpose}</span>
                <span className="fill" />
                <button type="button" aria-label="Shorter" disabled={x.seconds <= SCENE_MIN} onClick={() => setScene(x.id, { seconds: x.seconds - 1 })} style={{ width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="minus" size={10} color="#8B8883" /></button>
                <span className="xs i1 tnum">{x.seconds}s</span>
                <button type="button" aria-label="Longer" disabled={x.seconds >= SCENE_MAX} onClick={() => setScene(x.id, { seconds: x.seconds + 1 })} style={{ width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="plus" size={10} color="#8B8883" /></button>
              </div>
              <div className="row top g8">
                <div className="col g4" style={{ flexShrink: 0, alignItems: "center" }}>
                  {x.frame && byId.has(x.frame) ? <Thumb id={x.frame} w={54} h={96} onClick={() => onView(x.frame!)} title="Open" />
                    : <div style={{ width: 54, height: 96, borderRadius: 6, background: "var(--tray)", border: "1px dashed var(--line-2)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="image" size={14} color="#B5B2AC" /></div>}
                  {hasProduct && <button type="button" className="lnk xs i3" disabled={busy} onClick={() => onFrames([x.id])}>{x.frame ? "Remake" : "Make"}</button>}
                </div>
                <div className="col g4 fill" style={{ minWidth: 0 }}>
                  <input value={x.caption} maxLength={60} onChange={(e) => setScene(x.id, { caption: e.target.value }, false)} placeholder="On-screen caption" aria-label={`Scene ${i + 1} caption`} className="input sm" style={{ height: 28, fontSize: 12, fontWeight: 500 }} />
                  <label className="row g6" style={{ height: 28, padding: "0 8px", borderRadius: 7, background: "var(--tray)" }}>
                    <Icon name="msg" size={12} color="#8B8883" />
                    <input value={x.line} maxLength={200} onChange={(e) => setScene(x.id, { line: e.target.value }, false)} placeholder="Says on camera (or nothing)" aria-label={`Scene ${i + 1} line`}
                      style={{ border: 0, outline: 0, background: "transparent", font: "inherit", fontSize: 12, width: "100%" }} />
                  </label>
                  <span className="xs i3 ell" title={x.camera}>{x.camera}</span>
                </div>
              </div>
              <textarea value={x.keyframe} rows={2} maxLength={900} onChange={(e) => setScene(x.id, { keyframe: e.target.value }, false)} aria-label={`Scene ${i + 1} keyframe`} title="The opening still" style={area} />
              <textarea value={x.motion} rows={2} maxLength={400} onChange={(e) => setScene(x.id, { motion: e.target.value }, false)} aria-label={`Scene ${i + 1} action`} title="What happens in the scene" style={area} />
            </div>
          ))}

          {story.hooks.length > 0 && (
            <Field label="Other hooks to test">
              {story.hooks.map((h) => (
                <div key={h} className="row g8" style={{ minHeight: 30, borderTop: "1px solid var(--line)" }}>
                  <span className="xs i1 fill">“{h}”</span>
                  <button type="button" className="lnk xs i2" onClick={() => { const first = story.scenes[0]; if (first) set({ scenes: [{ ...first, caption: h }, ...story.scenes.slice(1)], hooks: [first.caption, ...story.hooks.filter((y) => y !== h)].filter(Boolean) }); }}>Use</button>
                </div>
              ))}
            </Field>
          )}

          <Field label="End card · the real product photo">
            <input value={story.end.headline} maxLength={60} onChange={(e) => set({ end: { ...story.end, headline: e.target.value } }, false)} placeholder="Headline" aria-label="End card headline" className="input sm" style={{ height: 30, fontSize: 12, fontWeight: 500 }} />
            <input value={story.end.sub} maxLength={80} onChange={(e) => set({ end: { ...story.end, sub: e.target.value } }, false)} placeholder="Sub line" aria-label="End card sub line" className="input sm" style={{ height: 30, fontSize: 12 }} />
            <div className="row g6">
              <Combo chip label="Button" value={story.end.cta} options={CTAS.map((c) => ({ value: c, label: c }))} onChange={(v) => set({ end: { ...story.end, cta: v } })} menuWidth={180} />
              <input value={story.end.offer} maxLength={60} onChange={(e) => set({ end: { ...story.end, offer: e.target.value } }, false)} placeholder="Offer (only a real one)" aria-label="Offer" className="input sm fill" style={{ height: 28, fontSize: 12 }} />
            </div>
          </Field>
          {hasPerson ? null : story.scenes.some((x) => x.person) && <span className="xs i3" style={{ flexShrink: 0 }}>Some scenes show a person — wire a Character node in to keep the same face in every scene.</span>}
        </>
      )}
    </>
  );
}

/** Video node fed by a storyboard: one clip per scene, rendered from its keyframe. */
export function SceneRenderPanel({ story, sceneOut, jobs, jobState, busy, res, via, perVideoSecond, resMul, voice, byId, onRes, onRender, onView }: {
  story: Story | null; sceneOut: Record<string, string>; jobs: { id: string; scene?: string }[]; jobState: Record<string, string>; busy: boolean; res: string; via: string; perVideoSecond: number;
  resMul: Partial<Record<string, number>>; voice: string | null; byId: Map<string, Shot>; onRes: (r: "480p" | "720p" | "1080p") => void; onRender: (ids?: string[]) => void; onView: (id: string) => void;
}) {
  if (!story) return <span className="xs i2">Write the storyboard first — each scene becomes one clip here.</span>;
  const secs = story.scenes.reduce((a, x) => a + x.seconds, 0);
  const noFrame = story.scenes.filter((x) => !x.frame).length;
  const done = story.scenes.filter((x) => sceneOut[x.id] && byId.has(sceneOut[x.id])).length;
  return (
    <>
      {via === "Higgsfield" && <Field label="Quality"><Pills label="Quality" value={res} options={[["480p", "Draft"], ["720p", "Standard"], ["1080p", "High"]]} onChange={(v) => onRes(v as "480p")} /></Field>}
      <span className="xs i3" style={{ lineHeight: "16px", flexShrink: 0 }}>
        {voice ? `Lines are spoken in the brand voice “${voice}”.` : "Lines use the storyboard’s voice; pick a brand voice in Voice + music for the very same voice in every scene."}
      </span>
      <Field label={`Scenes · ${done} of ${story.scenes.length} rendered`}>
        {story.scenes.map((x, i) => {
          const clip = sceneOut[x.id] && byId.has(sceneOut[x.id]) ? sceneOut[x.id] : null, job = jobs.find((j) => j.scene === x.id);
          return (
            <div key={x.id} className="row g8" style={{ minHeight: 46, borderTop: "1px solid var(--line)" }}>
              <span className="xs i3 tnum" style={{ width: 14 }}>{i + 1}</span>
              {clip ? <Thumb id={clip} kind="video" w={26} h={46} sound onClick={() => onView(clip)} title="Play" /> : x.frame && byId.has(x.frame) ? <Thumb id={x.frame} w={26} h={46} /> : <span style={{ width: 26, height: 46, borderRadius: 5, background: "var(--tray)" }} />}
              <span className="col fill" style={{ minWidth: 0 }}><span className="xs w5 i1 ell">{x.caption || x.purpose}</span><span className="xs i3">{x.purpose} · {x.seconds}s{x.line ? " · speaks" : ""}</span></span>
              {job ? <span className="row g4 xs" style={{ color: "#1A8FAB" }}><Icon name="spinner" size={11} className="spin" color="#1A8FAB" />{jobState[job.id] === "queued" ? "queued" : "rendering"}</span>
                : clip ? <button type="button" className="lnk xs i3" disabled={busy} onClick={() => onRender([x.id])}>Redo</button>
                : !x.frame ? <span className="xs i3">no keyframe</span> : null}
            </div>
          );
        })}
      </Field>
      <div className="col g6" style={{ flexShrink: 0, marginTop: "auto" }}>
        <button type="button" className="btn dark" disabled={busy || jobs.length > 0} onClick={() => onRender()} style={{ justifyContent: "center" }}>
          <Icon name="play" size={12} weight="fill" color="#fff" />{done ? "Render every scene again" : "Render the scenes"} · {usd(secs * perVideoSecond * (resMul[res] ?? 1))}
        </button>
        <span className="xs i3" style={{ textAlign: "center" }}>{noFrame ? `${noFrame} keyframe${noFrame > 1 ? "s" : ""} are made first · ` : ""}all scenes render at once, usually 3–6 min</span>
      </div>
    </>
  );
}

/** Final cut: captions, end card, sound — and the finished ad. */
export function CutPanel({ cfg, story, ready, total, busy, working, onPatch, onCut }: {
  cfg: Required<ShootNodeCfg>; story: Story | null; ready: number; total: number; busy: boolean; working: boolean;
  onPatch: (c: Partial<ShootNodeCfg>) => void; onCut: () => void;
}) {
  const last = cfg.out[0];
  return (
    <>
      {last && <video key={last} src={asset(last)} controls playsInline style={{ width: "100%", maxHeight: 420, borderRadius: 10, background: "#000", flexShrink: 0 }} />}
      {last && <a className="lnk xs i2 row g4" href={asset(last)} download style={{ flexShrink: 0 }}><Icon name="download" size={12} />Download the ad</a>}
      <Field label="Captions" sub="Most people watch with the sound off — captions carry the story"><Pills label="Captions" value={cfg.captions ? "on" : "off"} options={[["on", "On"], ["off", "Off"]]} onChange={(v) => onPatch({ captions: v === "on" })} /></Field>
      <Field label="End card" sub={story ? `“${story.end.headline}” · ${story.end.cta} — with the real product photo` : undefined}><Pills label="End card" value={cfg.endCard ? "on" : "off"} options={[["on", "On"], ["off", "Off"]]} onChange={(v) => onPatch({ endCard: v === "on" })} /></Field>
      <Field label="Sound" sub="Off = silent; add licensed music when you upload to Meta"><Pills label="Sound" value={cfg.keepSound ? "on" : "off"} options={[["on", "Scene sound"], ["off", "Silent"]]} onChange={(v) => onPatch({ keepSound: v === "on" })} /></Field>
      <div className="col g6" style={{ flexShrink: 0, marginTop: "auto" }}>
        <button type="button" className="btn dark" disabled={busy || !total || ready < total} onClick={onCut} style={{ justifyContent: "center" }}>
          {working ? <Icon name="spinner" size={13} className="spin" color="#fff" /> : <Icon name="play" size={12} weight="fill" color="#fff" />}{working ? "Cutting…" : last ? "Cut it again" : "Cut the ad"}
        </button>
        <span className="xs i3" style={{ textAlign: "center" }}>{!total ? "Wire the storyboard’s Video node into this one." : ready < total ? `${ready} of ${total} scenes rendered — it cuts by itself when the last one lands` : "about a minute · free"}</span>
      </div>
    </>
  );
}
