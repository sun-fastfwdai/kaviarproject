/** Kaviar's geometric mascots, ported from the design boards. Iris (blue capsule) reads data; Cleo (green circle) keeps sources in sync. */
type Kind = "builder" | "catalog" | "qa" | "analyst";
type Mood = "focus" | "happy" | "up";

const COLOR: Record<Kind, string> = { builder: "#1AA7C8", catalog: "#22A46E", qa: "#EB7A3C", analyst: "#6A8FD6" };
export const AGENT_NAME: Record<Kind, string> = { builder: "Remy", catalog: "Cleo", qa: "Otto", analyst: "Iris" };
const EYE: Record<Kind, [number, number, number, number]> = {
  builder: [11.6, 20.4, 15.4, 1], catalog: [11.6, 20.4, 15.4, 1], qa: [12.9, 19.1, 19.8, 0.86], analyst: [12.2, 19.8, 13.2, 0.94],
};

function Eyes({ kind, mood }: { kind: Kind; mood: Mood }) {
  const [lx, rx, y, k] = EYE[kind];
  if (mood === "happy") {
    return (
      <>
        {[lx, rx].map((x) => (
          <path key={x} d={`M${x - 2.6 * k} ${y + 1}q${2.6 * k} -${3.2 * k} ${5.2 * k} 0`} stroke="#121212" strokeWidth={2 * k} fill="none" strokeLinecap="round" />
        ))}
      </>
    );
  }
  const [dx, dy] = mood === "up" ? [0.3, -1.4] : [0.7, 0.8];
  return (
    <>
      {[lx, rx].map((x) => (
        <g key={x}>
          <ellipse cx={x} cy={y} rx={3.6 * k} ry={4.2 * k} fill="#fff" />
          <circle cx={x + dx * k} cy={y + dy * k} r={2.05 * k} fill="#121212" />
        </g>
      ))}
    </>
  );
}

export function AgentFace({ kind, size = 24, mood = "focus" }: { kind: Kind; size?: number; mood?: Mood }) {
  const c = COLOR[kind];
  const shape =
    kind === "builder" ? <rect x="2.5" y="2.5" width="27" height="27" rx="8.5" fill={c} /> :
    kind === "catalog" ? <circle cx="16" cy="16" r="14" fill={c} /> :
    kind === "qa" ? <path d="M16 5.2 27.6 26H4.4z" fill={c} stroke={c} strokeWidth="5.2" strokeLinejoin="round" /> :
    <rect x="5.5" y="1.5" width="21" height="29" rx="10.5" fill={c} />;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-label={AGENT_NAME[kind]}>
      {shape}
      <Eyes kind={kind} mood={mood} />
    </svg>
  );
}
