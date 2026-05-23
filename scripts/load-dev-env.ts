import { existsSync } from "node:fs";

const candidateEnvFiles = [".env.local", ".env", ".env.example"];

export function loadDevEnv() {
  if (process.env.DATABASE_URL) {
    return;
  }

  for (const candidate of candidateEnvFiles) {
    if (!existsSync(candidate)) {
      continue;
    }

    process.loadEnvFile?.(candidate);

    if (process.env.DATABASE_URL) {
      return;
    }
  }
}
