"use client";
import Link from "next/link";
import { useState } from "react";
import type { TopVideo } from "@/lib/types";
import { fmt, pct, daysAgo } from "@/lib/format";

type Key = "views_window" | "velocity_48h" | "avg_view_pct" | "ctr" | "published_at";

export function VideoTable({ videos, showChannel = false, privateCols = true, windowLabel = "28d" }: { videos: TopVideo[]; showChannel?: boolean; privateCols?: boolean; windowLabel?: string }) {
  const [sort, setSort] = useState<Key>("views_window");
  const [visibleCount, setVisibleCount] = useState(20);
  const rows = [...videos].sort((a, b) => {
    if (sort === "published_at") return new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
    return (b[sort] ?? -1) - (a[sort] ?? -1);
  });
  const visibleRows = rows.slice(0, visibleCount);
  const Th = ({ k, children, right = true }: { k?: Key; children: React.ReactNode; right?: boolean }) => (
    <th className={`whitespace-nowrap px-2 py-2 font-normal text-muted ${right ? "text-right" : "text-left"}`}>
      {k ? (
        <button onClick={() => setSort(k)} className={`hover:text-ink ${sort === k ? "text-tan-deep" : ""}`}>{children}</button>
      ) : children}
    </th>
  );
  return (
    <>
      <div className="space-y-3 lg:hidden">
        {visibleRows.map((v) => (
          <Link key={v.id} href={`/video/?id=${v.id}`} className="block rounded-tile border border-line bg-tan-tint/40 p-3 hover:bg-tan-tint">
            <div className="flex min-w-0 gap-3">
              {v.thumbnail_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={v.thumbnail_url} alt="" className="h-14 w-24 shrink-0 rounded-md object-cover" />
              ) : <span className="h-14 w-24 shrink-0 rounded-md bg-tan-soft" />}
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 font-medium leading-snug">{v.title}</span>
                {v.is_short && <span className="mt-1 inline-block rounded-full bg-tan-soft px-2 py-0.5 text-xs text-tan-ink">Short</span>}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line pt-3 text-sm">
              <span className="text-muted">Topic <strong className="font-normal text-ink">{v.topic ?? "—"}</strong></span>
              <span className="text-muted">Age <strong className="tnum font-normal text-ink">{daysAgo(v.published_at)}d</strong></span>
              <span className="text-muted">Views ({windowLabel}) <strong className="tnum font-normal text-ink">{fmt(v.views_window)}</strong></span>
              <span className="text-muted">First 48h <strong className="tnum font-normal text-ink">{fmt(v.velocity_48h)}</strong></span>
              {privateCols && <span className="text-muted">Avg viewed <strong className="tnum font-normal text-ink">{pct(v.avg_view_pct, 0)}</strong></span>}
              {privateCols && <span className="text-muted">CTR <strong className="tnum font-normal text-ink">{pct(v.ctr)}</strong></span>}
            </div>
          </Link>
        ))}
      </div>
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[900px] text-[14px]">
        <thead className="border-b border-line text-sm">
          <tr>
            <Th right={false}>Video</Th>
            {showChannel && <Th right={false}>Channel</Th>}
            <Th right={false}>Topic</Th>
            <Th k="published_at">Age</Th>
            <Th k="views_window">Views ({windowLabel})</Th>
            <Th k="velocity_48h">First 48h</Th>
            {privateCols && <Th k="avg_view_pct">Avg viewed</Th>}
            {privateCols && <Th k="ctr">CTR</Th>}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((v, i) => (
            <tr key={v.id} className={`border-b border-line/50 ${i % 2 ? "bg-tan-tint/60" : ""}`}>
              <td className="w-[390px] px-2 py-3 pr-4">
                <Link href={`/video/?id=${v.id}`} className="flex items-center gap-3 hover:text-tan-deep">
                  {v.thumbnail_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={v.thumbnail_url} alt="" className="h-10 w-[71px] shrink-0 rounded-md object-cover" />
                  ) : <span className="h-10 w-[71px] shrink-0 rounded-md bg-tan-soft" />}
                  <span className="line-clamp-2 max-w-[360px] leading-snug">{v.title}{v.is_short && <span className="ml-2 rounded-full bg-tan-soft px-2 py-0.5 text-xs text-tan-ink">Short</span>}</span>
                </Link>
              </td>
              {showChannel && <td className="whitespace-nowrap px-2 py-3 pr-3 text-muted">{v.channel_name}</td>}
              <td className="max-w-[130px] px-2 py-3 pr-3 text-muted">{v.topic ?? "—"}</td>
              <td className="tnum whitespace-nowrap px-2 py-3 text-right text-muted">{daysAgo(v.published_at)}d</td>
              <td className="tnum whitespace-nowrap px-2 py-3 text-right font-medium">{fmt(v.views_window)}</td>
              <td className="tnum whitespace-nowrap px-2 py-3 text-right">{fmt(v.velocity_48h)}</td>
              {privateCols && <td className="tnum whitespace-nowrap px-2 py-3 text-right">{pct(v.avg_view_pct, 0)}</td>}
              {privateCols && <td className="tnum whitespace-nowrap px-2 py-3 text-right">{pct(v.ctr)}</td>}
            </tr>
          ))}
        </tbody>
        </table>
      </div>
      {visibleCount < rows.length && (
        <button
          onClick={() => setVisibleCount((count) => count + 20)}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-tan px-4 py-2 text-sm text-tan-deep hover:bg-tan-tint"
        >
          Show next {Math.min(20, rows.length - visibleCount)} videos
          <span aria-hidden="true">↓</span>
        </button>
      )}
    </>
  );
}
