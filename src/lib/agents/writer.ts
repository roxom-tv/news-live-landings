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
Every quote and data point must include sourceUrl from the source list.
Return JSON:
{
  "headline": string,
  "subheadline": string,
  "summary": string,
  "sections": [{"id": string, "eyebrow": string, "title": string, "body": string, "visualHint": "image"|"chart"|"quote"|"data"|"svg"}],
  "quotes": [{"quote": string, "attribution": string, "sourceUrl": string}],
  "dataPoints": [{"label": string, "value": string, "context": string, "sourceUrl": string}]
}
Research:
${JSON.stringify(research)}
`,
    fallback: () => ({
      headline: `${research.topic} Becomes The Signal Markets Cannot Ignore`,
      subheadline: "A live news brief tracks verified facts, context, and material updates as the story develops.",
      summary: research.facts.join(" "),
      sections: [
        {
          id: "live-brief",
          eyebrow: "Live Brief",
          title: "The current signal",
          body: research.facts[0] ?? `The live news pipeline is monitoring ${research.topic}.`,
          visualHint: "svg"
        },
        {
          id: "market-context",
          eyebrow: "Context",
          title: "Why it matters",
          body: research.facts[1] ?? "The story may affect markets, policy expectations, or public attention.",
          visualHint: "data"
        },
        {
          id: "watch-next",
          eyebrow: "Watch Next",
          title: "What could change",
          body: research.facts[2] ?? "The live monitor will update this page when new verified facts matter.",
          visualHint: "quote"
        }
      ],
      quotes: [
        {
          quote: "Every material update must be verified before it changes the public page.",
          attribution: "News Landing Critic Gate",
          sourceUrl: research.sources[0]?.url ?? "https://diegodella.ar/landings"
        }
      ],
      dataPoints: [
        {
          label: "Sources",
          value: String(research.sources.length),
          context: "Credible sources attached to this live landing.",
          sourceUrl: research.sources[0]?.url ?? "https://diegodella.ar/landings"
        }
      ]
    })
  });
