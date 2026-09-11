export type Channel = {
  id: string; yt_channel_id: string | null; name: string; handle: string | null;
  kind: "own" | "competitor"; thumbnail_url: string | null; needs_reconnect: boolean;
};

export type ChannelLatest = Channel & {
  as_of: string | null; subscribers: number | null; total_views: number | null; video_count: number | null;
  views_28d: number | null; views_prev_28d: number | null; subs_28d: number | null; subs_prev_28d: number | null;
};

export type SeriesPoint = { date: string; views: number; subscribers: number };

export type Kpis = {
  views: number; prev_views: number; watch_time_min: number; prev_watch_time_min: number;
  subs_net: number; prev_subs_net: number; avg_view_duration_s: number; prev_avg_view_duration_s: number;
  ctr: number | null; prev_ctr: number | null; as_of: string | null;
};

export type TopVideo = {
  id: string; yt_video_id: string; channel_id: string; channel_name: string; title: string;
  thumbnail_url: string | null; published_at: string; is_short: boolean; topic: string | null;
  views_window: number; views_total: number; velocity_48h: number | null; avg_view_pct: number | null; ctr: number | null;
};

export type TopicLift = { topic: string; videos: number; median_views_7d: number; lift: number | null };
export type RetentionPoint = { elapsed_pct: number; recent_ratio: number | null; baseline_ratio: number };
export type Pace = { metric: "views" | "subs" | "watch_time"; target: number; actual: number; expected: number; pace: number; projected: number };
export type TopicGap = { topic: string; competitor_videos: number; competitor_median_views: number };
export type Target = { id: string; channel_id: string; period: string; metric: string; target_value: number };

export type VideoRow = {
  id: string; yt_video_id: string; channel_id: string; title: string; description: string | null;
  published_at: string; duration_s: number | null; thumbnail_url: string | null; is_short: boolean;
  channels: { name: string } | { name: string }[] | null;
};
