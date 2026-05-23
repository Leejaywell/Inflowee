import { spawnSync } from "node:child_process";

type Step = {
  command: string;
  args: string[];
};

function runStep(step: Step) {
  const result = spawnSync(step.command, step.args, {
    stdio: "inherit",
    env: process.env,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const steps: Step[] = [
  { command: "pnpm", args: ["prisma", "generate"] },
];

if (process.env.VERCEL && process.env.DATABASE_URL) {
  steps.unshift({ command: "pnpm", args: ["prisma", "migrate", "deploy"] });
}

for (const step of steps) {
  runStep(step);
}
