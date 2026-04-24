import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/config";
import { recoverInterruptedRuns } from "@/lib/recovery";
import { handleTelegramUpdate, isLongRunningTelegramCommand } from "@/lib/telegram";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  recoverInterruptedRuns();
  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  if (env.pipelineEnv === "prod" && !env.telegramWebhookSecret) {
    return NextResponse.json({ ok: false, error: "telegram webhook secret is not configured" }, { status: 503 });
  }
  if (env.telegramWebhookSecret && secret !== env.telegramWebhookSecret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const update = await request.json();
  if (isLongRunningTelegramCommand(update)) {
    void handleTelegramUpdate(update).catch(error => {
      console.error("[telegram] background command failed", error);
    });
    return NextResponse.json({ ok: true, queued: true });
  }

  const result = await handleTelegramUpdate(update);
  return NextResponse.json(result);
}

export async function GET() {
  recoverInterruptedRuns();
  return NextResponse.json({ ok: true, endpoint: "telegram" });
}
