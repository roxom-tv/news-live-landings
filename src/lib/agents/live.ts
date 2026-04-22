import { hashValue } from "../hash";
import { runJsonAgent } from "../openai";
import type { LandingContent, LiveMonitorResult } from "../types";
import { editorialSystem } from "./prompts";
import { fallbackNoMaterialChange } from "./fallbacks";

export const runLiveMonitor = (content: LandingContent, landingId: number) =>
  runJsonAgent<LiveMonitorResult>({
    agent: "liveMonitor",
    landingId,
    system: editorialSystem,
    useWebSearch: true,
    prompt: `
Monitor this live landing for net-new verified updates.
Return JSON:
{
  "materiality": "NO_MATERIAL_CHANGE"|"MINOR"|"IMPORTANT"|"CRITICAL"|"BLOCKER",
  "summary": string,
  "delta": string,
  "sourceUrls": string[]
}
Only IMPORTANT or CRITICAL should update the public page.
Current landing:
${JSON.stringify(content)}
`,
    fallback: fallbackNoMaterialChange
  });

export const runLiveUpdater = (content: LandingContent, monitor: LiveMonitorResult, landingId: number) =>
  runJsonAgent<LandingContent>({
    agent: "liveUpdater",
    landingId,
    system: editorialSystem,
    prompt: `
Apply this verified live delta to the landing JSON. Preserve structure and source credits.
Preserve or improve the current dark magazine/news article look: full-bleed hero, long-form article sections, inline visuals, timeline, quotes, data/impact, reactions, gallery, and source footer.
Do not convert the landing into a compact dossier or card grid.
Add the new facts into the relevant article sections or append a substantial update section if needed.
Content is king, context is queen, update is prince: prioritize factual article substance first, explanatory context second, and live-update mechanics third.
When updating, preserve topic-specific depth: competitors/results for competitions, results/outcomes/statements for elections, price/action/catalyst data for markets, current relevance and reactions for people, and timeline/impact/official statements for crises.
Only add or keep images/graphs that are directly related to the story, named entities, locations, or sourced data. Remove irrelevant decorative visuals.
Keep sources inline and ensure the complete source list remains suitable for the final bibliography.
Return the full updated LandingContent JSON.
Current landing:
${JSON.stringify(content)}
Monitor result:
${JSON.stringify(monitor)}
`,
    fallback: () => ({
      ...content,
      lastUpdatedUtc: new Date().toISOString(),
      updateHistory: [
        {
          timestampUtc: new Date().toISOString(),
          materiality: monitor.materiality,
          summary: monitor.summary,
          sourceUrls: monitor.sourceUrls
        },
        ...content.updateHistory
      ]
    })
  });

export const deltaHash = (monitor: LiveMonitorResult) => hashValue(monitor);
