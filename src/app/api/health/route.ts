import { NextResponse } from "next/server";
import { listLandings } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "news-live-landings",
    landings: listLandings(1).length,
    timestamp: new Date().toISOString()
  });
}
