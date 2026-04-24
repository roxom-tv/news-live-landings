import { NextRequest, NextResponse } from "next/server";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const allowedProtocols = new Set(["http:", "https:"]);
const blockedHostnames = new Set(["localhost", "127.0.0.1", "::1"]);

const isPrivateIpv4 = (value: string) => {
  const octets = value.split(".").map(part => Number(part));
  if (octets.length !== 4 || octets.some(octet => !Number.isInteger(octet) || octet < 0 || octet > 255)) return false;
  const [a, b] = octets;
  return (
    a === 10
    || a === 127
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127)
    || a === 0
  );
};

const normalizeIpv6 = (value: string) => value.toLowerCase();

const isPrivateIpv6 = (value: string) => {
  const normalized = normalizeIpv6(value);
  return (
    normalized === "::1"
    || normalized.startsWith("fc")
    || normalized.startsWith("fd")
    || normalized.startsWith("fe80:")
    || normalized === "::"
  );
};

const isBlockedIpAddress = (value: string) => {
  const version = isIP(value);
  if (version === 4) return isPrivateIpv4(value);
  if (version === 6) return isPrivateIpv6(value);
  return false;
};

const assertPublicImageHost = async (sourceUrl: URL) => {
  if (blockedHostnames.has(sourceUrl.hostname.toLowerCase())) {
    throw new Error("blocked_hostname");
  }

  if (isBlockedIpAddress(sourceUrl.hostname)) {
    throw new Error("blocked_ip");
  }

  const resolved = await lookup(sourceUrl.hostname, { all: true });
  if (resolved.some(address => isBlockedIpAddress(address.address))) {
    throw new Error("blocked_ip");
  }
};

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get("url");
  if (!rawUrl) return new NextResponse("Missing url", { status: 400 });

  let sourceUrl: URL;
  try {
    sourceUrl = new URL(rawUrl);
  } catch {
    return new NextResponse("Invalid url", { status: 400 });
  }

  if (!allowedProtocols.has(sourceUrl.protocol)) {
    return new NextResponse("Unsupported image url", { status: 400 });
  }

  try {
    await assertPublicImageHost(sourceUrl);
    const response = await fetch(sourceUrl.toString(), {
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        Referer: sourceUrl.origin,
        "User-Agent":
          "Mozilla/5.0 (compatible; NewsLiveLandings/1.0; +https://diegodella.ar/landings)"
      },
      signal: AbortSignal.timeout(8000)
    });

    if (!response.ok) return new NextResponse("Image unavailable", { status: response.status });
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) return new NextResponse("URL is not an image", { status: 415 });

    return new NextResponse(response.body, {
      headers: {
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        "Content-Type": contentType
      }
    });
  } catch (error) {
    if (error instanceof Error && (error.message === "blocked_hostname" || error.message === "blocked_ip")) {
      return new NextResponse("Blocked image host", { status: 403 });
    }
    return new NextResponse("Image fetch failed", { status: 502 });
  }
}
