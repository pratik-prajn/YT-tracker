"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useAsync, Loading, Empty, ErrorBox } from "@/components/Async";
import { Section } from "@/components/Section";
import { VideoTable } from "@/components/VideoTable";
import { TopicBars } from "@/components/TopicBars";
import { CompareChart, Pills, RANGES, type RangeDays } from "@/components/Charts";
import { useState } from "react";
import type { SeriesPoint } from "@/lib/types";
import { q } from "@/lib/queries";
import { fmt, delta } from "@/lib/format";

function Compare({ own }: { own: string }) {
  const head = useAsync(() => Promise.all([q.channelLatestOne(own), q.competitorsOf(own)]), [own]);
  const compIds = head.data ? head.data[1].map((c) => c.id) : [];
  const key = compIds.join();
  const videos = useAsync(() => (compIds.length ? q.topVideos(compIds, 28, 20) : Promise.resolve([])), [key]);
  const topics = useAsync(() => (compIds.length ? q.topicLift(compIds) : Promise.resolve([])), [key]);
  const gap = useAsync(() => q.topicGap(own), [own]);
  const [range, setRange] = useState<RangeDays>(28);
  const allIds = head.data ? [head.data[0].id, ...compIds] : [];
  const trend = useAsync(async () => {
    const out: Record<string, SeriesPoint[]> = {};
    await Promise.all(allIds.map(async (id) => { out[id] = await q.series(id, range).catch(() => []); }));
    return out;
  }, [allIds.join(), range]);

  if (head.loading) return <Loading lines={5} />;
  if (head.error) return <ErrorBox message={head.error} />;
  const [me, comps] = head.data!;
  const all = [me, ...comps];

  return (
    <>
      <header>
        <p className="text-muted"><Link href={`/channel/?id=${own}`} className="text-tan-deep hover:underline">{me.name}</Link> · competitors</p>
        <h1 className="display display-tight mt-1 text-[36px] text-ink sm:text-[56px]">Who else is winning this audience</h1>
        <p className="mt-2 max-w-2xl text-muted">Public numbers only — nobody can see a competitor's retention or CTR. Growth speed, upload cadence and topics are the signal here.</p>
      </header>

      {comps.length === 0 ? (
        <div className="mt-10">
          <Empty title="No competitors tracked yet" hint="Add channels by handle or URL in settings. They start syncing within 15 minutes." action={<Link href="/settings/" className="rounded-full bg-tan px-5 py-2 text-cream">Add competitors</Link>} />
        </div>
      ) : (
        <>
          <Section title="Daily views, overlaid" aside={<Pills value={range} onChange={setRange} options={RANGES.map((r) => ({ value: r.value, label: r.label }))} />}>
            {trend.loading && <Loading />}
            {trend.data && <CompareChart series={trend.data} names={Object.fromEntries(all.map((c) => [c.id, c.name]))} />}
            <p className="mt-1 text-xs text-muted">Click a name in the legend to hide or show it.</p>
          </Section>

          <Section title="Side by side, last 28 days">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[14px]">
              <thead className="border-b border-line text-sm text-muted">
                <tr>
                  <th className="py-2 text-left font-normal">Channel</th>
                  <th className="py-2 text-right font-normal">Subscribers</th>
                  <th className="py-2 text-right font-normal">Subs gained</th>
                  <th className="py-2 text-right font-normal">Views</th>
                  <th className="py-2 text-right font-normal">vs prior 28d</th>
                  <th className="py-2 text-right font-normal">Videos</th>
                </tr>
              </thead>
              <tbody>
                {all.map((c) => {
                  const d = delta(c.views_28d, c.views_prev_28d);
                  const mine = c.id === me.id;
                  return (
                    <tr key={c.id} className={mine ? "bg-tan-tint font-medium" : ""}>
                      <td className="py-2.5 pl-2">{c.name}{mine && <span className="ml-2 text-xs text-tan-deep">you</span>}</td>
                      <td className="tnum py-2.5 text-right">{fmt(c.subscribers)}</td>
                      <td className="tnum py-2.5 text-right">{c.subs_28d == null ? "—" : `${c.subs_28d >= 0 ? "+" : ""}${fmt(c.subs_28d)}`}</td>
                      <td className="tnum display py-2.5 text-right text-[20px]">{fmt(c.views_28d)}</td>
                      <td className={`tnum py-2.5 text-right ${d.dir === "up" ? "text-ok" : d.dir === "down" ? "text-bad" : "text-muted"}`}>{d.text}</td>
                      <td className="tnum py-2.5 pr-2 text-right text-muted">{c.video_count ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </Section>

          <div className="grid gap-x-10 lg:grid-cols-[1fr_320px]">
            <Section title="Their top videos, 28 days">
              {videos.loading && <Loading lines={6} />}
              {videos.error && <ErrorBox message={videos.error} />}
              {videos.data && (videos.data.length ? <VideoTable videos={videos.data} showChannel privateCols={false} /> : <Empty title="Nothing synced yet" hint="Competitor videos appear after the next public sync." />)}
            </Section>
            <div>
              <Section title="Topics they cover that you don't" aside="last 90 days">
                {gap.loading && <Loading />}
                {gap.error && <ErrorBox message={gap.error} />}
                {gap.data && (gap.data.length ? (
                  <ul className="space-y-3">
                    {gap.data.map((g) => (
                      <li key={g.topic} className="flex items-baseline justify-between border-b border-line pb-2">
                        <span>{g.topic}</span>
                        <span className="tnum text-sm text-muted">{g.competitor_videos} videos · {fmt(g.competitor_median_views)} median</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-muted">You cover everything they cover.</p>)}
              </Section>
              <Section title="Their topic lift">
                {topics.loading && <Loading />}
                {topics.data && (topics.data.length ? <TopicBars topics={topics.data} /> : <p className="text-muted">Not tagged yet.</p>)}
              </Section>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function Inner() {
  const id = useSearchParams().get("id");
  if (!id) return <Empty title="Pick a channel" hint="Open a channel from the sidebar, then its competitors." />;
  return <Compare own={id} />;
}

export default function Page() {
  return <Suspense fallback={<Loading />}><Inner /></Suspense>;
}
