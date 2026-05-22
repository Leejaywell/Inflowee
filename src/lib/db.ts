import { PrismaClient } from "@prisma/client";

import { getEnv } from "./env.ts";

const globalForPrisma = globalThis as typeof globalThis & {
  __infloweePrisma?: PrismaClient;
};

export function createPrismaClient() {
  getEnv();

  return new PrismaClient({
    log:
      process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export function getDatabaseUrl() {
  return process.env.DATABASE_URL;
}

export function requireDatabaseUrl() {
  const databaseUrl = getDatabaseUrl();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for cloud runtime.");
  }

  return databaseUrl;
}

export function getPrisma() {
  if (!globalForPrisma.__infloweePrisma) {
    globalForPrisma.__infloweePrisma = createPrismaClient();
  }

  return globalForPrisma.__infloweePrisma;
}
