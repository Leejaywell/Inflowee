import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import {
  GITHUB_CLIENT_ID_ENV,
  GITHUB_CLIENT_SECRET_ENV,
  GOOGLE_CLIENT_ID_ENV,
  GOOGLE_CLIENT_SECRET_ENV,
  INFLOWEE_WECHAT_APP_ID_ENV,
  INFLOWEE_WECHAT_APP_SECRET_ENV,
  OAUTH_STATE_COOKIE_NAME,
  SESSION_SECRET_ENV,
  WECHAT_APP_ID_ENV,
  WECHAT_APP_SECRET_ENV,
} from "@/lib/auth-config";
import type { SessionActor } from "@/lib/auth";

export type OAuthProvider = "google" | "github" | "wechat";

type ProviderConfig = {
  provider: OAuthProvider;
  clientId: string;
  clientSecret: string;
};

type OAuthStatePayload = {
  provider: OAuthProvider;
  state: string;
  next: string;
};

type OAuthStateCookie = OAuthStatePayload & {
  signature: string;
};

const PROVIDER_LABELS: Record<OAuthProvider, string> = {
  google: "Google",
  github: "GitHub",
  wechat: "WeChat",
};

export const OAUTH_PROVIDERS: OAuthProvider[] = ["wechat", "google", "github"];
const VISIBLE_OAUTH_PROVIDERS: OAuthProvider[] = ["google", "github"];

function getRequiredSessionSecret() {
  const secret = process.env[SESSION_SECRET_ENV];

  if (!secret) {
    throw new Error("INFLOWEE_SESSION_SECRET is required for OAuth login.");
  }

  return secret;
}

function getProviderConfig(provider: OAuthProvider): ProviderConfig | null {
  if (provider === "google") {
    const clientId = process.env[GOOGLE_CLIENT_ID_ENV];
    const clientSecret = process.env[GOOGLE_CLIENT_SECRET_ENV];

    return clientId && clientSecret
      ? { provider, clientId, clientSecret }
      : null;
  }

  if (provider === "github") {
    const clientId = process.env[GITHUB_CLIENT_ID_ENV];
    const clientSecret = process.env[GITHUB_CLIENT_SECRET_ENV];

    return clientId && clientSecret
      ? { provider, clientId, clientSecret }
      : null;
  }

  const clientId =
    process.env[INFLOWEE_WECHAT_APP_ID_ENV] ?? process.env[WECHAT_APP_ID_ENV];
  const clientSecret =
    process.env[INFLOWEE_WECHAT_APP_SECRET_ENV] ??
    process.env[WECHAT_APP_SECRET_ENV];

  return clientId && clientSecret ? { provider, clientId, clientSecret } : null;
}

export function getOAuthProviderLabel(provider: OAuthProvider) {
  return PROVIDER_LABELS[provider];
}

export function parseOAuthProvider(value: string): OAuthProvider | null {
  return OAUTH_PROVIDERS.includes(value as OAuthProvider)
    ? (value as OAuthProvider)
    : null;
}

export function getConfiguredOAuthProviders() {
  return VISIBLE_OAUTH_PROVIDERS.map((provider) => ({
    provider,
    label: getOAuthProviderLabel(provider),
    configured: Boolean(getProviderConfig(provider)),
  }));
}

export function getOAuthStateCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/api/auth",
    maxAge: 10 * 60,
  };
}

function signStatePayload(payload: OAuthStatePayload, secret: string) {
  return createHmac("sha256", secret)
    .update(`${payload.provider}:${payload.state}:${payload.next}`)
    .digest("hex");
}

function signaturesMatch(expected: string, received: string) {
  const expectedBytes = Buffer.from(expected);
  const receivedBytes = Buffer.from(received);

  if (expectedBytes.length !== receivedBytes.length) {
    return false;
  }

  return timingSafeEqual(expectedBytes, receivedBytes);
}

export function createOAuthStateCookieValue(payload: OAuthStatePayload) {
  const secret = getRequiredSessionSecret();

  return Buffer.from(
    JSON.stringify({
      ...payload,
      signature: signStatePayload(payload, secret),
    } satisfies OAuthStateCookie),
    "utf8",
  ).toString("base64url");
}

export function decodeOAuthStateCookieValue(
  value: string | undefined,
): OAuthStatePayload | null {
  if (!value) {
    return null;
  }

  try {
    const secret = getRequiredSessionSecret();
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      provider?: unknown;
      state?: unknown;
      next?: unknown;
      signature?: unknown;
    };
    const provider =
      typeof parsed.provider === "string"
        ? parseOAuthProvider(parsed.provider)
        : null;

    if (
      !provider ||
      typeof parsed.state !== "string" ||
      typeof parsed.next !== "string" ||
      typeof parsed.signature !== "string"
    ) {
      return null;
    }

    const payload = {
      provider,
      state: parsed.state,
      next: sanitizeRedirectPath(parsed.next),
    };
    const expected = signStatePayload(payload, secret);

    return signaturesMatch(expected, parsed.signature) ? payload : null;
  } catch {
    return null;
  }
}

export function sanitizeRedirectPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }

  return value;
}

