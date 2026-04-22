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
Act as Critic for an experimental live news landing. Approve only if the landing is factual, sourced, visually usable, and safe to publish.
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
