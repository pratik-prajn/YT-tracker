// Public data for ALL channels (own + competitors) via Data API v3.
// Runs every 6 hours. Idempotent: upserts on (id, date).
import { db, today, chunk, must } from "./lib/db";
import { channelsList, playlistVideoIds, videosList, isoToSeconds } from "./lib/youtube";
import { quotaUsed } from "./lib/quota";

const VIDEOS_PER_CHANNEL = Number(process.env.VIDEOS_PER_CHANNEL ?? 200);

type ChannelRow = { id: string; yt_channel_id: string | null; handle: string | null; kind: string; uploads_playlist_id: string | null };

async function main() {
  const channels = await must<ChannelRow[]>(db.from("channels").select("id, yt_channel_id, handle, kind, uploads_playlist_id"));
  const date = today();

  // 1. Resolve channels added by handle from the UI (yt_channel_id still null)
  for (const c of channels.filter((c) => !c.yt_channel_id && c.handle)) {
    const [yt] = await channelsList({ forHandle: c.handle!.replace(/^@/, "") });
    if (!yt) { console.warn(`Could not resolve handle ${c.handle}`); continue; }
    await must<{ id: string; yt_video_id: string }[]>(db.from("channels").update({
      yt_channel_id: yt.id, name: yt.snippet.title, uploads_playlist_id: yt.contentDetails.relatedPlaylists.uploads,
      thumbnail_url: yt.snippet.thumbnails?.default?.url ?? null,
    }).eq("id", c.id));
    c.yt_channel_id = yt.id; c.uploads_playlist_id = yt.contentDetails.relatedPlaylists.uploads;
  }

  const live = channels.filter((c) => c.yt_channel_id);
  const byYt = new Map(live.map((c) => [c.yt_channel_id!, c]));

  // 2. Channel-level snapshot: 1 unit per 50 channels
  for (const batch of chunk([...byYt.keys()], 50)) {
    const items = await channelsList({ ids: batch });
    await must(db.from("channel_daily").upsert(items.map((yt) => ({
      channel_id: byYt.get(yt.id)!.id, date,
      subscribers: Number(yt.statistics.subscriberCount ?? 0),
      total_views: Number(yt.statistics.viewCount ?? 0),
      video_count: Number(yt.statistics.videoCount ?? 0),
    }))));
    for (const yt of items) {
      const c = byYt.get(yt.id)!;
      // Refresh metadata every run so a stale uploads playlist cannot stop sync.
      c.uploads_playlist_id = yt.contentDetails.relatedPlaylists.uploads;
      await must(db.from("channels").update({
        name: yt.snippet.title, handle: yt.snippet.customUrl ?? null,
        uploads_playlist_id: c.uploads_playlist_id, thumbnail_url: yt.snippet.thumbnails?.default?.url ?? null,
      }).eq("id", c.id));
    }
  }

  // 3. Videos: recent uploads per channel, metadata + daily view snapshot
  for (const c of live) {
    if (!c.uploads_playlist_id) continue;
    let ids: string[];
    try {
      ids = await playlistVideoIds(c.uploads_playlist_id, VIDEOS_PER_CHANNEL);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("playlistNotFound")) {
        console.warn(`Skipping ${c.yt_channel_id}: uploads playlist was not found; channel metadata was refreshed.`);
        continue;
      }
      throw error;
    }
    for (const batch of chunk(ids, 50)) {
      const vids = await videosList(batch);
      if (!vids.length) continue;
      const rows = vids.map((v) => {
        const duration_s = isoToSeconds(v.contentDetails.duration);
        return {
          yt_video_id: v.id, channel_id: c.id, title: v.snippet.title,
          description: v.snippet.description?.slice(0, 2000) ?? null, tags: v.snippet.tags ?? null,
          published_at: v.snippet.publishedAt, duration_s,
          thumbnail_url: v.snippet.thumbnails?.medium?.url ?? null,
          is_short: duration_s > 0 && duration_s <= 180 && /#shorts/i.test(`${v.snippet.title} ${v.snippet.description}`),
        };
      });
      const saved = await must<{ id: string; yt_video_id: string }[]>(db.from("videos").upsert(rows, { onConflict: "yt_video_id" }).select("id, yt_video_id"));
      const idMap = new Map(saved.map((s) => [s.yt_video_id, s.id]));
      await must(db.from("video_daily").upsert(vids.map((v) => ({
        video_id: idMap.get(v.id)!, date,
        views: Number(v.statistics.viewCount ?? 0), likes: Number(v.statistics.likeCount ?? 0), comments: Number(v.statistics.commentCount ?? 0),
      }))));
    }
    console.log(`synced ${c.kind} ${c.yt_channel_id}: ${ids.length} videos`);
  }
  console.log(`done. quota used: ${quotaUsed()} units`);
}

main().catch((e) => { console.error(e); process.exit(1); });
