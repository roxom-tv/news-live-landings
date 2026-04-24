import { postSlackMessage } from "./slack";
import { sendTelegramMessage } from "./telegram";
import { env } from "./config";
import {
  createLanding,
  findLandingByTopic,
  getLandingById,
  getLandingBySlug,
  listActiveLandings,
  markLandingCycle,
  recordLiveCycle,
  updateLandingContent,
  updateLandingStatus
} from "./db";
import {
  createPipelineRun,
  createPipelineStep,
  failPipelineStep,
  findLatestPipelineRun,
  getLatestPipelineStep,
  getPipelineRun,
  heartbeatPipelineStep,
  leasePipelineStep,
  listPipelineRuns,
  listPipelineSteps,
  markPipelineStepAdvanced,
  markPipelineStepRunning,
  reclaimStalePipelineLeases,
  recordPipelineEvent,
  resolveRunLanding,
  succeedPipelineStep,
  updatePipelineRun,
  type PipelineRequestContext,
  type PipelineRunContext,
  type PipelineRunRecord,
  type PipelineStepRecord
} from "./pipeline-runs";
import { slugify } from "./slug";
import { getCreateFlowStages, getLiveFlowStages } from "./pipeline-config";
import { runResearch, type ResearchOutput } from "./agents/research";
import { runWriter, type WriterOutput } from "./agents/writer";
import { runCritic } from "./agents/critic";
import { runDesigner, runDesignerRevision } from "./agents/designer";
import { deltaHash, runLiveMonitor, runLiveUpdater } from "./agents/live";
import { evaluateResearchTopicSupport } from "./topic-support";
import type { CriticResult, LandingContent, LiveMonitorResult, AgentName } from "./types";
import {
  blockedUnsupportedTopicLanding,
  createOrRestartDraft,
  maxCriticRepairAttempts,
  retryableStatuses,
  safeBriefContent
} from "./pipeline";

const leaseTimeoutMs = 8 * 60 * 1000;

type CreateRunContext = PipelineRunContext & {
  topic: string;
  slug: string;
  landingId?: number;
  research?: ResearchOutput;
  writing?: WriterOutput;
  content?: LandingContent;
  critic?: CriticResult;
  repairAttemptsUsed?: number;
  repairFailureReason?: string;
  blockedReason?: string;
};

type LiveRunContext = PipelineRunContext & {
  slug: string;
  landingId: number;
  topic: string;
  content?: LandingContent;
  updatedContent?: LandingContent;
  monitor?: LiveMonitorResult;
  critic?: CriticResult;
};

const now = () => new Date().toISOString();

const stageMessage = (run: PipelineRunRecord, stage: string, detail?: string) =>
  `STAGE | topic=${run.topic ?? run.slug ?? "unknown"} | stage=${stage}${detail ? ` | detail=${detail.slice(0, 500)}` : ""}`;

const sendRunMessage = async (run: PipelineRunRecord, text: string) => {
  const request = run.requestedBy;
  if (!request) return;

  if (request.platform === "telegram") {
    await sendTelegramMessage(request.roomId, text, { menu: true });
    return;
  }

  if (request.platform === "slack" && request.roomId) {
    await postSlackMessage({
      channel: request.roomId,
      threadTs: request.threadId,
      text
    });
  }
};

const emitRunEvent = async (run: PipelineRunRecord, input: {
  eventName: string;
  message: string;
  level?: "info" | "warning" | "error";
  stepId?: number;
  payload?: unknown;
  notify?: boolean;
}) => {
  recordPipelineEvent({
    runId: run.id,
    stepId: input.stepId,
    eventName: input.eventName,
    message: input.message,
    level: input.level,
    payload: input.payload
  });
  if (input.notify) await sendRunMessage(run, input.message);
};

