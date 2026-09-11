const compact = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });
const full = new Intl.NumberFormat("en-IN");

export const fmt = (n: number | null | undefined) => (n == null ? "—" : compact.format(n));
export const fmtFull = (n: number | null | undefined) => (n == null ? "—" : full.format(n));
export const pct = (n: number | null | undefined, digits = 1) => (n == null ? "—" : `${n.toFixed(digits)}%`);

export function delta(cur: number | null | undefined, prev: number | null | undefined): { text: string; dir: "up" | "down" | "flat" } {
  if (cur == null || prev == null || prev === 0) return { text: "—", dir: "flat" };
  const d = ((cur - prev) / Math.abs(prev)) * 100;
  return { text: `${d > 0 ? "+" : ""}${d.toFixed(0)}%`, dir: d > 1 ? "up" : d < -1 ? "down" : "flat" };
}

export function duration(s: number | null | undefined) {
  if (s == null) return "—";
  const m = Math.floor(s / 60), r = Math.round(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
}

export const currentPeriod = () => new Date().toISOString().slice(0, 7);
export const monthLabel = (p: string) => new Date(`${p}-01T00:00:00`).toLocaleDateString("en", { month: "long", year: "numeric" });
export const shortDate = (d: string) => new Date(d).toLocaleDateString("en", { day: "numeric", month: "short" });
export const daysAgo = (d: string) => Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 864e5));
