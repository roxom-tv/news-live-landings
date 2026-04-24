import { startPipelineWorkerLoop } from "../lib/pipeline-runtime";
import type { AgentName } from "../lib/types";

const workerId = process.env.PIPELINE_WORKER_ID ?? `worker-${process.pid}`;
const intervalMs = Number(process.env.PIPELINE_WORKER_INTERVAL_MS ?? "1500");
const agents = (process.env.PIPELINE_WORKER_AGENTS
  ? process.env.PIPELINE_WORKER_AGENTS.split(",").map(value => value.trim()).filter(Boolean)
  : undefined) as AgentName[] | undefined;

startPipelineWorkerLoop({
  workerId,
  intervalMs,
  agents
}).catch(error => {
  console.error("[worker] fatal", error);
  process.exit(1);
});
