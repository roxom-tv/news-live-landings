import {
  createLanding,
  findLandingByTopic,
  getLandingBySlug,
  listActiveLandings,
  markLandingCycle,
  recordLiveCycle,
  updateLandingContent,
  updateLandingStatus
} from "./db";
import { finalUrlForSlug } from "./config";
import { hashValue } from "./hash";
import { slugify } from "./slug";
import { getCreateFlowStages, getLiveFlowStages } from "./pipeline-config";
import { runCritic } from "./agents/critic";
import { defaultStitchDesignSpec, runDesigner, runDesignerRevision } from "./agents/designer";
import { deltaHash, runLiveMonitor, runLiveUpdater } from "./agents/live";
import { runResearch } from "./agents/research";
import { runWriter, type WriterOutput } from "./agents/writer";
import type { LandingContent, LandingRecord } from "./types";
import { enforceTopLineLanding } from "./landing-quality";
import { fallbackLanding } from "./agents/fallbacks";
import { evaluateResearchTopicSupport } from "./topic-support";

export const retryableStatuses = new Set(["drafting", "critic_review", "blocked", "cancelled", "failed"]);
const defaultCriticRepairAttempts = 3;
type PipelineStageReporter = (stage: string, detail?: string) => Promise<void> | void;

const reportStage = async (reporter: PipelineStageReporter | undefined, stage: string, detail?: string) => {
  if (reporter) await reporter(stage, detail);
};

export const maxCriticRepairAttempts = () => {
  const configured = Number(process.env.CRITIC_REPAIR_ATTEMPTS);
  if (Number.isFinite(configured) && configured > 0) return Math.floor(configured);
  return defaultCriticRepairAttempts;
};

const normalizeCriticIssue = (issue: string) =>
  issue
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 :_-]/g, "")
    .trim();

const criticIssueSet = (issues: string[]) => new Set(issues.map(normalizeCriticIssue).filter(Boolean));

const issueOverlapRatio = (previous: Set<string>, next: Set<string>) => {
  if (previous.size === 0 || next.size === 0) return 0;
  let overlap = 0;
  for (const issue of next) {
    if (previous.has(issue)) overlap += 1;
  }
  return overlap / Math.max(previous.size, next.size);
};

export const blockedUnsupportedTopicLanding = (input: {
  topic: string;
  slug: string;
  reason: string;
  sources: LandingContent["sources"];
}): LandingContent => {
  const fallback = fallbackLanding(input.topic, input.slug);
  const timestamp = new Date().toISOString();
  const sources = input.sources.length > 0 ? input.sources : fallback.sources;
  const primarySourceUrl = sources[0]?.url ?? finalUrlForSlug(input.slug);

  return enforceTopLineLanding({
    ...fallback,
    slug: input.slug,
    topic: input.topic,
    status: "blocked",
    lastUpdatedUtc: timestamp,
    headline: `Blocked: ${input.topic} is not directly verified yet`,
    subheadline: "This topic was not published because the research package did not verify the exact event with a direct source.",
    summary: input.reason,
    sources,
    sections: [
      {
        id: "verification",
        eyebrow: "Verification",
        title: "Why publication stopped",
        body: input.reason,
        visualHint: "data",
        sourceUrls: [primarySourceUrl]
      },
      {
        id: "required-proof",
        eyebrow: "Missing Proof",
        title: "What source evidence is still required",
        body: "Direct event pages are required for matchup topics: fixture listing, live match page, match report, box score, or official competition reporting that mentions both sides together. Generic team pages are not enough.",
        visualHint: "svg",
        sourceUrls: [primarySourceUrl]
      },
      {
        id: "next-step",
        eyebrow: "Next Step",
        title: "What would unblock publication",
        body: "The pipeline can publish once research returns at least one direct source for the exact event and enough source-bound facts to support the result, status, and stakes without guessing.",
        visualHint: "quote",
        sourceUrls: [primarySourceUrl]
      }
    ],
    dataPoints: [],
    quotes: [],
    updateHistory: [
      {
        timestampUtc: timestamp,
        materiality: "BLOCKER",
        summary: input.reason,
        sourceUrls: sources.map(source => source.url)
      }
    ]
  });
};

export const createOrRestartDraft = (input: { existing: LandingRecord | null; content: LandingContent; slug: string; topic: string }) => {
  const content = {
    ...input.content,
    slug: input.slug,
    topic: input.topic,
    status: "critic_review" as const
  };

  if (input.existing && retryableStatuses.has(input.existing.status)) {
    return updateLandingContent(input.existing.id, content, "critic_review");
  }

  return createLanding(content);
};

