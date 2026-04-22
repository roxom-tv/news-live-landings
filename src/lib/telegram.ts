import { env } from "./config";
import { getLandingBySlug, listLandings, recordTelegramEvent, updateLandingStatus } from "./db";
import { publicFinalUrl, runLiveCycleForLanding, startLiveLanding } from "./pipeline";
import { slugify } from "./slug";

type TelegramMessage = {
  message_id: number;
  chat: { id: number | string };
  text?: string;
};

type TelegramUpdate = {
  message?: TelegramMessage;
};

const sendTelegramMessage = async (chatId: string | number, text: string) => {
  recordTelegramEvent("out", { text }, String(chatId));

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
      disable_web_page_preview: false
    })
  });
};

export const notifyTelegram = async (text: string) => {
  if (!env.telegramChatId) return;
  await sendTelegramMessage(env.telegramChatId, text);
};

const assertAllowedChat = (chatId: string | number) => {
  if (env.telegramChatId && String(chatId) !== String(env.telegramChatId)) {
    throw new Error("Unauthorized Telegram chat.");
  }
};

const helpText = () => [
  "Live news landing commands:",
  "/start_live <topic>",
  "/status <slug_or_topic>",
  "/force_update <slug_or_topic>",
  "/pause_live <slug_or_topic>",
  "/resume_live <slug_or_topic>",
  "/final_url <slug_or_topic>",
  "/landings",
  "/help"
].join("\n");

const findSlug = (value: string) => {
  const direct = getLandingBySlug(value);
  if (direct) return value;
  return slugify(value);
};

export const handleTelegramUpdate = async (update: TelegramUpdate) => {
  const message = update.message;
  if (!message?.text) return { ok: true, ignored: true };

  const chatId = message.chat.id;
  assertAllowedChat(chatId);
  const [command, ...rest] = message.text.trim().split(/\s+/);
  const arg = rest.join(" ").trim();
  recordTelegramEvent("in", update, String(chatId), command);

  try {
    if (command === "/help" || command === "/start") {
      await sendTelegramMessage(chatId, helpText());
      return { ok: true };
    }

    if (command === "/landings") {
      const latest = listLandings(10)
        .map(landing => `- ${landing.slug}: ${landing.finalUrl}`)
        .join("\n");
      await sendTelegramMessage(chatId, [`LANDINGS INDEX: ${env.landingsIndexUrl}`, latest].filter(Boolean).join("\n"));
      return { ok: true };
    }

    if (command === "/start_live") {
      if (!arg) throw new Error("Usage: /start_live <topic>");
      await sendTelegramMessage(chatId, `PROJECT STARTED | topic=${arg} | stage=research`);
      const landing = await startLiveLanding(arg);
      if (landing.status === "live") {
        await sendTelegramMessage(
          chatId,
          `FINAL URL READY | topic=${landing.topic} | final_url=${landing.finalUrl} | index_url=${env.landingsIndexUrl}`
        );
      } else {
        await sendTelegramMessage(chatId, `BLOCKED | topic=${landing.topic} | stage=critic | status=${landing.status}`);
      }
      return { ok: true, slug: landing.slug };
    }

    if (command === "/status") {
      if (!arg) throw new Error("Usage: /status <slug_or_topic>");
      const landing = getLandingBySlug(findSlug(arg));
      if (!landing) throw new Error(`No landing found for ${arg}`);
      await sendTelegramMessage(
        chatId,
        `STATUS | topic=${landing.topic} | slug=${landing.slug} | status=${landing.status} | final_url=${landing.finalUrl} | last_updated=${landing.updatedAt}`
      );
      return { ok: true };
    }

    if (command === "/final_url") {
      if (!arg) throw new Error("Usage: /final_url <slug_or_topic>");
      const slug = findSlug(arg);
      await sendTelegramMessage(chatId, `FINAL URL | final_url=${publicFinalUrl(slug)} | index_url=${env.landingsIndexUrl}`);
      return { ok: true };
    }

    if (command === "/force_update") {
      if (!arg) throw new Error("Usage: /force_update <slug_or_topic>");
      const result = await runLiveCycleForLanding(findSlug(arg));
      await sendTelegramMessage(
        chatId,
        `FORCE UPDATE | slug=${result.landing.slug} | materiality=${result.monitor?.materiality ?? "SKIPPED"} | updated=${result.updated}`
      );
      return { ok: true };
    }

    if (command === "/pause_live" || command === "/resume_live") {
      if (!arg) throw new Error(`Usage: ${command} <slug_or_topic>`);
      const slug = findSlug(arg);
      const landing = getLandingBySlug(slug);
      if (!landing) throw new Error(`No landing found for ${arg}`);
      updateLandingStatus(landing.id, command === "/pause_live" ? "paused" : "live");
      await sendTelegramMessage(chatId, `${command === "/pause_live" ? "PAUSED" : "RESUMED"} | slug=${slug}`);
      return { ok: true };
    }

    await sendTelegramMessage(chatId, `Unknown command: ${command}\n\n${helpText()}`);
    return { ok: true };
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    await sendTelegramMessage(chatId, `BLOCKER | stage=telegram | action_required=${messageText}`);
    return { ok: false, error: messageText };
  }
};
