import { findLandingBySourceUrl, findLandingByTopic, getLandingBySlug, listLandings, updateLandingStatus } from "./db";
import { discoverLiveTopic } from "./agents/discover";
import { env } from "./config";
import { publicFinalUrl } from "./pipeline";
import { enqueueCreateLandingRun, enqueueLiveUpdateRun, getPipelineStatusSummary } from "./pipeline-runtime";
import { slugify } from "./slug";
import type { LandingRecord } from "./types";

type ChatPlatform = "telegram" | "slack";

export type ChatReplyContext = {
  text?: string;
  urls: string[];
};

export type ChatCommandContext = {
  platform: ChatPlatform;
  actorId: string;
  roomId: string;
  threadId?: string;
  text: string;
  replyContext?: ChatReplyContext;
};

export type ChatSendOptions = {
  menu?: boolean;
};

export type ChatSendMessage = (text: string, options?: ChatSendOptions) => Promise<void>;

const retryableStatuses = new Set(["drafting", "critic_review", "blocked", "cancelled", "failed"]);

const commandAliases: Array<[pattern: RegExp, command: string]> = [
  [/^latest(?:\s+landings)?$/i, "/landings"],
  [/^discover(?:\s+topic)?$/i, "/discover_live"],
  [/^status\s+(.+)$/i, "/status"],
  [/^final(?:\s+url)?\s+(.+)$/i, "/final_url"],
  [/^force[_\s-]*update\s+(.+)$/i, "/force_update"],
  [/^update\s+(.+)$/i, "/force_update"],
  [/^pause(?:[_\s-]*live)?\s+(.+)$/i, "/pause_live"],
  [/^resume(?:[_\s-]*live)?\s+(.+)$/i, "/resume_live"],
  [/^cancel(?:[_\s-]*live)?\s+(.+)$/i, "/cancel_live"],
  [/^help$/i, "/help"],
  [/^start(?:[_\s-]*live)?\s+(.+)$/i, "/start_live"]
];

const replyCommandHints = /^(update|refresh|check|review|rebuild|this|please|pls|run|force update)\b/i;

const cleanTopic = (value: string) =>
  value
    .replace(/^<@[^>]+>\s*/g, "")
    .replace(/^[@/][^\s]+\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();

const extractUrls = (text: string) => {
  const matches = text.match(/https?:\/\/[^\s)>]+/g) ?? [];
  return [...new Set(matches)];
};

const helpText = () => [
  "Send me a topic and I will build a sourced live news landing.",
  "",
  "Examples:",
  "bitcoin treasury companies",
  "jerome powell fed rates",
  "iran us hormuz",
  "",
  "Commands:",
  "discover topic",
  "latest landings",
  "status <slug_or_topic>",
  "force update <slug_or_topic>",
  "",
  "Slack reply mode:",
  "Reply to a message with a URL and mention the bot to update or create from that linked story."
].join("\n");

const findSlug = (value: string) => {
  const direct = getLandingBySlug(value);
  if (direct) return value;
  return slugify(value);
};

const landingStatusMessage = (landing: LandingRecord) => {
  if (landing.status === "live") {
    return `FINAL URL READY | topic=${landing.topic} | final_url=${landing.finalUrl} | index_url=${env.landingsIndexUrl}`;
  }

  if (landing.status === "blocked") {
    const blocker = landing.content.updateHistory.find(update => update.materiality === "BLOCKER");
    const reason = blocker?.summary ? ` | reason=${blocker.summary.slice(0, 700)}` : "";
    return `BLOCKED | topic=${landing.topic} | slug=${landing.slug} | status=${landing.status}${reason}`;
  }

  if (landing.status === "cancelled") {
    return `CANCELLED | topic=${landing.topic} | slug=${landing.slug}`;
  }

  if (landing.status === "failed") {
    return `RETRY NEEDED | topic=${landing.topic} | slug=${landing.slug} | status=${landing.status}`;
  }

  return `IN PROGRESS | topic=${landing.topic} | slug=${landing.slug} | status=${landing.status}`;
};

const duplicateTopicMessage = (input: { topic: string; matchedTopic: string; slug: string; finalUrl: string; score: number }) =>
  [
    `TOPIC ALREADY COVERED | topic=${input.topic} | matched_topic=${input.matchedTopic} | slug=${input.slug} | final_url=${input.finalUrl} | score=${input.score.toFixed(2)}`,
    `To refresh this landing now: force update ${input.slug}`
  ].join("\n");

