import { runJsonAgent } from "../openai";
import { getAgentOverride } from "../admin-agents";
import { editorialSystem } from "./prompts";

export type DiscoveryCandidate = {
  topic: string;
  rationale: string;
  urgency: "low" | "medium" | "high";
  sourceUrls: string[];
  newestSourcePublishedAt?: string;
  freshnessEvidence?: string;
  visualPotential: "low" | "medium" | "high";
  score: number;
};

export type DiscoveryOutput = {
  selectedTopic: string;
  selectedRationale: string;
  candidates: DiscoveryCandidate[];
};

export class DiscoveryNoTopicError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiscoveryNoTopicError";
  }
}

const invalidTopicPatterns = [
  /no qualifying/i,
  /no valid/i,
  /could not verify/i,
  /non-selection/i,
  /recommend rerunning/i,
  /once a credible/i,
  /unable to identify/i,
  /i would pivot/i
];

const genericHints = new Set(["", "topic", "news", "latest", "current", "discover", "discover topic", "breaking"]);

const isInvalidTopic = (topic: string) => {
  const cleaned = topic.trim();
  if (!cleaned) return true;
  if (cleaned.length > 180) return true;
  if (genericHints.has(cleaned.toLowerCase())) return true;
  return invalidTopicPatterns.some(pattern => pattern.test(cleaned));
};

const normalizeDiscovery = (output: DiscoveryOutput): DiscoveryOutput | null => {
  const candidates = (output.candidates ?? []).filter(candidate => !isInvalidTopic(candidate.topic));
  const selectedFromCandidates = [...candidates].sort((a, b) => b.score - a.score)[0];

  if (!isInvalidTopic(output.selectedTopic)) {
    return { ...output, candidates };
  }

  if (selectedFromCandidates) {
    return {
      selectedTopic: selectedFromCandidates.topic,
      selectedRationale: selectedFromCandidates.rationale,
      candidates
    };
  }

  return null;
};

const discoveryPrompt = (input: { hint?: string; adminOverride: string; retry?: boolean }) => {
  const hint = input.hint?.trim() ?? "";
  const effectiveHint = genericHints.has(hint.toLowerCase()) ? "No specific hint. Scan all major current news beats." : hint;
  return `
Discover one timely, source-rich topic for a live news landing.

Hard output rule:
- selectedTopic must be a real news topic, not an explanation, apology, refusal, or "no topic found" message.
- Never return "no qualifying topic found" or similar text as selectedTopic.
- If the user hint is generic, vague, or just "topic", ignore it and scan all major current news beats.
- If one beat is thin, pivot to another beat and return the best real topic you can verify.

Freshness gate:
- The selected topic must have a meaningful new development, report, data release, quote, official action, market move, result, filing, or verified update from the last 8 hours.
- If the user's hint points to an older broad story, select the freshest last-8-hours angle inside that story.
- If no credible last-8-hours coverage exists for the hint, choose a different relevant topic that satisfies the 8-hour gate.
- Prefer topics with multiple independent sources published or updated inside the last 8 hours.
- Include newestSourcePublishedAt and freshnessEvidence for every candidate so the freshness decision is auditable.

Sources and discovery:
- Use current web search.
- Search across major wires and global outlets: Reuters, AP, BBC, NYT, Washington Post, Wall Street Journal, Financial Times, Bloomberg, CNBC, CNN, Al Jazeera, The Guardian, New York Post, Asia Times, Times of India, Indian Express, Nikkei Asia, South China Morning Post, CoinDesk, The Verge, TechCrunch, official government/company/regulator pages, and relevant local outlets.
- Check multiple beats before deciding: world, US politics, markets, crypto, economy, tech, AI, geopolitics, courts, elections, sports, entertainment, climate, health, India/Asia, Europe, Latin America, and breaking local stories with global relevance.
- The selected topic must have enough credible sources for a useful landing.
- Prefer topics with strong visual potential: photos, maps, charts, timelines, market moves, named actors, locations, or measurable deltas.
- Avoid stale, generic, low-source, or purely opinion topics.
- If the user gives a specific hint, use it as a direction, not as a fixed topic.

User hint:
${effectiveHint || "No hint. Choose the best current topic."}

${input.retry ? "Previous discovery output was invalid because it returned a non-selection. Broaden the search now and return a real news topic." : ""}

Return JSON:
{
  "selectedTopic": string,
  "selectedRationale": string,
  "candidates": [
    {
      "topic": string,
      "rationale": string,
      "urgency": "low"|"medium"|"high",
      "sourceUrls": string[],
      "newestSourcePublishedAt": string,
      "freshnessEvidence": string,
      "visualPotential": "low"|"medium"|"high",
      "score": number
    }
  ]
}

Return 3-5 candidates. Scores must be 0-100 and grounded in source quality, last-8-hours freshness, urgency, landing suitability, and visual potential.
Private red-team before returning:
- Reject candidates whose newest credible source is older than 8 hours unless the source itself has an updated timestamp inside the window.
- Reject topics that are merely evergreen, generic, or missing a clear "what changed now".
- Prefer a topic that can become a complete top-line landing with clear sections, strong visuals, and enough source-backed context.
- Confirm selectedTopic is concise, concrete, and names the actual event, actor, market move, result, decision, filing, quote, or official action.
${input.adminOverride}
`;
};

export const discoverLiveTopic = async (hint?: string) => {
  const adminOverride = await getAgentOverride("discover");
  const output = await runJsonAgent<DiscoveryOutput>({
    agent: "discover",
    system: editorialSystem,
    useWebSearch: true,
    prompt: discoveryPrompt({ hint, adminOverride }),
    fallback: () => ({
      selectedTopic: "No qualifying last-8-hours topic found",
      selectedRationale: "Discovery fallback could not verify a real current topic because web discovery was unavailable.",
      candidates: []
    })
  });

  const normalized = normalizeDiscovery(output);
  if (normalized) return normalized;

  const retryOutput = await runJsonAgent<DiscoveryOutput>({
    agent: "discover",
    system: editorialSystem,
    useWebSearch: true,
    prompt: discoveryPrompt({ adminOverride, retry: true }),
    fallback: () => ({
      selectedTopic: "No qualifying last-8-hours topic found",
      selectedRationale: "Discovery retry fallback could not verify a real current topic because web discovery was unavailable.",
      candidates: []
    })
  });
  const retryNormalized = normalizeDiscovery(retryOutput);
  if (retryNormalized) return retryNormalized;

  throw new DiscoveryNoTopicError(
    "Discovery could not verify a real source-rich topic with a meaningful last-8-hours development after a broad search. Process stopped before Research."
  );
};
