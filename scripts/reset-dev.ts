import { execSync } from "node:child_process";

execSync("pnpm prisma db push --force-reset --skip-generate", {
  stdio: "inherit",
  env: process.env,
});
