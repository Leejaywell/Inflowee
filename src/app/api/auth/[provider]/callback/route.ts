import { NextResponse, type NextRequest } from "next/server";

import {
  createSessionCookieValue,
  getSessionCookieOptions,
} from "@/lib/auth";
import { OAUTH_STATE_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/lib/auth-config";
import {
  decodeOAuthStateCookieValue,
  exchangeOAuthCodeForActor,
  getOAuthStateCookieOptions,
  parseOAuthProvider,
} from "@/lib/oauth";

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

  const providerError =
    request.nextUrl.searchParams.get("error_description") ??
    request.nextUrl.searchParams.get("error");

  if (providerError) {
    return redirectToLogin(request, providerError);
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const stateCookie = decodeOAuthStateCookieValue(
    request.cookies.get(OAUTH_STATE_COOKIE_NAME)?.value,
  );

  if (
    !code ||
    !state ||
    !stateCookie ||
    stateCookie.provider !== provider ||
    stateCookie.state !== state
  ) {
    return redirectToLogin(request, "OAuth state validation failed.");
  }

  try {
    const actor = await exchangeOAuthCodeForActor({
      provider,
      code,
      origin: request.nextUrl.origin,
    });
    const response = NextResponse.redirect(new URL(stateCookie.next, request.url));
    response.cookies.set(
      SESSION_COOKIE_NAME,
      createSessionCookieValue(actor),
      getSessionCookieOptions(),
    );
    response.cookies.set(
      OAUTH_STATE_COOKIE_NAME,
      "",
      {
      ...getOAuthStateCookieOptions(),
      maxAge: 0,
      },
    );

    return response;
  } catch (error) {
    return redirectToLogin(
      request,
      error instanceof Error ? error.message : "OAuth login failed.",
    );
  }
}
