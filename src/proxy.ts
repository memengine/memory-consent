import { NextRequest, NextResponse } from "next/server";

const SESSION_ROUTE = "/__memoryos/session";
const COOKIE_NAME = "memoryos_uui_session";
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

function cookieDomain(hostname: string): string | undefined {
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return undefined;
  }
  if (hostname.endsWith(".memoryos.io")) {
    return ".memoryos.io";
  }
  return undefined;
}

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname !== SESSION_ROUTE) {
    return NextResponse.next();
  }

  const response =
    request.method === "DELETE"
      ? NextResponse.json({ cleared: true })
      : NextResponse.json({ ok: true });

  if (request.method === "POST") {
    const sessionToken = request.headers.get("x-memoryos-session-token")?.trim();
    if (!sessionToken) {
      return NextResponse.json({ error: "missing_session_token" }, { status: 400 });
    }

    response.cookies.set({
      name: COOKIE_NAME,
      value: sessionToken,
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
      domain: cookieDomain(request.nextUrl.hostname),
    });
    return response;
  }

  if (request.method === "DELETE") {
    response.cookies.set({
      name: COOKIE_NAME,
      value: "",
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
      domain: cookieDomain(request.nextUrl.hostname),
    });
    return response;
  }

  return NextResponse.json(
    { authenticated: request.cookies.has(COOKIE_NAME) },
    { status: 200 },
  );
}

export const config = {
  matcher: ["/__memoryos/session"],
};
