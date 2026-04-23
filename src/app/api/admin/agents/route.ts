import { NextRequest, NextResponse } from "next/server";
import { isEditableAgentId, listEditableAgents, saveAgentMarkdown } from "@/lib/admin-agents";
import { requestHasAdminAccess, unauthorizedAdminResponse } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!requestHasAdminAccess(request)) return unauthorizedAdminResponse();
  return NextResponse.json({ ok: true, agents: await listEditableAgents() });
}

export async function POST(request: NextRequest) {
  if (!requestHasAdminAccess(request)) return unauthorizedAdminResponse();
  const body = await request.json().catch(() => ({})) as { agentId?: unknown; markdown?: unknown; override?: unknown };
  if (!isEditableAgentId(body.agentId)) {
    return NextResponse.json({ ok: false, error: "agentId must be a known pipeline agent" }, { status: 400 });
  }
  const markdown = typeof body.markdown === "string" ? body.markdown : body.override;
  if (typeof markdown !== "string") {
    return NextResponse.json({ ok: false, error: "markdown must be a string" }, { status: 400 });
  }
  const savedMarkdown = await saveAgentMarkdown(body.agentId, markdown);
  return NextResponse.json({ ok: true, agentId: body.agentId, markdown: savedMarkdown, override: savedMarkdown });
}
