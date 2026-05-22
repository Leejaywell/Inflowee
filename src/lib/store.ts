import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type TaskType = "TOPIC" | "QUESTION";
export type SourceType =
  | "RSS"
  | "PAGE"
  | "STRUCTURED"
  | "UPDATE"
  | "NEWSLETTER";
export type SourceStatus = "idle" | "success" | "error";
export type SyncRunStatus = "running" | "success" | "error";
export type DeliveryStatus = "running" | "success" | "error";
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
  task_profile: string | null;
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
  sync_interval_minutes: number;
  next_sync_at: string | null;
  created_at: string;
  updated_at: string;
};

type SyncRunRow = {
  id: string;
  source_id: string;
  status: SyncRunStatus;
  inserted_item_count: number;
  created_brief_count: number;
  error: string | null;
  started_at: string;
  finished_at: string | null;
};

type AppSettingRow = {
  key: string;
  value: string;
  updated_at: string;
};

type DeliveryLogRow = {
  id: string;
  brief_id: string;
  endpoint: string;
  payload_type: "html";
  status: DeliveryStatus;
  response_status: number | null;
  error: string | null;
  started_at: string;
  finished_at: string | null;
};

type ItemRow = {
  id: string;
  source_id: string;
  title: string;
  canonical_url: string;
  summary: string | null;
  raw_content: string | null;
  origin: string | null;
  language: string | null;
  content_hash: string;
  structured_fields: string | null;
  published_at: string | null;
  fetched_at: string;
  created_at: string;
};

type BriefRow = {
  id: string;
  task_id: string;
  title: string;
  summary: string;
  why_it_matters: string;
  source_citations: string;
  relevance_score: number;
  importance_score: number;
  tags_json: string;
  is_read: number;
  created_at: string;
  task_title?: string;
  space_name?: string;
};

type RecommendationBundleRow = {
  id: string;
  task_id: string;
  position: number;
  bundle_json: string;
  created_at: string;
  updated_at: string;
};

export type ChatThreadRow = {
  id: string;
  scope_type: string;
  scope_id: string;
  created_at: string;
};

export type ChatMessageRow = {
  id: string;
  thread_id: string;
  role: "user" | "assistant";
  content: string;
  citations: string | null;
  provenance: "stored" | "mixed" | null;
  created_at: string;
};

export type TaskProfile = {
  keywords: string[];
  suggestedQueries: string[];
};

export type RecommendationSource = {
  title: string;
  url: string;
  sourceType: SourceType;
};

export type RecommendationBundle = {
  title: string;
  description: string;
  rationale: string;
  sources: RecommendationSource[];
};

