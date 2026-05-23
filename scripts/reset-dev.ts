import { execSync } from "node:child_process";

import { loadDevEnv } from "./load-dev-env.ts";
import { requireDatabaseUrl } from "../src/lib/db.ts";

loadDevEnv();
requireDatabaseUrl();

execSync("pnpm prisma db push --force-reset --skip-generate", {
  stdio: "inherit",
  env: process.env,
});
