import { runJsonAgent } from "../openai";
import type { CriticResult, LandingContent } from "../types";
import { validateLandingContent } from "../validation";
import { editorialSystem } from "./prompts";

export const runCritic = async (content: LandingContent, landingId?: number) => {
  const local = validateLandingContent(content);
  if (!local.approved) return local;

  return runJsonAgent<CriticResult>({
    agent: "critic",
    landingId,
    system: editorialSystem,
    prompt: `
Act as Critic for an experimental live news landing. Approve only if the landing is factual, sourced, visually strong, clearly sectioned, and safe to publish.
Use "changes_requested" for issues the agents can fix by rewriting, removing unsupported claims, improving attribution, strengthening structure, improving top-line clarity, or tightening visuals.
Do not demand a photographic image when no source-associated image is present and the landing already includes a deliberate fallback visual direction.
Use "blocked" only when publishing requires external human action, missing credentials, unavailable sources, legal uncertainty that cannot be worded safely, or a production incident.
Make every issue understandable and directly repairable. Each issue must follow this format:
"area: problem. Fix: exact action needed."
Good examples:
- "section:timeline: Body has only 72 words. Fix: expand it to at least 120 words using sourced chronology from Reuters and AP."
- "visuals: Hero image relevance is unclear. Fix: rewrite relevanceReason to name the person/place/source overlap, or remove the image."
- "top-line: Summary is too generic. Fix: name the current event, the affected actors, and why this changed today."
Do not return vague issues like "improve quality", "needs work", or "make it better".
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
