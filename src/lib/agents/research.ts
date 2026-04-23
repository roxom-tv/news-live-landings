import { runJsonAgent } from "../openai";
import type { ImageCandidate, Source, SourceBoundFact } from "../types";
import { discoverSourceImages, discoverWikimediaImages } from "../source-images";
import { editorialSystem } from "./prompts";
import { fallbackSources } from "./fallbacks";
import { getAgentOverride } from "../admin-agents";

export type ResearchOutput = {
  topic: string;
  facts: SourceBoundFact[];
  sources: Source[];
  imageCandidates: ImageCandidate[];
  visualDirections: string[];
};

const normalizeResearch = async (output: ResearchOutput): Promise<ResearchOutput> => {
  const fallbackSourceUrl = output.sources[0]?.url ?? "https://diegodella.ar/landings";
  const generatedImageCandidates = (output.imageCandidates ?? []).filter(
    image => image.url?.startsWith("http") && output.sources.some(source => source.url === image.sourceUrl)
  );
  const discoveredImageCandidates = [
    ...await discoverSourceImages(output.sources),
    ...await discoverWikimediaImages(output.topic)
  ];
  const imageUrls = new Set<string>();
  return {
    ...output,
    facts: (output.facts as unknown[]).map(fact => {
      if (typeof fact === "string") return { claim: fact, sourceUrl: fallbackSourceUrl };
      const maybeFact = fact as Partial<SourceBoundFact>;
      return {
        claim: maybeFact.claim ?? "",
        sourceUrl: maybeFact.sourceUrl ?? fallbackSourceUrl
      };
    }),
    imageCandidates: [...generatedImageCandidates, ...discoveredImageCandidates].filter(image => {
      if (imageUrls.has(image.url)) return false;
      imageUrls.add(image.url);
      return true;
    })
  };
};

export const runResearch = async (topic: string) => {
  const adminOverride = await getAgentOverride("research");
  return normalizeResearch(await runJsonAgent<ResearchOutput>({
    agent: "research",
    system: editorialSystem,
    useWebSearch: true,
    prompt: `
Research this live news landing topic: "${topic}".
Use current web sources. Prefer AP, Reuters, Google News results, Bloomberg, BBC, NYT, FT, WSJ, CNBC, CoinDesk, and any other source deemed relevant by legacy and new media standards.
Every fact must be source-bound. Do not include a claim unless it has a sourceUrl from the returned sources list.
Freshness and relevance:
- Identify what changed now. Prefer sources published or updated in the last 8 hours when available.
- If the topic came from Discover, preserve the fresh angle instead of broadening into an old evergreen explainer.
- Include older background only when it explains the new development, and label it as context through the factual claim.
- Avoid source packages that are only headlines. Gather enough substance for Writer and Designer to build a near-publishable landing on the first pass.
Find more than a headline: gather chronology, actors, numbers, official statements, market/geopolitical context, human stakes, power dynamics, social/market reactions, visual scene details, and what to watch next.
Collect enough detail to support a long-form magazine/news article, not a short dossier.
Gather a facts timeline when chronology is relevant and enough dates/events are available. Do not force a timeline for stories where the better structure is results, standings, market signals, profile context, or impact analysis.
Topic-specific reporting requirements:
- If the topic is a competition, tournament, race, league, award, trial, or product/market rivalry: gather competitors, standings/status, leaders, losers, score/result, rules or stakes, next milestone, and quotes/reactions from key competitors or organizers.
- If the topic is an election or vote: gather current results, vote shares, seats/delegates/electoral count, turnout, key outcomes, winners/losers, legal challenges, concession/victory statements, and quotes from relevant parties.
- If the topic is markets/crypto/economy: gather price levels, percentage moves, flows, volumes, historical comparison, catalysts, winners/losers, analyst/institutional reactions, and next macro/event risk.
- If the topic is a person: gather biography only where relevant, current role/status, controversy or achievement, key relationships, direct quotes, critics/supporters, and what changed now.
- If the topic is an event/crisis: gather timeline, affected parties, geography, casualties/financial impact where relevant, official statements, disputed claims, and what happens next.
Search specifically for exact quotes from relevant parties. Include only exact quotes that appear in source material; otherwise gather paraphrased reactions as source-bound facts.
Image collection is mandatory when available. Collect photographic image candidates only when the image URL is directly associated with a returned source, such as a source article OpenGraph image, press image, company/government media image, or media kit image. Prefer large landscape images. Do not use icons, logos, avatars, trackers, base64 data URLs, SVGs, or unrelated stock images.
For every imageCandidate, explain why it is relevant to the story. Use relevance "direct" only for images from an article/source about the exact story, "contextual" for a known person/place/institution/entity in the story, and "fallback" only when no direct/contextual image exists.
Return JSON:
{
  "topic": string,
  "facts": [{"claim": string, "sourceUrl": string}],
  "sources": [{"title": string, "outlet": string, "url": string, "publishedAt": string, "credibility": "tier1"|"tier2"|"unknown"}],
  "imageCandidates": [{"url": string, "title": string, "credit": string, "alt": string, "sourceUrl": string, "relevance": "direct"|"contextual"|"fallback", "relevanceReason": string}],
  "visualDirections": string[]
}
Minimum eight credible sources when available. Minimum twenty source-bound facts when available. No unsupported claims.
Private red-team before returning:
- Does the package explain the current angle in one clear sentence?
- Can the first three landing sections be written from these facts without guessing?
- Are there enough actors/entities, numbers, quotes/reactions, and next-step facts for a complete top-line landing?
- Are image candidates relevant enough that Designer will not need decorative filler?
- Remove weak facts, unsupported claims, duplicate sources, and image candidates whose relevance is not obvious.
${adminOverride}
`,
    fallback: () => {
      const sources = fallbackSources(topic);
      return {
        topic,
        facts: [
          {
            claim: `This pipeline is tracking ${topic} as a live story until stronger source coverage is available.`,
            sourceUrl: sources[0]?.url ?? "https://diegodella.ar/landings"
          },
          {
            claim: "Updates are only published after Critic approval.",
            sourceUrl: sources[0]?.url ?? "https://diegodella.ar/landings"
          }
        ],
        sources,
        imageCandidates: [],
        visualDirections: ["Clean editorial cover image", "Source-backed timeline", "Minimal data panel"]
      };
    }
  }));
};
