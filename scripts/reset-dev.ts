import { execSync } from "node:child_process";

execSync("pnpm prisma migrate reset --force --skip-seed", {
  stdio: "inherit",
  env: process.env,
});
