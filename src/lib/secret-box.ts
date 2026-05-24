import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { SESSION_SECRET_ENV } from "@/lib/auth-config";

const SECRET_PREFIX = "v1";

function getSecretKey() {
  const secret = process.env[SESSION_SECRET_ENV];

  if (!secret) {
    throw new Error(`${SESSION_SECRET_ENV} is required to save GitHub tokens.`);
  }

  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getSecretKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    SECRET_PREFIX,
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

export function decryptSecret(value: string): string {
  const [version, ivBase64, tagBase64, encryptedBase64] = value.split(":");

  if (
    version !== SECRET_PREFIX ||
    !ivBase64 ||
    !tagBase64 ||
    !encryptedBase64
  ) {
    throw new Error("Unsupported encrypted secret format.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getSecretKey(),
    Buffer.from(ivBase64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagBase64, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedBase64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
