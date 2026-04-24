import { env } from "./config";
import { isAutoRefreshEnabled } from "./db";
import { enqueueScheduledLiveCycles } from "./pipeline-runtime";
import { notifyTelegram } from "./telegram";

let started = false;

export const runScheduledLiveCycle = async () => {
  if (!isAutoRefreshEnabled()) return [];
  return enqueueScheduledLiveCycles();
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