export const safeBriefContent = (input: {
  base: LandingContent;
  writing: WriterOutput;
  slug: string;
  topic: string;
  reason: string;
}): LandingContent => {
  const timestamp = new Date().toISOString();
  const primarySource = input.base.sources[0];
  const primarySourceUrl = primarySource?.url ?? finalUrlForSlug(input.slug);
  const summarize = (text: string, fallback: string) => {
    const normalized = text.replace(/\s+/g, " ").trim();
    if (!normalized) return fallback;
    return normalized.length > 420 ? `${normalized.slice(0, 417).trim()}...` : normalized;
  };
  const writerSections = input.writing.sections.slice(0, 9);
  const fallbackSections = [
    { id: "lead", eyebrow: "Now", title: "What changed now", body: summarize(input.writing.summary || input.base.summary, `This page is tracking ${input.topic}.`), visualHint: "image" as const },
    { id: "stakes", eyebrow: "Why It Matters", title: "Why this matters", body: summarize(writerSections[1]?.body ?? writerSections[0]?.body ?? "", `The current turn in ${input.topic} matters because it changes the immediate pressure points around the story.`), visualHint: "data" as const },
    { id: "actors", eyebrow: "Actors", title: "Who is driving the story", body: summarize(writerSections[2]?.body ?? writerSections[0]?.body ?? "", "The key actors are the officials, institutions, and affected parties named in the reporting tied to this landing."), visualHint: "image" as const },
    { id: "status", eyebrow: "Status", title: "Where things stand", body: summarize(writerSections[3]?.body ?? writerSections[0]?.body ?? "", "The situation remains active, with the latest reporting clarifying what is confirmed and what is still unresolved."), visualHint: "chart" as const },
    { id: "timeline", eyebrow: "Timeline", title: "How the latest turn developed", body: summarize(writerSections[4]?.body ?? writerSections[0]?.body ?? "", "The latest turn follows earlier decisions and battlefield or diplomatic developments already reflected in the attached reporting."), visualHint: "data" as const },
    { id: "impact", eyebrow: "Impact", title: "What changes on the ground", body: summarize(writerSections[5]?.body ?? writerSections[1]?.body ?? "", "The reported impact falls on the institutions, civilians, markets, or military positions affected by this development."), visualHint: "map" as const },
    { id: "reactions", eyebrow: "Reaction", title: "What officials and markets are reacting to", body: summarize(writerSections[6]?.body ?? writerSections[2]?.body ?? "", "Reaction is visible through official statements, policy moves, and the way major actors are adjusting to the latest development."), visualHint: "quote" as const },
    { id: "risk", eyebrow: "Uncertainty", title: "What remains unresolved", body: summarize(writerSections[7]?.body ?? writerSections[3]?.body ?? "", "Several parts of the story are still unsettled, especially around timing, escalation risk, and what follow-through actually materializes."), visualHint: "data" as const },
    { id: "next", eyebrow: "Watch Next", title: "What could change the landing next", body: summarize(writerSections[8]?.body ?? writerSections[4]?.body ?? "", "The next meaningful update would be a verified shift in official policy, battlefield conditions, financing, or negotiations."), visualHint: "svg" as const }
  ].map((section, index) => ({
    ...section,
    sourceUrls: writerSections[index]?.sourceUrls?.length ? writerSections[index].sourceUrls : [primarySourceUrl]
  }));
  const fallbackDataPoints = (input.base.dataPoints.length > 0 ? input.base.dataPoints : input.writing.dataPoints).slice(0, 3);

  return enforceTopLineLanding({
    ...input.base,
    slug: input.slug,
    topic: input.topic,
    headline: input.writing.headline || `Live brief: ${input.topic}`,
    subheadline: primarySource
      ? summarize(input.writing.subheadline, `The latest reporting from ${primarySource.outlet} frames the current turn in ${input.topic}.`)
      : summarize(input.writing.subheadline, `This page tracks the latest reported turn in ${input.topic}.`),
    summary: summarize(input.writing.summary || input.base.summary, `This page tracks the latest reported turn in ${input.topic}.`),
    status: "live",
    lastUpdatedUtc: timestamp,
    sections: fallbackSections,
    quotes: [],
    dataPoints: fallbackDataPoints.length > 0 ? fallbackDataPoints : [{
      label: "Current turn",
      value: "Active",
      context: "The story remains live and subject to verified updates.",
      sourceUrl: primarySourceUrl
    }],
    designSpec: input.base.designSpec ?? defaultStitchDesignSpec(),
    updateHistory: [
      {
        timestampUtc: timestamp,
        materiality: "MINOR",
        summary: `Prepared conservative fallback content after autonomous repair feedback: ${input.reason}`,
        sourceUrls: input.base.sources.map(source => source.url)
      },
      ...input.base.updateHistory
    ]
  });
};