export type TaskRecord = {
  id: string;
  spaceId: string;
  title: string;
  taskType: TaskType;
  userPrompt: string;
  relevanceLevel: number;
  summaryPreference: string;
  taskProfile?: TaskProfile | null;
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
  syncIntervalMinutes: number;
  nextSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SyncRunRecord = {
  id: string;
  sourceId: string;
  status: SyncRunStatus;
  insertedItemCount: number;
  createdBriefCount: number;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
};

export type WebhookSettingsRecord = {
  endpoint: string | null;
  updatedAt: string | null;
};

export type DeliveryLogRecord = {
  id: string;
  briefId: string;
  endpoint: string;
  payloadType: "html";
  status: DeliveryStatus;
  responseStatus: number | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
};

export type ItemRecord = {
  id: string;
  sourceId: string;
  title: string;
  canonicalUrl: string;
  summary: string | null;
  rawContent: string | null;
  origin: string | null;
  language: string | null;
  contentHash: string;
  structuredFields: Record<string, unknown> | null;
  publishedAt: string | null;
  fetchedAt: string;
  createdAt: string;
};

export type BriefRecord = {
  id: string;
  taskId: string;
  title: string;
  summary: string;
  whyItMatters: string;
  sourceCitations: string[];
  relevanceScore: number;
  importanceScore: number;
  tags: string[];
  isRead: boolean;
  createdAt: string;
  taskTitle?: string;
  spaceName?: string;
};

export type ChatThreadRecord = {
  id: string;
  scopeType: "global" | "space" | "task" | "brief";
  scopeId: string;
  createdAt: string;
};

export type ChatMessageRecord = {
  id: string;
  threadId: string;
  role: "user" | "assistant";
  content: string;
  citations: string[] | null;
  provenance: "stored" | "mixed" | null;
  createdAt: string;
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
    source_type TEXT NOT NULL CHECK(source_type IN ('RSS', 'PAGE', 'STRUCTURED', 'UPDATE', 'NEWSLETTER')),
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'idle' ${sourceStatusConstraint},
    last_synced_at TEXT,
    last_error TEXT,
    sync_interval_minutes INTEGER NOT NULL DEFAULT 360,
    next_sync_at TEXT,
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
    syncIntervalMinutes: row.sync_interval_minutes,
    nextSyncAt: row.next_sync_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSyncRun(row: SyncRunRow): SyncRunRecord {
  return {
    id: row.id,
    sourceId: row.source_id,
    status: row.status,
    insertedItemCount: row.inserted_item_count,
    createdBriefCount: row.created_brief_count,
    error: row.error,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

function mapDeliveryLog(row: DeliveryLogRow): DeliveryLogRecord {
  return {
    id: row.id,
    briefId: row.brief_id,
    endpoint: row.endpoint,
    payloadType: row.payload_type,
    status: row.status,
    responseStatus: row.response_status,
    error: row.error,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

function mapItem(row: ItemRow): ItemRecord {
  return {
    id: row.id,
    sourceId: row.source_id,
    title: row.title,
    canonicalUrl: row.canonical_url,
    summary: row.summary,
    rawContent: row.raw_content,
    origin: row.origin,
    language: row.language,
    contentHash: row.content_hash,
    structuredFields: row.structured_fields
      ? (JSON.parse(row.structured_fields) as Record<string, unknown>)
      : null,
    publishedAt: row.published_at,
    fetchedAt: row.fetched_at,
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
    relevanceScore: row.relevance_score,
    importanceScore: row.importance_score,
    tags: JSON.parse(row.tags_json) as string[],
    isRead: Boolean(row.is_read),
    createdAt: row.created_at,
    taskTitle: row.task_title,
    spaceName: row.space_name,
  };
}

function mapRecommendationBundle(
  row: RecommendationBundleRow,
): RecommendationBundle {
  return JSON.parse(row.bundle_json) as RecommendationBundle;
}

function mapChatThread(row: ChatThreadRow): ChatThreadRecord {
  return {
    id: row.id,
    scopeType: row.scope_type as "global" | "space" | "task" | "brief",
    scopeId: row.scope_id,
    createdAt: row.created_at,
  };
}

function mapChatMessage(row: ChatMessageRow): ChatMessageRecord {
  return {
    id: row.id,
    threadId: row.thread_id,
    role: row.role,
    content: row.content,
    citations: row.citations ? (JSON.parse(row.citations) as string[]) : null,
    provenance: row.provenance,
    createdAt: row.created_at,
  };
}

function migrateSourcesTable(database: DatabaseSync) {
  const sourcesTable = database
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'sources'",
    )
    .get() as { sql: string } | undefined;

  if (!sourcesTable) {
    return;
  }

  const needsStatusMigration = !sourcesTable.sql.includes(sourceStatusConstraint);
  const needsStructuredMigration = !sourcesTable.sql.includes("'STRUCTURED'");
  const needsUpdateMigration = !sourcesTable.sql.includes("'UPDATE'");
  const needsNewsletterMigration = !sourcesTable.sql.includes("'NEWSLETTER'");
  const needsScheduleMigration = !sourcesTable.sql.includes("sync_interval_minutes");

  if (
    !needsStatusMigration &&
    !needsStructuredMigration &&
    !needsUpdateMigration &&
    !needsNewsletterMigration &&
    !needsScheduleMigration
  ) {
    return;
  }

  database.exec(`
    PRAGMA foreign_keys = OFF;
    BEGIN;

    CREATE TABLE sources_migrated (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      source_type TEXT NOT NULL CHECK(source_type IN ('RSS', 'PAGE', 'STRUCTURED', 'UPDATE', 'NEWSLETTER')),
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'idle' CHECK(status IN ('idle', 'success', 'error')),
      last_synced_at TEXT,
      last_error TEXT,
      sync_interval_minutes INTEGER NOT NULL DEFAULT 360,
      next_sync_at TEXT,
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
      sync_interval_minutes,
      next_sync_at,
      created_at,
      updated_at
    )
    SELECT
      id,
      task_id,
      CASE
        WHEN source_type IN ('RSS', 'PAGE', 'STRUCTURED', 'UPDATE', 'NEWSLETTER') THEN source_type
        ELSE 'PAGE'
      END,
      title,
      url,
      CASE
        WHEN status IN ('idle', 'success', 'error') THEN status
        ELSE 'error'
      END,
      last_synced_at,
      last_error,
      360,
      created_at,
      created_at,
      updated_at
    FROM sources;

    DROP TABLE sources;
    ALTER TABLE sources_migrated RENAME TO sources;

    COMMIT;
    PRAGMA foreign_keys = ON;
  `);
}

function migrateSyncRunsTable(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS sync_runs (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('running', 'success', 'error')),
      inserted_item_count INTEGER NOT NULL DEFAULT 0,
      created_brief_count INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      FOREIGN KEY(source_id) REFERENCES sources(id) ON DELETE CASCADE
    );
  `);
}

function migrateDeliveryLogsTable(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS delivery_logs (
      id TEXT PRIMARY KEY,
      brief_id TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      payload_type TEXT NOT NULL CHECK(payload_type IN ('html')),
      status TEXT NOT NULL CHECK(status IN ('running', 'success', 'error')),
      response_status INTEGER,
      error TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      FOREIGN KEY(brief_id) REFERENCES briefs(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_delivery_logs_brief_started_at
      ON delivery_logs(brief_id, started_at DESC);
  `);
}

function migrateBriefsTable(database: DatabaseSync) {
  const briefsTable = database
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'briefs'",
    )
    .get() as { sql: string } | undefined;

  if (!briefsTable) {
    return;
  }

  const needsIsRead = !briefsTable.sql.includes("is_read");
  const needsScores = !briefsTable.sql.includes("relevance_score");

  if (!needsIsRead && !needsScores) {
    return;
  }

  if (!needsScores) {
    database.exec("ALTER TABLE briefs ADD COLUMN is_read INTEGER NOT NULL DEFAULT 0;");
    return;
  }

  database.exec(`
    PRAGMA foreign_keys = OFF;
    BEGIN;

    CREATE TABLE briefs_migrated (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      why_it_matters TEXT NOT NULL,
      source_citations TEXT NOT NULL,
      relevance_score REAL NOT NULL DEFAULT 0,
      importance_score REAL NOT NULL DEFAULT 0,
      tags_json TEXT NOT NULL DEFAULT '[]',
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    INSERT INTO briefs_migrated (
      id,
      task_id,
      title,
      summary,
      why_it_matters,
      source_citations,
      relevance_score,
      importance_score,
      tags_json,
      is_read,
      created_at
    )
    SELECT
      id,
      task_id,
      title,
      summary,
      why_it_matters,
      source_citations,
      0.5,
      0.5,
      '[]',
      CASE WHEN instr(sql, 'is_read') > 0 THEN is_read ELSE 0 END,
      created_at
    FROM briefs
    CROSS JOIN (SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'briefs');

    DROP TABLE briefs;
    ALTER TABLE briefs_migrated RENAME TO briefs;

    COMMIT;
    PRAGMA foreign_keys = ON;
  `);
}

function migrateTasksTable(database: DatabaseSync) {
  const tasksTable = database
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'tasks'",
    )
    .get() as { sql: string } | undefined;

  if (!tasksTable || tasksTable.sql.includes("task_profile")) {
    return;
  }

  database.exec("ALTER TABLE tasks ADD COLUMN task_profile TEXT;");
}

function migrateItemsTable(database: DatabaseSync) {
  const itemsTable = database
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'items'",
    )
    .get() as { sql: string } | undefined;

  if (!itemsTable || itemsTable.sql.includes("content_hash")) {
    return;
  }

  database.exec(`
    PRAGMA foreign_keys = OFF;
    BEGIN;

    CREATE TABLE items_migrated (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      title TEXT NOT NULL,
      canonical_url TEXT NOT NULL,
      summary TEXT,
      raw_content TEXT,
      origin TEXT,
      language TEXT,
      content_hash TEXT NOT NULL,
      structured_fields TEXT,
      published_at TEXT,
      fetched_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(source_id) REFERENCES sources(id) ON DELETE CASCADE
    );

    INSERT INTO items_migrated (
      id,
      source_id,
      title,
      canonical_url,
      summary,
      raw_content,
      origin,
      language,
      content_hash,
      structured_fields,
      published_at,
      fetched_at,
      created_at
    )
    SELECT
      id,
      source_id,
      title,
      canonical_url,
      summary,
      summary,
      NULL,
      NULL,
      canonical_url || char(10) || title || char(10) || coalesce(summary, ''),
      NULL,
      published_at,
      created_at,
      created_at
    FROM items;

    DROP TABLE items;
    ALTER TABLE items_migrated RENAME TO items;

    COMMIT;
    PRAGMA foreign_keys = ON;
  `);
}

