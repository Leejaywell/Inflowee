# Source Ingestion And Brief Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the next working slice after `Space/Task`: manage RSS sources, ingest feed items, generate stored briefs, and display them in an inbox view.

**Architecture:** Keep the current modular monolith shape. Continue using the existing local `node:sqlite` persistence for development, but isolate storage access behind small store functions so a future Postgres swap only touches the store layer. The first ingestion path is RSS-only and synchronous-on-demand from the UI, which keeps the feature testable before introducing hosted async jobs.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Zod, built-in `node:sqlite`, Vitest, Testing Library, `fast-xml-parser`

---

## Scope Check

The full spec covers multiple independent subsystems. This plan intentionally covers only one sub-project:

- source CRUD
- RSS ingestion
- stored items
- stored briefs
- inbox rendering
- HTML digest export

This plan does **not** include:

- AI source recommendation bundles
- chat assistant
- structured list sources
- update sources
- newsletter archive sources
- image card generation
- hosted async job execution

Those should be separate follow-up plans after this slice is stable.

## File Structure

### Existing files to modify

- `src/lib/store.ts`
  - Expand storage schema and query helpers for sources, items, briefs
- `src/lib/validation.ts`
  - Add source creation validation
- `src/app/actions.ts`
  - Add source creation and manual ingestion actions
- `src/app/page.tsx`
  - Keep this page focused on `Space/Task`
- `src/app/layout.tsx`
  - Update navigation shell once inbox and sources routes exist
- `package.json`
  - Add test and ingestion dependencies

### Files to create

- `src/lib/rss.ts`
  - Parse RSS/Atom XML into normalized item candidates
- `src/lib/briefs.ts`
  - Convert normalized feed items into stored briefs
- `src/app/sources/page.tsx`
  - Source management page
- `src/app/inbox/page.tsx`
  - Brief inbox page
- `src/app/inbox/[briefId]/html/route.ts`
  - HTML digest output for a single brief
- `src/components/app-shell.tsx`
  - Shared navigation shell for `Home`, `Sources`, `Inbox`
- `tests/store.test.ts`
  - Storage schema and query tests
- `tests/rss.test.ts`
  - RSS parser tests
- `tests/briefs.test.ts`
  - Brief generation tests
- `tests/fixtures/sample-feed.xml`
  - Stable feed fixture for tests
- `vitest.config.ts`
  - Vitest configuration
- `vitest.setup.ts`
  - Testing Library setup

## Task 1: Make Storage Testable And Add Source Tables

**Files:**
- Create: `tests/store.test.ts`
- Modify: `src/lib/store.ts`
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`

- [ ] **Step 1: Write the failing storage test**

```ts
import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  createStore,
  createSpaceRecord,
  createTaskRecord,
  createSourceRecord,
  listSourcesByTask,
} from "../src/lib/store";

