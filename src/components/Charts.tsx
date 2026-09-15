"use client";
import { useMemo, useState } from "react";
import { Area, AreaChart, Brush, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceDot } from "recharts";
import type { SeriesPoint, RetentionPoint } from "@/lib/types";
import { fmt, shortDate } from "@/lib/format";

const TAN = "#b5836a", DEEP = "#8a5e45", LINE = "#e5d8cd", INK = "#2a1f19";
const tip = { contentStyle: { borderRadius: 14, border: `1px solid ${LINE}`, fontSize: 13, boxShadow: "none" }, labelStyle: { color: "#7d6a5d" }, cursor: { stroke: DEEP, strokeOpacity: 0.4 } };

// ---------- small pill controls used by several charts ----------
export function Pills<T extends string | number>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-full bg-tan-tint p-1 text-sm">
      {options.map((o) => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          className={`rounded-full px-3 py-1 transition-colors ${value === o.value ? "bg-tan text-cream" : "text-tan-ink hover:bg-tan-soft"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const RANGES = [
  { value: 7, label: "7d" }, { value: 28, label: "28d" }, { value: 90, label: "90d" }, { value: 365, label: "1y" },
] as const;
export type RangeDays = (typeof RANGES)[number]["value"];

export function Sparkline({ data }: { data: SeriesPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={44}>
      <AreaChart data={data} margin={{ top: 2, bottom: 0, left: 0, right: 0 }}>
        <Area dataKey="views" stroke={TAN} fill={TAN} fillOpacity={0.18} strokeWidth={1.5} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ---------- main channel trend: metric toggle, zoom brush, upload markers ----------
export type Upload = { date: string; title: string; id: string };

function TrendTooltip({ active, payload, label, uploads, metric }: { active?: boolean; payload?: { value: number }[]; label?: string; uploads: Map<string, Upload[]>; metric: "views" | "subscribers" }) {
  if (!active || !payload?.length || !label) return null;
  const ups = uploads.get(label) ?? [];
  return (
    <div className="max-w-[260px] rounded-[14px] border border-line bg-white px-3 py-2 text-[13px]">
      <p className="text-muted">{shortDate(label)}</p>
      <p className="tnum mt-0.5 font-medium">{fmt(payload[0].value)} <span className="font-normal text-muted">{metric === "views" ? "views" : "subscribers"}</span></p>
      {ups.length > 0 && (
        <ul className="mt-1.5 border-t border-line pt-1.5 text-tan-ink">
          {ups.slice(0, 3).map((u) => <li key={u.id} className="truncate">Published: {u.title}</li>)}
          {ups.length > 3 && <li className="text-muted">+{ups.length - 3} more</li>}
        </ul>
      )}
    </div>
  );
}

export function TrendChart({ data, uploads = [], onPickUpload }: { data: SeriesPoint[]; uploads?: Upload[]; onPickUpload?: (u: Upload) => void }) {
  const [metric, setMetric] = useState<"views" | "subscribers">("views");
  const [showUploads, setShowUploads] = useState(true);
  const byDate = useMemo(() => {
    const m = new Map<string, Upload[]>();
    for (const u of uploads) m.set(u.date, [...(m.get(u.date) ?? []), u]);
    return m;
  }, [uploads]);
  const points = useMemo(() => data.slice(1).map((d) => ({ ...d, y: d[metric] })), [data, metric]);
  const markers = useMemo(() => points.filter((p) => byDate.has(p.date)), [points, byDate]);
  const long = data.length > 60;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Pills value={metric} onChange={setMetric} options={[{ value: "views", label: "Daily views" }, { value: "subscribers", label: "Subscribers" }]} />
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={showUploads} onChange={(e) => setShowUploads(e.target.checked)} className="accent-[#b5836a]" />
          Show upload days
        </label>
      </div>
      <ResponsiveContainer width="100%" height={long ? 320 : 260}>
        <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          <CartesianGrid vertical={false} stroke={LINE} />
          <XAxis dataKey="date" tickFormatter={shortDate} tickLine={false} axisLine={false} minTickGap={40} />
          <YAxis domain={metric === "subscribers" ? ["auto", "auto"] : [0, "auto"]} tickFormatter={(v) => fmt(v)} tickLine={false} axisLine={false} width={56} />
          <Tooltip {...tip} content={<TrendTooltip uploads={byDate} metric={metric} />} />
          <Area type="monotone" dataKey="y" stroke={metric === "views" ? TAN : DEEP} fill={metric === "views" ? TAN : DEEP} fillOpacity={0.15} strokeWidth={2} activeDot={{ r: 5, fill: DEEP, stroke: "#fff", strokeWidth: 2 }} />
          {showUploads && markers.map((p) => (
            <ReferenceDot
              key={p.date} x={p.date} y={p.y} r={5} fill="#fff" stroke={DEEP} strokeWidth={2}
              style={{ cursor: onPickUpload ? "pointer" : "default" }}
              onClick={() => onPickUpload?.(byDate.get(p.date)![0])}
            />
          ))}
          {long && <Brush dataKey="date" height={26} stroke={TAN} fill="#f4ece5" tickFormatter={shortDate} travellerWidth={10} />}
        </AreaChart>
      </ResponsiveContainer>
      {long && <p className="mt-1 text-xs text-muted">Drag the handles under the chart to zoom into a period. Dots are upload days; click one to open the video.</p>}
    </div>
  );
}

// ---------- retention: clickable legend hides/shows series ----------
export function RetentionCurve({ data, labels = { recent_ratio: "Last 10 videos", baseline_ratio: "12-month baseline" } }: { data: RetentionPoint[]; labels?: Record<string, string> }) {
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const toggle = (key: string) => setHidden((h) => ({ ...h, [key]: !h[key] }));
  const drop = useMemo(() => {
    const at30 = data.find((d) => d.elapsed_pct >= 30);
    return at30 ? { recent: at30.recent_ratio, base: at30.baseline_ratio } : null;
  }, [data]);

  return (
    <div>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          <CartesianGrid vertical={false} stroke={LINE} />
          <XAxis dataKey="elapsed_pct" tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} type="number" domain={[0, 100]} />
          <YAxis domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} tickLine={false} axisLine={false} width={48} />
          <Tooltip {...tip} formatter={(v: number, name: string) => [`${Math.round(v * 100)}% still watching`, labels[name] ?? name]} labelFormatter={(v) => `${v}% of the video`} />
          <Legend
            verticalAlign="top" align="right" iconType="plainline" height={30}
            formatter={(value: string) => <span style={{ color: hidden[value] ? "#b8aca2" : INK, cursor: "pointer", textDecoration: hidden[value] ? "line-through" : "none" }}>{labels[value] ?? value}</span>}
            onClick={(e) => toggle(String(e.dataKey))}
          />
          <Line type="monotone" dataKey="baseline_ratio" stroke={LINE} strokeWidth={2} dot={false} hide={hidden.baseline_ratio} />
          <Line type="monotone" dataKey="recent_ratio" stroke={TAN} strokeWidth={2.5} dot={false} connectNulls hide={hidden.recent_ratio} activeDot={{ r: 5, fill: DEEP, stroke: "#fff", strokeWidth: 2 }} />
        </LineChart>
      </ResponsiveContainer>
      {drop && drop.recent != null && (
        <p className="mt-1 text-sm text-muted">
          At 30%: <span className="tnum text-ink">{Math.round(drop.recent * 100)}%</span> of viewers still watching, vs {Math.round(drop.base * 100)}% baseline
          {drop.recent < drop.base - 0.03 && <span className="text-bad"> — early drop-off is worse than usual</span>}.
        </p>
      )}
    </div>
  );
}

// ---------- video page: cumulative vs daily gained ----------
export function VideoViewsChart({ data }: { data: { date: string; views: number }[] }) {
  const [mode, setMode] = useState<"total" | "daily">("total");
  const points = useMemo(() => data.map((d, i) => ({ date: d.date, total: d.views, daily: i === 0 ? d.views : Math.max(0, d.views - data[i - 1].views) })), [data]);
  return (
    <div>
      <div className="mb-3"><Pills value={mode} onChange={setMode} options={[{ value: "total", label: "Cumulative" }, { value: "daily", label: "Per day" }]} /></div>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          <CartesianGrid vertical={false} stroke={LINE} />
          <XAxis dataKey="date" tickFormatter={shortDate} tickLine={false} axisLine={false} minTickGap={40} />
          <YAxis tickFormatter={(v) => fmt(v)} tickLine={false} axisLine={false} width={56} />
          <Tooltip {...tip} formatter={(v: number) => [fmt(v), mode === "total" ? "Total views" : "Views that day"]} labelFormatter={shortDate} />
          <Area type="monotone" dataKey={mode} stroke={TAN} fill={TAN} fillOpacity={0.15} strokeWidth={2} activeDot={{ r: 5, fill: DEEP, stroke: "#fff", strokeWidth: 2 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------- competitors: overlay several channels' daily views ----------
const PALETTE = [DEEP, "#c9a58f", "#7d6a5d", "#e0b9a3", "#5a3b2b", "#a88b78"];

export function CompareChart({ series, names }: { series: Record<string, SeriesPoint[]>; names: Record<string, string> }) {
  const ids = Object.keys(series);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const merged = useMemo(() => {
    const byDate = new Map<string, Record<string, number | string>>();
    for (const id of ids) for (const p of series[id]) byDate.set(p.date, { ...(byDate.get(p.date) ?? { date: p.date }), [id]: p.views });
    return [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [series, ids]);
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={merged} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
        <CartesianGrid vertical={false} stroke={LINE} />
        <XAxis dataKey="date" tickFormatter={shortDate} tickLine={false} axisLine={false} minTickGap={40} />
        <YAxis tickFormatter={(v) => fmt(v)} tickLine={false} axisLine={false} width={56} />
        <Tooltip {...tip} formatter={(v: number, name: string) => [fmt(v), names[name] ?? name]} labelFormatter={shortDate} />
        <Legend
          verticalAlign="top" align="right" iconType="plainline" height={30}
          formatter={(value: string) => <span style={{ color: hidden[value] ? "#b8aca2" : INK, cursor: "pointer", textDecoration: hidden[value] ? "line-through" : "none" }}>{names[value] ?? value}</span>}
          onClick={(e) => setHidden((h) => ({ ...h, [String(e.dataKey)]: !h[String(e.dataKey)] }))}
        />
        {ids.map((id, i) => (
          <Line key={id} type="monotone" dataKey={id} stroke={i === 0 ? TAN : PALETTE[(i - 1) % PALETTE.length]} strokeWidth={i === 0 ? 3 : 2} dot={false} hide={hidden[id]} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
