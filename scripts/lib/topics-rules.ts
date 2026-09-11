// Deterministic fallback classifier: used when Gemini is unavailable or over quota.
// Keep names identical to the `topics` table.
export const TOPIC_RULES: Record<string, RegExp> = {
  "Prompting": /\bprompt(s|ing)?\b/i,
  "AI agents": /\bagent(s|ic)?\b|\bmcp\b|\bautomat/i,
  "Coding with AI": /\bcode|coding|cursor|copilot|claude code|developer|programm/i,
  "Excel & productivity": /\bexcel\b|sheets?|powerpoint|notion|productiv/i,
  "Careers & jobs": /\bjob|career|salary|interview|resume|hiring|skills?\b/i,
  "Tool reviews": /\breview|vs\.?|comparison|best .* tools?|top \d+/i,
  "AI news": /\bnews|launch|release|announce|update/i,
  "Business & money": /\bbusiness|money|income|revenue|startup|freelanc|earn/i,
  "Beginner tutorials": /\bbeginner|tutorial|how to|step by step|guide|basics/i,
  "Deep dives": /\bexplained|deep dive|masterclass|complete|full course/i,
};

export function ruleClassify(title: string, description = ""): string | null {
  const text = `${title} ${description.slice(0, 200)}`;
  for (const [topic, re] of Object.entries(TOPIC_RULES)) if (re.test(text)) return topic;
  return null;
}