const nextCreateStage = (steps: PipelineStepRecord[], context: CreateRunContext) => {
  const configuredStages = getCreateFlowStages();
  const completed = new Set(steps.filter(step => step.status === "succeeded").map(step => step.agentName));
  const latestCompleted = [...steps].reverse().find(step => step.status === "succeeded");
  const latestCompletedDesignerAfterCritic = latestCompleted?.agentName === "designer"
    && steps.some(step => step.agentName === "critic" && step.status === "succeeded" && step.sequence < latestCompleted.sequence);

  if (context.blockedReason) return "publisher" as const;
  if (latestCompletedDesignerAfterCritic) return "critic" as const;

  for (const stage of configuredStages) {
    if (stage === "publisher") {
      if (completed.has("critic") || context.blockedReason) return "publisher" as const;
      continue;
    }
    if (stage === "designStyle") {
      if (!completed.has("writer")) break;
      if (!completed.has("designStyle")) return "designStyle" as const;
      continue;
    }
    if (!completed.has(stage)) return stage;
  }

  if (context.critic) return "publisher" as const;
  return null;
};

const nextLiveStage = (steps: PipelineStepRecord[], context: LiveRunContext) => {
  const configuredStages = getLiveFlowStages();
  const completed = new Set(steps.filter(step => step.status === "succeeded").map(step => step.agentName));

  if (context.monitor?.materiality === "NO_MATERIAL_CHANGE" || context.monitor?.materiality === "MINOR" || context.monitor?.materiality === "BLOCKER") {
    return completed.has("publisher") ? null : "publisher";
  }

  for (const stage of configuredStages) {
    if (stage === "publisher") {
      if (completed.has("critic")) return "publisher" as const;
      continue;
    }
    if (!completed.has(stage)) return stage;
  }

  if (context.critic) return "publisher" as const;
  return null;
};

const createNextStep = (run: PipelineRunRecord) => {
  const steps = listPipelineSteps(run.id);
  const nextAgent = run.kind === "create"
    ? nextCreateStage(steps, run.context as CreateRunContext)
    : nextLiveStage(steps, run.context as LiveRunContext);
  if (!nextAgent) return null;
  const nextSequence = (getLatestPipelineStep(run.id)?.sequence ?? 0) + 1;
  return createPipelineStep({
    runId: run.id,
    sequence: nextSequence,
    agentName: nextAgent,
    payload: run.context,
    maxAttempts: nextAgent === "critic" ? 1 : 3
  });
};

const finalizeRun = async (runId: number, status: "succeeded" | "failed", error?: { code?: string; detail?: string }) => {
  const updated = updatePipelineRun(runId, {
    status,
    finishedAt: now(),
    errorCode: error?.code ?? null,
    errorDetail: error?.detail ?? null
  });
  if (status === "failed") {
    await emitRunEvent(updated, {
      eventName: "run_failed",
      message: `BLOCKER | topic=${updated.topic ?? updated.slug ?? "unknown"} | action_required=${(error?.detail ?? "Run failed").slice(0, 700)}`,
      level: "error",
      notify: true
    });
  }
  return updated;
};

const mergeContextAfterCreateStep = async (run: PipelineRunRecord, step: PipelineStepRecord) => {
  const current = run.context as CreateRunContext;
  const output = step.output as Record<string, unknown> | undefined;
  if (!output) return current;

  if (step.agentName === "research") {
    const research = output.research as ResearchOutput;
    const topicSupport = evaluateResearchTopicSupport(current.topic, research);
    if (!topicSupport.supported) {
      return {
        ...current,
        research,
        blockedReason: topicSupport.reason
      };
    }
    return {
      ...current,
      research
    };
  }

  if (step.agentName === "writer") {
    return {
      ...current,
      writing: output.writing as WriterOutput
    };
  }

  if (step.agentName === "designStyle") {
    return {
      ...current,
      designStyleSkippedAt: now()
    };
  }

  if (step.agentName === "designer") {
    return {
      ...current,
      content: output.content as LandingContent,
      landingId: typeof output.landingId === "number" ? output.landingId : current.landingId
    };
  }

  if (step.agentName === "critic") {
    const critic = output.critic as CriticResult;
    if (!critic.approved && critic.severity === "changes_requested") {
      const repairAttemptsUsed = (current.repairAttemptsUsed ?? 0) + 1;
      const nextContext: CreateRunContext = {
        ...current,
        critic,
        repairAttemptsUsed
      };
      if (repairAttemptsUsed < maxCriticRepairAttempts()) {
        createPipelineStep({
          runId: run.id,
          sequence: step.sequence + 1,
          agentName: "designer",
          payload: nextContext,
          maxAttempts: 2
        });
        markPipelineStepAdvanced(step.id);
        return nextContext;
      }
      return {
        ...nextContext,
        repairFailureReason: critic.summary
      };
    }
    return {
      ...current,
      critic
    };
  }

  return current;
};

