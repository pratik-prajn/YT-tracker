-- Public dashboard access: anonymous users may read dashboard-safe data only.
-- Writes and private YouTube analytics remain restricted to the service role.

do $$
declare t text;
begin
  foreach t in array array['channels','channel_daily','videos','video_daily','video_weekly',
    'topics','video_topics','targets','competitor_sets']
  loop
    execute format('drop policy if exists public_read on %I', t);
    execute format('create policy public_read on %I for select to anon using (true)', t);
  end loop;
end $$;

-- Private analytics are intentionally unavailable to anonymous dashboard visitors.
drop policy if exists public_read on channel_analytics;
drop policy if exists public_read on video_analytics;
drop policy if exists public_read on video_retention;

-- The browser must never receive the encrypted YouTube refresh token.
revoke select on channels from anon;
grant select (id, yt_channel_id, name, handle, kind, owner_email, uploads_playlist_id,
              thumbnail_url, needs_reconnect, created_at) on channels to anon;

grant select on channel_daily, videos, video_daily, video_weekly,
  topics, video_topics, targets, competitor_sets to anon;
grant select on v_channel_latest to anon;

grant execute on function channel_series(uuid, int) to anon;
grant execute on function channel_kpis(uuid, int) to anon;
grant execute on function top_videos(uuid[], int, int) to anon;
grant execute on function topic_lift(uuid[], int) to anon;
grant execute on function retention_curve(uuid, int) to anon;
grant execute on function month_pace(uuid, text) to anon;
grant execute on function topic_gap(uuid) to anon;