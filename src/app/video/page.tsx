"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useAsync, Loading, Empty, ErrorBox } from "@/components/Async";
import { Stat } from "@/components/Stat";
import { Section } from "@/components/Section";
import { VideoViewsChart, RetentionCurve } from "@/components/Charts";
import { q } from "@/lib/queries";
import { fmt, pct, duration, shortDate, daysAgo } from "@/lib/format";

function VideoView({ id }: { id: string }) {
  const s = useAsync(async () => {
    const [v, daily, priv, ret, topic] = await Promise.all([
      q.video(id), q.videoDaily(id), q.videoAnalytics(id), q.videoRetention(id), q.videoTopic(id).catch(() => null),
    ]);
    return { v, daily, priv: priv[0], ret, topic };
  }, [id]);

  if (s.loading) return <Loading lines={5} />;
  if (s.error) return <ErrorBox message={s.error} />;
  const { v, daily, priv, ret, topic } = s.data!;
  const channelName = Array.isArray(v.channels) ? v.channels[0]?.name : v.channels?.name;
  const latest = daily.at(-1);
  const at48 = daily.find((d) => new Date(d.date).getTime() >= new Date(v.published_at).getTime() + 48 * 3600e3);

  return (
    <>
      <header>
        <p className="text-muted"><Link href={`/channel/?id=${v.channel_id}`} className="text-tan-deep hover:underline">{channelName}</Link> · published {shortDate(v.published_at)} · {daysAgo(v.published_at)} days ago</p>
        <h1 className="display display-tight mt-1 max-w-3xl text-[30px] text-ink sm:text-[40px]">{v.title}</h1>
        <p className="mt-2 text-muted">{v.is_short ? "Short" : "Long-form"} · {duration(v.duration_s)} · {topic?.name ?? "Untagged"} · <a href={`https://youtu.be/${v.yt_video_id}`} target="_blank" rel="noreferrer" className="text-tan-deep hover:underline">Open on YouTube</a></p>
      </header>

      <div className="mt-10 grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Total views" value={fmt(latest?.views)} />
        <Stat label="Views in first 48h" value={fmt(at48?.views)} />
        <Stat label="Likes" value={fmt(latest?.likes)} />
        <Stat label="Avg % viewed" value={pct(priv?.avg_view_pct, 0)} note={priv ? undefined : "Private — own channels only"} />
        <Stat label="Click-through rate" value={pct(priv?.ctr)} />
      </div>

      <div className="grid gap-x-10 lg:grid-cols-2">
        <Section title="Cumulative views">
          {daily.length ? <VideoViewsChart data={daily} /> : <Empty title="No snapshots yet" />}
        </Section>
        <Section title="Audience retention">
          {ret.length
            ? <RetentionCurve data={ret.map((r) => ({ elapsed_pct: r.elapsed_pct, recent_ratio: r.audience_watch_ratio, baseline_ratio: r.audience_watch_ratio }))} />
            : <Empty title="No retention curve" hint="Only available for connected channels, for videos under 90 days old." />}
        </Section>
      </div>

      {v.description && (
        <Section title="Description">
          <p className="max-w-2xl whitespace-pre-line text-muted">{v.description.slice(0, 800)}</p>
        </Section>
      )}
    </>
  );
}

function Inner() {
  const id = useSearchParams().get("id");
  if (!id) return <Empty title="No video selected" />;
  return <VideoView id={id} />;
}

export default function Page() {
  return <Suspense fallback={<Loading />}><Inner /></Suspense>;
}
