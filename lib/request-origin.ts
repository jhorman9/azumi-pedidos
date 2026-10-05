import type { NextRequest } from "next/server";

export function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  if (origin === request.nextUrl.origin) return true;
  // The hosting proxy can expose HTTPS while Next sees an internal HTTP URL.
  if (process.env.AZUMI_APP_URL) {
    try { return origin === new URL(process.env.AZUMI_APP_URL).origin; } catch { return false; }
  }
  return false;
}
