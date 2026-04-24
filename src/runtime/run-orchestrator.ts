import { startPipelineOrchestratorLoop } from "../lib/pipeline-runtime";

const intervalMs = Number(process.env.PIPELINE_ORCHESTRATOR_INTERVAL_MS ?? "2000");

startPipelineOrchestratorLoop({ intervalMs }).catch(error => {
  console.error("[orchestrator] fatal", error);
  process.exit(1);
});
