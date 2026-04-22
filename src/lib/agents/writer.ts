import { runJsonAgent } from "../openai";
import type { StorySection } from "../types";
import { editorialSystem } from "./prompts";
import type { ResearchOutput } from "./research";

export type WriterOutput = {
  headline: string;
  subheadline: string;
  summary: string;
  sections: StorySection[];
  quotes: Array<{ quote: string; attribution: string; sourceUrl: string }>;
  dataPoints: Array<{ label: string; value: string; context: string; sourceUrl: string }>;
};

export const runWriter = (research: ResearchOutput) =>
  runJsonAgent<WriterOutput>({
    agent: "writer",
    system: editorialSystem,
    prompt: `
Write structured landing content from this research package.
Every factual sentence must be supported by the source-bound facts in Research.
Every section must include sourceUrls from the source list.
Every quote and data point must include sourceUrl from the source list.
Do not invent quotes. If exact quotation text is not present in the research, return an empty quotes array.
Write like a premium magazine/news feature in the spirit of Vice: immersive, scene-setting, sharp, human, and narrative-driven, while staying factual and sourced.
This must read as a real article, not a tiny dossier, not bullet-note intelligence, and not a product brief.
Create 9-14 sections when the research supports it. Each section body should be 150-260 words and contain only sourced information.
Make the article experiential: open with tension, explain the stakes, introduce the people/institutions, reconstruct the timeline, show the money/power/risk dynamics, include market/social/political reactions, and end with what could happen next when supported by facts.
The format must complement the story. Use a factual timeline when chronology matters; use results/outcomes for elections, status/stakes for competitions, signals/data for markets, profile timeline for people, and impact/official-response structure for crises.
Use the right journalistic frame for the topic:
- Competition/rivalry: explain who is competing, current standings/status, score/result, key competitors, momentum shifts, stakes, and next round/milestone.
- Election/vote: explain results, vote share/seats/delegates, key outcomes, winners/losers, turnout, challenged or disputed results, and statements from major parties.
- Market/crypto/economy: explain current level, move size, cause, historical comparison, winners/losers, flows/volume, institutional reactions, and next catalyst.
- Person profile/news: explain why this person matters now, role/history, allies/critics, direct quotes, controversies/achievements, and what changes next.
- Event/crisis: explain timeline, geography, actors, impact, official statements, disputed claims, and next decision point.
Prioritize quotes from relevant parties: candidates, competitors, officials, companies, teams, regulators, analysts, witnesses, or affected people. Use exact quotes only from sources.
Use section titles that feel like magazine subheads, not generic labels such as "Context", "Data", or "Watch Next".
Avoid dry transitions. Each section should move the story forward and connect to the next one.
Include at least 3 dataPoints when the research contains numbers, dates, counts, prices, named actors, or status markers.
Use visualHint "chart" for sections with time, price, count, volume, comparison, route, or risk data. Use "map" for geography. Use "image" for actor/place/object sections.
Return JSON:
{
  "headline": string,
  "subheadline": string,
  "summary": string,
  "sections": [{"id": string, "eyebrow": string, "title": string, "body": string, "visualHint": "image"|"chart"|"map"|"quote"|"data"|"svg", "sourceUrls": string[]}],
  "quotes": [{"quote": string, "attribution": string, "sourceUrl": string}],
  "dataPoints": [{"label": string, "value": string, "context": string, "sourceUrl": string}]
}
Research:
${JSON.stringify(research)}
`,
    fallback: () => ({
      headline: `Live brief: ${research.topic}`,
      subheadline: "A sourced live news brief tracks verified facts and material updates.",
      summary: research.facts.map(fact => fact.claim).join(" "),
      sections: [
        {
          id: "live-brief",
          eyebrow: "Live Brief",
          title: "What is reported",
          body: research.facts[0]?.claim ?? `The live news pipeline is monitoring ${research.topic}.`,
          visualHint: "svg",
          sourceUrls: [research.facts[0]?.sourceUrl ?? research.sources[0]?.url ?? "https://diegodella.ar/landings"]
        },
        {
          id: "source-context",
          eyebrow: "Context",
          title: "Source context",
          body: research.facts[1]?.claim ?? "The page will add context only when it is supported by attached sources.",
          visualHint: "data",
          sourceUrls: [research.facts[1]?.sourceUrl ?? research.sources[0]?.url ?? "https://diegodella.ar/landings"]
        },
        {
          id: "key-actors",
          eyebrow: "Actors",
          title: "Who is involved",
          body: research.facts[2]?.claim ?? "The page will identify key actors only when those details are supported by attached sources.",
          visualHint: "image",
          sourceUrls: [research.facts[2]?.sourceUrl ?? research.sources[0]?.url ?? "https://diegodella.ar/landings"]
        },
        {
          id: "timeline",
          eyebrow: "Timeline",
          title: "How the story is moving",
          body: research.facts[3]?.claim ?? "The live monitor will add timeline detail when verified source material supports it.",
          visualHint: "data",
          sourceUrls: [research.facts[3]?.sourceUrl ?? research.sources[0]?.url ?? "https://diegodella.ar/landings"]
        },
        {
          id: "watch-next",
          eyebrow: "Watch Next",
          title: "What could change",
          body: research.facts[4]?.claim ?? "The live monitor will update this page when new verified facts matter.",
          visualHint: "quote",
          sourceUrls: [research.facts[4]?.sourceUrl ?? research.sources[0]?.url ?? "https://diegodella.ar/landings"]
        }
      ],
      quotes: [],
      dataPoints: [
        {
          label: "Sources",
          value: String(research.sources.length),
          context: "Credible sources attached to this live landing.",
          sourceUrl: research.sources[0]?.url ?? "https://diegodella.ar/landings"
        },
        {
          label: "Facts",
          value: String(research.facts.length),
          context: "Source-bound facts available to the writer.",
          sourceUrl: research.sources[0]?.url ?? "https://diegodella.ar/landings"
        },
        {
          label: "Images",
          value: String(research.imageCandidates.length),
          context: "Source-associated image candidates found during research.",
          sourceUrl: research.sources[0]?.url ?? "https://diegodella.ar/landings"
        }
      ]
    })
  });
