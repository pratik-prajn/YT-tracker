// Keeps Supabase under 500 MB: video_daily rows older than 90 days are rolled into
// video_weekly (last snapshot of each week) and deleted. Run weekly.
import { db } from "./lib/db";

async function main() {
  const cutoff = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
  const { data, error } = await db.rpc("rollup_video_daily", { cutoff });
  if (error) throw new Error(error.message);
  console.log(`rolled up ${data} daily rows older than ${cutoff}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
