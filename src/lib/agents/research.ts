import { runJsonAgent } from "../openai";
import type { Source } from "../types";
import { editorialSystem } from "./prompts";
import { fallbackSources } from "./fallbacks";

export type ResearchOutput = {
  topic: string;
  facts: string[];
  sources: Source[];
  visualDirections: string[];
};

export const runResearch = (topic: string) =>
  runJsonAgent<ResearchOutput>({
    agent: "research",
    system: editorialSystem,
    useWebSearch: true,
    prompt: `
Research this live news landing topic: "${topic}".
Use current web sources. Prefer Reuters, AP, Bloomberg, BBC, NYT, FT, WSJ, CNBC, CoinDesk when relevant.
Return JSON:
{
  "topic": string,
  "facts": string[],
  "sources": [{"title": string, "outlet": string, "url": string, "publishedAt": string, "credibility": "tier1"|"tier2"|"unknown"}],
  "visualDirections": string[]
}
Minimum two credible sources. No unsupported claims.
`,
    fallback: () => ({
      topic,
      facts: [
        `This pipeline is tracking ${topic} as a live story.`,
        "The MVP requires at least two credible sources before production publishing.",
        "Updates are only published after Critic approval."
      ],
      sources: fallbackSources(topic),
      visualDirections: ["Abstract neon market grid", "Broadcast-style source rail", "Parallax data panel"]
    })
  });
