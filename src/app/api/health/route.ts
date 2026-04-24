import { NextResponse } from "next/server";
import { env } from "@/lib/config";
import { listActiveLandings, listLandings } from "@/lib/db";
import { getPipelineRunHealth } from "@/lib/pipeline-runs";

export const runtime = "nodejs";

export async function GET() {
  const orchestration = getPipelineRunHealth(new Date(Date.now() - 8 * 60 * 1000).toISOString());
  return NextResponse.json({
    ok: true,
    service: "news-live-landings",
    pipelineEnv: env.pipelineEnv,
    landings: listLandings(100).length,
    liveLandings: listActiveLandings().length,
    features: {
      designSpecFallbackNormalization: true,
      criticGuidanceMode: true,
      publishConservativeFallbackOnRepairStop: true,
      sqliteBackedPipelineRuns: true
    },
    orchestration,
    timestamp: new Date().toISOString()
  });
}