export const startLiveLanding = async (topic: string, onStage?: PipelineStageReporter) => {
  const slug = slugify(topic);
  const exactExisting = getLandingBySlug(slug);
  const topicMatch = findLandingByTopic(topic, {
    statuses: ["live", "paused", "critic_review", "drafting"],
    minimumScore: 0.8
  });
  const existing = exactExisting ?? topicMatch?.landing ?? null;
  if (existing && !retryableStatuses.has(existing.status)) return existing;
  const createFlow = new Set(getCreateFlowStages());

  await reportStage(onStage, "researching", "Gathering current sources, facts, numbers, and image candidates.");
  const research = await runResearch(topic);
  const topicSupport = evaluateResearchTopicSupport(topic, research);
  if (!topicSupport.supported) {
    const blockedReason = topicSupport.reason;
    await reportStage(onStage, "blocked", blockedReason);
    const blockedContent = blockedUnsupportedTopicLanding({
      topic,
      slug,
      reason: blockedReason,
      sources: research.sources
    });
    if (existing && retryableStatuses.has(existing.status)) {
      return updateLandingContent(existing.id, blockedContent, "blocked");
    }
    return createLanding(blockedContent);
  }
  await reportStage(onStage, "writing", `Building the editorial brief from ${research.sources.length} sources and ${research.facts.length} sourced facts.`);
  const writing = await runWriter(research);
  if (createFlow.has("designStyle")) {
    await reportStage(onStage, "design_style", "Selecting the image treatment style system for this topic.");
  }
  await reportStage(onStage, "designing", `Choosing topic-aware layout and visuals. Image candidates found: ${research.imageCandidates.length}.`);
  const designed = await runDesigner(topic, research, writing);
  await reportStage(onStage, "saving_draft", `Saving draft slug=${slug}.`);
  let draft;
  try {
    draft = createOrRestartDraft({ existing, content: designed, slug, topic });
  } catch (error) {
    if (String(error).includes("UNIQUE constraint failed")) {
      const landing = getLandingBySlug(slug);
      if (landing) return landing;
    }
    throw error;
  }
  let content = draft.content;
  await reportStage(onStage, "critic_review", "Checking sourcing, wording, visuals, and publication readiness.");
  let critic = await runCritic(content, draft.id);
  let repairFailureReason: string | null = null;
  const repairLimit = maxCriticRepairAttempts();
  let repairAttemptsUsed = 0;
  let lastContentHash = hashValue(content);
  let lastCriticFingerprint = hashValue({
    severity: critic.severity,
    issues: critic.issues,
    summary: critic.summary
  });
  let lastIssueSet = criticIssueSet(critic.issues);
  let stagnantRepairRounds = 0;

  for (let attempt = 0; !critic.approved && critic.severity === "changes_requested" && attempt < repairLimit; attempt += 1) {
    repairAttemptsUsed = attempt + 1;
    await reportStage(onStage, "repairing", `Critic requested changes. Autonomous quality repair ${attempt + 1}/${repairLimit}.`);
    try {
      content = await runDesignerRevision(content, critic, research);
      const contentHash = hashValue(content);
      if (contentHash === lastContentHash) {
        repairFailureReason = "Designer repair produced no material content change, so the pipeline stopped before using more attempts.";
        await reportStage(onStage, "repair_stopped", repairFailureReason);
        break;
      }
      lastContentHash = contentHash;
      critic = await runCritic(content, draft.id);
      const nextIssueSet = criticIssueSet(critic.issues);
      const criticFingerprint = hashValue({
        severity: critic.severity,
        issues: critic.issues,
        summary: critic.summary
      });
      if (!critic.approved && critic.severity === "changes_requested" && criticFingerprint === lastCriticFingerprint) {
        repairFailureReason = "Critic repeated the same repair feedback after a revision, so the pipeline stopped early instead of spending all attempts.";
        await reportStage(onStage, "repair_stopped", repairFailureReason);
        break;
      }
      const overlap = issueOverlapRatio(lastIssueSet, nextIssueSet);
      const issueCountDidNotImprove = nextIssueSet.size >= lastIssueSet.size;
      if (!critic.approved && critic.severity === "changes_requested" && overlap >= 0.75 && issueCountDidNotImprove) {
        stagnantRepairRounds += 1;
      } else {
        stagnantRepairRounds = 0;
      }
      if (stagnantRepairRounds >= 1) {
        repairFailureReason = "Critic feedback is no longer materially improving after a revision, so the pipeline stopped instead of consuming all remaining repair attempts.";
        await reportStage(onStage, "repair_stopped", repairFailureReason);
        break;
      }
      lastCriticFingerprint = criticFingerprint;
      lastIssueSet = nextIssueSet;
    } catch (error) {
      repairFailureReason = error instanceof Error ? error.message : String(error);
      await reportStage(onStage, "repair_failed", `Repair hit a transient error: ${repairFailureReason}`);
      break;
    }
  }

  if (!critic.approved && critic.severity === "blocked") {
    await reportStage(onStage, "blocked", critic.summary);
    return updateLandingContent(
      draft.id,
      {
        ...content,
        status: "blocked",
        updateHistory: [
          {
            timestampUtc: new Date().toISOString(),
            materiality: "BLOCKER",
            summary: critic.summary,
            sourceUrls: []
          },
          ...content.updateHistory
        ]
      },
      "blocked"
    );
  }

  if (!critic.approved) {
    const repairSummary = repairFailureReason
      ? `Critic did not approve after ${repairAttemptsUsed} repair attempt${repairAttemptsUsed === 1 ? "" : "s"}: ${repairFailureReason}`
      : `Critic did not approve after ${repairLimit} repair attempts.`;
    await reportStage(onStage, "publishing", `${repairSummary} Publishing a conservative fallback landing instead of leaving the story without an outcome.`);
    const fallbackContent = safeBriefContent({ base: content, writing, slug, topic, reason: repairFailureReason ?? critic.summary });
    return updateLandingContent(
      draft.id,
      {
        ...fallbackContent,
        status: "live",
        updateHistory: [
          {
            timestampUtc: new Date().toISOString(),
            materiality: "MINOR",
            summary: `Published conservative fallback after critic repair limit: ${repairSummary} ${critic.summary}`,
            sourceUrls: fallbackContent.sources.map(source => source.url)
          },
          ...fallbackContent.updateHistory
        ]
      },
      "live"
    );
  }

  await reportStage(onStage, "publishing", "Critic approved. Publishing final URL.");
  return updateLandingContent(draft.id, { ...content, status: "live" }, "live");
};