const mergeContextAfterLiveStep = (run: PipelineRunRecord, step: PipelineStepRecord) => {
  const current = run.context as LiveRunContext;
  const output = step.output as Record<string, unknown> | undefined;
  if (!output) return current;

  if (step.agentName === "liveMonitor") {
    return {
      ...current,
      monitor: output.monitor as LiveMonitorResult
    };
  }

  if (step.agentName === "liveUpdater") {
    return {
      ...current,
      updatedContent: output.updatedContent as LandingContent
    };
  }

  if (step.agentName === "critic") {
    return {
      ...current,
      critic: output.critic as CriticResult
    };
  }

  return current;
};

const applySucceededStep = async (run: PipelineRunRecord, step: PipelineStepRecord) => {
  const nextContext = run.kind === "create"
    ? await mergeContextAfterCreateStep(run, step)
    : mergeContextAfterLiveStep(run, step);
  const updatedRun = updatePipelineRun(run.id, {
    status: "running",
    context: nextContext,
    landingId: typeof nextContext.landingId === "number" ? nextContext.landingId : run.landingId,
    startedAt: run.startedAt ?? now()
  });
  markPipelineStepAdvanced(step.id);
  return updatedRun;
};

const publishCreateRun = async (run: PipelineRunRecord) => {
  const context = run.context as CreateRunContext;
  const slug = context.slug;
  const topic = context.topic;
  const exactExisting = getLandingBySlug(slug);
  const topicMatch = findLandingByTopic(topic, {
    statuses: ["live", "paused", "critic_review", "drafting"],
    minimumScore: 0.8
  });
  const existing = exactExisting ?? topicMatch?.landing ?? null;

  if (context.blockedReason) {
    const blockedContent = blockedUnsupportedTopicLanding({
      topic,
      slug,
      reason: context.blockedReason,
      sources: context.research?.sources ?? []
    });
    const landing = existing && retryableStatuses.has(existing.status)
      ? updateLandingContent(existing.id, blockedContent, "blocked")
      : createLanding(blockedContent);
    const updatedRun = updatePipelineRun(run.id, {
      landingId: landing.id,
      context: { ...context, landingId: landing.id, content: blockedContent }
    });
    await emitRunEvent(updatedRun, {
      eventName: "create_blocked",
      message: `BLOCKED | topic=${topic} | slug=${landing.slug} | status=${landing.status} | reason=${context.blockedReason.slice(0, 700)}`,
      level: "warning",
      notify: true
    });
    return finalizeRun(updatedRun.id, "succeeded");
  }

  if (!context.content || !context.writing) {
    return finalizeRun(run.id, "failed", {
      code: "missing_context",
      detail: "Publisher step did not receive content and writing context."
    });
  }

  if (context.critic?.approved) {
    const landing = context.landingId
      ? updateLandingContent(context.landingId, { ...context.content, status: "live" }, "live")
      : createOrRestartDraft({ existing, content: context.content, slug, topic });
    const published = updateLandingContent(landing.id, { ...context.content, status: "live" }, "live");
    const updatedRun = updatePipelineRun(run.id, {
      landingId: published.id,
      context: { ...context, landingId: published.id, content: published.content }
    });
    await emitRunEvent(updatedRun, {
      eventName: "create_published",
      message: `FINAL URL READY | topic=${published.topic} | final_url=${published.finalUrl} | index_url=${env.landingsIndexUrl}`,
      notify: true
    });
    return finalizeRun(updatedRun.id, "succeeded");
  }

  if (context.critic?.severity === "blocked") {
    const content = {
      ...context.content,
      status: "blocked" as const,
      updateHistory: [
        {
          timestampUtc: now(),
          materiality: "BLOCKER" as const,
          summary: context.critic.summary,
          sourceUrls: []
        },
        ...context.content.updateHistory
      ]
    };
    const landing = context.landingId
      ? updateLandingContent(context.landingId, content, "blocked")
      : createLanding(content);
    const updatedRun = updatePipelineRun(run.id, {
      landingId: landing.id,
      context: { ...context, landingId: landing.id, content: landing.content }
    });
    await emitRunEvent(updatedRun, {
      eventName: "create_blocked",
      message: `BLOCKED | topic=${landing.topic} | slug=${landing.slug} | status=${landing.status} | reason=${context.critic.summary.slice(0, 700)}`,
      level: "warning",
      notify: true
    });
    return finalizeRun(updatedRun.id, "succeeded");
  }

  const fallbackContent = safeBriefContent({
    base: context.content,
    writing: context.writing,
    slug,
    topic,
    reason: context.repairFailureReason ?? context.critic?.summary ?? "Critic did not approve."
  });
  const landing = context.landingId
    ? updateLandingContent(
        context.landingId,
        {
          ...fallbackContent,
          status: "live",
          updateHistory: [
            {
              timestampUtc: now(),
              materiality: "MINOR",
              summary: `Published conservative fallback after critic repair limit: ${(context.repairFailureReason ?? context.critic?.summary ?? "").slice(0, 500)}`,
              sourceUrls: fallbackContent.sources.map(source => source.url)
            },
            ...fallbackContent.updateHistory
          ]
        },
        "live"
      )
    : createLanding(fallbackContent);
  const published = updateLandingContent(landing.id, { ...landing.content, status: "live" }, "live");
  const updatedRun = updatePipelineRun(run.id, {
    landingId: published.id,
    context: { ...context, landingId: published.id, content: published.content }
  });
  await emitRunEvent(updatedRun, {
    eventName: "create_fallback_published",
    message: `FINAL URL READY | topic=${published.topic} | final_url=${published.finalUrl} | index_url=${env.landingsIndexUrl}`,
    notify: true
  });
  return finalizeRun(updatedRun.id, "succeeded");
};

