# Channels — YouTube analytics dashboard

One view per channel (Decoded, AI Seekho, Be10x Labs, AI for Techies): monthly targets and pace, top videos, topic lift, retention, and competitor tracking. Everything runs on free tiers with no credit card.

| Layer | Service | Cost |
|---|---|---|
| Frontend | Next.js 15 static export on Cloudflare Pages | $0 |
| Database + login | Supabase Free (Postgres, Google auth, RLS) | $0 |
| Data sync | GitHub Actions cron → YouTube Data API v3 + Analytics API | $0 |
| Topic tagging | Gemini API free tier (Flash), keyword fallback | $0 |
| Alerts | Slack incoming webhook | $0 |

## Design

- Typeface: **Gentle** (MADETYPE) if you own it — drop `Gentle-Regular.woff2` into `public/fonts/` and it is picked up automatically. Until then Fraunces (soft axis) loads from Google Fonts as the stand-in.
- Palette: white surfaces, tan `#b5836a` as the structural colour (sidebar, target panel), cream text on tan, near-black ink. Tokens live in `src/app/globals.css`.

## Setup (once, ~1 hour)

### 1. Supabase
1. Create a free project. In **SQL editor**, run `supabase/migrations/0001_schema.sql`, then `supabase/migrations/0002_public_dashboard.sql`, then `supabase/migrations/0003_seed_real_channels.sql`.
2. The dashboard is public and does not require Supabase Google Auth. The `allowed_domain` value is retained only for legacy authenticated policies; anonymous reads are limited by the public dashboard migration.
3. Copy the project URL and anon key into `.env.local` (see `.env.example`). Keep the service-role key only in GitHub Actions or local script environment variables.

### 2. Google Cloud
1. New project → enable **YouTube Data API v3**, **YouTube Analytics API**.
2. **Credentials → API key** → `YOUTUBE_API_KEY`.
3. **OAuth consent screen**: user type *Internal* (Workspace) — no verification needed. Scopes: `youtube.readonly`, `yt-analytics.readonly`.
4. Create one **Desktop** OAuth client for `connect-channel` → `GOOGLE_OAUTH_CLIENT_ID/SECRET`. YouTube OAuth remains an owner/admin-only backend operation.

### 3. Gemini (topic tagging)
Get a key at Google AI Studio. Keep it in a **separate Google project with billing never enabled** — enabling billing removes the free tier for that project. → `GEMINI_API_KEY`.

### 4. Connect your four channels
```bash
cp .env.example .env.local   # fill in everything
openssl rand -base64 32      # → TOKEN_ENC_KEY
npm run connect-channel      # sign in as the channel owner; repeat per channel
npm run sync:public          # first snapshot
```

### 5. GitHub Actions
Push the repo (private). In **Settings → Secrets and variables → Actions** add:
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `YOUTUBE_API_KEY`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `TOKEN_ENC_KEY`, `GEMINI_API_KEY`, `SLACK_WEBHOOK_URL`, and a variable `APP_URL`.
The five workflows in `.github/workflows/` then run on schedule (public sync every 15 min, analytics + classify daily, Slack digest Mondays, storage roll-up Sundays). Trigger any of them manually from the Actions tab for a first run.

### 6. Cloudflare Pages
Create a new project under **Workers & Pages → Pages → Connect to Git**, not under **Workers Builds**. If the current project shows `Worker Name`, it is the wrong project type for this app. Use framework **Next.js (Static HTML Export)**, build command `npm run build`, and output directory `out`. Do not use `npx wrangler deploy`, which selects the OpenNext Worker adapter and fails for this static export. Environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Add the resulting `*.pages.dev` URL to Supabase **Auth → URL configuration → Redirect URLs**.

For a manual deployment, authenticate Wrangler, set `CF_PAGES_PROJECT_NAME` to the Pages project name, and run `npm run deploy:pages`. The command defaults to the project name `yt-tracker` and deploys the generated `out` directory.

## Day-to-day

- **Your channels**: Settings → paste a channel link (`youtube.com/@handle`, a `UC…` id, or just `@handle`). Public numbers start on the next sync. For private metrics (watch time, retention, CTR) also run `npm run connect-channel` with that owner signed in. `supabase/seed_channels.sql` pre-registers the four channels if you'd rather do it in SQL.
- **Targets**: Settings → type the month's numbers per channel. Pace = actual ÷ where you should be today; projected month-end is shown on every channel.
- **Competitors**: Settings → pick a channel → paste `@handle` or a channel URL. Resolved and synced within 15 minutes.
- **Topics**: Settings → add a topic. New videos are tagged nightly; to re-tag history, empty `video_topics` and run the classify workflow.
- **Reconnect**: if a channel shows a dot in the sidebar, its OAuth token was revoked. Run `npm run connect-channel` again for that owner.

## Responsive & interactive

- Layout collapses to a top bar with a menu under 1024 px; tables scroll sideways; KPI grid goes 2 → 3 → 5 columns.
- Trend chart: range pills (7d / 28d / 90d / 1y), views ⇄ subscribers toggle, drag-to-zoom brush on long ranges, upload-day dots with titles in the tooltip; click a dot to open that video.
- Top videos: 7/28/90-day window, title search, sortable columns, click a topic bar to filter.
- Retention and competitor charts: click legend entries to hide/show a series.

## Repo map

```
src/app/            pages: overview, channel, competitors, video, settings
src/components/     Shell (sidebar + auth), Stat, Charts, TargetStrip, VideoTable, TopicBars, ChannelTile
src/lib/            supabase client, typed queries (RPC/view wrappers), formatting
scripts/            GitHub Actions jobs: sync-public, sync-analytics, classify, digest, rollup-weekly, connect-channel
scripts/lib/        youtube (fetch-based Data + Analytics API), quota guard, AES token crypto, topic rules
supabase/migrations 0001_schema.sql — tables, v_channel_latest view, RPCs, RLS policies, seed
.github/workflows/  five cron workflows
```

## Free-tier guardrails already built in

- YouTube quota counter stops the sync at 8,000 of 10,000 units; `search.list` is never used.
- `rollup-weekly` folds `video_daily` older than 90 days into weekly rows — keeps Supabase well under 500 MB.
- Daily writes keep the free Supabase project from pausing.
- Every workflow has `timeout-minutes`, so a stuck job can't eat the 2,000 free Actions minutes.
- Gemini calls are batched (25 videos per request) with backoff; keyword rules take over if it's unavailable.
