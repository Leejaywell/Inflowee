import { NextResponse, type NextRequest } from "next/server";

import {
  ACTOR_EMAIL_HEADER,
  ACTOR_ID_HEADER,
  ACTOR_SIGNATURE_HEADER,
  SESSION_COOKIE_NAME,
  SESSION_SECRET_ENV,
} from "@/lib/auth-config";

const PUBLIC_PATH_PREFIXES = ["/login", "/_next", "/api", "/favicon.ico"];

function isPublicPath(pathname: string) {
  return PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function proxy(request: NextRequest) {
  if (!process.env[SESSION_SECRET_ENV] || isPublicPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const hasSessionCookie = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  const hasSignedHeaderContext =
    Boolean(request.headers.get(ACTOR_ID_HEADER)) &&
    Boolean(request.headers.get(ACTOR_EMAIL_HEADER)) &&
    Boolean(request.headers.get(ACTOR_SIGNATURE_HEADER));

  if (hasSessionCookie || hasSignedHeaderContext) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!.*\\..*).*)"],
};