const listLandingsMessage = () => {
  const latest = listLandings(10)
    .filter(landing => landing.status === "live")
    .map(landing => `- ${landing.slug}: ${landing.finalUrl}`)
    .join("\n");
  return [`LANDINGS INDEX: ${env.landingsIndexUrl}`, latest].filter(Boolean).join("\n");
};

const requestContextFrom = (context: ChatCommandContext) => ({
  platform: context.platform,
  actorId: context.actorId,
  roomId: context.roomId,
  threadId: context.threadId
});

const runDiscoveredLanding = async (context: ChatCommandContext, sendMessage: ChatSendMessage, hint = "") => {
  await sendMessage(`DISCOVERY STARTED${hint ? ` | hint=${hint}` : ""}`, { menu: true });
  const discovery = await discoverLiveTopic(hint);
  await sendMessage(
    `TOPIC SELECTED | topic=${discovery.selectedTopic} | reason=${discovery.selectedRationale.slice(0, 700)}`,
    { menu: true }
  );

  const exact = getLandingBySlug(slugify(discovery.selectedTopic));
  const topicMatch = findLandingByTopic(discovery.selectedTopic, {
    statuses: ["live", "paused", "critic_review", "drafting"],
    minimumScore: 0.8
  });
  const existing = exact ?? topicMatch?.landing ?? null;
  if (existing && !retryableStatuses.has(existing.status)) {
    await sendMessage(
      duplicateTopicMessage({
        topic: discovery.selectedTopic,
        matchedTopic: existing.topic,
        slug: existing.slug,
        finalUrl: existing.finalUrl,
        score: topicMatch?.score ?? 1
      }),
      { menu: true }
    );
  }
  const result =
    existing && !retryableStatuses.has(existing.status)
      ? { existing, run: null }
      : await enqueueCreateLandingRun(discovery.selectedTopic, requestContextFrom(context));
  if (result.existing) {
    await sendMessage(landingStatusMessage(result.existing), { menu: true });
    return { ok: true, slug: result.existing.slug, topic: discovery.selectedTopic };
  }
  if (!result.run) throw new Error("Unable to queue discovered topic.");
  await sendMessage(`QUEUED | topic=${discovery.selectedTopic} | slug=${result.run.slug} | run_id=${result.run.id}`, { menu: true });
  return { ok: true, slug: result.run.slug ?? slugify(discovery.selectedTopic), topic: discovery.selectedTopic };
};

const runTopicLanding = async (context: ChatCommandContext, sendMessage: ChatSendMessage, topic: string) => {
  const exact = getLandingBySlug(slugify(topic));
  const topicMatch = findLandingByTopic(topic, {
    statuses: ["live", "paused", "critic_review", "drafting"],
    minimumScore: 0.8
  });
  const existing = exact ?? topicMatch?.landing ?? null;
  if (existing && !retryableStatuses.has(existing.status)) {
    await sendMessage(
      duplicateTopicMessage({
        topic,
        matchedTopic: existing.topic,
        slug: existing.slug,
        finalUrl: existing.finalUrl,
        score: topicMatch?.score ?? 1
      }),
      { menu: true }
    );
    await sendMessage(landingStatusMessage(existing), { menu: true });
    return { ok: true, slug: existing.slug, existing: true };
  }

  await sendMessage(`TOPIC RECEIVED | topic=${topic}${existing ? " | mode=retry" : ""}`, { menu: true });
  const result = await enqueueCreateLandingRun(topic, requestContextFrom(context));
  if (!result.run) throw new Error("Unable to queue landing.");
  await sendMessage(`QUEUED | topic=${topic} | slug=${result.run.slug} | run_id=${result.run.id}`, { menu: true });
  return { ok: true, slug: result.run.slug ?? slugify(topic) };
};

const isOurLandingUrl = (url: string) => {
  const normalizedBase = env.finalUrlBase.replace(/\/$/, "");
  const indexBase = env.landingsIndexUrl.replace(/\/$/, "");
  return url.startsWith(normalizedBase) || url.startsWith(indexBase);
};

