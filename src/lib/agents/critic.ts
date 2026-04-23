import { runJsonAgent } from "../openai";
import type { CriticResult, LandingContent } from "../types";
import { validateLandingContent } from "../validation";
import { editorialSystem } from "./prompts";
import { getAgentOverride } from "../admin-agents";

export const runCritic = async (content: LandingContent, landingId?: number) => {
  const local = validateLandingContent(content);
  if (!local.approved) return local;
  const adminOverride = await getAgentOverride("critic");

  return runJsonAgent<CriticResult>({
    agent: "critic",
    landingId,
    system: editorialSystem,
    prompt: `
Act as Critic for an experimental live news landing. Approve only if the landing is factual, sourced, visually strong, clearly sectioned, and safe to publish.
Use "changes_requested" for issues the agents can fix by rewriting, removing unsupported claims, improving attribution, strengthening structure, improving top-line clarity, or tightening visuals.
Do not demand a photographic image when no source-associated image is present and the landing already includes a deliberate fallback visual direction.
Use "blocked" only when publishing requires external human action, missing credentials, unavailable sources, legal uncertainty that cannot be worded safely, or a production incident.
Review like a red team, but make the result useful to autonomous repair. The goal is not to be harsh; the goal is to make the next designer revision obvious and sufficient.
Prioritize issues in this order: unsupported factual claims, unsafe/legal wording, missing or invalid sources, stale or unclear current angle, weak first viewport/top-line clarity, thin or generic sections, irrelevant visuals, missing data/impact/reactions/next-step context, then style polish.
Make every issue understandable and directly repairable. Each issue must follow this format:
"area: problem. Fix: exact action needed."
Good examples:
- "section:timeline: Body has only 72 words. Fix: expand it to at least 120 words using sourced chronology from Reuters and AP."
- "visuals: Hero image relevance is unclear. Fix: rewrite relevanceReason to name the person/place/source overlap, or remove the image."
- "top-line: Summary is too generic. Fix: name the current event, the affected actors, and why this changed today."
Do not return vague issues like "improve quality", "needs work", or "make it better".
If the landing has only minor style preferences but is factual, sourced, complete, and understandable, approve it. Do not force repair loops for subjective taste.
${adminOverride}
Return JSON:
{
  "approved": boolean,
  "severity": "approved"|"changes_requested"|"blocked",
  "issues": string[],
  "summary": string
}
Landing JSON:
${JSON.stringify(content)}
`,
    fallback: () => local
  });
};