const publishLiveRun = async (run: PipelineRunRecord) => {
  const context = run.context as LiveRunContext;
  const landing = getLandingById(context.landingId) ?? getLandingBySlug(context.slug);
  if (!landing) {
    return finalizeRun(run.id, "failed", {
      code: "landing_not_found",
      detail: `Live publisher could not find landing for ${context.slug}.`
    });
  }

  const monitor = context.monitor;
  if (!monitor) {
    return finalizeRun(run.id, "failed", {
      code: "missing_monitor",
      detail: "Live publisher did not receive monitor output."
    });
  }

  if (monitor.materiality === "NO_MATERIAL_CHANGE" || monitor.materiality === "MINOR") {
    recordLiveCycle(landing.id, monitor.materiality, deltaHash(monitor), { approved: true, skipped: true });
    return finalizeRun(run.id, "succeeded");
  }

  if (monitor.materiality === "BLOCKER") {
    updateLandingStatus(landing.id, "blocked");
    recordLiveCycle(landing.id, monitor.materiality, deltaHash(monitor), { approved: false, blocked: true });
    await emitRunEvent(run, {
      eventName: "live_blocked",
      message: `BLOCKER | topic=${landing.topic} | action_required=${monitor.summary.slice(0, 700)}`,
      level: "warning",
      notify: true
    });
    return finalizeRun(run.id, "succeeded");
  }

  const critic = context.critic;
  if (!context.updatedContent || !critic) {
    return finalizeRun(run.id, "failed", {
      code: "missing_update_context",
      detail: "Live publisher did not receive updated content and critic output."
    });
  }

  recordLiveCycle(landing.id, monitor.materiality, deltaHash(monitor), critic);

  if (!critic.approved) return finalizeRun(run.id, "succeeded");

  const updatedLanding = updateLandingContent(landing.id, { ...context.updatedContent, status: "live" }, "live");
  await emitRunEvent(run, {
    eventName: "live_update_published",
    message: [
      `LIVE UPDATE PUBLISHED | topic=${updatedLanding.topic}`,
      `materiality=${monitor.materiality}`,
      `what_changed=${monitor.summary.slice(0, 900)}`,
      `final_url=${updatedLanding.finalUrl}`
    ].join(" | "),
    notify: true
  });
  return finalizeRun(run.id, "succeeded");
};

