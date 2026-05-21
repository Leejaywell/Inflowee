import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const databasePath = join(process.cwd(), "data", "inflowee.sqlite");

if (existsSync(databasePath)) {
  rmSync(databasePath, { force: true });
  console.log(`Removed ${databasePath}`);
} else {
  console.log(`No database found at ${databasePath}`);
}
