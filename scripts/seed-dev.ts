import {
  createBriefRecord,
  createItemRecordResult,
  createSourceRecord,
  createSpaceRecord,
  createStore,
  createTaskRecord,
  listSpacesWithTasks,
  markSourceSyncResult,
} from "../src/lib/store.ts";
import { buildBriefsFromItems } from "../src/lib/briefs.ts";

const store = createStore();

if (listSpacesWithTasks(store).length > 0) {
  console.log("Database already has data. Skip seeding.");
  process.exit(0);
}

const spaceId = createSpaceRecord(store, {
  name: "Verification Space",
  description: "Manual verification flow",
});
const taskId = createTaskRecord(store, {
  spaceId,
  title: "Verification Task",
  taskType: "TOPIC",
  userPrompt: "Track a seeded verification feed.",
});
const sourceId = createSourceRecord(store, {
  taskId,
  sourceType: "RSS",
  title: "Seeded Feed",
  url: "https://example.com/feed.xml",
});
const item = createItemRecordResult(store, {
  sourceId,
  title: "Seeded launch roundup",
  canonicalUrl: "https://example.com/posts/seeded-launch-roundup",
  summary: "Seeded item for inbox and HTML digest verification.",
  publishedAt: "2026-05-21T08:00:00.000Z",
});

if (item) {
  for (const brief of buildBriefsFromItems(taskId, [item])) {
    createBriefRecord(store, brief);
  }
}

markSourceSyncResult(store, {
  sourceId,
  status: "success",
});

console.log("Seeded verification data.");
