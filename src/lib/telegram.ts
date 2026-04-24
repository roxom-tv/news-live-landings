import { env } from "./config";
import { recordTelegramEvent } from "./db";
import { handleChatCommand, isLongRunningChatRequest } from "./chat-commands";

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

export const sendTelegramMessage = async (
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

export const isLongRunningTelegramCommand = (update: unknown) => {
  const text =
    typeof update === "object" && update !== null && "message" in update
      ? (update as { message?: { text?: unknown } }).message?.text
      : undefined;

  if (typeof text !== "string") return false;
  return isLongRunningChatRequest({
    text,
    replyContext: undefined
  });
};

export const handleTelegramUpdate = async (update: TelegramUpdate) => {
  const message = update.message;
  if (!message?.text) return { ok: true, ignored: true };

  const chatId = String(message.chat.id);
  assertAllowedChat(chatId);
  const text = message.text.trim();
  const command = text.split(/\s+/)[0];
  recordTelegramEvent("in", update, chatId, command);

  return handleChatCommand(
    {
      platform: "telegram",
      actorId: chatId,
      roomId: chatId,
      threadId: chatId,
      text
    },
    (outgoingText, options) => sendTelegramMessage(chatId, outgoingText, options)
  );
};
