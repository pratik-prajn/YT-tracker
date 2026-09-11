// Monday Slack digest: pace per own channel + top video of the week.
import { db, must } from "./lib/db";
import { env } from "./lib/env";

const fmt = (n: number) => Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);

async function main() {
  const own = await must<{ id: string; name: string }[]>(db.from("channels").select("id, name").eq("kind", "own"));
  const lines: string[] = [`*Channel pace — week of ${new Date().toISOString().slice(0, 10)}*`];

  for (const c of own) {
    const pace = await must<{ metric: string; target: number; actual: number; pace: number; projected: number }[]>(db.rpc("month_pace", { cid: c.id }));
    const views = pace.find((p) => p.metric === "views");
    const subs = pace.find((p) => p.metric === "subs");
    const top = await must<{ title: string; views_window: number; yt_video_id: string }[]>(db.rpc("top_videos", { cids: [c.id], days: 7, lim: 1 }));
    const flag = (p?: { pace: number }) => (!p ? "no target" : p.pace >= 1 ? "on track" : p.pace >= 0.85 ? "slightly behind" : "behind");
    lines.push(
      `*${c.name}* — views ${views ? `${fmt(views.actual)} / ${fmt(views.target)} (${Math.round(views.pace * 100)}%, ${flag(views)})` : "no target"}` +
      `, subs ${subs ? `${fmt(subs.actual)} / ${fmt(subs.target)} (${Math.round(subs.pace * 100)}%)` : "no target"}` +
      (top[0] ? `\n    top this week: <https://youtu.be/${top[0].yt_video_id}|${top[0].title}> — ${fmt(top[0].views_window)} views` : "")
    );
  }
  lines.push(`<${env("APP_URL", false) || "https://example.pages.dev"}|Open dashboard>`);

  const res = await fetch(env("SLACK_WEBHOOK_URL"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: lines.join("\n") }) });
  if (!res.ok) throw new Error(`slack ${res.status}`);
  console.log("digest sent");
}

main().catch((e) => { console.error(e); process.exit(1); });