export function createOAuthAuthorizationUrl(input: {
  provider: OAuthProvider;
  origin: string;
  next: string;
}) {
  const config = getProviderConfig(input.provider);

  if (!config) {
    throw new Error(`${getOAuthProviderLabel(input.provider)} login is not configured.`);
  }

  getRequiredSessionSecret();

  const state = randomBytes(24).toString("base64url");
  const redirectUri = `${input.origin}/api/auth/${input.provider}/callback`;

  if (input.provider === "google") {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", config.clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("state", state);
    url.searchParams.set("access_type", "online");
    url.searchParams.set("prompt", "select_account");

    return {
      url,
      stateCookieValue: createOAuthStateCookieValue({
        provider: input.provider,
        state,
        next: sanitizeRedirectPath(input.next),
      }),
    };
  }

  if (input.provider === "github") {
    const url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", config.clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", "read:user user:email");
    url.searchParams.set("state", state);

    return {
      url,
      stateCookieValue: createOAuthStateCookieValue({
        provider: input.provider,
        state,
        next: sanitizeRedirectPath(input.next),
      }),
    };
  }

  const url = new URL("https://open.weixin.qq.com/connect/qrconnect");
  url.searchParams.set("appid", config.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "snsapi_login");
  url.searchParams.set("state", state);
  url.hash = "wechat_redirect";

  return {
    url,
    stateCookieValue: createOAuthStateCookieValue({
      provider: input.provider,
      state,
      next: sanitizeRedirectPath(input.next),
    }),
  };
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      data && typeof data === "object" && "error_description" in data
        ? String(data.error_description)
        : data && typeof data === "object" && "error" in data
        ? String(data.error)
        : `OAuth provider returned ${response.status}.`;

    throw new Error(message);
  }

  return data as T;
}

async function exchangeGoogleCode(config: ProviderConfig, code: string, redirectUri: string) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
  const token = await readJsonResponse<{ access_token?: string }>(response);

  if (!token.access_token) {
    throw new Error("Google did not return an access token.");
  }

  const userResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: {
      authorization: `Bearer ${token.access_token}`,
    },
  });
  const user = await readJsonResponse<{
    sub?: string;
    email?: string;
    name?: string;
  }>(userResponse);

  if (!user.sub) {
    throw new Error("Google did not return a user id.");
  }

  return {
    id: `google:${user.sub}`,
    email: user.email ?? `${user.sub}@google.oauth.local`,
  };
}

async function exchangeGithubCode(config: ProviderConfig, code: string, redirectUri: string) {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });
  const token = await readJsonResponse<{ access_token?: string }>(response);

  if (!token.access_token) {
    throw new Error("GitHub did not return an access token.");
  }

  const userResponse = await fetch("https://api.github.com/user", {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token.access_token}`,
      "x-github-api-version": "2022-11-28",
    },
  });
  const user = await readJsonResponse<{
    id?: number;
    login?: string;
    email?: string | null;
  }>(userResponse);

  if (!user.id) {
    throw new Error("GitHub did not return a user id.");
  }

  let email = user.email ?? null;

  if (!email) {
    const emailResponse = await fetch("https://api.github.com/user/emails", {
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token.access_token}`,
        "x-github-api-version": "2022-11-28",
      },
    });

    if (emailResponse.ok) {
      const emails = (await emailResponse.json()) as Array<{
        email?: string;
        primary?: boolean;
        verified?: boolean;
      }>;
      email =
        emails.find((entry) => entry.primary && entry.verified)?.email ??
        emails.find((entry) => entry.verified)?.email ??
        null;
    }
  }

  return {
    id: `github:${user.id}`,
    email: email ?? `${user.login ?? user.id}@users.noreply.github.com`,
  };
}

async function exchangeWechatCode(config: ProviderConfig, code: string) {
  const tokenUrl = new URL("https://api.weixin.qq.com/sns/oauth2/access_token");
  tokenUrl.searchParams.set("appid", config.clientId);
  tokenUrl.searchParams.set("secret", config.clientSecret);
  tokenUrl.searchParams.set("code", code);
  tokenUrl.searchParams.set("grant_type", "authorization_code");

  const tokenResponse = await fetch(tokenUrl);
  const token = await readJsonResponse<{
    access_token?: string;
    openid?: string;
    unionid?: string;
    errcode?: number;
    errmsg?: string;
  }>(tokenResponse);

  if (token.errcode) {
    throw new Error(token.errmsg ?? "WeChat token exchange failed.");
  }

  if (!token.access_token || !token.openid) {
    throw new Error("WeChat did not return an access token and openid.");
  }

  const userInfoUrl = new URL("https://api.weixin.qq.com/sns/userinfo");
  userInfoUrl.searchParams.set("access_token", token.access_token);
  userInfoUrl.searchParams.set("openid", token.openid);
  userInfoUrl.searchParams.set("lang", "zh_CN");

  const userResponse = await fetch(userInfoUrl);
  const user = await readJsonResponse<{
    openid?: string;
    unionid?: string;
    nickname?: string;
    errcode?: number;
    errmsg?: string;
  }>(userResponse);

  if (user.errcode) {
    throw new Error(user.errmsg ?? "WeChat user lookup failed.");
  }

  const userId = user.unionid ?? token.unionid ?? user.openid ?? token.openid;
  return {
    id: `wechat:${userId}`,
    email: `wechat-${userId}@wechat.oauth.local`,
  };
}

export async function exchangeOAuthCodeForActor(input: {
  provider: OAuthProvider;
  code: string;
  origin: string;
}): Promise<SessionActor> {
  const config = getProviderConfig(input.provider);

  if (!config) {
    throw new Error(`${getOAuthProviderLabel(input.provider)} login is not configured.`);
  }

  const redirectUri = `${input.origin}/api/auth/${input.provider}/callback`;

  if (input.provider === "google") {
    return exchangeGoogleCode(config, input.code, redirectUri);
  }

  if (input.provider === "github") {
    return exchangeGithubCode(config, input.code, redirectUri);
  }

  return exchangeWechatCode(config, input.code);
}

export { OAUTH_STATE_COOKIE_NAME };
