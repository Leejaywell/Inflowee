import { spawn } from "node:child_process";

import { loadDevEnv } from "./load-dev-env.ts";

loadDevEnv();

const nextArgs = process.argv.slice(2);

if (nextArgs.length === 0) {
  throw new Error("Expected a Next.js command, for example: dev or start.");
}

const child = spawn(
  process.execPath,
  ["./node_modules/next/dist/bin/next", ...nextArgs],
  {
    stdio: "inherit",
    env: process.env,
  },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
