"use client";
import Link from "next/link";
import type { ChannelLatest, SeriesPoint, Pace } from "@/lib/types";
import { fmt, delta } from "@/lib/format";
import { Sparkline } from "./Charts";

export function ChannelTile({ c, series, pace }: { c: ChannelLatest; series: SeriesPoint[]; pace?: Pace }) {
  const d = delta(c.views_28d, c.views_prev_28d);
  return (
    <Link href={`/channel/?id=${c.id}`} className="group block rounded-tile bg-tan-tint p-6 transition-colors hover:bg-tan-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="display text-[28px] text-tan-ink">{c.name}</h2>
          <p className="mt-0.5 text-sm text-muted">{fmt(c.subscribers)} subscribers · {c.handle ?? ""}</p>
        </div>
        {pace && (
          <div className="text-right">
            <p className={`display tnum text-[28px] ${pace.pace >= 1 ? "text-ok" : pace.pace >= 0.85 ? "text-warn" : "text-bad"}`}>{Math.round(pace.pace * 100)}%</p>
            <p className="text-xs text-muted">of view pace</p>
          </div>
        )}
      </div>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="display tnum text-[44px] leading-none text-ink">{fmt(c.views_28d)}</p>
          <p className="mt-1 text-sm text-muted">views, last 28 days <span className={d.dir === "up" ? "text-ok" : d.dir === "down" ? "text-bad" : ""}>{d.text}</span></p>
        </div>
        <div className="w-full sm:w-40 sm:shrink-0"><Sparkline data={series} /></div>
      </div>
      {c.needs_reconnect && <p className="mt-4 rounded-full bg-warn/15 px-3 py-1 text-xs text-tan-ink">Private analytics paused — run the connect script again for this channel.</p>}
    </Link>
  );
}
