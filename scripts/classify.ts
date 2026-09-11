// Topic tagging for untagged videos. Gemini free tier (Flash) in batches of 25;
// falls back to keyword rules if Gemini is unavailable.
import { db, must, chunk } from "./lib/db";
import { ruleClassify } from "./lib/topics-rules";

const VERSION = "gemini-flash-v1";
const MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash-lite";

type Video = { id: string; title: string; description: string | null; tags: string[] | null };

async function gemini(prompt: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("no GEMINI_API_KEY");
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0 } }),
  });
  if (res.status === 429) { await new Promise((r) => setTimeout(r, 30_000)); return gemini(prompt); }
  if (!res.ok) throw new Error(`gemini ${res.status}: ${await res.text()}`);
  const j = (await res.json()) as { candidates?: { content: { parts: { text: string }[] } }[] };
  return j.candidates?.[0]?.content.parts[0]?.text ?? "[]";
}

async function main() {
  const topics = await must<{ id: number; name: string }[]>(db.from("topics").select("id, name"));
  const topicId = new Map(topics.map((t) => [t.name.toLowerCase(), t.id]));

  const tagged = await must<{ video_id: string }[]>(db.from("video_topics").select("video_id"));
  const taggedSet = new Set(tagged.map((t) => t.video_id));
  const all = await must<Video[]>(db.from("videos").select("id, title, description, tags").order("published_at", { ascending: false }).limit(2000));
  const todo = all.filter((v) => !taggedSet.has(v.id));
  console.log(`${todo.length} videos to classify`);

  for (const batch of chunk(todo, 25)) {
    let results: { id: string; topic: string; confidence: number }[] = [];
    try {
      const prompt = `You label YouTube videos with exactly one topic from this list: ${topics.map((t) => t.name).join(" | ")}.
Return ONLY a JSON array: [{"id": "...", "topic": "<one of the list>", "confidence": 0-1}].
Videos:
${batch.map((v) => JSON.stringify({ id: v.id, title: v.title, description: v.description?.slice(0, 200), tags: v.tags?.slice(0, 8) })).join("\n")}`;
      results = JSON.parse((await gemini(prompt)).replace(/```json|```/g, "").trim());
    } catch (e) {
      console.warn("Gemini unavailable, using rules:", (e as Error).message);
      results = batch.map((v) => ({ id: v.id, topic: ruleClassify(v.title, v.description ?? "") ?? "", confidence: 0.4 }));
    }
    const rows = results
      .map((r) => ({ video_id: r.id, topic_id: topicId.get(r.topic?.toLowerCase()), confidence: r.confidence, classifier_version: VERSION }))
      .filter((r) => r.topic_id);
    if (rows.length) await must(db.from("video_topics").upsert(rows));
    console.log(`tagged ${rows.length}/${batch.length}`);
    await new Promise((r) => setTimeout(r, 5000)); // stay well under free-tier RPM
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
