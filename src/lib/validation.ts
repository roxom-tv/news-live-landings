import type { CriticResult, LandingContent } from "./types";

export const validateLandingContent = (content: LandingContent): CriticResult => {
  const issues: string[] = [];
  const sourceUrls = new Set(content.sources.map(source => source.url));

  if (!content.headline || content.headline.length < 12) issues.push("Headline is missing or too weak.");
  if (!content.subheadline) issues.push("Subheadline is missing.");
  if (content.sources.length < 3) issues.push("At least three cited sources are required.");
  if (content.sections.length < 9) issues.push("At least nine story sections are required for a full news article.");
  if (!content.visuals.length) issues.push("At least one visual asset or SVG direction is required.");
  const hasImageVisual = content.visuals.some(visual => visual.type === "image" && visual.url?.startsWith("http"));
  const hasFallbackVisual = content.visuals.some(visual => visual.type === "svg" || visual.type === "chart" || visual.type === "map");
  if (!hasImageVisual && !hasFallbackVisual) {
    issues.push("Add a usable visual asset: a sourced image when available, or a deliberate fallback visual direction.");
  }
  if (content.dataPoints.length < 3) issues.push("At least three sourced data/context points are required.");
  if (content.visuals.some(visual => visual.type === "image" && visual.url && !visual.relevanceReason)) {
    issues.push("Every image visual must include a relevanceReason explaining why it belongs to this story.");
  }
  if (content.visuals.some(visual => visual.type === "chart" && !visual.relevanceReason)) {
    issues.push("Every chart visual must include a relevanceReason tied to sourced data.");
  }

  for (const source of content.sources) {
    if (!source.url.startsWith("http")) issues.push(`Invalid source URL: ${source.url}`);
  }

  for (const section of content.sections) {
    if (!section.sourceUrls?.length) {
      issues.push(`Missing source URLs for section ${section.id}.`);
      continue;
    }
    if (section.body.split(/\s+/).filter(Boolean).length < 120) {
      issues.push(`Section ${section.id} is too thin; expand it into real article prose with sourced context.`);
    }

    for (const sourceUrl of section.sourceUrls) {
      if (!sourceUrls.has(sourceUrl)) issues.push(`Section ${section.id} cites a source URL that is not attached to the landing.`);
    }
  }

  for (const quote of content.quotes) {
    if (!sourceUrls.has(quote.sourceUrl)) issues.push(`Quote cites a source URL that is not attached to the landing: ${quote.sourceUrl}`);
  }

  for (const point of content.dataPoints) {
    if (!sourceUrls.has(point.sourceUrl)) issues.push(`Data point cites a source URL that is not attached to the landing: ${point.sourceUrl}`);
  }

  for (const visual of content.visuals) {
    if (visual.type !== "image" || !visual.relevanceReason) continue;
    const relevanceText = `${visual.title} ${visual.alt} ${visual.relevanceReason}`.toLowerCase();
    const topicTerms = content.topic.toLowerCase().split(/\W+/).filter(term => term.length > 3);
    const sourceTerms = content.sources.flatMap(source => `${source.title} ${source.outlet}`.toLowerCase().split(/\W+/)).filter(term => term.length > 3);
    const allowedTerms = new Set([...topicTerms, ...sourceTerms]);
    const hasTopicalOverlap = [...allowedTerms].some(term => relevanceText.includes(term));
    if (!hasTopicalOverlap && visual.relevance !== "direct") {
      issues.push(`Image visual appears weakly related to the story: ${visual.title}`);
    }
  }

  if (content.designSpec?.source !== "stitch") issues.push("Landing is missing a Stitch design specification.");

  const approved = issues.length === 0;
  return {
    approved,
    severity: approved ? "approved" : "changes_requested",
    issues,
    summary: approved
      ? "Approved for direct publishing."
      : `Changes requested before publishing: ${issues.join(" ")}`
  };
};