const executeCreateStep = async (run: PipelineRunRecord, step: PipelineStepRecord) => {
  const context = step.payload as CreateRunContext;

  if (step.agentName === "research") {
    await emitRunEvent(run, {
      eventName: "stage_research",
      message: stageMessage(run, "researching", "Gathering current sources, facts, numbers, and image candidates."),
      stepId: step.id,
      notify: true
    });
    const research = await runResearch(context.topic);
    return { research };
  }

  if (step.agentName === "writer") {
    if (!context.research) throw new Error("Writer step requires research.");
    await emitRunEvent(run, {
      eventName: "stage_writer",
      message: stageMessage(run, "writing", `Building the editorial brief from ${context.research.sources.length} sources and ${context.research.facts.length} sourced facts.`),
      stepId: step.id,
      notify: true
    });
    const writing = await runWriter(context.research);
    return { writing };
  }

  if (step.agentName === "designStyle") {
    await emitRunEvent(run, {
      eventName: "stage_design_style",
      message: stageMessage(run, "design_style", "Design style stage is configured but currently deterministic."),
      stepId: step.id
    });
    return { skipped: true };
  }

  if (step.agentName === "designer") {
    if (!context.research) throw new Error("Designer step requires research.");
    if (context.critic && context.content) {
      await emitRunEvent(run, {
        eventName: "stage_repair",
        message: stageMessage(run, "repairing", `Critic requested changes. Autonomous quality repair ${(context.repairAttemptsUsed ?? 0) + 1}/${maxCriticRepairAttempts()}.`),
        stepId: step.id,
        notify: true
      });
      const revised = await runDesignerRevision(context.content, context.critic, context.research);
      if (context.landingId) updateLandingContent(context.landingId, revised, "critic_review");
      return { content: revised, landingId: context.landingId };
    }
    if (!context.writing) throw new Error("Designer step requires writing.");
    await emitRunEvent(run, {
      eventName: "stage_designer",
      message: stageMessage(run, "designing", `Choosing topic-aware layout and visuals. Image candidates found: ${context.research.imageCandidates.length}.`),
      stepId: step.id,
      notify: true
    });
    const designed = await runDesigner(context.topic, context.research, context.writing);
    const existing = context.slug
      ? getLandingBySlug(context.slug)
      : null;
    const draft = createOrRestartDraft({ existing, content: designed, slug: context.slug, topic: context.topic });
    return { content: draft.content, landingId: draft.id };
  }

  if (step.agentName === "critic") {
    if (!context.content) throw new Error("Critic step requires content.");
    await emitRunEvent(run, {
      eventName: "stage_critic",
      message: stageMessage(run, "critic_review", "Checking sourcing, wording, visuals, and publication readiness."),
      stepId: step.id,
      notify: true
    });
    const critic = await runCritic(context.content, context.landingId);
    return { critic };
  }

  if (step.agentName === "publisher") {
    await emitRunEvent(run, {
      eventName: "stage_publisher",
      message: stageMessage(run, "publishing", "Applying final publication outcome from persisted run state."),
      stepId: step.id
    });
    return publishCreateRun(run);
  }

  throw new Error(`Unsupported create step agent: ${step.agentName}`);
};

