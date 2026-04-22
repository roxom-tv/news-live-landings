import type { AgentName } from "./types";

export const env = {
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  telegramChatId: process.env.TELEGRAM_CHAT_ID ?? "",
  telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET ?? "",
  finalUrlBase: process.env.FINAL_URL_BASE ?? "https://diegodella.ar/landings",
  landingsIndexUrl: process.env.LANDINGS_INDEX_URL ?? "https://diegodella.ar/landings",
  databaseUrl: process.env.DATABASE_URL ?? "file:/tmp/news-live-dev.db",
  liveCycleMinutes: Number(process.env.LIVE_CYCLE_MINUTES ?? "30"),
  internalCronSecret: process.env.INTERNAL_CRON_SECRET ?? "",
  pipelineEnv: process.env.PIPELINE_ENV ?? "dev"
};

export const modelForAgent = (agent: AgentName) => {
  const explicit: Partial<Record<AgentName, string | undefined>> = {
    telegramGateway: process.env.TELEGRAM_GATEWAY_MODEL,
    research: process.env.RESEARCH_MODEL,
    writer: process.env.WRITER_MODEL,
    designer: process.env.DESIGNER_MODEL,
    critic: process.env.CRITIC_MODEL,
    publisher: process.env.PUBLISHER_MODEL,
    liveMonitor: process.env.LIVE_MONITOR_MODEL,
    liveUpdater: process.env.LIVE_UPDATER_MODEL
  };

  return explicit[agent] ?? process.env.DEFAULT_MODEL ?? "gpt-5.4-mini";
};

export const finalUrlForSlug = (slug: string) => `${env.finalUrlBase.replace(/\/$/, "")}/${slug}`;
