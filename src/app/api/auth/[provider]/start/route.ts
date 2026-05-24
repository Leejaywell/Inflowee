import { NextResponse, type NextRequest } from "next/server";

import {
  createOAuthAuthorizationUrl,
  getOAuthStateCookieOptions,
  parseOAuthProvider,
  sanitizeRedirectPath,
} from "@/lib/oauth";
import { OAUTH_STATE_COOKIE_NAME } from "@/lib/auth-config";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ provider: string }>;
};

function redirectToLogin(request: NextRequest, message: string) {
  const url = new URL("/login", request.url);
  url.searchParams.set("error", message);

  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { provider: providerParam } = await context.params;
  const provider = parseOAuthProvider(providerParam);

  if (!provider) {
    return redirectToLogin(request, "Unsupported OAuth provider.");
  }

  try {
    const next = sanitizeRedirectPath(request.nextUrl.searchParams.get("next"));
    const { url, stateCookieValue } = createOAuthAuthorizationUrl({
      provider,
      origin: request.nextUrl.origin,
      next,
    });
    const response = NextResponse.redirect(url);
    response.cookies.set(
      OAUTH_STATE_COOKIE_NAME,
      stateCookieValue,
      getOAuthStateCookieOptions(),
    );

    return response;
  } catch (error) {
    return redirectToLogin(
      request,
      error instanceof Error ? error.message : "Unable to start OAuth login.",
    );
  }
}