function migrateChatMessagesTable(database: DatabaseSync) {
  const chatMessagesTable = database
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'chat_messages'",
    )
    .get() as { sql: string } | undefined;

  if (!chatMessagesTable || chatMessagesTable.sql.includes("provenance")) {
    return;
  }

  database.exec(
    "ALTER TABLE chat_messages ADD COLUMN provenance TEXT CHECK(provenance IN ('stored', 'mixed'));",
  );
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
        task_profile TEXT,
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
        raw_content TEXT,
        origin TEXT,
        language TEXT,
        content_hash TEXT NOT NULL,
        structured_fields TEXT,
        published_at TEXT,
        fetched_at TEXT NOT NULL,
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
        relevance_score REAL NOT NULL DEFAULT 0,
        importance_score REAL NOT NULL DEFAULT 0,
        tags_json TEXT NOT NULL DEFAULT '[]',
        is_read INTEGER NOT NULL DEFAULT 0,
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

      CREATE TABLE IF NOT EXISTS chat_threads (
        id TEXT PRIMARY KEY,
        scope_type TEXT NOT NULL CHECK(scope_type IN ('global', 'space', 'task', 'brief')),
        scope_id TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        citations TEXT,
        provenance TEXT CHECK(provenance IN ('stored', 'mixed')),
        created_at TEXT NOT NULL,
        FOREIGN KEY(thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS recommendation_bundles (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        bundle_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS sync_runs (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('running', 'success', 'error')),
        inserted_item_count INTEGER NOT NULL DEFAULT 0,
        created_brief_count INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        FOREIGN KEY(source_id) REFERENCES sources(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS delivery_logs (
        id TEXT PRIMARY KEY,
        brief_id TEXT NOT NULL,
        endpoint TEXT NOT NULL,
        payload_type TEXT NOT NULL CHECK(payload_type IN ('html')),
        status TEXT NOT NULL CHECK(status IN ('running', 'success', 'error')),
        response_status INTEGER,
        error TEXT,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        FOREIGN KEY(brief_id) REFERENCES briefs(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_tasks_space_id ON tasks(space_id);
      CREATE INDEX IF NOT EXISTS idx_sources_task_id ON sources(task_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_items_source_url ON items(source_id, canonical_url);
      CREATE INDEX IF NOT EXISTS idx_items_source_published_at ON items(source_id, published_at DESC, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_briefs_task_created_at ON briefs(task_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_id ON chat_messages(thread_id);
      CREATE INDEX IF NOT EXISTS idx_recommendation_bundles_task_position ON recommendation_bundles(task_id, position);
      CREATE INDEX IF NOT EXISTS idx_sync_runs_source_started_at ON sync_runs(source_id, started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_delivery_logs_brief_started_at ON delivery_logs(brief_id, started_at DESC);
    `);

    migrateSourcesTable(nextDatabase);
    migrateBriefsTable(nextDatabase);
    migrateTasksTable(nextDatabase);
    migrateItemsTable(nextDatabase);
    migrateChatMessagesTable(nextDatabase);
    migrateSyncRunsTable(nextDatabase);
    migrateDeliveryLogsTable(nextDatabase);
    nextDatabase.exec("CREATE INDEX IF NOT EXISTS idx_sources_task_id ON sources(task_id);");
    nextDatabase.exec("CREATE INDEX IF NOT EXISTS idx_sources_next_sync_at ON sources(next_sync_at);");
    nextDatabase.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_items_source_url ON items(source_id, canonical_url);");
    nextDatabase.exec("CREATE INDEX IF NOT EXISTS idx_items_source_published_at ON items(source_id, published_at DESC, created_at DESC);");
    nextDatabase.exec("CREATE INDEX IF NOT EXISTS idx_briefs_task_created_at ON briefs(task_id, created_at DESC);");
    nextDatabase.exec("CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_id ON chat_messages(thread_id);");
    nextDatabase.exec("CREATE INDEX IF NOT EXISTS idx_recommendation_bundles_task_position ON recommendation_bundles(task_id, position);");
    nextDatabase.exec("CREATE INDEX IF NOT EXISTS idx_sync_runs_source_started_at ON sync_runs(source_id, started_at DESC);");
    nextDatabase.exec("CREATE INDEX IF NOT EXISTS idx_delivery_logs_brief_started_at ON delivery_logs(brief_id, started_at DESC);");

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
    taskProfile: row.task_profile ? JSON.parse(row.task_profile) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listSpacesWithTasks(
  store: Store = defaultStore,
): Promise<SpaceRecord[]> {
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

export async function getSpaceById(
  store: Store,
  spaceId: string,
): Promise<SpaceRecord | null> {
  const row = store.database
    .prepare("SELECT * FROM spaces WHERE id = ? LIMIT 1")
    .get(spaceId) as SpaceRow | undefined;

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tasks: [],
  };
}

export function createSpaceRecord(input: CreateSpaceInput): Promise<string>;
export function createSpaceRecord(
  store: Store,
  input: CreateSpaceInput,
): Promise<string>;
export async function createSpaceRecord(
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

export function createTaskRecord(input: CreateTaskInput): Promise<string>;
export function createTaskRecord(
  store: Store,
  input: CreateTaskInput,
): Promise<string>;
export async function createTaskRecord(
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

export async function hasTaskRecord(
  store: Store,
  taskId: string,
): Promise<boolean> {
  return Boolean(
    store.database
      .prepare("SELECT 1 FROM tasks WHERE id = ? LIMIT 1")
      .get(taskId),
  );
}

export async function getSourceById(
  store: Store,
  sourceId: string,
): Promise<SourceRecord | null> {
  const row = store.database
    .prepare("SELECT * FROM sources WHERE id = ? LIMIT 1")
    .get(sourceId) as SourceRow | undefined;

  return row ? mapSource(row) : null;
}

export async function getTaskBySourceId(
  store: Store,
  sourceId: string,
): Promise<TaskRecord | null> {
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

export async function createSourceRecord(
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
  const nextSyncAt = timestamp;

  store.database
    .prepare(
      `INSERT INTO sources (
        id,
        task_id,
        source_type,
        title,
        url,
        status,
        sync_interval_minutes,
        next_sync_at,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.taskId,
      input.sourceType,
      input.title,
      input.url,
      "idle",
      360,
      nextSyncAt,
      timestamp,
      timestamp,
    );

  return id;
}

export async function createItemRecordResult(
  store: Store,
  input: {
    sourceId: string;
    title: string;
    canonicalUrl: string;
    summary?: string | null;
    rawContent?: string | null;
    origin?: string | null;
    language?: string | null;
    contentHash?: string;
    structuredFields?: Record<string, unknown> | null;
    publishedAt?: string | null;
    fetchedAt?: string;
  },
): Promise<ItemRecord | null> {
  const timestamp = new Date().toISOString();
  const id = randomUUID();
  const rawContent = input.rawContent ?? input.summary ?? input.title;
  const contentHash =
    input.contentHash ??
    createHash("sha256")
      .update(`${input.canonicalUrl}\n${input.title}\n${rawContent ?? ""}`)
      .digest("hex");
  const fetchedAt = input.fetchedAt ?? timestamp;
  const result = store.database
    .prepare(
      `INSERT OR IGNORE INTO items (
        id,
        source_id,
        title,
        canonical_url,
        summary,
        raw_content,
        origin,
        language,
        content_hash,
        structured_fields,
        published_at,
        fetched_at,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.sourceId,
      input.title,
      input.canonicalUrl,
      input.summary ?? null,
      rawContent,
      input.origin ?? new URL(input.canonicalUrl).hostname,
      input.language ?? null,
      contentHash,
      input.structuredFields ? JSON.stringify(input.structuredFields) : null,
      input.publishedAt ?? null,
      fetchedAt,
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
    rawContent,
    origin: input.origin ?? new URL(input.canonicalUrl).hostname,
    language: input.language ?? null,
    contentHash,
    structuredFields: input.structuredFields ?? null,
    publishedAt: input.publishedAt ?? null,
    fetchedAt,
    createdAt: timestamp,
  };
}

export async function createItemRecord(
  store: Store,
  input: {
    sourceId: string;
    title: string;
    canonicalUrl: string;
    summary?: string | null;
    rawContent?: string | null;
    origin?: string | null;
    language?: string | null;
    contentHash?: string;
    structuredFields?: Record<string, unknown> | null;
    publishedAt?: string | null;
    fetchedAt?: string;
  },
): Promise<boolean> {
  return (await createItemRecordResult(store, input)) !== null;
}

export async function listSourcesByTask(
  store: Store,
  taskId: string,
): Promise<SourceRecord[]> {
  const rows = store.database
    .prepare(
      "SELECT * FROM sources WHERE task_id = ? ORDER BY created_at DESC",
    )
    .all(taskId) as SourceRow[];

  return rows.map(mapSource);
}

export async function listDueSources(
  store: Store,
  nowIso = new Date().toISOString(),
): Promise<SourceRecord[]> {
  const rows = store.database
    .prepare(
      `SELECT * FROM sources
       WHERE status != 'error'
         AND next_sync_at IS NOT NULL
         AND next_sync_at <= ?
       ORDER BY next_sync_at ASC, created_at ASC`,
    )
    .all(nowIso) as SourceRow[];

  return rows.map(mapSource);
}

export async function listItemsBySource(
  store: Store,
  sourceId: string,
): Promise<ItemRecord[]> {
  const rows = store.database
    .prepare(
      `SELECT * FROM items
       WHERE source_id = ?
       ORDER BY published_at DESC, created_at DESC`,
    )
    .all(sourceId) as ItemRow[];

  return rows.map(mapItem);
}

export async function listItemsByBriefId(
  store: Store,
  briefId: string,
): Promise<ItemRecord[]> {
  const rows = store.database
    .prepare(
      `SELECT items.*
       FROM items
       JOIN brief_items ON brief_items.item_id = items.id
       WHERE brief_items.brief_id = ?
       ORDER BY items.published_at DESC, items.created_at DESC`,
    )
    .all(briefId) as ItemRow[];

  return rows.map(mapItem);
}

export async function createBriefRecord(
  store: Store,
  input: {
    taskId: string;
    itemIds: string[];
    title: string;
    summary: string;
    whyItMatters: string;
    sourceCitations: string[];
    relevanceScore?: number;
    importanceScore?: number;
    tags?: string[];
  },
): Promise<string> {
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
        relevance_score,
        importance_score,
        tags_json,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.taskId,
      input.title,
      input.summary,
      input.whyItMatters,
      JSON.stringify(input.sourceCitations),
      input.relevanceScore ?? 0.5,
      input.importanceScore ?? 0.5,
      JSON.stringify(input.tags ?? []),
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

export async function listBriefs(
  store: Store = defaultStore,
): Promise<BriefRecord[]> {
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

export async function markSourceSyncResult(
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

export async function setSourceSchedule(
  store: Store,
  sourceId: string,
  syncIntervalMinutes: number,
  nextSyncAt?: string,
): Promise<void> {
  const timestamp = new Date().toISOString();
  store.database
    .prepare(
      `UPDATE sources
       SET sync_interval_minutes = ?,
           next_sync_at = ?,
           updated_at = ?
       WHERE id = ?`,
    )
    .run(syncIntervalMinutes, nextSyncAt ?? timestamp, timestamp, sourceId);
}

export async function scheduleNextSourceSync(
  store: Store,
  sourceId: string,
  syncIntervalMinutes: number,
  baseTimeIso = new Date().toISOString(),
): Promise<string> {
  const baseTime = Date.parse(baseTimeIso);
  const nextSyncAt = new Date(
    baseTime + syncIntervalMinutes * 60 * 1000,
  ).toISOString();
  const timestamp = new Date().toISOString();

  store.database
    .prepare(
      `UPDATE sources
       SET next_sync_at = ?,
           updated_at = ?
       WHERE id = ?`,
    )
    .run(nextSyncAt, timestamp, sourceId);

  return nextSyncAt;
}

export async function createSyncRun(
  store: Store,
  input: { sourceId: string },
): Promise<string> {
  const id = randomUUID();
  const startedAt = new Date().toISOString();

  store.database
    .prepare(
      `INSERT INTO sync_runs (
        id,
        source_id,
        status,
        started_at
      ) VALUES (?, ?, 'running', ?)`,
    )
    .run(id, input.sourceId, startedAt);

  return id;
}

export async function finishSyncRun(
  store: Store,
  input: {
    runId: string;
    status: "success" | "error";
    insertedItemCount?: number;
    createdBriefCount?: number;
    error?: string | null;
  },
) {
  store.database
    .prepare(
      `UPDATE sync_runs
       SET status = ?,
           inserted_item_count = ?,
           created_brief_count = ?,
           error = ?,
           finished_at = ?
       WHERE id = ?`,
    )
    .run(
      input.status,
      input.insertedItemCount ?? 0,
      input.createdBriefCount ?? 0,
      input.status === "error" ? (input.error ?? "Unknown sync error.") : null,
      new Date().toISOString(),
      input.runId,
    );
}

export async function listRecentSyncRunsBySource(
  store: Store,
  sourceId: string,
  limit = 5,
): Promise<SyncRunRecord[]> {
  const rows = store.database
    .prepare(
      `SELECT * FROM sync_runs
       WHERE source_id = ?
       ORDER BY started_at DESC
       LIMIT ?`,
    )
    .all(sourceId, limit) as SyncRunRow[];

  return rows.map(mapSyncRun);
}

export async function saveWebhookSettings(store: Store, endpoint: string) {
  const updatedAt = new Date().toISOString();
  store.database
    .prepare(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES ('webhook_endpoint', ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at`,
    )
    .run(endpoint, updatedAt);
}

export async function getWebhookSettings(
  store: Store,
): Promise<WebhookSettingsRecord> {
  const row = store.database
    .prepare(
      `SELECT value, updated_at
       FROM app_settings
       WHERE key = 'webhook_endpoint'
       LIMIT 1`,
    )
    .get() as AppSettingRow | undefined;

  return {
    endpoint: row?.value ?? null,
    updatedAt: row?.updated_at ?? null,
  };
}

export async function createDeliveryLog(
  store: Store,
  input: {
    briefId: string;
    endpoint: string;
    payloadType: "html";
  },
) {
  const id = randomUUID();
  const startedAt = new Date().toISOString();

  store.database
    .prepare(
      `INSERT INTO delivery_logs (
        id,
        brief_id,
        endpoint,
        payload_type,
        status,
        started_at
      ) VALUES (?, ?, ?, ?, 'running', ?)`,
    )
    .run(id, input.briefId, input.endpoint, input.payloadType, startedAt);

  return id;
}

export async function finishDeliveryLog(
  store: Store,
  input: {
    logId: string;
    status: "success" | "error";
    responseStatus?: number | null;
    error?: string | null;
  },
) {
  store.database
    .prepare(
      `UPDATE delivery_logs
       SET status = ?,
           response_status = ?,
           error = ?,
           finished_at = ?
       WHERE id = ?`,
    )
    .run(
      input.status,
      input.responseStatus ?? null,
      input.status === "error"
        ? (input.error ?? "Unknown delivery error.")
        : null,
      new Date().toISOString(),
      input.logId,
    );
}

export async function listRecentDeliveryLogsByBrief(
  store: Store,
  briefId: string,
  limit = 10,
): Promise<DeliveryLogRecord[]> {
  const rows = store.database
    .prepare(
      `SELECT * FROM delivery_logs
       WHERE brief_id = ?
       ORDER BY started_at DESC
       LIMIT ?`,
    )
    .all(briefId, limit) as DeliveryLogRow[];

  return rows.map(mapDeliveryLog);
}

export async function listRecentDeliveryLogs(
  store: Store,
  limit = 20,
): Promise<DeliveryLogRecord[]> {
  const rows = store.database
    .prepare(
      `SELECT * FROM delivery_logs
       ORDER BY started_at DESC
       LIMIT ?`,
    )
    .all(limit) as DeliveryLogRow[];

  return rows.map(mapDeliveryLog);
}

export async function listSources(
  store: Store = defaultStore,
): Promise<SourceRecord[]> {
  const rows = store.database
    .prepare("SELECT * FROM sources ORDER BY created_at DESC")
    .all() as SourceRow[];

  return rows.map(mapSource);
}

export async function getBriefById(
  store: Store,
  briefId: string,
): Promise<BriefRecord | null> {
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

export async function listBriefItemIds(
  store: Store,
  briefId: string,
): Promise<string[]> {
  const rows = store.database
    .prepare("SELECT item_id FROM brief_items WHERE brief_id = ?")
    .all(briefId) as Array<{ item_id: string }>;

  return rows.map((row) => row.item_id);
}

export async function briefExistsForItem(
  store: Store,
  itemId: string,
): Promise<boolean> {
  return Boolean(
    store.database
      .prepare("SELECT 1 FROM brief_items WHERE item_id = ? LIMIT 1")
      .get(itemId),
  );
}

// --- Slice A: read/unread, filtered listing, unread count ---

export async function markBriefRead(
  store: Store,
  briefId: string,
): Promise<void> {
  store.database
    .prepare("UPDATE briefs SET is_read = 1 WHERE id = ?")
    .run(briefId);
}

export async function markBriefUnread(
  store: Store,
  briefId: string,
): Promise<void> {
  store.database
    .prepare("UPDATE briefs SET is_read = 0 WHERE id = ?")
    .run(briefId);
}

export async function countUnreadBriefs(store: Store): Promise<number> {
  const row = store.database
    .prepare("SELECT COUNT(*) AS count FROM briefs WHERE is_read = 0")
    .get() as { count: number };

  return row.count;
}

export async function listBriefsFiltered(
  store: Store,
  filters: { taskId?: string; unreadOnly?: boolean } = {},
): Promise<BriefRecord[]> {
  const conditions: string[] = [];
  const params: string[] = [];

  if (filters.taskId) {
    conditions.push("briefs.task_id = ?");
    params.push(filters.taskId);
  }
  if (filters.unreadOnly) {
    conditions.push("briefs.is_read = 0");
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = store.database
    .prepare(
      `SELECT
         briefs.*,
         tasks.title AS task_title,
         spaces.name AS space_name
       FROM briefs
       JOIN tasks ON briefs.task_id = tasks.id
       JOIN spaces ON tasks.space_id = spaces.id
       ${where}
       ORDER BY briefs.created_at DESC`,
    )
    .all(...params) as BriefRow[];

  return rows.map(mapBrief);
}

// --- Slice A + B: delete functions ---

export async function deleteBrief(
  store: Store,
  briefId: string,
): Promise<void> {
  store.database.prepare("DELETE FROM briefs WHERE id = ?").run(briefId);
}

export async function deleteSource(
  store: Store,
  sourceId: string,
): Promise<void> {
  store.database.prepare("DELETE FROM sources WHERE id = ?").run(sourceId);
}

export async function deleteTask(
  store: Store,
  taskId: string,
): Promise<void> {
  store.database.prepare("DELETE FROM tasks WHERE id = ?").run(taskId);
}

export async function deleteSpace(
  store: Store,
  spaceId: string,
): Promise<void> {
  store.database.prepare("DELETE FROM spaces WHERE id = ?").run(spaceId);
}

// --- AI Task Intent, Profiles, Controls & Grounded Chat thread store helpers ---

export async function getTaskById(
  store: Store,
  taskId: string,
): Promise<TaskRecord | null> {
  const row = store.database
    .prepare("SELECT * FROM tasks WHERE id = ? LIMIT 1")
    .get(taskId) as TaskRow | undefined;

  return row ? mapTask(row) : null;
}

export async function getTaskProfile(
  store: Store,
  taskId: string,
): Promise<TaskProfile | null> {
  const task = await getTaskById(store, taskId);
  return task ? task.taskProfile ?? null : null;
}

export async function saveTaskProfile(
  store: Store,
  taskId: string,
  profile: TaskProfile,
): Promise<void> {
  const timestamp = new Date().toISOString();
  store.database
    .prepare("UPDATE tasks SET task_profile = ?, updated_at = ? WHERE id = ?")
    .run(JSON.stringify(profile), timestamp, taskId);
}

export async function replaceRecommendationBundles(
  store: Store,
  taskId: string,
  bundles: RecommendationBundle[],
): Promise<void> {
  const deleteStatement = store.database.prepare(
    "DELETE FROM recommendation_bundles WHERE task_id = ?",
  );
  const insertStatement = store.database.prepare(
    `INSERT INTO recommendation_bundles (
      id,
      task_id,
      position,
      bundle_json,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)`,
  );

  store.database.exec("BEGIN");

  try {
    deleteStatement.run(taskId);

    for (const [index, bundle] of bundles.entries()) {
      const timestamp = new Date().toISOString();
      insertStatement.run(
        randomUUID(),
        taskId,
        index,
        JSON.stringify(bundle),
        timestamp,
        timestamp,
      );
    }

    store.database.exec("COMMIT");
  } catch (error) {
    store.database.exec("ROLLBACK");
    throw error;
  }
}

export async function listRecommendationBundlesByTask(
  store: Store,
  taskId: string,
): Promise<RecommendationBundle[]> {
  const rows = store.database
    .prepare(
      `SELECT * FROM recommendation_bundles
       WHERE task_id = ?
       ORDER BY position ASC, created_at ASC`,
    )
    .all(taskId) as RecommendationBundleRow[];

  return rows.map(mapRecommendationBundle);
}

export async function updateTaskControls(
  store: Store,
  taskId: string,
  relevanceLevel: number,
  summaryPreference: string,
): Promise<void> {
  const timestamp = new Date().toISOString();
  store.database
    .prepare(
      `UPDATE tasks
       SET relevance_level = ?,
           summary_preference = ?,
           updated_at = ?
       WHERE id = ?`,
    )
    .run(relevanceLevel, summaryPreference, timestamp, taskId);
}

export async function getOrCreateChatThread(
  store: Store,
  scopeType: "global" | "space" | "task" | "brief",
  scopeId: string,
): Promise<ChatThreadRecord> {
  const existing = await findChatThread(store, scopeType, scopeId);

  if (existing) {
    return existing;
  }

  const id = randomUUID();
  const timestamp = new Date().toISOString();

  store.database
    .prepare(
      `INSERT INTO chat_threads (id, scope_type, scope_id, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(id, scopeType, scopeId, timestamp);

  return {
    id,
    scopeType,
    scopeId,
    createdAt: timestamp,
  };
}

export async function findChatThread(
  store: Store,
  scopeType: "global" | "space" | "task" | "brief",
  scopeId: string,
): Promise<ChatThreadRecord | null> {
  const existing = store.database
    .prepare(
      `SELECT * FROM chat_threads
       WHERE scope_type = ? AND scope_id = ?
       LIMIT 1`
    )
    .get(scopeType, scopeId) as ChatThreadRow | undefined;

  return existing ? mapChatThread(existing) : null;
}

export async function createChatMessage(
  store: Store,
  input: {
    threadId: string;
    role: "user" | "assistant";
    content: string;
    citations?: string[] | null;
    provenance?: "stored" | "mixed" | null;
  },
): Promise<ChatMessageRecord> {
  const id = randomUUID();
  const timestamp = new Date().toISOString();
  const citationsStr = input.citations ? JSON.stringify(input.citations) : null;
  const provenance = input.provenance ?? null;

  store.database
    .prepare(
      `INSERT INTO chat_messages (id, thread_id, role, content, citations, provenance, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.threadId,
      input.role,
      input.content,
      citationsStr,
      provenance,
      timestamp,
    );

  return {
    id,
    threadId: input.threadId,
    role: input.role,
    content: input.content,
    citations: input.citations ?? null,
    provenance,
    createdAt: timestamp,
  };
}

export async function listChatMessages(
  store: Store,
  threadId: string,
): Promise<ChatMessageRecord[]> {
  const rows = store.database
    .prepare(
      `SELECT * FROM chat_messages
       WHERE thread_id = ?
       ORDER BY created_at ASC`
    )
    .all(threadId) as ChatMessageRow[];

  return rows.map(mapChatMessage);
}
