import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { PrismaClient } from "@prisma/client";

const execFileAsync = promisify(execFile);

export async function createIsolatedPostgresStore(): Promise<{
  prisma: PrismaClient;
  databaseUrl: string;
  cleanup: () => Promise<void>;
}> {
  const baseUrl = process.env.DATABASE_URL;

  if (!baseUrl) {
    throw new Error("DATABASE_URL must be set for Postgres-backed tests.");
  }

  const schema = `test_${randomUUID().replaceAll("-", "")}`;
  const separator = baseUrl.includes("?") ? "&" : "?";
  const databaseUrl = `${baseUrl}${separator}schema=${schema}`;
  const adminPrisma = new PrismaClient({
    datasourceUrl: baseUrl,
  });
  const prisma = new PrismaClient({
    datasourceUrl: databaseUrl,
  });

  await adminPrisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  await execFileAsync(
    "pnpm",
    ["prisma", "db", "push", "--skip-generate"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
      },
    },
  );

  return {
    prisma,
    databaseUrl,
    async cleanup() {
      await adminPrisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await prisma.$disconnect();
      await adminPrisma.$disconnect();
    },
  };
}
