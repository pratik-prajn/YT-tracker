// Private metrics for OWN channels via YouTube Analytics API (OAuth refresh tokens).
// Runs daily. Analytics data lags ~2 days, so we always re-pull the last 7 days.
import { db, must } from "./lib/db";
import { decrypt } from "./lib/crypto";
import { accessTokenFromRefresh, analyticsQuery, rowsToObjects } from "./lib/youtube";

const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

type Own = { id: string; yt_channel_id: string; refresh_token_enc: string | null };

async function main() {
  const own = await must<Own[]>(db.from("channels").select("id, yt_channel_id, refresh_token_enc").eq("kind", "own"));
  const start = daysAgo(7), end = daysAgo(1);

  for (const c of own) {
    if (!c.refresh_token_enc) { console.warn(`${c.yt_channel_id}: not connected, run npm run connect-channel`); continue; }
    let token: string;
    try { token = await accessTokenFromRefresh(decrypt(c.refresh_token_enc)); }
    catch (e) {
      console.error(`${c.yt_channel_id}: token refresh failed, flagging reconnect`, e);
      await db.from("channels").update({ needs_reconnect: true }).eq("id", c.id);
      continue;
    }
    await db.from("channels").update({ needs_reconnect: false }).eq("id", c.id);

    // Channel by day
    const ch = rowsToObjects(await analyticsQuery(token, {
      channelId: c.yt_channel_id, startDate: start, endDate: end, dimensions: "day",
      metrics: "views,estimatedMinutesWatched,subscribersGained,subscribersLost,averageViewDuration,cardImpressions",
    }));
    // impressions/CTR are only exposed on the Analytics API in some accounts; tolerate absence.
    await must<{ id: string; yt_video_id: string; published_at: string }[]>(db.from("channel_analytics").upsert(ch.map((r) => ({
      channel_id: c.id, date: r.day, views: r.views, watch_time_min: r.estimatedMinutesWatched,
      subs_gained: r.subscribersGained, subs_lost: r.subscribersLost, avg_view_duration_s: r.averageViewDuration,
    }))));

    // Per video (last 7 days), top 200 by views
    const vids = rowsToObjects(await analyticsQuery(token, {
      channelId: c.yt_channel_id, startDate: start, endDate: end, dimensions: "video",
      metrics: "views,estimatedMinutesWatched,averageViewPercentage,subscribersGained",
      sort: "-views", maxResults: 200,
    }));
    const ytIds = vids.map((r) => String(r.video));
    const known = await must<{ id: string; yt_video_id: string; published_at: string }[]>(db.from("videos").select("id, yt_video_id, published_at").in("yt_video_id", ytIds));
    const map = new Map(known.map((k) => [k.yt_video_id, k]));
    await must(db.from("video_analytics").upsert(vids.filter((r) => map.has(String(r.video))).map((r) => ({
      video_id: map.get(String(r.video))!.id, date: end, views: r.views, watch_time_min: r.estimatedMinutesWatched,
      avg_view_pct: r.averageViewPercentage, subs_gained: r.subscribersGained,
    }))));

    // Retention curves for videos < 90 days old (one request per video, so keep it bounded)
    const recent = known.filter((k) => Date.now() - new Date(k.published_at).getTime() < 90 * 864e5).slice(0, 40);
    for (const v of recent) {
      try {
        const rows = rowsToObjects(await analyticsQuery(token, {
          channelId: c.yt_channel_id, startDate: "2015-01-01", endDate: end, dimensions: "elapsedVideoTimeRatio",
          metrics: "audienceWatchRatio", filters: `video==${v.yt_video_id};audienceType==ORGANIC`,
        }));
        if (rows.length) await must(db.from("video_retention").upsert(rows.map((r) => ({
          video_id: v.id, elapsed_pct: Math.round(Number(r.elapsedVideoTimeRatio) * 100), audience_watch_ratio: r.audienceWatchRatio,
        }))));
      } catch (e) { console.warn(`retention failed for ${v.yt_video_id}`, (e as Error).message); }
    }
    console.log(`analytics synced for ${c.yt_channel_id}: ${ch.length} days, ${vids.length} videos, ${recent.length} retention curves`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
