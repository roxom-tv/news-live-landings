import {
  createLanding,
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
import { runCritic } from "./agents/critic";
import { defaultStitchDesignSpec, runDesigner, runDesignerRevision } from "./agents/designer";
import { deltaHash, runLiveMonitor, runLiveUpdater } from "./agents/live";
import { runResearch } from "./agents/research";
import { runWriter, type WriterOutput } from "./agents/writer";
import type { LandingContent, LandingRecord } from "./types";
import { enforceTopLineLanding } from "./landing-quality";

const retryableStatuses = new Set(["drafting", "critic_review", "blocked", "cancelled", "failed"]);
const defaultCriticRepairAttempts = 8;
type PipelineStageReporter = (stage: string, detail?: string) => Promise<void> | void;

const reportStage = async (reporter: PipelineStageReporter | undefined, stage: string, detail?: string) => {
  if (reporter) await reporter(stage, detail);
};

const maxCriticRepairAttempts = () => {
  const configured = Number(process.env.CRITIC_REPAIR_ATTEMPTS);
  if (Number.isFinite(configured) && configured > 0) return Math.floor(configured);
  return defaultCriticRepairAttempts;
};

const createOrRestartDraft = (input: { existing: LandingRecord | null; content: LandingContent; slug: string; topic: string }) => {
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

const safeBriefContent = (input: {
  base: LandingContent;
  writing: WriterOutput;
  slug: string;
  topic: string;
  reason: string;
}): LandingContent => {
  const timestamp = new Date().toISOString();
  const facts = input.base.summary
    ? [input.base.summary, ...input.writing.sections.map(section => section.body)]
    : input.writing.sections.map(section => section.body);
  const primarySource = input.base.sources[0];
  const primarySourceUrl = primarySource?.url ?? finalUrlForSlug(input.slug);

  return enforceTopLineLanding({
    ...input.base,
    slug: input.slug,
    topic: input.topic,
    headline: input.writing.headline || `Live brief: ${input.topic}`,
    subheadline: primarySource
      ? `A conservative sourced brief based on reporting from ${primarySource.outlet}.`
      : "A conservative sourced brief with live monitoring enabled.",
    summary:
      facts[0] ??
      `This page is tracking ${input.topic}. It will update only when verified source material passes the publishing guardrails.`,
    status: "live",
    lastUpdatedUtc: timestamp,
    sections: [
      {
        id: "what-is-reported",
        eyebrow: "Reported",
        title: "What is reported now",
        body: facts[0] ?? `The current brief tracks ${input.topic} using the listed sources.`,
        visualHint: "data",
        sourceUrls: [primarySourceUrl]
      },
      {
        id: "source-context",
        eyebrow: "Sources",
        title: "Where this stands",
        body:
          input.base.sources.length > 0
            ? `This brief uses ${input.base.sources.map(source => source.outlet).join(", ")} as its source base and avoids claims outside that reporting.`
            : "This brief is waiting for stronger source coverage before adding more detail.",
        visualHint: "quote",
        sourceUrls: input.base.sources.length > 0 ? input.base.sources.map(source => source.url) : [primarySourceUrl]
      },
      {
        id: "watch-next",
        eyebrow: "Watch Next",
        title: "What could change",
        body: "The live monitor will update this page when new verified facts materially change the story.",
        visualHint: "svg",
        sourceUrls: [primarySourceUrl]
      }
    ],
    quotes: [],
    dataPoints: [
      {
        label: "Sources",
        value: String(input.base.sources.length),
        context: "Count of sources attached to this conservative live brief.",
        sourceUrl: primarySourceUrl
      }
    ],
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
  const existing = getLandingBySlug(slug);
  if (existing && !retryableStatuses.has(existing.status)) return existing;

  await reportStage(onStage, "researching", "Gathering current sources, facts, numbers, and image candidates.");
  const research = await runResearch(topic);
  await reportStage(onStage, "writing", `Building the editorial brief from ${research.sources.length} sources and ${research.facts.length} sourced facts.`);
  const writing = await runWriter(research);
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
      lastCriticFingerprint = criticFingerprint;
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
    await reportStage(onStage, "blocked", `${repairSummary} Keeping the landing unpublished for quality control.`);
    const fallbackContent = safeBriefContent({ base: content, writing, slug, topic, reason: repairFailureReason ?? critic.summary });
    return updateLandingContent(
      draft.id,
      {
        ...fallbackContent,
        status: "blocked",
        updateHistory: [
          {
            timestampUtc: new Date().toISOString(),
            materiality: "BLOCKER",
            summary: `Not published: ${repairSummary} ${critic.summary}`,
            sourceUrls: fallbackContent.sources.map(source => source.url)
          },
          ...fallbackContent.updateHistory
        ]
      },
      "blocked"
    );
  }

  await reportStage(onStage, "publishing", "Critic approved. Publishing final URL.");
  return updateLandingContent(draft.id, { ...content, status: "live" }, "live");
};

export const runLiveCycleForLanding = async (slug: string) => {
  const landing = getLandingBySlug(slug);
  if (!landing) throw new Error(`Landing not found: ${slug}`);
  if (landing.status !== "live") return { landing, monitor: null, updated: false };

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
