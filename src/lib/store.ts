import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type TaskType = "TOPIC" | "QUESTION";
export type SourceType = "RSS";
export type SourceStatus = "idle" | "success" | "error";
export type Store = {
  database: DatabaseSync;
};

type SpaceRow = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

type TaskRow = {
  id: string;
  space_id: string;
  title: string;
  task_type: TaskType;
  user_prompt: string;
  relevance_level: number;
  summary_preference: string;
  created_at: string;
  updated_at: string;
};

type SourceRow = {
  id: string;
  task_id: string;
  source_type: SourceType;
  title: string;
  url: string;
  status: SourceStatus;
  last_synced_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

type ItemRow = {
  id: string;
  source_id: string;
  title: string;
  canonical_url: string;
  summary: string | null;
  published_at: string | null;
  created_at: string;
};

type BriefRow = {
  id: string;
  task_id: string;
  title: string;
  summary: string;
  why_it_matters: string;
  source_citations: string;
  created_at: string;
  task_title?: string;
  space_name?: string;
};

export type TaskRecord = {
  id: string;
  spaceId: string;
  title: string;
  taskType: TaskType;
  userPrompt: string;
  relevanceLevel: number;
  summaryPreference: string;
  createdAt: string;
  updatedAt: string;
};

export type SpaceRecord = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  tasks: TaskRecord[];
};

