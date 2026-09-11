// One-time, run locally with the channel owner present:  npm run connect-channel
// Opens Google consent in the browser, captures the refresh token on localhost,
// encrypts it and saves the channel as kind='own'. No public server needed.
import { createServer } from "node:http";
import { exec } from "node:child_process";
import { db, must } from "./lib/db";
import { encrypt } from "./lib/crypto";
import { env } from "./lib/env";

const PORT = 53682;
const REDIRECT = `http://127.0.0.1:${PORT}/callback`;
const SCOPES = ["https://www.googleapis.com/auth/youtube.readonly", "https://www.googleapis.com/auth/yt-analytics.readonly"];

async function main() {
  const authUrl = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
    client_id: env("GOOGLE_OAUTH_CLIENT_ID"), redirect_uri: REDIRECT, response_type: "code",
    scope: SCOPES.join(" "), access_type: "offline", prompt: "consent",
  });

  const code = await new Promise<string>((resolve, reject) => {
    const server = createServer((req, res) => {
      const u = new URL(req.url!, REDIRECT);
      if (u.pathname !== "/callback") return res.end();
      const c = u.searchParams.get("code");
      res.end(c ? "Connected. You can close this tab." : "Missing code.");
      server.close();
      c ? resolve(c) : reject(new Error("no code"));
    }).listen(PORT, () => {
      console.log("Open this URL and sign in as the channel owner:\n", authUrl);
      const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
      exec(`${opener} "${authUrl}"`);
    });
  });

  const tok = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: env("GOOGLE_OAUTH_CLIENT_ID"), client_secret: env("GOOGLE_OAUTH_CLIENT_SECRET"), redirect_uri: REDIRECT, grant_type: "authorization_code" }),
  }).then((r) => r.json()) as { refresh_token?: string; access_token: string };
  if (!tok.refresh_token) throw new Error("No refresh token returned — remove the app at myaccount.google.com/permissions and retry");

  const me = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails&mine=true", { headers: { Authorization: `Bearer ${tok.access_token}` } }).then((r) => r.json()) as { items: { id: string; snippet: { title: string; customUrl?: string; thumbnails?: { default?: { url: string } } }; contentDetails: { relatedPlaylists: { uploads: string } } }[] };
  const ch = me.items?.[0];
  if (!ch) throw new Error("This Google account has no YouTube channel");

  await must(db.from("channels").upsert({
    yt_channel_id: ch.id, name: ch.snippet.title, handle: ch.snippet.customUrl ?? null, kind: "own",
    uploads_playlist_id: ch.contentDetails.relatedPlaylists.uploads, thumbnail_url: ch.snippet.thumbnails?.default?.url ?? null,
    refresh_token_enc: encrypt(tok.refresh_token), needs_reconnect: false,
  }, { onConflict: "yt_channel_id" }));
  console.log(`Connected: ${ch.snippet.title} (${ch.id})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
