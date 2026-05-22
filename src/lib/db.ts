import { PrismaClient } from "@prisma/client";

import { getEnv } from "@/lib/env";

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

export const prisma =
  globalForPrisma.__infloweePrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__infloweePrisma = prisma;
}