const executeLiveStep = async (run: PipelineRunRecord, step: PipelineStepRecord) => {
  const context = step.payload as LiveRunContext;
  const landing = getLandingById(context.landingId) ?? getLandingBySlug(context.slug);
  if (!landing) throw new Error(`Landing not found: ${context.slug}`);

  if (step.agentName === "liveMonitor") {
    const monitor = await runLiveMonitor(landing.content, landing.id);
    markLandingCycle(landing.id);
    return { monitor };
  }

  if (step.agentName === "liveUpdater") {
    if (!context.monitor) throw new Error("Live updater requires monitor output.");
    const updatedContent = await runLiveUpdater(landing.content, context.monitor, landing.id);
    return { updatedContent };
  }

  if (step.agentName === "critic") {
    if (!context.updatedContent) throw new Error("Critic step requires updated content.");
    const critic = await runCritic(context.updatedContent, landing.id);
    return { critic };
  }

  if (step.agentName === "publisher") {
    return publishLiveRun(run);
  }

  throw new Error(`Unsupported live step agent: ${step.agentName}`);
};

export const tickPipelineOrchestratorNow = async () => {
  reclaimStalePipelineLeases(new Date(Date.now() - leaseTimeoutMs).toISOString());
  const runs = listPipelineRuns(200).filter(run => run.status === "queued" || run.status === "running");
  for (const run of runs) {
    const steps = listPipelineSteps(run.id);
    const activeStep = steps.find(step => ["pending", "leased", "running"].includes(step.status));
    if (activeStep) continue;

    const failedStep = steps.find(step => step.status === "failed" && !step.advancedAt);
    if (failedStep) {
      markPipelineStepAdvanced(failedStep.id);
      await finalizeRun(run.id, "failed", {
        code: failedStep.errorCode,
        detail: failedStep.errorDetail ?? `${failedStep.agentName} failed.`
      });
      continue;
    }

    const succeededStep = [...steps].reverse().find(step => step.status === "succeeded" && !step.advancedAt);
    let currentRun = run;
    if (succeededStep) {
      currentRun = await applySucceededStep(run, succeededStep);
    } else if (currentRun.status === "queued") {
      currentRun = updatePipelineRun(run.id, { status: "running", startedAt: run.startedAt ?? now() });
      await emitRunEvent(currentRun, {
        eventName: "run_started",
        message: `QUEUED | topic=${currentRun.topic ?? currentRun.slug ?? "unknown"} | run_id=${currentRun.id}`,
        notify: true
      });
    }

    const nextRun = getPipelineRun(currentRun.id);
    if (!nextRun) continue;
    const nextStep = createNextStep(nextRun);
    if (!nextStep && nextRun.status === "running") {
      await finalizeRun(nextRun.id, "succeeded");
    }
  }
};

