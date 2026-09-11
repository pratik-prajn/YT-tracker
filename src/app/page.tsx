"use client";
import { useAsync, Loading, Empty, ErrorBox } from "@/components/Async";
import { ChannelTile } from "@/components/ChannelTile";
import { q } from "@/lib/queries";
import { currentPeriod, monthLabel } from "@/lib/format";

export default function Overview() {
  const period = currentPeriod();
  const { data, loading, error } = useAsync(async () => {
    const channels = await q.channelLatest("own");
    const extras = await Promise.all(channels.map(async (c) => ({
      series: await q.series(c.id, 90).catch(() => []),
      pace: (await q.pace(c.id).catch(() => []))?.find((p) => p.metric === "views"),
    })));
    return channels.map((c, i) => ({ c, ...extras[i] }));
  }, []);

  return (
    <>
      <header>
        <h1 className="display display-tight text-[40px] text-ink sm:text-[56px]">All channels</h1>
        <p className="mt-2 text-muted">Last 28 days, with {monthLabel(period)} pace against target. Numbers refresh every six hours.</p>
      </header>

      <div className="mt-10">
        {loading && <Loading lines={4} />}
        {error && <ErrorBox message={error} />}
        {data && data.length === 0 && (
          <Empty title="No channels connected yet" hint="Run `npm run connect-channel` once per channel, then `npm run sync:public`. The overview fills in on the first sync." />
        )}
        {data && data.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2">
            {data.map(({ c, series, pace }) => <ChannelTile key={c.id} c={c} series={series} pace={pace} />)}
          </div>
        )}
      </div>
    </>
  );
}
