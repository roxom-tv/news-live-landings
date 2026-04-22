import { runJsonAgent } from "../openai";
import { slugify } from "../slug";
import type { LandingContent, VisualAsset } from "../types";
import { miamiDesignSystem } from "./prompts";
import type { ResearchOutput } from "./research";
import type { WriterOutput } from "./writer";

export const runDesigner = (topic: string, research: ResearchOutput, writing: WriterOutput) => {
  const slug = slugify(topic);
  return runJsonAgent<LandingContent>({
    agent: "designer",
    system: miamiDesignSystem,
    prompt: `
Create structured live news landing JSON. Do not generate React code.
Use this exact JSON shape:
{
  "slug": string,
  "topic": string,
  "headline": string,
  "subheadline": string,
  "summary": string,
  "status": "drafting",
  "lastUpdatedUtc": string,
  "sources": Source[],
  "visuals": VisualAsset[],
  "sections": StorySection[],
  "quotes": Quote[],
  "dataPoints": DataPoint[],
  "updateHistory": []
}
Make visuals renderable by reusable Next.js components. Use SVG visual directions if no real image URL is verified.
Topic: ${topic}
Research: ${JSON.stringify(research)}
Writing: ${JSON.stringify(writing)}
`,
    fallback: () => ({
      slug,
      topic,
      headline: writing.headline,
      subheadline: writing.subheadline,
      summary: writing.summary,
      status: "drafting",
      lastUpdatedUtc: new Date().toISOString(),
      sources: research.sources,
      visuals: [
        {
          type: "svg",
          title: research.visualDirections[0] ?? "Neon broadcast grid",
          credit: "Generated visual direction",
          alt: "Abstract Miami neon broadcast grid"
        } satisfies VisualAsset
      ],
      sections: writing.sections,
      quotes: writing.quotes,
      dataPoints: writing.dataPoints,
      updateHistory: []
    })
  });
};