export const runWorkerOnce = async (workerId: string, allowedAgents?: AgentName[]) => {
  const step = leasePipelineStep(workerId, allowedAgents);
  if (!step) return null;
  const runningStep = markPipelineStepRunning(step.id);
  if (!runningStep) return null;
  const run = getPipelineRun(runningStep.runId);
  if (!run) throw new Error(`Pipeline run not found: ${runningStep.runId}`);

  try {
    heartbeatPipelineStep(runningStep.id);
    if (runningStep.agentName === "publisher") {
      await (run.kind === "create"
        ? await executeCreateStep(run, runningStep)
        : await executeLiveStep(run, runningStep));
      succeedPipelineStep(runningStep.id, { published: true });
      markPipelineStepAdvanced(runningStep.id);
      return runningStep;
    }

    const output = run.kind === "create"
      ? await executeCreateStep(run, runningStep)
      : await executeLiveStep(run, runningStep);
    succeedPipelineStep(runningStep.id, output);
    await tickPipelineOrchestratorNow();
    return runningStep;
  } catch (error) {
    failPipelineStep(runningStep.id, {
      errorCode: "step_failed",
      errorDetail: error instanceof Error ? error.message : String(error)
    });
    await tickPipelineOrchestratorNow();
    return runningStep;
  }
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const startPipelineOrchestratorLoop = async (input?: { intervalMs?: number }) => {
  const intervalMs = Math.max(500, input?.intervalMs ?? 2000);
  for (;;) {
    await tickPipelineOrchestratorNow();
    await sleep(intervalMs);
  }
};

export const startPipelineWorkerLoop = async (input: { workerId: string; intervalMs?: number; agents?: AgentName[] }) => {
  const intervalMs = Math.max(500, input.intervalMs ?? 1500);
  for (;;) {
    const step = await runWorkerOnce(input.workerId, input.agents);
    if (!step) await sleep(intervalMs);
  }
};

export const enqueueCreateLandingRun = async (topic: string, requestedBy?: PipelineRequestContext) => {
  const slug = slugify(topic);
  const exactExisting = getLandingBySlug(slug);
  const topicMatch = findLandingByTopic(topic, {
    statuses: ["live", "paused", "critic_review", "drafting"],
    minimumScore: 0.8
  });
  const existing = exactExisting ?? topicMatch?.landing ?? null;
  if (existing && !retryableStatuses.has(existing.status)) {
    return { existing, run: null };
  }

  const run = createPipelineRun({
    kind: "create",
    topic,
    slug,
    landingId: existing?.id,
    requestedBy,
    context: {
      topic,
      slug,
      landingId: existing?.id
    }
  });
  await tickPipelineOrchestratorNow();
  return { existing: null, run };
};

export const enqueueLiveUpdateRun = async (slug: string, requestedBy?: PipelineRequestContext) => {
  const landing = getLandingBySlug(slug);
  if (!landing) throw new Error(`Landing not found: ${slug}`);
  if (landing.status !== "live") return { landing, run: null };

  const run = createPipelineRun({
    kind: "live",
    topic: landing.topic,
    slug: landing.slug,
    landingId: landing.id,
    requestedBy,
    context: {
      slug: landing.slug,
      landingId: landing.id,
      topic: landing.topic,
      content: landing.content
    }
  });
  await tickPipelineOrchestratorNow();
  return { landing, run };
};

export const enqueueScheduledLiveCycles = async () => {
  const active = listActiveLandings();
  const createdRuns: Array<{ landingId: number; runId: number }> = [];

  for (const landing of active) {
    const latestRun = findLatestPipelineRun({ landingId: landing.id });
    if (latestRun && ["queued", "running"].includes(latestRun.status)) continue;
    const run = createPipelineRun({
      kind: "live",
      topic: landing.topic,
      slug: landing.slug,
      landingId: landing.id,
      context: {
        slug: landing.slug,
        landingId: landing.id,
        topic: landing.topic,
        content: landing.content
      }
    });
    createdRuns.push({ landingId: landing.id, runId: run.id });
  }

  await tickPipelineOrchestratorNow();
  return createdRuns;
};

export const getPipelineStatusSummary = (value: string) => {
  const run = findLatestPipelineRun({ slugOrTopic: value });
  if (!run) return null;
  const landing = resolveRunLanding(run);
  const steps = listPipelineSteps(run.id);
  const latestStep = steps.at(-1);
  return {
    run,
    landing,
    latestStep
  };
};
