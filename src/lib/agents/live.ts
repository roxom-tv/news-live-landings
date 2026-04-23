import { hashValue } from "../hash";
import { runJsonAgent } from "../openai";
import type { LandingContent, LiveMonitorResult } from "../types";
import { getAgentOverride } from "../admin-agents";
import { editorialSystem } from "./prompts";
import { fallbackNoMaterialChange } from "./fallbacks";

export const runLiveMonitor = async (content: LandingContent, landingId: number) => {
  const adminOverride = await getAgentOverride("liveMonitor");
  return runJsonAgent<LiveMonitorResult>({
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
Freshness gate:
- Focus on updates published, reported, or officially announced since the landing's lastUpdatedUtc, with special attention to the last 8 hours.
- Do not reopen an old background fact unless it materially changes the current story.
- If sources disagree, summarize the dispute and classify materiality conservatively.
Private red-team before returning:
- Is the delta truly new compared with the current landing?
- Are the sourceUrls credible and specific to the update?
- Would updating the page improve reader understanding now?
Current landing:
${JSON.stringify(content)}
${adminOverride}
`,
    fallback: fallbackNoMaterialChange
  });
};

export const runLiveUpdater = async (content: LandingContent, monitor: LiveMonitorResult, landingId: number) => {
  const adminOverride = await getAgentOverride("liveUpdater");
  return runJsonAgent<LandingContent>({
    agent: "liveUpdater",
    landingId,
    system: editorialSystem,
    prompt: `
Apply this verified live delta to the landing JSON. Preserve structure and source credits.
Keep the freshest verified update visible in the first viewport and in the relevant article section without turning the page into a log.
Preserve or improve the current dark magazine/news article look: full-bleed hero, long-form article sections, inline visuals, timeline, quotes, data/impact, reactions, gallery, and source footer.
Do not convert the landing into a compact dossier or card grid.
Add the new facts into the relevant article sections or append a substantial update section if needed.
Content is king, context is queen, update is prince: prioritize factual article substance first, explanatory context second, and live-update mechanics third.
When updating, preserve topic-specific depth: competitors/results for competitions, results/outcomes/statements for elections, price/action/catalyst data for markets, current relevance and reactions for people, and timeline/impact/official statements for crises.
Only add or keep images/graphs that are directly related to the story, named entities, locations, or sourced data. Remove irrelevant decorative visuals.
Keep sources inline and ensure the complete source list remains suitable for the final bibliography.
Private red-team before returning:
- The update is integrated into the narrative, not only appended.
- No old source is presented as the new delta.
- New claims have sourceUrls, section order still makes sense, and Critic should see a complete publishable update.
Return the full updated LandingContent JSON.
Current landing:
${JSON.stringify(content)}
Monitor result:
${JSON.stringify(monitor)}
${adminOverride}
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
};

export const deltaHash = (monitor: LiveMonitorResult) => hashValue(monitor);
