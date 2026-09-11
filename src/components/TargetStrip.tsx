import Link from "next/link";
import type { Pace } from "@/lib/types";
import { fmt, monthLabel } from "@/lib/format";

const NAMES: Record<Pace["metric"], string> = { views: "Views", subs: "New subscribers", watch_time: "Watch time (min)" };

function tone(p: number) {
  return p >= 1 ? "bg-ok" : p >= 0.85 ? "bg-warn" : "bg-bad";
}

// The tan panel: month target vs actual, with pace as a bar and projected month-end.
export function TargetStrip({ pace, period }: { pace: Pace[]; period: string }) {
  if (!pace.length) {
    return (
      <section className="rounded-tile bg-tan-tint px-7 py-6">
        <p className="display text-2xl text-tan-ink">No targets for {monthLabel(period)}</p>
        <p className="mt-1 text-muted">Set view and subscriber targets to see pace here. <Link href="/settings/" className="text-tan-deep underline underline-offset-2">Set targets</Link></p>
      </section>
    );
  }
  return (
    <section className="rounded-tile bg-tan px-7 py-6 text-cream">
      <div className="flex items-baseline justify-between">
        <h2 className="display text-[26px]">{monthLabel(period)} targets</h2>
        <p className="text-sm text-cream/80">Pace = actual ÷ where you should be today</p>
      </div>
      <div className="mt-5 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {pace.map((p) => {
          const width = Math.min(100, Math.round((p.actual / Math.max(p.target, 1)) * 100));
          const expected = Math.min(100, Math.round((p.expected / Math.max(p.target, 1)) * 100));
          return (
            <div key={p.metric}>
              <div className="flex items-baseline justify-between">
                <p className="text-sm text-cream/85">{NAMES[p.metric]}</p>
                <p className="tnum text-sm"><span className="font-semibold">{Math.round(p.pace * 100)}%</span> of pace</p>
              </div>
              <p className="display tnum mt-1 text-[36px]">{fmt(p.actual)} <span className="text-[20px] text-cream/70">/ {fmt(p.target)}</span></p>
              <div className="relative mt-3 h-2.5 overflow-hidden rounded-full bg-black/15">
                <div className={`h-full rounded-full ${tone(p.pace)}`} style={{ width: `${width}%` }} />
                <div className="absolute top-0 h-full w-0.5 bg-cream/90" style={{ left: `${expected}%` }} title="Where you should be today" />
              </div>
              <p className="mt-2 text-sm text-cream/80">Projected month-end {fmt(p.projected)}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