const slugFromLandingUrl = (url: string) => {
  const withoutQuery = url.split(/[?#]/)[0];
  const segments = withoutQuery.replace(/\/$/, "").split("/");
  return segments.at(-1) ?? "";
};

const inferTopicFromReply = (text: string, url: string) => {
  const cleaned = cleanTopic(text)
    .replace(replyCommandHints, "")
    .replace(/\b(bot|newsbot)\b/gi, "")
    .replace(/\b(update|refresh|this|please|pls|run|force)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned) return cleaned;

  const urlPath = (() => {
    try {
      const pathname = new URL(url).pathname;
      const last = pathname.split("/").filter(Boolean).at(-1) ?? "";
      return decodeURIComponent(last)
        .replace(/\.[a-z0-9]+$/i, "")
        .replace(/[-_]+/g, " ")
        .trim();
    } catch {
      return "";
    }
  })();

  return urlPath || url;
};

const handleReplyContext = async (context: ChatCommandContext, sendMessage: ChatSendMessage) => {
  const replyUrls = context.replyContext?.urls ?? [];
  if (replyUrls.length === 0) return null;

  const targetUrl = replyUrls[0];
  if (isOurLandingUrl(targetUrl)) {
    const slug = findSlug(slugFromLandingUrl(targetUrl));
    const result = await enqueueLiveUpdateRun(slug, requestContextFrom(context));
    if (!result.run) {
      await sendMessage(`FORCE UPDATE | slug=${result.landing.slug} | materiality=SKIPPED | updated=false`, { menu: true });
      return { ok: true, slug: result.landing.slug, mode: "force_update" };
    }
    await sendMessage(`QUEUED UPDATE | slug=${result.run.slug} | run_id=${result.run.id}`, { menu: true });
    return { ok: true, slug: result.run.slug ?? slug, mode: "force_update" };
  }

  const matchedLanding = findLandingBySourceUrl(targetUrl);
  if (matchedLanding) {
    const result = await enqueueLiveUpdateRun(matchedLanding.slug, requestContextFrom(context));
    if (!result.run) {
      await sendMessage(`SOURCE UPDATE | source_url=${targetUrl} | slug=${matchedLanding.slug} | materiality=SKIPPED | updated=false`, { menu: true });
      return { ok: true, slug: matchedLanding.slug, mode: "source_update" };
    }
    await sendMessage(`QUEUED UPDATE | source_url=${targetUrl} | slug=${matchedLanding.slug} | run_id=${result.run.id}`, { menu: true });
    return { ok: true, slug: matchedLanding.slug, mode: "source_update" };
  }

  const inferredTopic = inferTopicFromReply(context.text, targetUrl);
  await sendMessage(`SOURCE CONTEXT | source_url=${targetUrl} | inferred_topic=${inferredTopic}`, { menu: true });
  return runTopicLanding(context, sendMessage, inferredTopic);
};

const normalizeCommand = (context: ChatCommandContext) => {
  const normalizedText = cleanTopic(context.text);
  if (!normalizedText) return { command: "", arg: "" };
  if (normalizedText.startsWith("/")) {
    const [command, ...rest] = normalizedText.split(/\s+/);
    return { command: command.toLowerCase(), arg: rest.join(" ").trim() };
  }

  for (const [pattern, command] of commandAliases) {
    const match = normalizedText.match(pattern);
    if (match) {
      return { command, arg: (match[1] ?? "").trim() };
    }
  }

  return { command: "", arg: normalizedText };
};

export const isLongRunningChatRequest = (context: Pick<ChatCommandContext, "text" | "replyContext">) => {
  const normalized = cleanTopic(context.text).toLowerCase();
  if (context.replyContext?.urls.length) return true;
  if (!normalized) return false;
  if (!normalized.startsWith("/") && normalized !== "help" && normalized !== "latest landings" && normalized !== "latest") return true;
  const command = normalized.split(/\s+/)[0];
  return command === "/start_live" || command === "/force_update" || command === "/discover_live";
};

export const extractUrlsFromText = extractUrls;

export const handleChatCommand = async (context: ChatCommandContext, sendMessage: ChatSendMessage) => {
  const { command, arg } = normalizeCommand(context);

  try {
    const genericReplyUpdate = context.replyContext?.urls.length && /^(?:|this|it|please|pls|now|again)$/i.test(arg);

    if (command === "/help" || command === "/start") {
      await sendMessage(helpText(), { menu: true });
      return { ok: true };
    }

    if (command === "/landings") {
      await sendMessage(listLandingsMessage(), { menu: true });
      return { ok: true };
    }

    if (command === "/discover_live") {
      return runDiscoveredLanding(context, sendMessage, arg);
    }

    if (command === "/start_live") {
      if (!arg) throw new Error("Usage: start live <topic>");
      return runTopicLanding(context, sendMessage, arg);
    }

    if (command === "/status") {
      if (!arg) throw new Error("Usage: status <slug_or_topic>");
      const landing = getLandingBySlug(findSlug(arg));
      if (landing) {
        await sendMessage(
          `STATUS | topic=${landing.topic} | slug=${landing.slug} | status=${landing.status} | final_url=${landing.finalUrl} | last_updated=${landing.updatedAt}`,
          { menu: true }
        );
        const pipelineStatus = getPipelineStatusSummary(landing.slug);
        if (pipelineStatus && pipelineStatus.run.status !== "succeeded") {
          await sendMessage(
            `RUN STATUS | run_id=${pipelineStatus.run.id} | status=${pipelineStatus.run.status} | latest_stage=${pipelineStatus.latestStep?.agentName ?? "none"} | step_status=${pipelineStatus.latestStep?.status ?? "none"}`,
            { menu: true }
          );
        }
        return { ok: true };
      }
      const pipelineStatus = getPipelineStatusSummary(arg);
      if (!pipelineStatus) throw new Error(`No landing found for ${arg}`);
      await sendMessage(
        `RUN STATUS | topic=${pipelineStatus.run.topic ?? arg} | slug=${pipelineStatus.run.slug ?? "pending"} | run_id=${pipelineStatus.run.id} | status=${pipelineStatus.run.status} | latest_stage=${pipelineStatus.latestStep?.agentName ?? "none"} | step_status=${pipelineStatus.latestStep?.status ?? "none"}`,
        { menu: true }
      );
      return { ok: true };
    }

    if (command === "/final_url") {
      if (!arg) throw new Error("Usage: final url <slug_or_topic>");
      const slug = findSlug(arg);
      await sendMessage(`FINAL URL | final_url=${publicFinalUrl(slug)} | index_url=${env.landingsIndexUrl}`, { menu: true });
      return { ok: true };
    }

    if (command === "/force_update") {
      if (genericReplyUpdate) {
        const replyResult = await handleReplyContext(context, sendMessage);
        if (replyResult) return replyResult;
      }
      if (!arg) throw new Error("Usage: force update <slug_or_topic>");
      const result = await enqueueLiveUpdateRun(findSlug(arg), {
        platform: context.platform,
        actorId: context.actorId,
        roomId: context.roomId,
        threadId: context.threadId
      });
      if (!result.run) {
        await sendMessage(
          `FORCE UPDATE | slug=${result.landing.slug} | materiality=SKIPPED | updated=false`,
          { menu: true }
        );
        return { ok: true };
      }
      await sendMessage(
        `QUEUED UPDATE | slug=${result.run.slug} | run_id=${result.run.id}`,
        { menu: true }
      );
      return { ok: true };
    }

    if (command === "/pause_live" || command === "/resume_live") {
      if (!arg) throw new Error(`Usage: ${command} <slug_or_topic>`);
      const slug = findSlug(arg);
      const landing = getLandingBySlug(slug);
      if (!landing) throw new Error(`No landing found for ${arg}`);
      updateLandingStatus(landing.id, command === "/pause_live" ? "paused" : "live");
      await sendMessage(`${command === "/pause_live" ? "PAUSED" : "RESUMED"} | slug=${slug}`, { menu: true });
      return { ok: true };
    }

    if (command === "/cancel_live") {
      if (!arg) throw new Error("Usage: cancel <slug_or_topic>");
      const slug = findSlug(arg);
      const landing = getLandingBySlug(slug);
      if (!landing) throw new Error(`No landing found for ${arg}`);
      updateLandingStatus(landing.id, "cancelled");
      await sendMessage(`CANCELLED | slug=${slug}`, { menu: true });
      return { ok: true };
    }

    const replyResult = await handleReplyContext(context, sendMessage);
    if (replyResult) return replyResult;

    if (!arg) {
      await sendMessage(helpText(), { menu: true });
      return { ok: true };
    }

    if (cleanTopic(context.text).startsWith("/")) {
      await sendMessage(`I did not recognize that command.\n\n${helpText()}`, { menu: true });
      return { ok: true };
    }

    return runTopicLanding(context, sendMessage, arg);
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    await sendMessage(`BLOCKER | stage=${context.platform} | action_required=${messageText}`, { menu: true });
    return { ok: false, error: messageText };
  }
};