export const runLiveCycleForLanding = async (slug: string) => {
  const landing = getLandingBySlug(slug);
  if (!landing) throw new Error(`Landing not found: ${slug}`);
  if (landing.status !== "live") return { landing, monitor: null, updated: false };
  const liveFlow = new Set(getLiveFlowStages());

  const monitor = await runLiveMonitor(landing.content, landing.id);
  markLandingCycle(landing.id);

  if (monitor.materiality === "NO_MATERIAL_CHANGE" || monitor.materiality === "MINOR") {
    recordLiveCycle(landing.id, monitor.materiality, deltaHash(monitor), { approved: true, skipped: true });
    return { landing, monitor, updated: false };
  }

  if (monitor.materiality === "BLOCKER") {
    updateLandingStatus(landing.id, "blocked");
    recordLiveCycle(landing.id, monitor.materiality, deltaHash(monitor), { approved: false, blocked: true });
    return { landing: getLandingBySlug(slug) ?? landing, monitor, updated: false };
  }

  if (!liveFlow.has("liveUpdater")) {
    recordLiveCycle(landing.id, monitor.materiality, deltaHash(monitor), { approved: false, skipped: true, reason: "liveUpdater_disabled" });
    return { landing, monitor, updated: false, skipped: "liveUpdater_disabled" as const };
  }

  const updatedContent = await runLiveUpdater(landing.content, monitor, landing.id);
  const critic = await runCritic(updatedContent, landing.id);
  recordLiveCycle(landing.id, monitor.materiality, deltaHash(monitor), critic);

  if (!critic.approved) return { landing, monitor, updated: false, critic };

  const updatedLanding = updateLandingContent(landing.id, { ...updatedContent, status: "live" }, "live");
  return { landing: updatedLanding, monitor, updated: true, critic };
};

export const runAllLiveCycles = async () => {
  const active = listActiveLandings();
  const results = [];
  for (const landing of active) {
    results.push(await runLiveCycleForLanding(landing.slug));
  }
  return results;
};

export const publicFinalUrl = (slug: string) => finalUrlForSlug(slug);
