import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

import { loadDevEnv } from "./load-dev-env.ts";
import { getDatabaseUrl } from "../src/lib/db.ts";

loadDevEnv();

if (getDatabaseUrl()) {
  execSync("pnpm prisma db push --force-reset --skip-generate", {
    stdio: "inherit",
    env: process.env,
  });
} else {
  const filename =
    process.env.INFLOWEE_SQLITE_PATH ?? join(process.cwd(), "data", "inflowee.sqlite");

  if (existsSync(filename)) {
    rmSync(filename);
    console.log(`Deleted ${filename}.`);
  } else {
    console.log(`SQLite database does not exist yet: ${filename}.`);
  }
}
