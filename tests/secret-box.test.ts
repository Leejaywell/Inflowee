/// <reference types="vitest/globals" />

import { afterEach, describe, expect, it } from "vitest";

import { SESSION_SECRET_ENV } from "@/lib/auth-config";
import { decryptSecret, encryptSecret } from "@/lib/secret-box";

const previousSecret = process.env[SESSION_SECRET_ENV];

describe("secret box", () => {
  afterEach(() => {
    if (previousSecret === undefined) {
      delete process.env[SESSION_SECRET_ENV];
    } else {
      process.env[SESSION_SECRET_ENV] = previousSecret;
    }
  });

  it("round-trips encrypted secrets", () => {
    process.env[SESSION_SECRET_ENV] = "test-secret";

    const encrypted = encryptSecret("github_pat_example");

    expect(encrypted).toMatch(/^v1:/);
    expect(encrypted).not.toContain("github_pat_example");
    expect(decryptSecret(encrypted)).toBe("github_pat_example");
  });

  it("requires the session secret for encryption", () => {
    delete process.env[SESSION_SECRET_ENV];

    expect(() => encryptSecret("github_pat_example")).toThrow(
      "INFLOWEE_SESSION_SECRET is required to save GitHub tokens.",
    );
  });
});
