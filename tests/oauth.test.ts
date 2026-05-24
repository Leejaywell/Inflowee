/// <reference types="vitest/globals" />

import {
  createOAuthAuthorizationUrl,
  createOAuthStateCookieValue,
  decodeOAuthStateCookieValue,
  exchangeOAuthCodeForActor,
  getConfiguredOAuthProviders,
} from "@/lib/oauth";

const OAUTH_ENV_KEYS = [
  "INFLOWEE_SESSION_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "WECHAT_APP_ID",
  "WECHAT_APP_SECRET",
  "INFLOWEE_WECHAT_APP_ID",
  "INFLOWEE_WECHAT_APP_SECRET",
] as const;

function snapshotEnv() {
  return Object.fromEntries(
    OAUTH_ENV_KEYS.map((key) => [key, process.env[key]]),
  ) as Record<(typeof OAUTH_ENV_KEYS)[number], string | undefined>;
}

function restoreEnv(snapshot: ReturnType<typeof snapshotEnv>) {
  for (const key of OAUTH_ENV_KEYS) {
    if (snapshot[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = snapshot[key];
    }
  }
}

describe("oauth helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("signs and validates oauth state cookies", () => {
    const env = snapshotEnv();
    process.env.INFLOWEE_SESSION_SECRET = "test-secret";

    try {
      const value = createOAuthStateCookieValue({
        provider: "github",
        state: "state-1",
        next: "/topics/topic-1",
      });

      expect(decodeOAuthStateCookieValue(value)).toEqual({
        provider: "github",
        state: "state-1",
        next: "/topics/topic-1",
      });
      expect(decodeOAuthStateCookieValue(`${value}tampered`)).toBeNull();
    } finally {
      restoreEnv(env);
    }
  });

  it("reports configured providers and creates provider authorization urls", () => {
    const env = snapshotEnv();
    process.env.INFLOWEE_SESSION_SECRET = "test-secret";
    process.env.GOOGLE_CLIENT_ID = "google-client";
    process.env.GOOGLE_CLIENT_SECRET = "google-secret";
    process.env.GITHUB_CLIENT_ID = "github-client";
    process.env.GITHUB_CLIENT_SECRET = "github-secret";
    process.env.WECHAT_APP_ID = "wechat-app";
    process.env.WECHAT_APP_SECRET = "wechat-secret";

    try {
      expect(getConfiguredOAuthProviders()).toEqual([
        { provider: "google", label: "Google", configured: true },
        { provider: "github", label: "GitHub", configured: true },
      ]);

      const google = createOAuthAuthorizationUrl({
        provider: "google",
        origin: "https://app.example.com",
        next: "/inbox",
      });
      expect(google.url.toString()).toContain(
        "https://accounts.google.com/o/oauth2/v2/auth",
      );
      expect(google.url.searchParams.get("scope")).toBe("openid email profile");

      const github = createOAuthAuthorizationUrl({
        provider: "github",
        origin: "https://app.example.com",
        next: "/",
      });
      expect(github.url.toString()).toContain(
        "https://github.com/login/oauth/authorize",
      );
      expect(github.url.searchParams.get("scope")).toBe("read:user user:email");

      const wechat = createOAuthAuthorizationUrl({
        provider: "wechat",
        origin: "https://app.example.com",
        next: "/",
      });
      expect(wechat.url.toString()).toContain(
        "https://open.weixin.qq.com/connect/qrconnect",
      );
      expect(wechat.url.searchParams.get("scope")).toBe("snsapi_login");
    } finally {
      restoreEnv(env);
    }
  });

  it("exchanges a GitHub code into a signed actor identity", async () => {
    const env = snapshotEnv();
    process.env.GITHUB_CLIENT_ID = "github-client";
    process.env.GITHUB_CLIENT_SECRET = "github-secret";

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        Response.json({
          access_token: "token-1",
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          id: 123,
          login: "octo",
          email: null,
        }),
      )
      .mockResolvedValueOnce(
        Response.json([
          {
            email: "octo@example.com",
            primary: true,
            verified: true,
          },
        ]),
      );

    try {
      await expect(
        exchangeOAuthCodeForActor({
          provider: "github",
          code: "code-1",
          origin: "https://app.example.com",
        }),
      ).resolves.toEqual({
        id: "github:123",
        email: "octo@example.com",
      });
      expect(fetchMock).toHaveBeenCalledTimes(3);
    } finally {
      restoreEnv(env);
    }
  });
});
