import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createStore } from "@/lib/store";

export function createSqliteFixture() {
  const tempDirectory = mkdtempSync(join(tmpdir(), "inflowee-test-"));
  const store = createStore(join(tempDirectory, "store.sqlite"));

  return {
    store,
    cleanup() {
      store.database.close();
      rmSync(tempDirectory, { recursive: true, force: true });
    },
  };
}
