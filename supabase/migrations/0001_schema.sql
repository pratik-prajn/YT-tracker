-- Channel Analytics — schema, views, RPCs, RLS
-- Run once in Supabase SQL editor (or `supabase db push`).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Org config: which Google account domain may sign in
-- ---------------------------------------------------------------------------
create table if not exists org_config (
  id            int primary key default 1 check (id = 1),
  allowed_domain text not null                    -- e.g. 'be10x.in'
);

create or replace function is_org_member() returns boolean
language sql stable as $$
  select coalesce(
    (auth.jwt() ->> 'email') ilike '%@' || (select allowed_domain from org_config where id = 1),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- Core tables
-- ---------------------------------------------------------------------------
create table if not exists channels (
  id                  uuid primary key default gen_random_uuid(),
  yt_channel_id       text unique,                -- null until the sync resolves a handle
  name                text not null,
  handle              text,
  kind                text not null check (kind in ('own','competitor')),
  owner_email         text,
  refresh_token_enc   text,                       -- AES-GCM, own channels only
  uploads_playlist_id text,
  thumbnail_url       text,
  needs_reconnect     boolean not null default false,
  created_at          timestamptz not null default now()
);

create table if not exists channel_daily (
  channel_id   uuid references channels(id) on delete cascade,
  date         date not null,
  subscribers  bigint,
  total_views  bigint,
  video_count  int,
  primary key (channel_id, date)
);

create table if not exists channel_analytics (          -- own channels only
  channel_id          uuid references channels(id) on delete cascade,
  date                date not null,
  views               bigint,
  watch_time_min      numeric,
  subs_gained         int,
  subs_lost           int,
  impressions         bigint,
  ctr                 numeric,                  -- percent, e.g. 4.8
  avg_view_duration_s numeric,
  primary key (channel_id, date)
);

create table if not exists videos (
  id            uuid primary key default gen_random_uuid(),
  yt_video_id   text unique not null,
  channel_id    uuid references channels(id) on delete cascade,
  title         text not null,
  description   text,
  tags          text[],
  published_at  timestamptz,
  duration_s    int,
  thumbnail_url text,
  is_short      boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists videos_channel_pub on videos (channel_id, published_at desc);

create table if not exists video_daily (
  video_id  uuid references videos(id) on delete cascade,
  date      date not null,
  views     bigint,
  likes     bigint,
  comments  bigint,
  primary key (video_id, date)
);

create table if not exists video_weekly (                -- 90-day roll-up target
  video_id   uuid references videos(id) on delete cascade,
  week_start date not null,
  views      bigint,
  likes      bigint,
  comments   bigint,
  primary key (video_id, week_start)
);

create table if not exists video_analytics (             -- own only
  video_id       uuid references videos(id) on delete cascade,
  date           date not null,
  views          bigint,
  watch_time_min numeric,
  avg_view_pct   numeric,                       -- average percentage viewed
  ctr            numeric,
  impressions    bigint,
  subs_gained    int,
  primary key (video_id, date)
);

create table if not exists video_retention (             -- own only
  video_id             uuid references videos(id) on delete cascade,
  elapsed_pct          numeric not null,        -- 0..100
  audience_watch_ratio numeric not null,        -- 0..1
  primary key (video_id, elapsed_pct)
);

create table if not exists topics (
  id        serial primary key,
  name      text unique not null,
  parent_id int references topics(id)
);

create table if not exists video_topics (
  video_id           uuid primary key references videos(id) on delete cascade,
  topic_id           int references topics(id),
  confidence         numeric,
  classifier_version text
);

create table if not exists targets (
  id           uuid primary key default gen_random_uuid(),
  channel_id   uuid references channels(id) on delete cascade,
  period       text not null,                   -- 'YYYY-MM'
  metric       text not null check (metric in ('views','subs','watch_time')),
  target_value bigint not null,
  set_by       text,
  set_at       timestamptz not null default now(),
  unique (channel_id, period, metric)
);

create table if not exists competitor_sets (
  own_channel_id        uuid references channels(id) on delete cascade,
  competitor_channel_id uuid references channels(id) on delete cascade,
  primary key (own_channel_id, competitor_channel_id)
);

-- ---------------------------------------------------------------------------
-- Views (security_invoker so RLS applies to the reader)
-- ---------------------------------------------------------------------------

-- Latest public snapshot per channel with 28-day and previous-28-day deltas
create or replace view v_channel_latest with (security_invoker = on) as
with latest as (
  select distinct on (channel_id) channel_id, date, subscribers, total_views, video_count
  from channel_daily order by channel_id, date desc
),
d28 as (
  select distinct on (cd.channel_id) cd.channel_id, cd.subscribers, cd.total_views
  from channel_daily cd join latest l on l.channel_id = cd.channel_id
  where cd.date <= l.date - 28 order by cd.channel_id, cd.date desc
),
d56 as (
  select distinct on (cd.channel_id) cd.channel_id, cd.subscribers, cd.total_views
  from channel_daily cd join latest l on l.channel_id = cd.channel_id
  where cd.date <= l.date - 56 order by cd.channel_id, cd.date desc
)
select c.id, c.yt_channel_id, c.name, c.handle, c.kind, c.thumbnail_url, c.needs_reconnect,
       l.date as as_of,
       l.subscribers, l.total_views, l.video_count,
       l.total_views  - d28.total_views  as views_28d,
       d28.total_views - d56.total_views as views_prev_28d,
       l.subscribers  - d28.subscribers  as subs_28d,
       d28.subscribers - d56.subscribers as subs_prev_28d
from channels c
left join latest l  on l.channel_id  = c.id
left join d28       on d28.channel_id = c.id
left join d56       on d56.channel_id = c.id;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Daily series: views gained per day (delta of cumulative total) + subscribers
create or replace function channel_series(cid uuid, days int default 90)
returns table (date date, views bigint, subscribers bigint)
language sql stable as $$
  select date,
         greatest(total_views - lag(total_views) over (order by date), 0) as views,
         subscribers
  from channel_daily
  where channel_id = cid and date >= current_date - (days + 1)
  order by date
  offset 1;
$$;

-- Own-channel private KPIs for the last N days vs the N days before
create or replace function channel_kpis(cid uuid, days int default 28)
returns table (
  views bigint, prev_views bigint,
  watch_time_min numeric, prev_watch_time_min numeric,
  subs_net bigint, prev_subs_net bigint,
  avg_view_duration_s numeric, prev_avg_view_duration_s numeric,
  ctr numeric, prev_ctr numeric,
  as_of date
)
language sql stable as $$
  with cur as (
    select sum(views) v, sum(watch_time_min) w, sum(subs_gained - subs_lost) s,
           avg(avg_view_duration_s) d, avg(ctr) c, max(date) mx
    from channel_analytics where channel_id = cid and date > current_date - days
  ),
  prev as (
    select sum(views) v, sum(watch_time_min) w, sum(subs_gained - subs_lost) s,
           avg(avg_view_duration_s) d, avg(ctr) c
    from channel_analytics where channel_id = cid
      and date > current_date - 2*days and date <= current_date - days
  )
  select cur.v, prev.v, cur.w, prev.w, cur.s, prev.s, cur.d, prev.d, cur.c, prev.c, cur.mx
  from cur, prev;
$$;

-- Top videos by views gained in the window, with velocity and private metrics if present
create or replace function top_videos(cids uuid[], days int default 28, lim int default 20)
returns table (
  id uuid, yt_video_id text, channel_id uuid, channel_name text, title text,
  thumbnail_url text, published_at timestamptz, is_short boolean,
  topic text, views_window bigint, views_total bigint, velocity_48h bigint,
  avg_view_pct numeric, ctr numeric
)
language sql stable as $$
  with latest as (
    select distinct on (video_id) video_id, date, views from video_daily
    order by video_id, date desc
  ),
  start as (
    select distinct on (vd.video_id) vd.video_id, vd.views
    from video_daily vd join latest l on l.video_id = vd.video_id
    where vd.date <= l.date - days order by vd.video_id, vd.date desc
  ),
  vel as (
    select distinct on (vd.video_id) vd.video_id, vd.views
    from video_daily vd join videos v on v.id = vd.video_id
    where vd.date >= (v.published_at + interval '48 hours')::date
    order by vd.video_id, vd.date asc
  ),
  priv as (
    select distinct on (video_id) video_id, avg_view_pct, ctr
    from video_analytics order by video_id, date desc
  )
  select v.id, v.yt_video_id, v.channel_id, c.name, v.title, v.thumbnail_url, v.published_at,
         v.is_short, t.name,
         (l.views - coalesce(s.views, 0))::bigint as views_window,
         l.views as views_total,
         vel.views as velocity_48h,
         priv.avg_view_pct, priv.ctr
  from videos v
  join channels c on c.id = v.channel_id
  join latest l   on l.video_id = v.id
  left join start s on s.video_id = v.id
  left join vel     on vel.video_id = v.id
  left join priv    on priv.video_id = v.id
  left join video_topics vt on vt.video_id = v.id
  left join topics t on t.id = vt.topic_id
  where v.channel_id = any(cids)
  order by views_window desc
  limit lim;
$$;

-- Topic lift: median 7-day views per topic vs channel median (1.0 = average)
create or replace function topic_lift(cids uuid[], months int default 6)
returns table (topic text, videos int, median_views_7d numeric, lift numeric)
language sql stable as $$
  with v7 as (
    select v.id, t.name as topic,
           (select vd.views from video_daily vd
            where vd.video_id = v.id and vd.date >= (v.published_at + interval '7 days')::date
            order by vd.date asc limit 1) as views_7d
    from videos v
    left join video_topics vt on vt.video_id = v.id
    left join topics t on t.id = vt.topic_id
    where v.channel_id = any(cids)
      and v.published_at >= current_date - (months * 30)
      and not v.is_short
  ),
  base as (select percentile_cont(0.5) within group (order by views_7d) as med from v7 where views_7d is not null)
  select coalesce(topic, 'Untagged'), count(*)::int,
         percentile_cont(0.5) within group (order by views_7d),
      round((percentile_cont(0.5) within group (order by views_7d) / nullif((select med from base), 0))::numeric, 2)
  from v7 where views_7d is not null
  group by topic
  order by 4 desc nulls last;
$$;

-- Average retention curve: last N videos vs everything, for one channel
create or replace function retention_curve(cid uuid, recent int default 10)
returns table (elapsed_pct numeric, recent_ratio numeric, baseline_ratio numeric)
language sql stable as $$
  with rv as (
    select id from videos where channel_id = cid and not is_short
    order by published_at desc limit recent
  )
  select r.elapsed_pct,
         avg(r.audience_watch_ratio) filter (where r.video_id in (select id from rv)),
         avg(r.audience_watch_ratio)
  from video_retention r join videos v on v.id = r.video_id
  where v.channel_id = cid
  group by r.elapsed_pct order by r.elapsed_pct;
$$;

-- Month pace: actual vs target vs expected-by-today, per metric
create or replace function month_pace(cid uuid, period text default to_char(current_date, 'YYYY-MM'))
returns table (metric text, target bigint, actual bigint, expected bigint, pace numeric, projected bigint)
language sql stable as $$
  with bounds as (
    select to_date(period || '-01', 'YYYY-MM-DD') as start_d,
           (to_date(period || '-01', 'YYYY-MM-DD') + interval '1 month')::date as end_d
  ),
  frac as (
    select start_d, end_d,
           least(greatest((current_date - start_d + 1)::numeric / (end_d - start_d), 0.01), 1) as f
    from bounds
  ),
  actual as (
    select 'views' as metric,
           (select max(total_views) - min(total_views) from channel_daily, frac
            where channel_id = cid and date >= start_d - 1 and date < end_d) as val
    union all
    select 'subs',
           (select max(subscribers) - min(subscribers) from channel_daily, frac
            where channel_id = cid and date >= start_d - 1 and date < end_d)
    union all
    select 'watch_time',
           (select sum(watch_time_min)::bigint from channel_analytics, frac
            where channel_id = cid and date >= start_d and date < end_d)
  )
  select t.metric, t.target_value, coalesce(a.val, 0),
         round(t.target_value * f)::bigint,
         round(coalesce(a.val, 0) / nullif(t.target_value * f, 0), 3),
         round(coalesce(a.val, 0) / f)::bigint
  from targets t
  join actual a on a.metric = t.metric
  cross join frac
  where t.channel_id = cid and t.period = month_pace.period;
$$;

-- Topics competitors cover that an own channel does not (last 90 days)
create or replace function topic_gap(own uuid)
returns table (topic text, competitor_videos int, competitor_median_views numeric)
language sql stable as $$
  with comp as (select competitor_channel_id as id from competitor_sets where own_channel_id = own),
  mine as (
    select distinct vt.topic_id from videos v join video_topics vt on vt.video_id = v.id
    where v.channel_id = own and v.published_at >= current_date - 90
  ),
  theirs as (
    select vt.topic_id, v.id,
           (select vd.views from video_daily vd where vd.video_id = v.id order by vd.date desc limit 1) views
    from videos v join video_topics vt on vt.video_id = v.id
    where v.channel_id in (select id from comp) and v.published_at >= current_date - 90
  )
  select t.name, count(*)::int, percentile_cont(0.5) within group (order by th.views)
  from theirs th join topics t on t.id = th.topic_id
  where th.topic_id not in (select topic_id from mine)
  group by t.name order by 2 desc;
$$;

-- ---------------------------------------------------------------------------
-- Row-level security: org members read everything; writes only where noted
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['org_config','channels','channel_daily','channel_analytics','videos',
    'video_daily','video_weekly','video_analytics','video_retention','topics','video_topics',
    'targets','competitor_sets']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists org_read on %I', t);
    execute format('create policy org_read on %I for select to authenticated using (is_org_member())', t);
  end loop;
end $$;

-- Leads can set targets, add competitors and edit the taxonomy from the UI
drop policy if exists org_write on targets;
create policy org_write on targets for all to authenticated
  using (is_org_member()) with check (is_org_member());

drop policy if exists org_write on competitor_sets;
create policy org_write on competitor_sets for all to authenticated
  using (is_org_member()) with check (is_org_member());

drop policy if exists org_write on topics;
create policy org_write on topics for all to authenticated
  using (is_org_member()) with check (is_org_member());

-- Leads can add channels (own or competitor) by handle/URL from the UI; the sync resolves them.
-- Refresh tokens are only ever written by the connect-channel script (service role).
drop policy if exists org_add_channel on channels;
create policy org_add_channel on channels for insert to authenticated
  with check (is_org_member() and refresh_token_enc is null);
drop policy if exists org_remove_channel on channels;
create policy org_remove_channel on channels for delete to authenticated
  using (is_org_member());

-- Never let the browser read refresh tokens: grant select on every column except that one.
-- (Frontend must name columns explicitly; `select *` on channels will be denied.)
revoke select on channels from authenticated, anon;
grant select (id, yt_channel_id, name, handle, kind, owner_email, uploads_playlist_id,
              thumbnail_url, needs_reconnect, created_at) on channels to authenticated;

-- ---------------------------------------------------------------------------
-- Seed: org domain + starter taxonomy (edit freely)
-- ---------------------------------------------------------------------------
insert into org_config (id, allowed_domain) values (1, 'yourcompany.com')
  on conflict (id) do nothing;

insert into topics (name) values
  ('Prompting'), ('AI agents'), ('Coding with AI'), ('Excel & productivity'),
  ('Careers & jobs'), ('Tool reviews'), ('AI news'), ('Business & money'),
  ('Beginner tutorials'), ('Deep dives')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- Maintenance: roll video_daily older than `cutoff` into video_weekly (service role only)
-- ---------------------------------------------------------------------------
create or replace function rollup_video_daily(cutoff date) returns int
language plpgsql security definer as $$
declare n int;
begin
  insert into video_weekly (video_id, week_start, views, likes, comments)
  select distinct on (video_id, date_trunc('week', date)) video_id, date_trunc('week', date)::date, views, likes, comments
  from video_daily where date < cutoff
  order by video_id, date_trunc('week', date), date desc
  on conflict (video_id, week_start) do update set views = excluded.views, likes = excluded.likes, comments = excluded.comments;
  delete from video_daily where date < cutoff;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function rollup_video_daily(date) from public, anon, authenticated;
