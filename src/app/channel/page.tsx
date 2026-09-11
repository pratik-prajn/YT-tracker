"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useAsync, Loading, Empty, ErrorBox } from "@/components/Async";
import { Stat } from "@/components/Stat";
import { Section } from "@/components/Section";
import { TargetStrip } from "@/components/TargetStrip";
import { TrendChart, RetentionCurve, Pills, RANGES, type RangeDays } from "@/components/Charts";
import { useRouter } from "next/navigation";
import { VideoTable } from "@/components/VideoTable";
import { TopicBars } from "@/components/TopicBars";
import { q } from "@/lib/queries";
import { fmt, pct, duration, currentPeriod, shortDate } from "@/lib/format";

function ChannelView({ id }: { id: string }) {
  const [topic, setTopic] = useState<string | null>(null);
  const [range, setRange] = useState<RangeDays>(90);
  const [videoWindow, setVideoWindow] = useState<7 | 28 | 90>(28);
  const [search, setSearch] = useState("");
  const router = useRouter();
  const period = currentPeriod();

  const head = useAsync(() => Promise.all([q.channelLatestOne(id), q.pace(id).catch(() => []), q.kpis(id).catch(() => undefined)]), [id]);
  const series = useAsync(() => q.series(id, range), [id, range]);
  const videos = useAsync(() => q.topVideos([id], videoWindow, 60), [id, videoWindow]);
  const topics = useAsync(() => q.topicLift([id]), [id]);
  const retention = useAsync(() => q.retention(id, 10), [id]);

  if (head.loading) return <Loading lines={5} />;
  if (head.error) return <ErrorBox message={head.error} />;
  const [c, pace, k] = head.data!;
  const avgViewsPerVideo = c.total_views != null && c.video_count ? c.total_views / c.video_count : null;
  const filtered = videos.data
    ?.filter((v) => !topic || (v.topic ?? "Untagged") === topic)
    .filter((v) => !search || v.title.toLowerCase().includes(search.toLowerCase()));
  const uploads = videos.data?.map((v) => ({ date: v.published_at.slice(0, 10), title: v.title, id: v.id })) ?? [];

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display display-tight text-[40px] text-ink sm:text-[56px]">{c.name}</h1>
          <p className="mt-2 text-muted">
            {fmt(c.subscribers)} subscribers · {fmt(c.total_views)} lifetime views · {c.video_count ?? "—"} videos
            {c.as_of && <> · public data as of {shortDate(c.as_of)}</>}
            {k?.as_of && <> · private data as of {shortDate(k.as_of)}</>}
          </p>
        </div>
        <Link href={`/competitors/?id=${id}`} className="rounded-full border border-tan px-5 py-2 text-tan-deep hover:bg-tan-tint">Competitors</Link>
      </header>

      <div className="mt-8"><TargetStrip pace={pace} period={period} /></div>

      <div className="mt-10 grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Views, 28d" value={fmt(c.views_28d)} cur={c.views_28d} prev={c.views_prev_28d} note={c.views_28d == null ? "Needs two public syncs" : undefined} />
        <Stat label="Subscribers, 28d" value={`${(c.subs_28d ?? 0) >= 0 ? "+" : ""}${fmt(c.subs_28d)}`} cur={c.subs_28d} prev={c.subs_prev_28d} note={c.subs_28d == null ? "Needs two public syncs" : undefined} />
        <Stat label="Avg views / video" value={fmt(avgViewsPerVideo)} note="Public lifetime average" />
        <Stat label="Watch time, 28d" value={k ? fmt(k.watch_time_min / 60) : "—"} suffix={k ? " h" : undefined} cur={k?.watch_time_min} prev={k?.prev_watch_time_min} note={k ? undefined : "Requires channel owner access"} />
        <Stat label="Avg view duration" value={k ? duration(k.avg_view_duration_s) : "—"} cur={k?.avg_view_duration_s} prev={k?.prev_avg_view_duration_s} note={k ? undefined : "Requires channel owner access"} />
        <Stat label="Click-through rate" value={k?.ctr != null ? pct(k.ctr) : "—"} cur={k?.ctr} prev={k?.prev_ctr} note={k?.ctr == null ? "Requires channel owner access" : undefined} />
      </div>

      <Section title="Trend" aside={<Pills value={range} onChange={setRange} options={RANGES.map((r) => ({ value: r.value, label: r.label }))} />}>
        {series.loading && <Loading />}
        {series.error && <ErrorBox message={series.error} />}
        {series.data && (series.data.length ? (
          <TrendChart data={series.data} uploads={uploads} onPickUpload={(u) => router.push(`/video/?id=${u.id}`)} />
        ) : <Empty title="No history yet" hint="The trend appears after two daily syncs." />)}
      </Section>

      <Section title={topic ? `Top videos · ${topic}` : "Top videos"} aside={
        <span className="flex flex-wrap items-center gap-3">
          {topic && <button onClick={() => setTopic(null)} className="text-tan-deep underline underline-offset-2">All topics</button>}
          <Pills value={videoWindow} onChange={setVideoWindow} options={[{ value: 7, label: "7d" }, { value: 28, label: "28d" }, { value: 90, label: "90d" }]} />
        </span>
      }>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search titles" className="mb-3 w-full rounded-full border border-line px-4 py-2 text-sm outline-none focus:border-tan sm:w-72" />
        {videos.loading && <Loading lines={6} />}
        {videos.error && <ErrorBox message={videos.error} />}
        {filtered && (filtered.length ? <VideoTable videos={filtered} windowLabel={`${videoWindow}d`} /> : <Empty title="No videos match" hint={search ? "Try a different search." : "Nothing published or viewed in this videoWindow."} />)}
      </Section>

      <Section title="Topics" aside="lift vs channel median">
        {topics.loading && <Loading />}
        {topics.error && <ErrorBox message={topics.error} />}
        {topics.data && (topics.data.length ? <TopicBars topics={topics.data} onPick={setTopic} active={topic} /> : <Empty title="Not tagged yet" hint="Topics appear after the classify job runs." />)}
      </Section>

      <Section title="Retention" aside="Last 10 videos against the 12-month baseline">
        {retention.loading && <Loading />}
        {retention.error && <ErrorBox message={retention.error} />}
        {retention.data && (retention.data.length ? <RetentionCurve data={retention.data} /> : <Empty title="No retention data" hint="Retention is private — connect the channel with the OAuth script and it appears after the next analytics sync." />)}
      </Section>
    </>
  );
}

function Inner() {
  const id = useSearchParams().get("id");
  if (!id) return <Empty title="Pick a channel" hint="Choose one from the sidebar." />;
  return <ChannelView id={id} />;
}

export default function Page() {
  return <Suspense fallback={<Loading />}><Inner /></Suspense>;
}
