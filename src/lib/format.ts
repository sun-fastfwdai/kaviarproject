export function money(v: number | null | undefined, currency = "USD", cents = false): string {
  const n = Number(v ?? 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  }).format(n);
}

export function compactMoney(v: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(v);
}

export function num(v: number | null | undefined): string {
  return new Intl.NumberFormat("en-US").format(Math.round(Number(v ?? 0)));
}

export function compact(v: number | null | undefined): string {
  const n = Number(v ?? 0);
  if (n < 10_000) return num(n);
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: n < 1e6 ? 0 : 2 }).format(n);
}

export const pct = (v: number | null | undefined, digits = 0) => `${(Number(v ?? 0) * 100).toFixed(digits)}%`;
export const roas = (v: number | null | undefined) => (v == null || !isFinite(v) ? "—" : `${v.toFixed(2)}×`);

export function ago(d: Date | string | null | undefined, now = Date.now()): string {
  if (!d) return "never";
  const s = Math.max(0, Math.round((now - new Date(d).getTime()) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days} d ago`;
  return shortDate(d);
}

export function shortDate(d: Date | string, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone }).format(new Date(d));
}

export function dateTime(d: Date | string, timeZone?: string): string {
  const x = new Date(d);
  const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone }).format(x);
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone }).format(x);
  return `${day} · ${time}`;
}

export function duration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  return `${m}m ${String(Math.round(s % 60)).padStart(2, "0")}s`;
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 48);
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

export function daysUntil(d: Date | string, now = Date.now()): number {
  return Math.round((new Date(d).getTime() - now) / 864e5);
}
