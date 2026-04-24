import { NextRequest, NextResponse } from "next/server";
import { isAutoRefreshEnabled, setAutoRefreshEnabled } from "@/lib/db";
import { requestHasAdminAccess, unauthorizedAdminResponse } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ ok: true, enabled: isAutoRefreshEnabled() });
}

export async function POST(request: NextRequest) {
  if (!requestHasAdminAccess(request)) return unauthorizedAdminResponse();
  const body = await request.json().catch(() => ({})) as { enabled?: unknown };
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ ok: false, error: "enabled boolean is required" }, { status: 400 });
  }

  setAutoRefreshEnabled(body.enabled);
  return NextResponse.json({ ok: true, enabled: body.enabled });
}
