import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/config";
import { runScheduledLiveCycle } from "@/lib/scheduler";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-internal-cron-secret");
  if (env.pipelineEnv === "prod" && !env.internalCronSecret) {
    return NextResponse.json({ ok: false, error: "internal cron secret is not configured" }, { status: 503 });
  }
  if (env.internalCronSecret && secret !== env.internalCronSecret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const results = await runScheduledLiveCycle();
  return NextResponse.json({
    ok: true,
    count: results.length,
    results: results.map(result => ({
      slug: result.landing.slug,
      materiality: result.monitor?.materiality ?? "SKIPPED",
      updated: result.updated
    }))
  });
}
