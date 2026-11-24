/**
 * AI answers: who an assistant names when a shopper asks about this kind of product. Pure rules — which brands an answer names and
 * links, and the count across the questions — so the result can be checked against the answers themselves.
 */
export type Tracked = { name: string; you: boolean; aliases: string[]; domains: string[] };
export type Asked = { q: string; named: string[]; linked: string[]; others: string[]; answer: string };
export type AnswerRun = {
  at: string; by: string | null; assistant: string; market: string; questions: Asked[];
  brands: { name: string; you: boolean; named: number; linked: number }[]; // out of questions.length
  top: { name: string; n: number }[]; // other brands the answers named, most often first
};

const flat = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");
export const hostOf = (u: string): string | null => { try { return new URL(/^https?:\/\//.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, "").toLowerCase(); } catch { return null; } };

/** A brand to look for: by its name, and by its site's own name ("percentscience.com" also finds "Percent Science"). */
export function tracked(name: string, url: string | null, you: boolean): Tracked {
  const host = url ? hostOf(url) : null, label = host?.split(".")[0] ?? null;
  return { name, you, aliases: [...new Set([name.trim(), ...(label && label.length >= 5 ? [label] : [])])].filter(Boolean), domains: host ? [host] : [] };
}
/** Is the brand named? A long name matches with spaces and punctuation ignored; a short one (PS, Anua) must stand alone, written as it is. */
export function named(text: string, t: Tracked): boolean {
  const f = flat(text);
  return t.aliases.some((a) => { const n = flat(a); return n.length >= 5 ? f.includes(n) : n.length >= 2 && new RegExp(`(^|[^A-Za-z0-9])${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Za-z0-9]|$)`).test(text); });
}
/** Did the answer link to the brand's own site? */
export const linkedTo = (urls: string[], t: Tracked) => urls.some((u) => { const h = hostOf(u); return Boolean(h) && t.domains.some((d) => h === d || h!.endsWith(`.${d}`)); });

/** The counts across every question, and the other brands named most. A brand Kaviar tracks is never listed among the others. */
export function tally(asked: Asked[], who: Tracked[]): Pick<AnswerRun, "brands" | "top"> {
  const brands = who.map((t) => ({ name: t.name, you: t.you, named: asked.filter((a) => a.named.includes(t.name)).length, linked: asked.filter((a) => a.linked.includes(t.name)).length }));
  const seen = new Map<string, { name: string; n: number }>();
  for (const a of asked) {
    const once = new Set<string>(); // a brand counts once an answer, however it is spelled
    for (const o of a.others.map((x) => x.trim()).filter(Boolean)) {
      const k = flat(o);
      if (!k || once.has(k) || who.some((t) => named(o, t))) continue;
      once.add(k);
      const e = seen.get(k) ?? { name: o, n: 0 }; e.n++; seen.set(k, e);
    }
  }
  return { brands: brands.sort((a, b) => Number(b.you) - Number(a.you) || b.named - a.named || b.linked - a.linked), top: [...seen.values()].sort((a, b) => b.n - a.n).slice(0, 8) };
}
