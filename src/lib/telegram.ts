import { env } from "./config";
import { getLandingBySlug, listLandings, recordTelegramEvent, summarizeTokenUsageSince, updateLandingStatus } from "./db";
import { discoverLiveTopic } from "./agents/discover";
import { publicFinalUrl, runLiveCycleForLanding, startLiveLanding } from "./pipeline";
import { slugify } from "./slug";
import type { LandingRecord } from "./types";

type TelegramMessage = {
  message_id: number;
  chat: { id: number | string };
  text?: string;
};

type TelegramUpdate = {
  update_id?: number;
  message?: TelegramMessage;
};

const menuKeyboard = {
  keyboard: [
    [{ text: "Discover topic" }, { text: "Latest landings" }],
    [{ text: "Help" }]
  ],
  resize_keyboard: true,
  is_persistent: true
};

const sendTelegramMessage = async (
  chatId: string | number,
  text: string,
  options: { menu?: boolean } = {}
) => {
  recordTelegramEvent("out", { text, menu: options.menu }, String(chatId));

  if (!env.telegramBotToken) {
    console.log(`[telegram:fallback] ${chatId}: ${text}`);
    return;
  }

  await fetch(`https://api.telegram.org/bot${env.telegramBotToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: false,
      ...(options.menu ? { reply_markup: menuKeyboard } : {})
    })
  });
};

export const notifyTelegram = async (text: string) => {
  const recipients = env.telegramAllowedChatIds.length > 0 ? env.telegramAllowedChatIds : env.telegramChatId ? [env.telegramChatId] : [];
  await Promise.all(recipients.map(chatId => sendTelegramMessage(chatId, text)));
};

const assertAllowedChat = (chatId: string | number) => {
  if (env.telegramAllowedChatIds.length > 0 && !env.telegramAllowedChatIds.includes(String(chatId))) {
    throw new Error("Unauthorized Telegram chat.");
  }
};

const helpText = () => [
  "Send me a topic and I will build a sourced live news landing.",
  "",
  "Examples:",
  "bitcoin treasury companies",
  "jerome powell fed rates",
  "iran us hormuz",
  "",
  "Menu:",
  "Discover topic - I choose a current topic.",
  "Latest landings - See published landings.",
  "Help - Show this guide."
].join("\n");

const findSlug = (value: string) => {
  const direct = getLandingBySlug(value);
  if (direct) return value;
  return slugify(value);
};

const retryableStatuses = new Set(["drafting", "critic_review", "blocked", "cancelled", "failed"]);

const tokenUsageMessage = (startedAt: string) => {
  const usage = summarizeTokenUsageSince(startedAt);
  return `TOKENS | input=${usage.inputTokens} | output=${usage.outputTokens} | total=${usage.totalTokens}`;
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

const stageMessage = (topic: string, stage: string, detail?: string) => {
  const suffix = detail ? ` | detail=${detail.slice(0, 500)}` : "";
  return `STAGE | topic=${topic} | stage=${stage}${suffix}`;
};

const listLandingsMessage = () => {
  const latest = listLandings(10)
    .filter(landing => landing.status === "live")
    .map(landing => `- ${landing.slug}: ${landing.finalUrl}`)
    .join("\n");
  return [`LANDINGS INDEX: ${env.landingsIndexUrl}`, latest].filter(Boolean).join("\n");
};

const runDiscoveredLanding = async (chatId: string | number, hint = "") => {
  const startedAt = new Date().toISOString();
  await sendTelegramMessage(chatId, `DISCOVERY STARTED${hint ? ` | hint=${hint}` : ""}`, { menu: true });
  const discovery = await discoverLiveTopic(hint);
  await sendTelegramMessage(
    chatId,
    `TOPIC SELECTED | topic=${discovery.selectedTopic} | reason=${discovery.selectedRationale.slice(0, 700)}`,
    { menu: true }
  );

  const existing = getLandingBySlug(slugify(discovery.selectedTopic));
  const landing =
    existing && !retryableStatuses.has(existing.status)
      ? existing
      : await startLiveLanding(discovery.selectedTopic, (stage, detail) =>
          sendTelegramMessage(chatId, stageMessage(discovery.selectedTopic, stage, detail), { menu: true })
        );
  await sendTelegramMessage(chatId, landingStatusMessage(landing), { menu: true });
  await sendTelegramMessage(chatId, tokenUsageMessage(startedAt), { menu: true });
  return { ok: true, slug: landing.slug, topic: discovery.selectedTopic };
};

const runTopicLanding = async (chatId: string | number, topic: string) => {
  const startedAt = new Date().toISOString();
  const existing = getLandingBySlug(slugify(topic));
  if (existing && !retryableStatuses.has(existing.status)) {
    await sendTelegramMessage(chatId, landingStatusMessage(existing), { menu: true });
    await sendTelegramMessage(chatId, tokenUsageMessage(startedAt), { menu: true });
    return { ok: true, slug: existing.slug, existing: true };
  }

  await sendTelegramMessage(chatId, `TOPIC RECEIVED | topic=${topic}${existing ? " | mode=retry" : ""}`, { menu: true });
  const landing = await startLiveLanding(topic, (stage, detail) =>
    sendTelegramMessage(chatId, stageMessage(topic, stage, detail), { menu: true })
  );
  await sendTelegramMessage(chatId, landingStatusMessage(landing), { menu: true });
  await sendTelegramMessage(chatId, tokenUsageMessage(startedAt), { menu: true });
  return { ok: true, slug: landing.slug };
};

export const handleTelegramUpdate = async (update: TelegramUpdate) => {
  const message = update.message;
  if (!message?.text) return { ok: true, ignored: true };

  const chatId = message.chat.id;
  assertAllowedChat(chatId);
  const text = message.text.trim();
  const [command, ...rest] = text.split(/\s+/);
  const arg = rest.join(" ").trim();
  recordTelegramEvent("in", update, String(chatId), command);

  try {
    if (command === "/help" || command === "/start" || text.toLowerCase() === "help") {
      await sendTelegramMessage(chatId, helpText(), { menu: true });
      return { ok: true };
    }

    if (command === "/landings" || text.toLowerCase() === "latest landings") {
      await sendTelegramMessage(chatId, listLandingsMessage(), { menu: true });
      return { ok: true };
    }

    if (command === "/discover_live" || text.toLowerCase() === "discover topic") {
      return runDiscoveredLanding(chatId, arg);
    }

    if (command === "/start_live") {
      if (!arg) throw new Error("Usage: /start_live <topic>");
      return runTopicLanding(chatId, arg);
    }

    if (command === "/status") {
      if (!arg) throw new Error("Usage: /status <slug_or_topic>");
      const landing = getLandingBySlug(findSlug(arg));
      if (!landing) throw new Error(`No landing found for ${arg}`);
      await sendTelegramMessage(
        chatId,
        `STATUS | topic=${landing.topic} | slug=${landing.slug} | status=${landing.status} | final_url=${landing.finalUrl} | last_updated=${landing.updatedAt}`,
        { menu: true }
      );
      return { ok: true };
    }

    if (command === "/final_url") {
      if (!arg) throw new Error("Usage: /final_url <slug_or_topic>");
      const slug = findSlug(arg);
      await sendTelegramMessage(chatId, `FINAL URL | final_url=${publicFinalUrl(slug)} | index_url=${env.landingsIndexUrl}`, { menu: true });
      return { ok: true };
    }

    if (command === "/force_update") {
      if (!arg) throw new Error("Usage: /force_update <slug_or_topic>");
      const startedAt = new Date().toISOString();
      const result = await runLiveCycleForLanding(findSlug(arg));
      await sendTelegramMessage(
        chatId,
        `FORCE UPDATE | slug=${result.landing.slug} | materiality=${result.monitor?.materiality ?? "SKIPPED"} | updated=${result.updated}`,
        { menu: true }
      );
      await sendTelegramMessage(chatId, tokenUsageMessage(startedAt), { menu: true });
      return { ok: true };
    }

    if (command === "/pause_live" || command === "/resume_live") {
      if (!arg) throw new Error(`Usage: ${command} <slug_or_topic>`);
      const slug = findSlug(arg);
      const landing = getLandingBySlug(slug);
      if (!landing) throw new Error(`No landing found for ${arg}`);
      updateLandingStatus(landing.id, command === "/pause_live" ? "paused" : "live");
      await sendTelegramMessage(chatId, `${command === "/pause_live" ? "PAUSED" : "RESUMED"} | slug=${slug}`, { menu: true });
      return { ok: true };
    }

    if (command === "/cancel_live") {
      if (!arg) throw new Error("Usage: /cancel_live <slug_or_topic>");
      const slug = findSlug(arg);
      const landing = getLandingBySlug(slug);
      if (!landing) throw new Error(`No landing found for ${arg}`);
      updateLandingStatus(landing.id, "cancelled");
      await sendTelegramMessage(chatId, `CANCELLED | slug=${slug}`, { menu: true });
      return { ok: true };
    }

    if (text.startsWith("/")) {
      await sendTelegramMessage(chatId, `I did not recognize that menu action.\n\n${helpText()}`, { menu: true });
      return { ok: true };
    }

    return runTopicLanding(chatId, text);
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    await sendTelegramMessage(chatId, `BLOCKER | stage=telegram | action_required=${messageText}`, { menu: true });
    return { ok: false, error: messageText };
  }
};