export type SourceRecord = {
  id: string;
  taskId: string;
  sourceType: SourceType;
  title: string;
  url: string;
  status: SourceStatus;
  lastSyncedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ItemRecord = {
  id: string;
  sourceId: string;
  title: string;
  canonicalUrl: string;
  summary: string | null;
  publishedAt: string | null;
  createdAt: string;
};

export type BriefRecord = {
  id: string;
  taskId: string;
  title: string;
  summary: string;
  whyItMatters: string;
  sourceCitations: string[];
  createdAt: string;
  taskTitle?: string;
  spaceName?: string;
};

type CreateSpaceInput = {
  name: string;
  description?: string;
};

type CreateTaskInput = {
  spaceId: string;
  title: string;
  taskType: TaskType;
  userPrompt: string;
};

const dataDirectory = join(process.cwd(), "data");
const sourceStatusConstraint = "CHECK(status IN ('idle', 'success', 'error'))";
const sourceTableDefinition = `
  CREATE TABLE IF NOT EXISTS sources (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    source_type TEXT NOT NULL CHECK(source_type IN ('RSS')),
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'idle' ${sourceStatusConstraint},
    last_synced_at TEXT,
    last_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
  );
`;

function mapSource(row: SourceRow): SourceRecord {
  return {
    id: row.id,
    taskId: row.task_id,
    sourceType: row.source_type,
    title: row.title,
    url: row.url,
    status: row.status,
    lastSyncedAt: row.last_synced_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapItem(row: ItemRow): ItemRecord {
  return {
    id: row.id,
    sourceId: row.source_id,
    title: row.title,
    canonicalUrl: row.canonical_url,
    summary: row.summary,
    publishedAt: row.published_at,
    createdAt: row.created_at,
  };
}

function mapBrief(row: BriefRow): BriefRecord {
  return {
    id: row.id,
    taskId: row.task_id,
    title: row.title,
    summary: row.summary,
    whyItMatters: row.why_it_matters,
    sourceCitations: JSON.parse(row.source_citations) as string[],
    createdAt: row.created_at,
    taskTitle: row.task_title,
    spaceName: row.space_name,
  };
}

function migrateSourcesTable(database: DatabaseSync) {
  const sourcesTable = database
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'sources'",
    )
    .get() as { sql: string } | undefined;

  if (!sourcesTable || sourcesTable.sql.includes(sourceStatusConstraint)) {
    return;
  }

  database.exec(`
    PRAGMA foreign_keys = OFF;
    BEGIN;

    CREATE TABLE sources_migrated (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      source_type TEXT NOT NULL CHECK(source_type IN ('RSS')),
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'idle' ${sourceStatusConstraint},
      last_synced_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    INSERT INTO sources_migrated (
      id,
      task_id,
      source_type,
      title,
      url,
      status,
      last_synced_at,
      last_error,
      created_at,
      updated_at
    )
    SELECT
      id,
      task_id,
      source_type,
      title,
      url,
      CASE
        WHEN status IN ('idle', 'success', 'error') THEN status
        ELSE 'error'
      END,
      last_synced_at,
      last_error,
      created_at,
      updated_at
    FROM sources;

    DROP TABLE sources;
    ALTER TABLE sources_migrated RENAME TO sources;

    COMMIT;
    PRAGMA foreign_keys = ON;
  `);
}

export function createStore(
  filename = join(dataDirectory, "inflowee.sqlite"),
): Store {
  let database: DatabaseSync | undefined;

  const initializeDatabase = () => {
    mkdirSync(dirname(filename), { recursive: true });

    const nextDatabase = new DatabaseSync(filename);

    nextDatabase.exec(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS spaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        space_id TEXT NOT NULL,
        title TEXT NOT NULL,
        task_type TEXT NOT NULL CHECK(task_type IN ('TOPIC', 'QUESTION')),
        user_prompt TEXT NOT NULL,
        relevance_level INTEGER NOT NULL DEFAULT 3,
        summary_preference TEXT NOT NULL DEFAULT 'balanced',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(space_id) REFERENCES spaces(id) ON DELETE CASCADE
      );

      ${sourceTableDefinition}

      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        title TEXT NOT NULL,
        canonical_url TEXT NOT NULL,
        summary TEXT,
        published_at TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(source_id) REFERENCES sources(id) ON DELETE CASCADE
      );

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
        FOREIGN KEY(brief_id) REFERENCES briefs(id) ON DELETE CASCADE,
        FOREIGN KEY(item_id) REFERENCES items(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_tasks_space_id ON tasks(space_id);
      CREATE INDEX IF NOT EXISTS idx_sources_task_id ON sources(task_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_items_source_url ON items(source_id, canonical_url);
      CREATE INDEX IF NOT EXISTS idx_items_source_published_at ON items(source_id, published_at DESC, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_briefs_task_created_at ON briefs(task_id, created_at DESC);
    `);

    migrateSourcesTable(nextDatabase);
    nextDatabase.exec("CREATE INDEX IF NOT EXISTS idx_sources_task_id ON sources(task_id);");
    nextDatabase.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_items_source_url ON items(source_id, canonical_url);");
    nextDatabase.exec("CREATE INDEX IF NOT EXISTS idx_items_source_published_at ON items(source_id, published_at DESC, created_at DESC);");
    nextDatabase.exec("CREATE INDEX IF NOT EXISTS idx_briefs_task_created_at ON briefs(task_id, created_at DESC);");

    database = nextDatabase;
    return nextDatabase;
  };

  return {
    get database() {
      return database ?? initializeDatabase();
    },
  };
}

export const defaultStore = createStore();

function mapTask(row: TaskRow): TaskRecord {
  return {
    id: row.id,
    spaceId: row.space_id,
    title: row.title,
    taskType: row.task_type,
    userPrompt: row.user_prompt,
    relevanceLevel: row.relevance_level,
    summaryPreference: row.summary_preference,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listSpacesWithTasks(store: Store = defaultStore): SpaceRecord[] {
  const spaces = store.database
    .prepare("SELECT * FROM spaces ORDER BY created_at DESC")
    .all() as SpaceRow[];
  const tasks = store.database
    .prepare("SELECT * FROM tasks ORDER BY created_at DESC")
    .all() as TaskRow[];

  const tasksBySpace = new Map<string, TaskRecord[]>();

  for (const task of tasks) {
    const collection = tasksBySpace.get(task.space_id) ?? [];
    collection.push(mapTask(task));
    tasksBySpace.set(task.space_id, collection);
  }

  return spaces.map((space) => ({
    id: space.id,
    name: space.name,
    description: space.description,
    createdAt: space.created_at,
    updatedAt: space.updated_at,
    tasks: tasksBySpace.get(space.id) ?? [],
  }));
}

export function createSpaceRecord(input: CreateSpaceInput): string;
export function createSpaceRecord(store: Store, input: CreateSpaceInput): string;
export function createSpaceRecord(
  storeOrInput: Store | CreateSpaceInput,
  maybeInput?: CreateSpaceInput,
) {
  const store = maybeInput ? (storeOrInput as Store) : defaultStore;
  const input = maybeInput ?? (storeOrInput as CreateSpaceInput);
  const timestamp = new Date().toISOString();
  const id = randomUUID();

  store.database
    .prepare(
      `INSERT INTO spaces (id, name, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.name,
      input.description ?? null,
      timestamp,
      timestamp,
    );

  return id;
}

export function createTaskRecord(input: CreateTaskInput): string;
export function createTaskRecord(store: Store, input: CreateTaskInput): string;
export function createTaskRecord(
  storeOrInput: Store | CreateTaskInput,
  maybeInput?: CreateTaskInput,
) {
  const store = maybeInput ? (storeOrInput as Store) : defaultStore;
  const input = maybeInput ?? (storeOrInput as CreateTaskInput);
  const timestamp = new Date().toISOString();
  const id = randomUUID();

  store.database
    .prepare(
      `INSERT INTO tasks (
        id,
        space_id,
        title,
        task_type,
        user_prompt,
        relevance_level,
        summary_preference,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.spaceId,
      input.title,
      input.taskType,
      input.userPrompt,
      3,
      "balanced",
      timestamp,
      timestamp,
    );

  return id;
}

export function hasTaskRecord(store: Store, taskId: string): boolean {
  return Boolean(
    store.database
      .prepare("SELECT 1 FROM tasks WHERE id = ? LIMIT 1")
      .get(taskId),
  );
}

export function getSourceById(
  store: Store,
  sourceId: string,
): SourceRecord | null {
  const row = store.database
    .prepare("SELECT * FROM sources WHERE id = ? LIMIT 1")
    .get(sourceId) as SourceRow | undefined;

  return row ? mapSource(row) : null;
}

export function getTaskBySourceId(
  store: Store,
  sourceId: string,
): TaskRecord | null {
  const row = store.database
    .prepare(
      `SELECT tasks.*
       FROM tasks
       JOIN sources ON sources.task_id = tasks.id
       WHERE sources.id = ?
       LIMIT 1`,
    )
    .get(sourceId) as TaskRow | undefined;

  return row ? mapTask(row) : null;
}

export function createSourceRecord(
  store: Store,
  input: {
    taskId: string;
    sourceType: SourceType;
    title: string;
    url: string;
  },
) {
  const timestamp = new Date().toISOString();
  const id = randomUUID();

  store.database
    .prepare(
      `INSERT INTO sources (
        id,
        task_id,
        source_type,
        title,
        url,
        status,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.taskId,
      input.sourceType,
      input.title,
      input.url,
      "idle",
      timestamp,
      timestamp,
    );

  return id;
}

export function createItemRecordResult(
  store: Store,
  input: {
    sourceId: string;
    title: string;
    canonicalUrl: string;
    summary?: string | null;
    publishedAt?: string | null;
  },
): ItemRecord | null {
  const timestamp = new Date().toISOString();
  const id = randomUUID();
  const result = store.database
    .prepare(
      `INSERT OR IGNORE INTO items (
        id,
        source_id,
        title,
        canonical_url,
        summary,
        published_at,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.sourceId,
      input.title,
      input.canonicalUrl,
      input.summary ?? null,
      input.publishedAt ?? null,
      timestamp,
    );

  if (Number(result.changes) === 0) {
    return null;
  }

  return {
    id,
    sourceId: input.sourceId,
    title: input.title,
    canonicalUrl: input.canonicalUrl,
    summary: input.summary ?? null,
    publishedAt: input.publishedAt ?? null,
    createdAt: timestamp,
  };
}

export function createItemRecord(
  store: Store,
  input: {
    sourceId: string;
    title: string;
    canonicalUrl: string;
    summary?: string | null;
    publishedAt?: string | null;
  },
): boolean {
  return createItemRecordResult(store, input) !== null;
}

export function listSourcesByTask(
  store: Store,
  taskId: string,
): SourceRecord[] {
  const rows = store.database
    .prepare(
      "SELECT * FROM sources WHERE task_id = ? ORDER BY created_at DESC",
    )
    .all(taskId) as SourceRow[];

  return rows.map(mapSource);
}

export function listItemsBySource(
  store: Store,
  sourceId: string,
): ItemRecord[] {
  const rows = store.database
    .prepare(
      `SELECT * FROM items
       WHERE source_id = ?
       ORDER BY published_at DESC, created_at DESC`,
    )
    .all(sourceId) as ItemRow[];

  return rows.map(mapItem);
}

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
): string {
  const id = randomUUID();
  const timestamp = new Date().toISOString();

  store.database
    .prepare(
      `INSERT INTO briefs (
        id,
        task_id,
        title,
        summary,
        why_it_matters,
        source_citations,
        created_at
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

export function listBriefs(store: Store = defaultStore): BriefRecord[] {
  const rows = store.database
    .prepare(
      `SELECT
         briefs.*,
         tasks.title AS task_title,
         spaces.name AS space_name
       FROM briefs
       JOIN tasks ON briefs.task_id = tasks.id
       JOIN spaces ON tasks.space_id = spaces.id
       ORDER BY briefs.created_at DESC`,
    )
    .all() as BriefRow[];

  return rows.map(mapBrief);
}

export function markSourceSyncResult(
  store: Store,
  input: {
    sourceId: string;
    status: SourceStatus;
    error?: string | null;
  },
) {
  const timestamp = new Date().toISOString();

  store.database
    .prepare(
      `UPDATE sources
       SET status = ?,
           last_synced_at = ?,
           last_error = ?,
           updated_at = ?
       WHERE id = ?`,
    )
    .run(
      input.status,
      timestamp,
      input.status === "error" ? (input.error ?? "Unknown sync error.") : null,
      timestamp,
      input.sourceId,
    );
}

export function listSources(store: Store = defaultStore): SourceRecord[] {
  const rows = store.database
    .prepare("SELECT * FROM sources ORDER BY created_at DESC")
    .all() as SourceRow[];

  return rows.map(mapSource);
}

export function getBriefById(
  store: Store,
  briefId: string,
): BriefRecord | null {
  const row = store.database
    .prepare(
      `SELECT
         briefs.*,
         tasks.title AS task_title,
         spaces.name AS space_name
       FROM briefs
       JOIN tasks ON briefs.task_id = tasks.id
       JOIN spaces ON tasks.space_id = spaces.id
       WHERE briefs.id = ?
       LIMIT 1`,
    )
    .get(briefId) as BriefRow | undefined;

  return row ? mapBrief(row) : null;
}

export function listBriefItemIds(
  store: Store,
  briefId: string,
): string[] {
  const rows = store.database
    .prepare("SELECT item_id FROM brief_items WHERE brief_id = ?")
    .all(briefId) as Array<{ item_id: string }>;

  return rows.map((row) => row.item_id);
}

export function briefExistsForItem(
  store: Store,
  itemId: string,
): boolean {
  return Boolean(
    store.database
      .prepare("SELECT 1 FROM brief_items WHERE item_id = ? LIMIT 1")
      .get(itemId),
  );
}

