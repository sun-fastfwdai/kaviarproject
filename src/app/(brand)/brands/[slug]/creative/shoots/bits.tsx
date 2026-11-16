"use client";

/** Small inspector pieces shared by the Shoots panels. */
export function Field({ label, sub, children }: { label: string; sub?: React.ReactNode; children: React.ReactNode }) {
  return <div className="col g4" style={{ flexShrink: 0 }}><span className="xs w5 i3">{label}</span>{children}{sub ? <span className="xs i3">{sub}</span> : null}</div>;
}

export function Pills<T extends string | number>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="row g4" role="radiogroup" aria-label={label} style={{ flexWrap: "wrap" }}>
      {options.map(([v, l]) => (
        <button key={String(v)} type="button" role="radio" aria-checked={v === value} onClick={() => onChange(v)} className="row"
          style={{ height: 26, padding: "0 9px", borderRadius: 7, fontSize: 11.5, ...(v === value ? { background: "var(--ink)", color: "#fff" } : { border: "1px solid var(--line-2)", color: "var(--ink-2)", background: "#fff" }) }}>{l}</button>
      ))}
    </div>
  );
}
