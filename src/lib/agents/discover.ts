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

export const discoverLiveTopic = async (hint?: string) => {
  const adminOverride = await getAgentOverride("discover");
  return runJsonAgent<DiscoveryOutput>({
    agent: "discover",
    system: editorialSystem,
    useWebSearch: true,
    prompt: `
Discover one timely, source-rich topic for a live news landing.

Freshness gate:
- The selected topic must have a meaningful new development, report, data release, quote, official action, market move, result, filing, or verified update from the last 8 hours.
- If the user's hint points to an older broad story, select the freshest last-8-hours angle inside that story.
- If no credible last-8-hours coverage exists for the hint, say so in the rationale and choose a different relevant topic that satisfies the 8-hour gate.
- Prefer topics with multiple independent sources published or updated inside the last 8 hours.
- Include newestSourcePublishedAt and freshnessEvidence for every candidate so the freshness decision is auditable.

Sources and discovery:
- Use current web search.
- Prefer AP, Reuters, Google News-style current coverage, Bloomberg, BBC, NYT, FT, WSJ, CNBC, CoinDesk, and relevant new media.
- The selected topic must have enough credible sources for a useful landing.
- Prefer topics with strong visual potential: photos, maps, charts, timelines, market moves, named actors, locations, or measurable deltas.
- Avoid stale, generic, low-source, or purely opinion topics.
- If the user gives a hint, use it as a direction, not as a fixed topic.

User hint:
${hint || "No hint. Choose the best current topic."}

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
${adminOverride}
`,
    fallback: () => ({
      selectedTopic: hint?.trim() || "global markets live update",
      selectedRationale: "Fallback discovery selected a broad topic because live web discovery was unavailable.",
      candidates: [
        {
          topic: hint?.trim() || "global markets live update",
          rationale: "Fallback candidate for the live landing pipeline.",
          urgency: "medium",
          sourceUrls: ["https://www.reuters.com/", "https://apnews.com/"],
          newestSourcePublishedAt: new Date().toISOString(),
          freshnessEvidence: "Fallback mode could not verify last-8-hours freshness with web search.",
          visualPotential: "medium",
          score: 50
        }
      ]
    })
  });
};
