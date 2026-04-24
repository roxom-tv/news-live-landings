import { NextRequest, NextResponse } from "next/server";
import { env } from "./config";

export const adminTokenIsConfigured = () => Boolean(env.adminToken);

export const requestHasAdminAccess = (request: NextRequest) => {
  if (!env.adminToken && env.pipelineEnv !== "prod") return true;
  const headerToken = request.headers.get("x-admin-token") ?? "";
  const bearerToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return [headerToken, bearerToken].some(token => token && token === env.adminToken);
};

export const unauthorizedAdminResponse = () =>
  NextResponse.json(
    {
      ok: false,
      error: adminTokenIsConfigured()
        ? "Admin token is required."
        : "ADMIN_TOKEN must be configured in production before /admin can edit agents."
    },
    { status: 401 }
  );