describe("store source persistence", () => {
  it("stores and lists RSS sources under a task", () => {
    const directory = mkdtempSync(join(tmpdir(), "inflowee-store-"));
    const store = createStore(join(directory, "test.sqlite"));

    const spaceId = createSpaceRecord(store, {
      name: "AI Coding Agents",
      description: "Track product and hiring signals.",
    });

    const taskId = createTaskRecord(store, {
      spaceId,
      title: "Agent launches",
      taskType: "TOPIC",
      userPrompt: "Track launches and updates from AI coding agents.",
    });

    createSourceRecord(store, {
      taskId,
      sourceType: "RSS",
      title: "OpenAI News",
      url: "https://example.com/feed.xml",
    });

    const sources = listSourcesByTask(store, taskId);

    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      taskId,
      sourceType: "RSS",
      title: "OpenAI News",
      url: "https://example.com/feed.xml",
      status: "idle",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec vitest run tests/store.test.ts
```

Expected:

```text
FAIL  tests/store.test.ts
Error: Cannot find module '../src/lib/store'
```

- [ ] **Step 3: Add test tooling and storage factory**

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "fast-xml-parser": "^5.3.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.3.0",
    "jsdom": "^26.1.0",
    "vitest": "^3.2.4"
  }
}
```

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
  },
});
```

```ts
// vitest.setup.ts
import "@testing-library/jest-dom/vitest";
```

```ts
// src/lib/store.ts
export type SourceType = "RSS";
export type SourceStatus = "idle" | "success" | "error";

export type Store = {
  database: DatabaseSync;
};

export function createStore(filename = join(dataDirectory, "inflowee.sqlite")): Store {
  const database = new DatabaseSync(filename);
  database.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS spaces (...);
    CREATE TABLE IF NOT EXISTS tasks (...);
    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      source_type TEXT NOT NULL CHECK(source_type IN ('RSS')),
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'idle',
      last_synced_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_sources_task_id ON sources(task_id);
  `);

  return { database };
}

export const defaultStore = createStore();
```

```ts
// src/lib/store.ts
export function createSpaceRecord(store: Store, input: { name: string; description?: string }) {
  const id = randomUUID();
  const timestamp = new Date().toISOString();
  store.database
    .prepare(
      `INSERT INTO spaces (id, name, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(id, input.name, input.description ?? null, timestamp, timestamp);
  return id;
}

export function createTaskRecord(
  store: Store,
  input: { spaceId: string; title: string; taskType: TaskType; userPrompt: string },
) {
  const id = randomUUID();
  const timestamp = new Date().toISOString();
  store.database
    .prepare(
      `INSERT INTO tasks (
        id, space_id, title, task_type, user_prompt,
        relevance_level, summary_preference, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, input.spaceId, input.title, input.taskType, input.userPrompt, 3, "balanced", timestamp, timestamp);
  return id;
}

export function createSourceRecord(
  store: Store,
  input: { taskId: string; sourceType: SourceType; title: string; url: string },
) {
  const id = randomUUID();
  const timestamp = new Date().toISOString();
  store.database
    .prepare(
      `INSERT INTO sources (
        id, task_id, source_type, title, url, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, input.taskId, input.sourceType, input.title, input.url, "idle", timestamp, timestamp);
  return id;
}

export function listSourcesByTask(store: Store, taskId: string) {
  return store.database
    .prepare("SELECT * FROM sources WHERE task_id = ? ORDER BY created_at DESC")
    .all(taskId);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
pnpm install
pnpm exec vitest run tests/store.test.ts
```

Expected:

```text
✓ tests/store.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts vitest.setup.ts tests/store.test.ts src/lib/store.ts
git commit -m "feat: add testable store and source persistence"
```

## Task 2: Add Source Validation, Actions, And Source Management UI

**Files:**
- Modify: `src/lib/validation.ts`
- Modify: `src/app/actions.ts`
- Create: `src/components/app-shell.tsx`
- Modify: `src/app/layout.tsx`
- Create: `src/app/sources/page.tsx`
- Test: `tests/store.test.ts`

- [ ] **Step 1: Write the failing source action test**

```ts
import { describe, expect, it } from "vitest";
import { createSourceSchema } from "../src/lib/validation";

describe("createSourceSchema", () => {
  it("rejects non-http urls", () => {
    const result = createSourceSchema.safeParse({
      taskId: "task-1",
      sourceType: "RSS",
      title: "Bad Source",
      url: "ftp://example.com/feed.xml",
    });

    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec vitest run tests/store.test.ts
```

Expected:

```text
FAIL  tests/store.test.ts
ReferenceError: createSourceSchema is not defined
```

- [ ] **Step 3: Add validation, actions, shell, and UI**

```ts
// src/lib/validation.ts
export const createSourceSchema = z.object({
  taskId: z.string().trim().min(1, "Select a task."),
  sourceType: z.literal("RSS"),
  title: z.string().trim().min(2, "Source title must be at least 2 characters."),
  url: z.url("Enter a valid http or https URL.").refine(
    (value) => value.startsWith("http://") || value.startsWith("https://"),
    "Enter a valid http or https URL.",
  ),
});
```

```ts
// src/app/actions.ts
import { defaultStore, createSourceRecord } from "@/lib/store";
import { createSourceSchema } from "@/lib/validation";

export async function createSource(formData: FormData) {
  const parsed = createSourceSchema.safeParse({
    taskId: getString(formData, "taskId"),
    sourceType: getString(formData, "sourceType"),
    title: getString(formData, "title"),
    url: getString(formData, "url"),
  });

  if (!parsed.success) {
    redirect(`/sources?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid source input.")}`);
  }

  createSourceRecord(defaultStore, parsed.data);
  revalidatePath("/sources");
  redirect("/sources?created=source");
}
```

```tsx
// src/components/app-shell.tsx
import Link from "next/link";

const navItems = [
  { href: "/", label: "Spaces" },
  { href: "/sources", label: "Sources" },
  { href: "/inbox", label: "Inbox" },
];

export function AppShell({
  children,
  currentPath,
}: {
  children: React.ReactNode;
  currentPath: string;
}) {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f7f1e9_0%,#f3f4ef_40%,#eceee9_100%)] text-stone-950">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-8 lg:px-10">
        <header className="flex items-center justify-between rounded-3xl border border-stone-900/10 bg-white/80 px-6 py-4 backdrop-blur">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-stone-500">Inflowee</p>
            <h1 className="text-lg font-semibold">AI-powered information hub</h1>
          </div>
          <nav className="flex gap-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={currentPath === item.href
                  ? "rounded-full bg-stone-950 px-4 py-2 text-sm text-white"
                  : "rounded-full bg-stone-100 px-4 py-2 text-sm text-stone-600"}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </header>
        {children}
      </div>
    </div>
  );
}
```

```tsx
// src/app/sources/page.tsx
import { createSource } from "@/app/actions";
import { AppShell } from "@/components/app-shell";
import { defaultStore, listSpacesWithTasks, listSourcesByTask } from "@/lib/store";

export default async function SourcesPage({
  searchParams,
}: {
  searchParams?: Promise<{ created?: string; error?: string }>;
}) {
  const [spaces, params] = await Promise.all([
    Promise.resolve(listSpacesWithTasks(defaultStore)),
    searchParams,
  ]);

  const tasks = spaces.flatMap((space) =>
    space.tasks.map((task) => ({
      ...task,
      spaceName: space.name,
      sources: listSourcesByTask(defaultStore, task.id),
    })),
  );

  return (
    <AppShell currentPath="/sources">
      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <form action={createSource} className="grid gap-4 rounded-[24px] border border-stone-900/10 bg-white p-6">
          <h2 className="text-xl font-semibold">Add RSS source</h2>
          <select name="taskId" defaultValue="" className="h-12 rounded-2xl border border-stone-200 bg-stone-50 px-4">
            <option value="" disabled>Select a task</option>
            {tasks.map((task) => (
              <option key={task.id} value={task.id}>
                {task.spaceName} / {task.title}
              </option>
            ))}
          </select>
          <input type="hidden" name="sourceType" value="RSS" />
          <input name="title" placeholder="OpenAI News" className="h-12 rounded-2xl border border-stone-200 bg-stone-50 px-4" />
          <input name="url" placeholder="https://example.com/feed.xml" className="h-12 rounded-2xl border border-stone-200 bg-stone-50 px-4" />
          <button className="h-12 rounded-2xl bg-stone-950 text-sm font-medium text-white">Save source</button>
          {params?.error ? <p className="text-sm text-rose-700">{decodeURIComponent(params.error)}</p> : null}
          {params?.created === "source" ? <p className="text-sm text-emerald-700">Source created.</p> : null}
        </form>
        <section className="grid gap-4 rounded-[24px] border border-stone-900/10 bg-white p-6">
          <h2 className="text-xl font-semibold">Task sources</h2>
          {tasks.map((task) => (
            <article key={task.id} className="rounded-2xl bg-stone-50 p-4">
              <h3 className="font-medium">{task.spaceName} / {task.title}</h3>
              <div className="mt-3 grid gap-2">
                {task.sources.length === 0 ? (
                  <p className="text-sm text-stone-500">No sources yet.</p>
                ) : (
                  task.sources.map((source) => (
                    <div key={source.id} className="rounded-2xl bg-white px-4 py-3 text-sm">
                      <div className="font-medium">{source.title}</div>
                      <div className="text-stone-500">{source.url}</div>
                    </div>
                  ))
                )}
              </div>
            </article>
          ))}
        </section>
      </section>
    </AppShell>
  );
}
```

- [ ] **Step 4: Run tests and lint**

Run:

```bash
pnpm exec vitest run tests/store.test.ts
pnpm lint
```

Expected:

```text
✓ tests/store.test.ts
✔ No ESLint warnings or errors
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/validation.ts src/app/actions.ts src/components/app-shell.tsx src/app/layout.tsx src/app/sources/page.tsx tests/store.test.ts
git commit -m "feat: add source management UI"
```

## Task 3: Parse RSS Feeds Into Stored Items

**Files:**
- Create: `tests/fixtures/sample-feed.xml`
- Create: `tests/rss.test.ts`
- Create: `src/lib/rss.ts`
- Modify: `src/lib/store.ts`
- Modify: `src/app/actions.ts`
- Modify: `src/app/sources/page.tsx`

- [ ] **Step 1: Write the failing RSS parser test**

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { parseFeedItems } from "../src/lib/rss";

describe("parseFeedItems", () => {
  it("extracts rss entries into normalized candidates", () => {
    const xml = readFileSync(join(process.cwd(), "tests/fixtures/sample-feed.xml"), "utf8");

    const items = parseFeedItems(xml);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      title: "Launch roundup",
      canonicalUrl: "https://example.com/posts/launch-roundup",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec vitest run tests/rss.test.ts
```

Expected:

```text
FAIL  tests/rss.test.ts
Error: Cannot find module '../src/lib/rss'
```

- [ ] **Step 3: Add fixture, parser, item persistence, and ingestion action**

```xml
<!-- tests/fixtures/sample-feed.xml -->
<rss version="2.0">
  <channel>
    <title>Sample Feed</title>
    <item>
      <title>Launch roundup</title>
      <link>https://example.com/posts/launch-roundup</link>
      <pubDate>Wed, 21 May 2026 08:00:00 GMT</pubDate>
      <description>Latest launches and product updates.</description>
    </item>
    <item>
      <title>Funding signals</title>
      <link>https://example.com/posts/funding-signals</link>
      <pubDate>Wed, 21 May 2026 09:00:00 GMT</pubDate>
      <description>New funding and hiring movement.</description>
    </item>
  </channel>
</rss>
```

```ts
// src/lib/rss.ts
import { XMLParser } from "fast-xml-parser";

export type ParsedFeedItem = {
  title: string;
  canonicalUrl: string;
  publishedAt: string | null;
  summary: string;
};

export function parseFeedItems(xml: string): ParsedFeedItem[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    trimValues: true,
  });

  const parsed = parser.parse(xml);
  const rawItems = parsed?.rss?.channel?.item ?? [];
  const items = Array.isArray(rawItems) ? rawItems : [rawItems];

  return items
    .filter(Boolean)
    .map((item) => ({
      title: item.title ?? "Untitled",
      canonicalUrl: item.link ?? "",
      publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : null,
      summary: item.description ?? "",
    }))
    .filter((item) => item.canonicalUrl);
}
```

```ts
// src/lib/store.ts
export type ItemRecord = {
  id: string;
  sourceId: string;
  title: string;
  canonicalUrl: string;
  summary: string;
  publishedAt: string | null;
  createdAt: string;
};

// inside createStore()
database.exec(`
  CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    title TEXT NOT NULL,
    canonical_url TEXT NOT NULL,
    summary TEXT NOT NULL,
    published_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY(source_id) REFERENCES sources(id) ON DELETE CASCADE
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_items_source_url ON items(source_id, canonical_url);
`);

export function createItemRecord(
  store: Store,
  input: { sourceId: string; title: string; canonicalUrl: string; summary: string; publishedAt: string | null },
) {
  const id = randomUUID();
  const timestamp = new Date().toISOString();
  store.database
    .prepare(
      `INSERT OR IGNORE INTO items (
        id, source_id, title, canonical_url, summary, published_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, input.sourceId, input.title, input.canonicalUrl, input.summary, input.publishedAt, timestamp);
}

export function listItemsBySource(store: Store, sourceId: string) {
  return store.database
    .prepare("SELECT * FROM items WHERE source_id = ? ORDER BY published_at DESC, created_at DESC")
    .all(sourceId);
}

export function markSourceSyncResult(
  store: Store,
  input: { sourceId: string; status: SourceStatus; error?: string },
) {
  store.database
    .prepare(
      `UPDATE sources
       SET status = ?, last_synced_at = ?, last_error = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      input.status,
      new Date().toISOString(),
      input.error ?? null,
      new Date().toISOString(),
      input.sourceId,
    );
}
```

```ts
// src/app/actions.ts
import { parseFeedItems } from "@/lib/rss";
import {
  createItemRecord,
  defaultStore,
  getSourceById,
  markSourceSyncResult,
} from "@/lib/store";

export async function runSourceSync(formData: FormData) {
  const sourceId = getString(formData, "sourceId");
  const source = getSourceById(defaultStore, sourceId);

  if (!source) {
    redirect("/sources?error=Source%20not%20found.");
  }

  try {
    const response = await fetch(source.url, { cache: "no-store" });
    const xml = await response.text();
    const items = parseFeedItems(xml);

    for (const item of items) {
      createItemRecord(defaultStore, {
        sourceId: source.id,
        title: item.title,
        canonicalUrl: item.canonicalUrl,
        summary: item.summary,
        publishedAt: item.publishedAt,
      });
    }

    markSourceSyncResult(defaultStore, { sourceId: source.id, status: "success" });
    revalidatePath("/sources");
    redirect("/sources?synced=source");
  } catch (error) {
    markSourceSyncResult(defaultStore, {
      sourceId,
      status: "error",
      error: error instanceof Error ? error.message : "Unknown sync error",
    });
    redirect("/sources?error=Unable%20to%20sync%20source.");
  }
}
```

```tsx
// src/app/sources/page.tsx
import { runSourceSync } from "@/app/actions";

// inside source card
<form action={runSourceSync} className="mt-3">
  <input type="hidden" name="sourceId" value={source.id} />
  <button className="rounded-full bg-stone-950 px-3 py-2 text-xs font-medium text-white">
    Sync now
  </button>
</form>
```

- [ ] **Step 4: Run parser test**

Run:

```bash
pnpm exec vitest run tests/rss.test.ts tests/store.test.ts
```

Expected:

```text
✓ tests/rss.test.ts
✓ tests/store.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add tests/fixtures/sample-feed.xml tests/rss.test.ts src/lib/rss.ts src/lib/store.ts src/app/actions.ts src/app/sources/page.tsx
git commit -m "feat: ingest rss sources into stored items"
```

## Task 4: Generate Stored Briefs From Items

**Files:**
- Create: `tests/briefs.test.ts`
- Create: `src/lib/briefs.ts`
- Modify: `src/lib/store.ts`
- Modify: `src/app/actions.ts`

- [ ] **Step 1: Write the failing brief generation test**

```ts
import { describe, expect, it } from "vitest";

import { buildBriefsFromItems } from "../src/lib/briefs";

describe("buildBriefsFromItems", () => {
  it("turns new feed items into brief records", () => {
    const briefs = buildBriefsFromItems("task-1", [
      {
        id: "item-1",
        title: "Launch roundup",
        canonicalUrl: "https://example.com/posts/launch-roundup",
        summary: "Latest launches and product updates.",
        publishedAt: "2026-05-21T08:00:00.000Z",
      },
    ]);

    expect(briefs).toEqual([
      expect.objectContaining({
        taskId: "task-1",
        title: "Launch roundup",
        summary: "Latest launches and product updates.",
        whyItMatters: "New signal captured from subscribed RSS sources.",
      }),
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec vitest run tests/briefs.test.ts
```

Expected:

```text
FAIL  tests/briefs.test.ts
Error: Cannot find module '../src/lib/briefs'
```

- [ ] **Step 3: Add brief builder and brief persistence**

```ts
// src/lib/briefs.ts
export type BriefCandidate = {
  taskId: string;
  itemIds: string[];
  title: string;
  summary: string;
  whyItMatters: string;
  sourceCitations: string[];
};

export function buildBriefsFromItems(
  taskId: string,
  items: Array<{
    id: string;
    title: string;
    canonicalUrl: string;
    summary: string;
    publishedAt: string | null;
  }>,
): BriefCandidate[] {
  return items.map((item) => ({
    taskId,
    itemIds: [item.id],
    title: item.title,
    summary: item.summary || "No summary available.",
    whyItMatters: "New signal captured from subscribed RSS sources.",
    sourceCitations: [item.canonicalUrl],
  }));
}
```

```ts
// src/lib/store.ts
export type BriefRecord = {
  id: string;
  taskId: string;
  title: string;
  summary: string;
  whyItMatters: string;
  sourceCitations: string[];
  createdAt: string;
};

// inside createStore()
database.exec(`
  CREATE TABLE IF NOT EXISTS briefs (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    why_it_matters TEXT NOT NULL,
    source_citations TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS brief_items (
    brief_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    PRIMARY KEY (brief_id, item_id),
    FOREIGN KEY(brief_id) REFERENCES briefs(id) ON DELETE CASCADE
  );
`);

export function createBriefRecord(
  store: Store,
  input: {
    taskId: string;
    itemIds: string[];
    title: string;
    summary: string;
    whyItMatters: string;
    sourceCitations: string[];
  },
) {
  const id = randomUUID();
  const timestamp = new Date().toISOString();

  store.database
    .prepare(
      `INSERT INTO briefs (
        id, task_id, title, summary, why_it_matters, source_citations, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.taskId,
      input.title,
      input.summary,
      input.whyItMatters,
      JSON.stringify(input.sourceCitations),
      timestamp,
    );

  const statement = store.database.prepare(
    `INSERT OR IGNORE INTO brief_items (brief_id, item_id) VALUES (?, ?)`,
  );

  for (const itemId of input.itemIds) {
    statement.run(id, itemId);
  }

  return id;
}

export function listBriefs(store: Store) {
  const rows = store.database
    .prepare(
      `SELECT briefs.*, tasks.title AS task_title, spaces.name AS space_name
       FROM briefs
       JOIN tasks ON briefs.task_id = tasks.id
       JOIN spaces ON tasks.space_id = spaces.id
       ORDER BY briefs.created_at DESC`,
    )
    .all() as Array<{
      id: string;
      task_id: string;
      title: string;
      summary: string;
      why_it_matters: string;
      source_citations: string;
      created_at: string;
      task_title: string;
      space_name: string;
    }>;

  return rows.map((row) => ({
    id: row.id,
    taskId: row.task_id,
    title: row.title,
    summary: row.summary,
    whyItMatters: row.why_it_matters,
    sourceCitations: JSON.parse(row.source_citations) as string[],
    createdAt: row.created_at,
    taskTitle: row.task_title,
    spaceName: row.space_name,
  }));
}
```

```ts
// src/app/actions.ts
import { buildBriefsFromItems } from "@/lib/briefs";
import {
  createBriefRecord,
  getTaskBySourceId,
  listItemsBySource,
} from "@/lib/store";

// inside runSourceSync, after createItemRecord loop
const task = getTaskBySourceId(defaultStore, source.id);
const storedItems = listItemsBySource(defaultStore, source.id);
const briefs = buildBriefsFromItems(task.id, storedItems.slice(0, items.length));

for (const brief of briefs) {
  createBriefRecord(defaultStore, brief);
}
```

- [ ] **Step 4: Run brief tests**

Run:

```bash
pnpm exec vitest run tests/briefs.test.ts tests/rss.test.ts tests/store.test.ts
```

Expected:

```text
✓ tests/briefs.test.ts
✓ tests/rss.test.ts
✓ tests/store.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add tests/briefs.test.ts src/lib/briefs.ts src/lib/store.ts src/app/actions.ts
git commit -m "feat: generate stored briefs from ingested items"
```

## Task 5: Add Inbox Route And HTML Digest Output

**Files:**
- Create: `src/app/inbox/page.tsx`
- Create: `src/app/inbox/[briefId]/html/route.ts`
- Modify: `src/components/app-shell.tsx`
- Test: `tests/briefs.test.ts`

- [ ] **Step 1: Write the failing inbox render test**

```ts
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import InboxPage from "../src/app/inbox/page";

describe("InboxPage", () => {
  it("renders the inbox heading", async () => {
    const view = await InboxPage({});
    render(view);

    expect(
      screen.getByRole("heading", { name: "Brief inbox" }),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec vitest run tests/briefs.test.ts
```

Expected:

```text
FAIL  tests/briefs.test.ts
Error: Cannot find module '../src/app/inbox/page'
```

- [ ] **Step 3: Add inbox page and HTML route**

```tsx
// src/app/inbox/page.tsx
import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { defaultStore, listBriefs } from "@/lib/store";

export default async function InboxPage() {
  const briefs = listBriefs(defaultStore);

  return (
    <AppShell currentPath="/inbox">
      <section className="grid gap-4 rounded-[24px] border border-stone-900/10 bg-white p-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold">Brief inbox</h2>
            <p className="text-sm leading-6 text-stone-500">
              AI-ready brief objects rendered from stored feed items.
            </p>
          </div>
        </div>
        {briefs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-200 bg-stone-50 px-5 py-8 text-sm text-stone-500">
            No briefs yet. Sync a source from the Sources page.
          </div>
        ) : (
          <div className="grid gap-4">
            {briefs.map((brief) => (
              <article key={brief.id} className="rounded-[22px] border border-stone-200 bg-stone-50 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-stone-400">
                      {brief.spaceName} / {brief.taskTitle}
                    </p>
                    <h3 className="mt-2 text-xl font-semibold">{brief.title}</h3>
                  </div>
                  <Link
                    href={`/inbox/${brief.id}/html`}
                    className="rounded-full bg-stone-950 px-3 py-2 text-xs font-medium text-white"
                  >
                    HTML view
                  </Link>
                </div>
                <p className="mt-4 text-sm leading-7 text-stone-700">{brief.summary}</p>
                <div className="mt-4 rounded-2xl bg-white px-4 py-4 text-sm">
                  <div className="font-medium text-stone-950">Why it matters</div>
                  <p className="mt-1 text-stone-600">{brief.whyItMatters}</p>
                </div>
                <ul className="mt-4 grid gap-2 text-sm text-stone-500">
                  {brief.sourceCitations.map((citation) => (
                    <li key={citation}>
                      <a href={citation} className="underline decoration-stone-300 underline-offset-4">
                        {citation}
                      </a>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
```

```ts
// src/app/inbox/[briefId]/html/route.ts
import { NextResponse } from "next/server";

import { defaultStore, getBriefById } from "@/lib/store";

export async function GET(
  _request: Request,
  context: { params: Promise<{ briefId: string }> },
) {
  const { briefId } = await context.params;
  const brief = getBriefById(defaultStore, briefId);

  if (!brief) {
    return new NextResponse("Brief not found", { status: 404 });
  }

  const html = `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>${brief.title}</title>
        <style>
          body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 0; background: #f4f1ea; color: #1c1917; }
          main { max-width: 760px; margin: 0 auto; padding: 48px 24px; }
          article { background: white; border-radius: 28px; padding: 32px; box-shadow: 0 24px 80px rgba(33, 24, 9, 0.08); }
          .eyebrow { font-size: 12px; text-transform: uppercase; letter-spacing: 0.16em; color: #78716c; }
          .callout { background: #f5f5f4; border-radius: 20px; padding: 18px 20px; margin-top: 24px; }
        </style>
      </head>
      <body>
        <main>
          <article>
            <div class="eyebrow">${brief.spaceName} / ${brief.taskTitle}</div>
            <h1>${brief.title}</h1>
            <p>${brief.summary}</p>
            <div class="callout">
              <strong>Why it matters</strong>
              <p>${brief.whyItMatters}</p>
            </div>
            <ul>
              ${brief.sourceCitations.map((citation) => `<li><a href="${citation}">${citation}</a></li>`).join("")}
            </ul>
          </article>
        </main>
      </body>
    </html>
  `;

  return new NextResponse(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
```

- [ ] **Step 4: Run tests and build**

Run:

```bash
pnpm exec vitest run tests/briefs.test.ts tests/rss.test.ts tests/store.test.ts
pnpm build
```

Expected:

```text
✓ tests/briefs.test.ts
✓ tests/rss.test.ts
✓ tests/store.test.ts
Compiled successfully
```

- [ ] **Step 5: Commit**

```bash
git add src/app/inbox/page.tsx src/app/inbox/[briefId]/html/route.ts src/components/app-shell.tsx tests/briefs.test.ts
git commit -m "feat: add brief inbox and html digest output"
```

## Task 6: Manual End-To-End Verification And Cleanup

**Files:**
- Modify: `README.md`
- Modify: `src/app/page.tsx`
- Modify: `src/app/sources/page.tsx`
- Modify: `src/app/inbox/page.tsx`

- [ ] **Step 1: Write the manual verification checklist into README**

```md
## Local verification

1. Start the app with `pnpm dev`
2. Create a space
3. Create a task inside that space
4. Open `/sources` and add an RSS source
5. Click `Sync now`
6. Open `/inbox` and confirm a brief appears
7. Open `/inbox/<briefId>/html` and confirm the HTML digest renders
```

- [ ] **Step 2: Run the full local verification flow**

Run:

```bash
pnpm dev
```

Expected:

```text
Local: http://localhost:3000
```

Then verify in browser:

```text
/           -> create space and task
/sources    -> create RSS source and sync it
/inbox      -> brief card appears
/inbox/:id/html -> HTML digest renders
```

- [ ] **Step 3: Make only the minimal polish fixes found during verification**

```tsx
// Example acceptable fixes only if verification reveals them:
// - missing empty states
// - broken navigation links
// - button disabled states
// - text overflow in cards
```

- [ ] **Step 4: Run the full validation suite**

Run:

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

Expected:

```text
All tests pass
No ESLint warnings or errors
TypeScript exits 0
Next.js build succeeds
```

- [ ] **Step 5: Commit**

```bash
git add README.md src/app/page.tsx src/app/sources/page.tsx src/app/inbox/page.tsx
git commit -m "docs: add verification flow for rss brief inbox slice"
```

## Self-Review

### Spec coverage

Covered by this plan:

- source management
- RSS ingestion
- item storage
- brief generation
- inbox consumption
- HTML output

Explicitly not covered:

- AI source recommendation
- chat assistant
- structured list extraction
- update sources
- newsletter archive sources
- image output

### Placeholder scan

Checked for:

- `TODO`
- `TBD`
- vague “add validation” language without code
- undefined commands

None remain.

### Type consistency

Shared names used consistently in tasks:

- `TaskType`
- `SourceType`
- `createSourceRecord`
- `parseFeedItems`
- `buildBriefsFromItems`
- `createBriefRecord`

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-21-source-ingestion-and-brief-inbox.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**

