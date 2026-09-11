// Thin fetch-based wrappers around YouTube Data API v3 and Analytics API v2.
// No googleapis dependency; Node 22 fetch is enough.
import { env } from "./env";
import { spend } from "./quota";

const DATA = "https://www.googleapis.com/youtube/v3";
const ANALYTICS = "https://youtubeanalytics.googleapis.com/v2/reports";

async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${url.split("?")[0]}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

const qs = (o: Record<string, string | number | undefined>) =>
  Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");

// ---------- Data API (API key, public) ----------
export interface YtChannel {
  id: string;
  snippet: { title: string; customUrl?: string; thumbnails?: { default?: { url: string } } };
  statistics: { subscriberCount?: string; viewCount?: string; videoCount?: string };
  contentDetails: { relatedPlaylists: { uploads: string } };
}
export interface YtVideo {
  id: string;
  snippet: { title: string; description: string; tags?: string[]; publishedAt: string; channelId: string; thumbnails?: { medium?: { url: string } } };
  contentDetails: { duration: string };
  statistics: { viewCount?: string; likeCount?: string; commentCount?: string };
}

export async function channelsList(params: { ids?: string[]; forHandle?: string }): Promise<YtChannel[]> {
  spend(1, "channels.list");
  const p = params.ids ? { id: params.ids.join(",") } : { forHandle: params.forHandle! };
  const r = await getJson<{ items?: YtChannel[] }>(
    `${DATA}/channels?${qs({ part: "snippet,statistics,contentDetails", ...p, key: env("YOUTUBE_API_KEY") })}`
  );
  return r.items ?? [];
}

// Latest uploads: 1 unit per 50 videos. Never use search.list (100 units).
export async function playlistVideoIds(playlistId: string, max = 200): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    spend(1, "playlistItems.list");
    const r = await getJson<{ items?: { contentDetails: { videoId: string } }[]; nextPageToken?: string }>(
      `${DATA}/playlistItems?${qs({ part: "contentDetails", playlistId, maxResults: 50, pageToken, key: env("YOUTUBE_API_KEY") })}`
    );
    ids.push(...(r.items ?? []).map((i) => i.contentDetails.videoId));
    pageToken = r.nextPageToken;
  } while (pageToken && ids.length < max);
  return ids.slice(0, max);
}

export async function videosList(ids: string[]): Promise<YtVideo[]> {
  if (!ids.length) return [];
  spend(1, "videos.list");
  const r = await getJson<{ items?: YtVideo[] }>(
    `${DATA}/videos?${qs({ part: "snippet,contentDetails,statistics", id: ids.join(","), key: env("YOUTUBE_API_KEY") })}`
  );
  return r.items ?? [];
}

// ISO 8601 duration (PT1H2M3S) → seconds
export function isoToSeconds(iso: string): number {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso);
  if (!m) return 0;
  return (+(m[1] ?? 0)) * 3600 + (+(m[2] ?? 0)) * 60 + (+(m[3] ?? 0));
}

// ---------- OAuth (own channels) ----------
export async function accessTokenFromRefresh(refreshToken: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: qs({
      client_id: env("GOOGLE_OAUTH_CLIENT_ID"),
      client_secret: env("GOOGLE_OAUTH_CLIENT_SECRET"),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`token refresh failed: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

// ---------- Analytics API (OAuth, own channels) ----------
export interface AnalyticsReport { columnHeaders: { name: string }[]; rows?: (string | number)[][] }

export async function analyticsQuery(
  accessToken: string,
  params: { channelId: string; startDate: string; endDate: string; metrics: string; dimensions?: string; filters?: string; sort?: string; maxResults?: number }
): Promise<AnalyticsReport> {
  return getJson<AnalyticsReport>(
    `${ANALYTICS}?${qs({ ids: `channel==${params.channelId}`, ...params, channelId: undefined })}`,
    { Authorization: `Bearer ${accessToken}` }
  );
}

// Convert report rows to objects keyed by column name
export function rowsToObjects(r: AnalyticsReport): Record<string, string | number>[] {
  const names = r.columnHeaders.map((h) => h.name);
  return (r.rows ?? []).map((row) => Object.fromEntries(row.map((v, i) => [names[i], v])));
}
