import { execSync } from "node:child_process";

import { requireDatabaseUrl } from "../src/lib/db.ts";

requireDatabaseUrl();

execSync("pnpm prisma db push --force-reset --skip-generate", {
  stdio: "inherit",
  env: process.env,
});
