import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./config";
import { recordChatEvent } from "./db";
import { extractUrlsFromText, handleChatCommand, isLongRunningChatRequest } from "./chat-commands";

export type SlackEvent = {
  type: string;
  text?: string;
  user?: string;
  channel?: string;
  ts?: string;
  thread_ts?: string;
  bot_id?: string;
  subtype?: string;
};

export type SlackEnvelope = {
  type?: string;
  challenge?: string;
  event?: SlackEvent;
};

const slackApi = async <T>(method: string, body: Record<string, unknown> | URLSearchParams) => {
  if (!env.slackBotToken) throw new Error("Slack bot token is missing.");
  const response = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.slackBotToken}`,
      "Content-Type": body instanceof URLSearchParams ? "application/x-www-form-urlencoded" : "application/json; charset=utf-8"
    },
    body: body instanceof URLSearchParams ? body.toString() : JSON.stringify(body)
  });
  const json = await response.json() as T & { ok?: boolean; error?: string };
  if (!json.ok) throw new Error(`Slack API ${method} failed: ${json.error ?? "unknown_error"}`);
  return json;
};

export const verifySlackSignature = (rawBody: string, timestamp: string | null, signature: string | null) => {
  if (!env.slackSigningSecret) return env.pipelineEnv !== "prod";
  if (!timestamp || !signature) return false;

  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > 60 * 5) return false;

  const base = `v0:${timestamp}:${rawBody}`;
  const digest = `v0=${createHmac("sha256", env.slackSigningSecret).update(base).digest("hex")}`;
  const expected = Buffer.from(digest);
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
};

const assertAllowedSlackContext = (channelId: string, userId: string) => {
  if (env.slackAllowedChannelIds.length > 0 && !env.slackAllowedChannelIds.includes(channelId)) {
    throw new Error("Unauthorized Slack channel.");
  }
  if (env.slackAllowedUserIds.length > 0 && !env.slackAllowedUserIds.includes(userId)) {
    throw new Error("Unauthorized Slack user.");
  }
};

export const postSlackMessage = async (input: {
  channel: string;
  text: string;
  threadTs?: string;
}) => {
  recordChatEvent({
    platform: "slack",
    direction: "out",
    payload: input,
    roomId: input.channel,
    threadId: input.threadTs
  });

  if (!env.slackBotToken) {
    console.log(`[slack:fallback] ${input.channel}/${input.threadTs ?? "top"}: ${input.text}`);
    return;
  }

  await slackApi("chat.postMessage", {
    channel: input.channel,
    text: input.text,
    thread_ts: input.threadTs
  });
};

const fetchSlackParentReplyContext = async (channel: string, threadTs: string) => {
  if (!env.slackBotToken) return undefined;
  const data = await slackApi<{ messages?: Array<{ text?: string }> }>(
    "conversations.replies",
    new URLSearchParams({ channel, ts: threadTs, inclusive: "true", limit: "1" })
  );
  const text = data.messages?.[0]?.text?.trim() ?? "";
  if (!text) return undefined;
  return {
    text,
    urls: extractUrlsFromText(text)
  };
};

const stripSlackMentions = (text: string) => text.replace(/<@[^>]+>/g, "").trim();

export const isLongRunningSlackEvent = (event: SlackEvent) =>
  isLongRunningChatRequest({
    text: stripSlackMentions(event.text ?? ""),
    replyContext: undefined
  }) || Boolean(event.thread_ts && event.thread_ts !== event.ts);

export const handleSlackEnvelope = async (envelope: SlackEnvelope) => {
  const event = envelope.event;
  if (!event || event.type !== "app_mention") return { ok: true, ignored: true };
  if (event.bot_id || event.subtype) return { ok: true, ignored: true };
  if (!event.channel || !event.user || !event.ts) return { ok: true, ignored: true };

  assertAllowedSlackContext(event.channel, event.user);
  const text = stripSlackMentions(event.text ?? "");
  const threadTs = event.thread_ts ?? event.ts;
  const replyContext = event.thread_ts && event.thread_ts !== event.ts
    ? await fetchSlackParentReplyContext(event.channel, event.thread_ts)
    : undefined;

  recordChatEvent({
    platform: "slack",
    direction: "in",
    payload: envelope,
    roomId: event.channel,
    threadId: threadTs,
    actorId: event.user,
    command: text.split(/\s+/)[0]
  });

  return handleChatCommand(
    {
      platform: "slack",
      actorId: event.user,
      roomId: event.channel,
      threadId: threadTs,
      text,
      replyContext
    },
    async outgoingText => {
      await postSlackMessage({
        channel: event.channel!,
        threadTs,
        text: outgoingText
      });
    }
  );
};
