import type { CriticResult, LandingContent } from "./types";

const sectionWordCount = (body: string) => body.split(/\s+/).filter(Boolean).length;

export const validateLandingContent = (content: LandingContent): CriticResult => {
  const issues: string[] = [];
  const sourceUrls = new Set(content.sources.map(source => source.url));

  if (!content.headline || content.headline.length < 12) {
    issues.push("headline: Add a specific, publish-ready headline of at least 12 characters that names the story and the main action.");
  }
  if (!content.subheadline) {
    issues.push("subheadline: Add a one- or two-sentence subheadline that explains why the story matters now.");
  }
  if (content.sources.length < 3) {
    issues.push(`sources: Attach at least 3 cited sources; current count is ${content.sources.length}.`);
  }
  if (content.sections.length < 9) {
    issues.push(`sections: Build at least 9 clear story sections; current count is ${content.sections.length}. Required coverage: lead, stakes, actors, status/result, timeline/comparison, impact/data, reactions, uncertainty, next watch.`);
  }
  if (!content.visuals.length) {
    issues.push("visuals: Add at least one visual asset: a sourced image when available, or a deliberate fallback visual direction.");
  }
  const hasImageVisual = content.visuals.some(visual => visual.type === "image" && visual.url?.startsWith("http"));
  const hasFallbackVisual = content.visuals.some(visual => visual.type === "svg" || visual.type === "chart" || visual.type === "map");
  if (!hasImageVisual && !hasFallbackVisual) {
    issues.push("visuals: Add a usable hero visual. Use a sourced image when available; otherwise add a clear SVG/chart/map fallback direction tied to the story.");
  }
  if (content.dataPoints.length < 3) {
    issues.push(`dataPoints: Add at least 3 sourced data/context cards; current count is ${content.dataPoints.length}. Use numbers, dates, actor counts, status markers, or source-count context.`);
  }
  if (content.visuals.some(visual => visual.type === "image" && visual.url && !visual.relevanceReason)) {
    issues.push("visuals: Every image visual needs relevanceReason explaining why that image belongs to this exact story.");
  }
  if (content.visuals.some(visual => visual.type === "chart" && !visual.relevanceReason)) {
    issues.push("visuals: Every chart visual needs relevanceReason tied to specific sourced data.");
  }

  for (const source of content.sources) {
    if (!source.url.startsWith("http")) issues.push(`sources: Invalid source URL "${source.url}". Replace it with an absolute http(s) URL.`);
  }

  for (const section of content.sections) {
    if (!section.sourceUrls?.length) {
      issues.push(`section:${section.id}: Add sourceUrls from the attached source list.`);
      continue;
    }
    const words = sectionWordCount(section.body);
    if (words < 120) {
      issues.push(`section:${section.id}: Body has ${words} words; expand to at least 120 words with sourced article prose, source-context framing, or clearly marked uncertainty.`);
    }

    for (const sourceUrl of section.sourceUrls) {
      if (!sourceUrls.has(sourceUrl)) issues.push(`section:${section.id}: Cites sourceUrl "${sourceUrl}" but that URL is not in content.sources. Use only attached source URLs.`);
    }
  }

  for (const quote of content.quotes) {
    if (!sourceUrls.has(quote.sourceUrl)) issues.push(`quotes: Quote from "${quote.attribution}" cites unattached sourceUrl "${quote.sourceUrl}". Use an attached source URL or remove the quote.`);
  }

  for (const point of content.dataPoints) {
    if (!sourceUrls.has(point.sourceUrl)) issues.push(`dataPoints:${point.label}: Cites unattached sourceUrl "${point.sourceUrl}". Use an attached source URL.`);
  }

  for (const visual of content.visuals) {
    if (visual.type !== "image" || !visual.relevanceReason) continue;
    const relevanceText = `${visual.title} ${visual.alt} ${visual.relevanceReason}`.toLowerCase();
    const topicTerms = content.topic.toLowerCase().split(/\W+/).filter(term => term.length > 3);
    const sourceTerms = content.sources.flatMap(source => `${source.title} ${source.outlet}`.toLowerCase().split(/\W+/)).filter(term => term.length > 3);
    const allowedTerms = new Set([...topicTerms, ...sourceTerms]);
    const hasTopicalOverlap = [...allowedTerms].some(term => relevanceText.includes(term));
    if (!hasTopicalOverlap && visual.relevance !== "direct") {
      issues.push(`visuals:${visual.title}: Relevance looks weak. Rewrite relevanceReason with explicit overlap to the topic, source title, named person, institution, or place; otherwise remove the image.`);
    }
  }

  if (content.designSpec?.source !== "stitch") {
    issues.push("designSpec: Add a Stitch design specification with layout, palette, hero treatment, motion, and notes.");
  }

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
