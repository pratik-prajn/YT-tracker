import type { TopicLift } from "@/lib/types";
import { fmt } from "@/lib/format";

// Horizontal bars of topic lift. 1.0 = channel median; the hairline marks it.
export function TopicBars({ topics, onPick, active }: { topics: TopicLift[]; onPick?: (t: string | null) => void; active?: string | null }) {
  const max = Math.max(2, ...topics.map((t) => t.lift ?? 0));
  return (
    <ul className="space-y-2.5">
      {topics.map((t) => {
        const w = Math.min(100, ((t.lift ?? 0) / max) * 100);
        const isActive = active === t.topic;
        return (
          <li key={t.topic}>
            <button
              onClick={() => onPick?.(isActive ? null : t.topic)}
              className={`w-full text-left ${onPick ? "hover:text-tan-deep" : "cursor-default"}`}
            >
              <div className="flex items-baseline justify-between text-sm">
                <span className={isActive ? "font-medium text-tan-deep" : ""}>{t.topic} <span className="text-muted">· {t.videos} videos</span></span>
                <span className="tnum text-muted">{t.lift == null ? "—" : `${t.lift.toFixed(2)}×`} <span className="text-xs">({fmt(t.median_views_7d)} median 7d)</span></span>
              </div>
              <div className="relative mt-1 h-2 rounded-full bg-tan-tint">
                <div className={`h-full rounded-full ${(t.lift ?? 0) >= 1 ? "bg-tan" : "bg-tan-soft"}`} style={{ width: `${w}%` }} />
                <div className="absolute top-[-3px] h-[14px] w-px bg-tan-ink/50" style={{ left: `${(1 / max) * 100}%` }} />
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
