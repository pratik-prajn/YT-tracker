"use client";
import { supabase, CHANNEL_COLS } from "./supabase";
import type { Channel, ChannelLatest, SeriesPoint, Kpis, TopVideo, TopicLift, RetentionPoint, Pace, TopicGap, Target, VideoRow } from "./types";

// supabase-js result unwrapper. We type results ourselves (RPC/view rows) instead of using
// .returns<>(), which is strict about single vs array shapes.
async function unwrap<T>(p: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as T;
}

const real = {
  channels: (kind?: "own" | "competitor") => {
    let s = supabase().from("channels").select(CHANNEL_COLS).order("created_at");
    if (kind) s = s.eq("kind", kind);
    return unwrap<Channel[]>(s);
  },
  channelLatest: (kind?: "own" | "competitor") => {
    let s = supabase().from("v_channel_latest").select("*").order("name");
    if (kind) s = s.eq("kind", kind);
    return unwrap<ChannelLatest[]>(s);
  },
  channelLatestOne: (id: string) => unwrap<ChannelLatest>(supabase().from("v_channel_latest").select("*").eq("id", id).single()),
  series: async (cid: string, days = 90) => {
    const snapshots = await unwrap<{ date: string; total_views: number | null; subscribers: number | null }[]>(
      supabase().from("channel_daily").select("date, total_views, subscribers").eq("channel_id", cid)
        .gte("date", new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)).order("date")
    );
    return snapshots.map((snapshot, index) => ({
      date: snapshot.date,
      // The first point is the only public baseline available until another sync runs.
      views: index === 0 ? snapshot.total_views ?? 0 : Math.max((snapshot.total_views ?? 0) - (snapshots[index - 1].total_views ?? 0), 0),
      subscribers: snapshot.subscribers ?? 0,
    }));
  },
  kpis: async (cid: string, days = 28) => {
    const k = (await unwrap<Kpis[]>(supabase().rpc("channel_kpis", { cid, days })))[0];
    return k?.views == null && k?.watch_time_min == null && k?.avg_view_duration_s == null && k?.ctr == null ? undefined : k;
  },
  topVideos: (cids: string[], days = 28, lim = 20) => unwrap<TopVideo[]>(supabase().rpc("top_videos", { cids, days, lim })),
  topicLift: (cids: string[], months = 6) => unwrap<TopicLift[]>(supabase().rpc("topic_lift", { cids, months })),
  retention: (cid: string, recent = 10) => unwrap<RetentionPoint[]>(supabase().rpc("retention_curve", { cid, recent })),
  pace: (cid: string, period?: string) => unwrap<Pace[]>(supabase().rpc("month_pace", period ? { cid, period } : { cid })),
  topicGap: (own: string) => unwrap<TopicGap[]>(supabase().rpc("topic_gap", { own })),
  competitorsOf: async (own: string) => {
    const links = await unwrap<{ competitor_channel_id: string }[]>(supabase().from("competitor_sets").select("competitor_channel_id").eq("own_channel_id", own));
    const ids = links.map((l) => l.competitor_channel_id);
    if (!ids.length) return [] as ChannelLatest[];
    return unwrap<ChannelLatest[]>(supabase().from("v_channel_latest").select("*").in("id", ids).order("subscribers", { ascending: false }));
  },
  targets: (period: string) => unwrap<Target[]>(supabase().from("targets").select("id, channel_id, period, metric, target_value").eq("period", period)),
  upsertTarget: (t: { channel_id: string; period: string; metric: string; target_value: number; set_by: string }) =>
    unwrap<Target[]>(supabase().from("targets").upsert(t, { onConflict: "channel_id,period,metric" }).select()),
  video: (id: string) => unwrap<VideoRow>(supabase().from("videos").select("id, yt_video_id, channel_id, title, description, published_at, duration_s, thumbnail_url, is_short, channels(name)").eq("id", id).single()),
  videoDaily: (id: string) => unwrap<{ date: string; views: number; likes: number; comments: number }[]>(supabase().from("video_daily").select("date, views, likes, comments").eq("video_id", id).order("date")),
  videoAnalytics: (id: string) => unwrap<{ date: string; views: number; watch_time_min: number; avg_view_pct: number | null; ctr: number | null; impressions: number | null; subs_gained: number }[]>(supabase().from("video_analytics").select("date, views, watch_time_min, avg_view_pct, ctr, impressions, subs_gained").eq("video_id", id).order("date", { ascending: false }).limit(1)),
  videoRetention: (id: string) => unwrap<{ elapsed_pct: number; audience_watch_ratio: number }[]>(supabase().from("video_retention").select("elapsed_pct, audience_watch_ratio").eq("video_id", id).order("elapsed_pct")),
  videoTopic: async (id: string) => (await unwrap<{ topics: { name: string } | null } | null>(supabase().from("video_topics").select("topics(name)").eq("video_id", id).maybeSingle()))?.topics as { name: string } | null | undefined,
  topics: () => unwrap<{ id: number; name: string }[]>(supabase().from("topics").select("id, name").order("name")),
  addTopic: (name: string) => unwrap<{ id: number; name: string }[]>(supabase().from("topics").insert({ name }).select()),
  // Accepts @handle, youtube.com/@handle, youtube.com/channel/UC..., or a bare channel id.
  addChannel: async (kind: "own" | "competitor", input: string, ownId?: string) => {
    const parsed = parseChannelInput(input);
    if (!parsed) throw new Error("Paste a channel URL like youtube.com/@handle, or an @handle, or a UC… channel id.");
    const row = await unwrap<{ id: string }>(supabase().from("channels").insert({ kind, ...parsed }).select("id").single());
    if (kind === "competitor" && ownId) await unwrap(supabase().from("competitor_sets").insert({ own_channel_id: ownId, competitor_channel_id: row.id }));
    window.dispatchEvent(new Event("channels-changed"));
    return row.id;
  },
  removeChannel: async (id: string) => {
    await unwrap(supabase().from("channels").delete().eq("id", id));
    window.dispatchEvent(new Event("channels-changed"));
  },
  removeCompetitor: (own: string, comp: string) => unwrap(supabase().from("competitor_sets").delete().eq("own_channel_id", own).eq("competitor_channel_id", comp)),
};

export const q = real;

export function parseChannelInput(input: string): { name: string; handle: string | null; yt_channel_id: string | null } | null {
  const t = input.trim();
  const byId = /(UC[\w-]{22})/.exec(t);
  if (byId) return { name: byId[1], handle: null, yt_channel_id: byId[1] };
  const byHandle = /@([\w.-]+)/.exec(t) ?? (/^[\w.-]+$/.test(t) ? [t, t] : null);
  if (byHandle) return { name: `@${byHandle[1]}`, handle: `@${byHandle[1]}`, yt_channel_id: null };
  return null;
}
