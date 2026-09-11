import { delta } from "@/lib/format";

// A KPI as a plain figure: big soft-serif number, quiet label, delta beneath.
export function Stat({ label, value, prev, cur, suffix, note }: {
  label: string; value: string; cur?: number | null; prev?: number | null; suffix?: string; note?: string;
}) {
  const d = cur !== undefined ? delta(cur, prev) : null;
  const color = d?.dir === "up" ? "text-ok" : d?.dir === "down" ? "text-bad" : "text-muted";
  return (
    <div className="border-l border-line pl-5 first:border-l-0 first:pl-0">
      <p className="text-sm text-muted">{label}</p>
      <p className="display tnum mt-1 text-[32px] text-ink sm:text-[40px]">
        {value}{suffix && <span className="text-[22px] text-muted">{suffix}</span>}
      </p>
      {d && <p className={`mt-1 text-sm ${color}`}>{d.text} <span className="text-muted">vs prior 28 days</span></p>}
      {note && <p className="mt-1 text-sm text-muted">{note}</p>}
    </div>
  );
}
