import { env } from "./config";
import { runAllLiveCycles } from "./pipeline";
import { notifyTelegram } from "./telegram";

let started = false;

export const runScheduledLiveCycle = async () => {
  const results = await runAllLiveCycles();
  for (const result of results) {
    if (result.updated && result.monitor) {
      await notifyTelegram(
        [
          `LIVE UPDATE PUBLISHED | topic=${result.landing.topic}`,
          `materiality=${result.monitor.materiality}`,
          `what_changed=${result.monitor.summary.slice(0, 900)}`,
          `final_url=${result.landing.finalUrl}`
        ].join(" | ")
      );
    }
  }
  return results;
};

export const startScheduler = () => {
  if (started || env.pipelineEnv === "test") return;
  started = true;
  const intervalMs = Math.max(1, env.liveCycleMinutes) * 60 * 1000;
  setInterval(() => {
    runScheduledLiveCycle().catch(error => {
      console.error("Live cycle failed", error);
      notifyTelegram(`BLOCKER | stage=scheduler | action_required=${error instanceof Error ? error.message : String(error)}`).catch(
        console.error
      );
    });
  }, intervalMs);
};
