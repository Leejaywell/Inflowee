import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Prisma, PrismaClient } from "@prisma/client";

import { getDatabaseUrl, getPrisma, requireDatabaseUrl } from "./db.ts";

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
export type SqliteStore = {
  runtime: "sqlite";
  database: DatabaseSync;
  prisma?: undefined;
};
export type PrismaStore = {
  runtime: "prisma";
  database: DatabaseSync;
  prisma: PrismaClient;
};
export type Store = SqliteStore | PrismaStore;

function createUnavailableDatabaseHandle(): DatabaseSync {
  return new Proxy({} as DatabaseSync, {
    get() {
      throw new Error("SQLite database is unavailable for Prisma-backed store.");
    },
  });
}

function createUnavailablePrismaHandle(): PrismaClient {
  return new Proxy({} as PrismaClient, {
    get() {
      throw new Error("DATABASE_URL is required for cloud runtime.");
    },
  });
}

type SpaceRow = {
  id: string;
  owner_id: string;
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
  payload_type: "html" | "slack" | "telegram" | "feishu";
  status: DeliveryStatus;
  attempt_count: number | null;
  response_status: number | null;
  error: string | null;
  started_at: string;
  finished_at: string | null;
};

type SpaceMemberRow = {
  space_id: string;
  user_id: string;
  role: string;
  created_at: string;
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
  ownerId: string;
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

export type SlackSettingsRecord = {
  endpoint: string | null;
  updatedAt: string | null;
};

export type TelegramSettingsRecord = {
  botToken: string | null;
  chatId: string | null;
  updatedAt: string | null;
};

export type FeishuSettingsRecord = {
  endpoint: string | null;
  updatedAt: string | null;
};

export type DeliveryLogRecord = {
  id: string;
  briefId: string;
  endpoint: string;
  payloadType: "html" | "slack" | "telegram" | "feishu";
  status: DeliveryStatus;
  attemptCount: number | null;
  responseStatus: number | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
};

export type SpaceRole = "viewer" | "editor" | "owner";

export type SourceHealthSummary = {
  total: number;
  healthy: number;
  errored: number;
  idle: number;
  dueNow: number;
};

export type DeliveryHealthSummary = {
  total: number;
  success: number;
  error: number;
  running: number;
  webhookConfigured: boolean;
  slackConfigured: boolean;
  telegramConfigured: boolean;
  feishuConfigured: boolean;
};

export type SpaceMemberRecord = {
  spaceId: string;
  userId: string;
  role: SpaceRole;
  createdAt: string;
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
  ownerId?: string;
  name: string;
  description?: string;
};

type CreateTaskInput = {
  spaceId: string;
  title: string;
  taskType: TaskType;
  userPrompt: string;
};

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
    attemptCount: row.attempt_count,
    responseStatus: row.response_status,
    error: row.error,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

function mapSpaceMember(row: SpaceMemberRow): SpaceMemberRecord {
  return {
    spaceId: row.space_id,
    userId: row.user_id,
    role: row.role as SpaceRole,
    createdAt: row.created_at,
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
  const deliveryLogsTable = database
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'delivery_logs'",
    )
    .get() as { sql: string } | undefined;

  const needsDeliveryPayloadUpgrade =
    deliveryLogsTable && !deliveryLogsTable.sql.includes("'feishu'");

  if (needsDeliveryPayloadUpgrade) {
    database.exec(`
      PRAGMA foreign_keys = OFF;
      BEGIN;

      CREATE TABLE delivery_logs_migrated (
        id TEXT PRIMARY KEY,
        brief_id TEXT NOT NULL,
        endpoint TEXT NOT NULL,
        payload_type TEXT NOT NULL CHECK(payload_type IN ('html', 'slack', 'telegram', 'feishu')),
        status TEXT NOT NULL CHECK(status IN ('running', 'success', 'error')),
        attempt_count INTEGER,
        response_status INTEGER,
        error TEXT,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        FOREIGN KEY(brief_id) REFERENCES briefs(id) ON DELETE CASCADE
      );

      INSERT INTO delivery_logs_migrated (
        id,
        brief_id,
        endpoint,
        payload_type,
        status,
        attempt_count,
        response_status,
        error,
        started_at,
        finished_at
      )
      SELECT
        id,
        brief_id,
        endpoint,
        payload_type,
        status,
        attempt_count,
        response_status,
        error,
        started_at,
        finished_at
      FROM delivery_logs;

      DROP TABLE delivery_logs;
      ALTER TABLE delivery_logs_migrated RENAME TO delivery_logs;

      COMMIT;
      PRAGMA foreign_keys = ON;
    `);
  }

  database.exec(`
    CREATE TABLE IF NOT EXISTS delivery_logs (
      id TEXT PRIMARY KEY,
      brief_id TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      payload_type TEXT NOT NULL CHECK(payload_type IN ('html', 'slack', 'telegram', 'feishu')),
      status TEXT NOT NULL CHECK(status IN ('running', 'success', 'error')),
      attempt_count INTEGER,
      response_status INTEGER,
      error TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      FOREIGN KEY(brief_id) REFERENCES briefs(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_delivery_logs_brief_started_at
      ON delivery_logs(brief_id, started_at DESC);
  `);

  if (deliveryLogsTable && !deliveryLogsTable.sql.includes("attempt_count")) {
    database.exec("ALTER TABLE delivery_logs ADD COLUMN attempt_count INTEGER;");
  }
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

function migrateBriefReadsTable(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS brief_reads (
      brief_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      read_at TEXT NOT NULL,
      PRIMARY KEY (brief_id, actor_id),
      FOREIGN KEY(brief_id) REFERENCES briefs(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_brief_reads_actor_read_at
      ON brief_reads(actor_id, read_at DESC);
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

function migrateSpacesTable(database: DatabaseSync) {
  const spacesTable = database
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'spaces'",
    )
    .get() as { sql: string } | undefined;

  if (!spacesTable || spacesTable.sql.includes("owner_id")) {
    return;
  }

  database.exec(`
    PRAGMA foreign_keys = OFF;
    BEGIN;

    CREATE TABLE spaces_migrated (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL DEFAULT 'local-user',
      name TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    INSERT INTO spaces_migrated (id, owner_id, name, description, created_at, updated_at)
    SELECT id, 'local-user', name, description, created_at, updated_at
    FROM spaces;

    DROP TABLE spaces;
    ALTER TABLE spaces_migrated RENAME TO spaces;

    COMMIT;
    PRAGMA foreign_keys = ON;
  `);
}

function migrateSpaceMembersTable(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS space_members (
      space_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (space_id, user_id),
      FOREIGN KEY(space_id) REFERENCES spaces(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_space_members_user_created_at
      ON space_members(user_id, created_at DESC);
  `);
}

function createPrismaStore(databaseUrl?: string): PrismaStore {
  if (!databaseUrl) {
    return {
      runtime: "prisma",
      database: createUnavailableDatabaseHandle(),
      prisma: createUnavailablePrismaHandle(),
    };
  }

  const prismaClient =
    databaseUrl === process.env.DATABASE_URL
      ? getPrisma()
      : new PrismaClient({
          datasourceUrl: databaseUrl,
        });

  return {
    runtime: "prisma",
    database: createUnavailableDatabaseHandle(),
    prisma: prismaClient,
  };
}

export function createStore(): PrismaStore;
export function createStore(filename: string): SqliteStore;
export function createStore(options: { databaseUrl: string }): PrismaStore;
export function createStore(
  filenameOrOptions?:
    | string
    | {
        databaseUrl: string;
      },
): Store {
  if (filenameOrOptions === undefined) {
    return createPrismaStore(getDatabaseUrl());
  }

  if (
    typeof filenameOrOptions === "object" &&
    filenameOrOptions !== null &&
    "databaseUrl" in filenameOrOptions
  ) {
    return createPrismaStore(filenameOrOptions.databaseUrl);
  }

  const filename = filenameOrOptions;
  let database: DatabaseSync | undefined;

  const initializeDatabase = () => {
    mkdirSync(dirname(filename), { recursive: true });

    const nextDatabase = new DatabaseSync(filename);

    nextDatabase.exec(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS spaces (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL DEFAULT 'local-user',
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

      CREATE TABLE IF NOT EXISTS space_members (
        space_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (space_id, user_id),
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

      CREATE TABLE IF NOT EXISTS brief_reads (
        brief_id TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        read_at TEXT NOT NULL,
        PRIMARY KEY (brief_id, actor_id),
        FOREIGN KEY(brief_id) REFERENCES briefs(id) ON DELETE CASCADE
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
        payload_type TEXT NOT NULL CHECK(payload_type IN ('html', 'slack', 'telegram', 'feishu')),
        status TEXT NOT NULL CHECK(status IN ('running', 'success', 'error')),
        attempt_count INTEGER,
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
      CREATE INDEX IF NOT EXISTS idx_brief_reads_actor_read_at ON brief_reads(actor_id, read_at DESC);
      CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_id ON chat_messages(thread_id);
      CREATE INDEX IF NOT EXISTS idx_recommendation_bundles_task_position ON recommendation_bundles(task_id, position);
      CREATE INDEX IF NOT EXISTS idx_sync_runs_source_started_at ON sync_runs(source_id, started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_delivery_logs_brief_started_at ON delivery_logs(brief_id, started_at DESC);
    `);

    migrateSourcesTable(nextDatabase);
    migrateSpacesTable(nextDatabase);
    migrateSpaceMembersTable(nextDatabase);
    migrateBriefsTable(nextDatabase);
    migrateBriefReadsTable(nextDatabase);
    migrateTasksTable(nextDatabase);
    migrateItemsTable(nextDatabase);
    migrateChatMessagesTable(nextDatabase);
    migrateSyncRunsTable(nextDatabase);
    migrateDeliveryLogsTable(nextDatabase);
    nextDatabase.exec("CREATE INDEX IF NOT EXISTS idx_sources_task_id ON sources(task_id);");
    nextDatabase.exec("CREATE INDEX IF NOT EXISTS idx_sources_next_sync_at ON sources(next_sync_at);");
    nextDatabase.exec("CREATE INDEX IF NOT EXISTS idx_space_members_user_created_at ON space_members(user_id, created_at DESC);");
    nextDatabase.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_items_source_url ON items(source_id, canonical_url);");
    nextDatabase.exec("CREATE INDEX IF NOT EXISTS idx_items_source_published_at ON items(source_id, published_at DESC, created_at DESC);");
    nextDatabase.exec("CREATE INDEX IF NOT EXISTS idx_briefs_task_created_at ON briefs(task_id, created_at DESC);");
    nextDatabase.exec("CREATE INDEX IF NOT EXISTS idx_brief_reads_actor_read_at ON brief_reads(actor_id, read_at DESC);");
    nextDatabase.exec("CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_id ON chat_messages(thread_id);");
    nextDatabase.exec("CREATE INDEX IF NOT EXISTS idx_recommendation_bundles_task_position ON recommendation_bundles(task_id, position);");
    nextDatabase.exec("CREATE INDEX IF NOT EXISTS idx_sync_runs_source_started_at ON sync_runs(source_id, started_at DESC);");
    nextDatabase.exec("CREATE INDEX IF NOT EXISTS idx_delivery_logs_brief_started_at ON delivery_logs(brief_id, started_at DESC);");

    database = nextDatabase;
    return nextDatabase;
  };

  return {
    runtime: "sqlite",
    get database() {
      return database ?? initializeDatabase();
    },
  };
}

export const defaultStore = createStore();

export function getDefaultRuntimeStore(): Store {
  return createStore({ databaseUrl: requireDatabaseUrl() });
}

function mapSpace(row: SpaceRow, tasks: TaskRecord[]): SpaceRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tasks,
  };
}

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

function mapPrismaTask(task: {
  id: string;
  spaceId: string;
  title: string;
  taskType: string;
  userPrompt: string;
  relevanceLevel: number;
  summaryPreference: string;
  taskProfile: unknown;
  createdAt: Date;
  updatedAt: Date;
}): TaskRecord {
  return {
    id: task.id,
    spaceId: task.spaceId,
    title: task.title,
    taskType: task.taskType as TaskType,
    userPrompt: task.userPrompt,
    relevanceLevel: task.relevanceLevel,
    summaryPreference: task.summaryPreference,
    taskProfile: (task.taskProfile as TaskProfile | null) ?? null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

function mapPrismaSpace(space: {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  tasks?: Array<{
    id: string;
    spaceId: string;
    title: string;
    taskType: string;
    userPrompt: string;
    relevanceLevel: number;
    summaryPreference: string;
    taskProfile: unknown;
    createdAt: Date;
    updatedAt: Date;
  }>;
}): SpaceRecord {
  return {
    id: space.id,
    ownerId: space.ownerId,
    name: space.name,
    description: space.description,
    createdAt: space.createdAt.toISOString(),
    updatedAt: space.updatedAt.toISOString(),
    tasks: space.tasks?.map(mapPrismaTask) ?? [],
  };
}

function mapPrismaSource(source: {
  id: string;
  taskId: string;
  sourceType: string;
  title: string;
  url: string;
  status: string;
  lastSyncedAt: Date | null;
  lastError: string | null;
  syncIntervalMinutes: number;
  nextSyncAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): SourceRecord {
  return {
    id: source.id,
    taskId: source.taskId,
    sourceType: source.sourceType as SourceType,
    title: source.title,
    url: source.url,
    status: source.status as SourceStatus,
    lastSyncedAt: source.lastSyncedAt?.toISOString() ?? null,
    lastError: source.lastError,
    syncIntervalMinutes: source.syncIntervalMinutes,
    nextSyncAt: source.nextSyncAt?.toISOString() ?? null,
    createdAt: source.createdAt.toISOString(),
    updatedAt: source.updatedAt.toISOString(),
  };
}

function mapPrismaItem(item: {
  id: string;
  sourceId: string;
  title: string;
  canonicalUrl: string;
  summary: string | null;
  rawContent: string | null;
  origin: string | null;
  language: string | null;
  contentHash: string;
  structuredFields: unknown;
  publishedAt: Date | null;
  fetchedAt: Date;
  createdAt: Date;
}): ItemRecord {
  return {
    id: item.id,
    sourceId: item.sourceId,
    title: item.title,
    canonicalUrl: item.canonicalUrl,
    summary: item.summary,
    rawContent: item.rawContent,
    origin: item.origin,
    language: item.language,
    contentHash: item.contentHash,
    structuredFields: (item.structuredFields as Record<string, unknown> | null) ?? null,
    publishedAt: item.publishedAt?.toISOString() ?? null,
    fetchedAt: item.fetchedAt.toISOString(),
    createdAt: item.createdAt.toISOString(),
  };
}

function mapPrismaBrief(brief: {
  id: string;
  taskId: string;
  title: string;
  summary: string;
  whyItMatters: string;
  sourceCitations: unknown;
  relevanceScore: number;
  importanceScore: number;
  tagsJson: unknown;
  isRead: boolean;
  createdAt: Date;
  briefReads?: Array<{ actorId: string }>;
  task?: { title: string; space?: { name: string } | null } | null;
}): BriefRecord {
  return {
    id: brief.id,
    taskId: brief.taskId,
    title: brief.title,
    summary: brief.summary,
    whyItMatters: brief.whyItMatters,
    sourceCitations: (brief.sourceCitations as string[]) ?? [],
    relevanceScore: brief.relevanceScore,
    importanceScore: brief.importanceScore,
    tags: (brief.tagsJson as string[]) ?? [],
    isRead: brief.briefReads ? brief.briefReads.length > 0 : brief.isRead,
    createdAt: brief.createdAt.toISOString(),
    taskTitle: brief.task?.title,
    spaceName: brief.task?.space?.name,
  };
}

function mapPrismaSyncRun(run: {
  id: string;
  sourceId: string;
  status: string;
  insertedItemCount: number;
  createdBriefCount: number;
  error: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}): SyncRunRecord {
  return {
    id: run.id,
    sourceId: run.sourceId,
    status: run.status as SyncRunStatus,
    insertedItemCount: run.insertedItemCount,
    createdBriefCount: run.createdBriefCount,
    error: run.error,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
  };
}

type PrismaDeliveryLogRow = {
  id: string;
  brief_id: string;
  endpoint: string;
  payload_type: "html";
  status: DeliveryStatus;
  attempt_count: number | null;
  response_status: number | null;
  error: string | null;
  started_at: Date;
  finished_at: Date | null;
};

function mapPrismaDeliveryLogRow(row: PrismaDeliveryLogRow): DeliveryLogRecord {
  return {
    id: row.id,
    briefId: row.brief_id,
    endpoint: row.endpoint,
    payloadType: row.payload_type,
    status: row.status,
    attemptCount: row.attempt_count,
    responseStatus: row.response_status,
    error: row.error,
    startedAt: row.started_at.toISOString(),
    finishedAt: row.finished_at?.toISOString() ?? null,
  };
}

function mapPrismaSpaceMember(member: {
  spaceId: string;
  userId: string;
  role: string;
  createdAt: Date;
}): SpaceMemberRecord {
  return {
    spaceId: member.spaceId,
    userId: member.userId,
    role: member.role as SpaceRole,
    createdAt: member.createdAt.toISOString(),
  };
}

export async function listSpacesWithTasks(
  store: Store = defaultStore,
  filters: { ownerId?: string; actorId?: string } = {},
): Promise<SpaceRecord[]> {
  if (store.prisma) {
    const spaces = await store.prisma.space.findMany({
      where: filters.actorId
        ? {
            OR: [
              { ownerId: filters.actorId },
              { members: { some: { userId: filters.actorId } } },
            ],
          }
        : filters.ownerId
          ? { ownerId: filters.ownerId }
          : undefined,
      orderBy: { createdAt: "desc" },
      include: {
        tasks: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    return spaces.map(mapPrismaSpace);
  }

  const spaces = (
    filters.actorId
      ? store.database
          .prepare(
            `SELECT DISTINCT spaces.*
             FROM spaces
             LEFT JOIN space_members
               ON space_members.space_id = spaces.id
              AND space_members.user_id = ?
             WHERE spaces.owner_id = ?
                OR space_members.user_id IS NOT NULL
             ORDER BY spaces.created_at DESC`,
          )
          .all(filters.actorId, filters.actorId)
      : filters.ownerId
      ? store.database
          .prepare(
            "SELECT * FROM spaces WHERE owner_id = ? ORDER BY created_at DESC",
          )
          .all(filters.ownerId)
      : store.database
          .prepare("SELECT * FROM spaces ORDER BY created_at DESC")
          .all()
  ) as SpaceRow[];
  const tasks = store.database
    .prepare("SELECT * FROM tasks ORDER BY created_at DESC")
    .all() as TaskRow[];

  const tasksBySpace = new Map<string, TaskRecord[]>();

  for (const task of tasks) {
    const collection = tasksBySpace.get(task.space_id) ?? [];
    collection.push(mapTask(task));
    tasksBySpace.set(task.space_id, collection);
  }

  return spaces.map((space) => mapSpace(space, tasksBySpace.get(space.id) ?? []));
}

export async function getSpaceById(
  store: Store,
  spaceId: string,
): Promise<SpaceRecord | null> {
  if (store.prisma) {
    const row = await store.prisma.space.findUnique({
      where: { id: spaceId },
    });

    if (!row) {
      return null;
    }

    return mapPrismaSpace(row);
  }

  const row = store.database
    .prepare("SELECT * FROM spaces WHERE id = ? LIMIT 1")
    .get(spaceId) as SpaceRow | undefined;

  if (!row) {
    return null;
  }

  return mapSpace(row, []);
}

export async function listTasksBySpace(
  store: Store,
  spaceId: string,
): Promise<TaskRecord[]> {
  if (store.prisma) {
    const rows = await store.prisma.task.findMany({
      where: { spaceId },
      orderBy: { createdAt: "desc" },
    });

    return rows.map(mapPrismaTask);
  }

  const rows = store.database
    .prepare("SELECT * FROM tasks WHERE space_id = ? ORDER BY created_at DESC")
    .all(spaceId) as TaskRow[];

  return rows.map(mapTask);
}

export async function addSpaceMember(
  store: Store,
  input: {
    spaceId: string;
    userId: string;
    role: SpaceRole;
  },
): Promise<void> {
  if (store.prisma) {
    await store.prisma.spaceMember.upsert({
      where: {
        spaceId_userId: {
          spaceId: input.spaceId,
          userId: input.userId,
        },
      },
      update: {
        role: input.role,
      },
      create: {
        spaceId: input.spaceId,
        userId: input.userId,
        role: input.role,
      },
    });
    return;
  }

  const timestamp = new Date().toISOString();
  store.database
    .prepare(
      `INSERT INTO space_members (space_id, user_id, role, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(space_id, user_id) DO UPDATE SET role = excluded.role`,
    )
    .run(input.spaceId, input.userId, input.role, timestamp);
}

export async function listSpaceMembers(
  store: Store,
  spaceId: string,
): Promise<SpaceMemberRecord[]> {
  if (store.prisma) {
    const rows = await store.prisma.spaceMember.findMany({
      where: { spaceId },
      orderBy: { createdAt: "asc" },
    });

    return rows.map(mapPrismaSpaceMember);
  }

  const rows = store.database
    .prepare(
      `SELECT * FROM space_members
       WHERE space_id = ?
       ORDER BY created_at ASC`,
    )
    .all(spaceId) as SpaceMemberRow[];

  return rows.map(mapSpaceMember);
}

export async function removeSpaceMember(
  store: Store,
  input: {
    spaceId: string;
    userId: string;
  },
): Promise<void> {
  if (store.prisma) {
    await store.prisma.spaceMember.deleteMany({
      where: {
        spaceId: input.spaceId,
        userId: input.userId,
      },
    });
    return;
  }

  store.database
    .prepare(
      `DELETE FROM space_members
       WHERE space_id = ?
         AND user_id = ?`,
    )
    .run(input.spaceId, input.userId);
}

export async function getSpaceMembership(
  store: Store,
  actorId: string,
  spaceId: string,
): Promise<SpaceMemberRecord | null> {
  const space = await getSpaceById(store, spaceId);

  if (!space) {
    return null;
  }

  if (space.ownerId === actorId) {
    return {
      spaceId,
      userId: actorId,
      role: "owner",
      createdAt: space.createdAt,
    };
  }

  if (store.prisma) {
    const member = await store.prisma.spaceMember.findUnique({
      where: {
        spaceId_userId: {
          spaceId,
          userId: actorId,
        },
      },
    });

    return member ? mapPrismaSpaceMember(member) : null;
  }

  const member = store.database
    .prepare(
      `SELECT * FROM space_members
       WHERE space_id = ?
         AND user_id = ?
       LIMIT 1`,
    )
    .get(spaceId, actorId) as SpaceMemberRow | undefined;

  return member ? mapSpaceMember(member) : null;
}

export async function getSpaceMembershipForTask(
  store: Store,
  actorId: string,
  taskId: string,
): Promise<SpaceMemberRecord | null> {
  const task = await getTaskById(store, taskId);

  if (!task) {
    return null;
  }

  return getSpaceMembership(store, actorId, task.spaceId);
}

export async function getTaskByBriefId(
  store: Store,
  briefId: string,
): Promise<TaskRecord | null> {
  if (store.prisma) {
    const row = await store.prisma.brief.findUnique({
      where: { id: briefId },
      include: { task: true },
    });

    return row ? mapPrismaTask(row.task) : null;
  }

  const row = store.database
    .prepare(
      `SELECT tasks.*
       FROM tasks
       JOIN briefs ON briefs.task_id = tasks.id
       WHERE briefs.id = ?
       LIMIT 1`,
    )
    .get(briefId) as TaskRow | undefined;

  return row ? mapTask(row) : null;
}

export async function getSpaceMembershipForBrief(
  store: Store,
  actorId: string,
  briefId: string,
): Promise<SpaceMemberRecord | null> {
  const task = await getTaskByBriefId(store, briefId);

  if (!task) {
    return null;
  }

  return getSpaceMembership(store, actorId, task.spaceId);
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

  if (store.prisma) {
    const space = await store.prisma.space.create({
      data: {
        ownerId: input.ownerId ?? "local-user",
        name: input.name,
        description: input.description ?? null,
      },
    });

    return space.id;
  }

  const timestamp = new Date().toISOString();
  const id = randomUUID();

  store.database
    .prepare(
      `INSERT INTO spaces (id, owner_id, name, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.ownerId ?? "local-user",
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

  if (store.prisma) {
    const task = await store.prisma.task.create({
      data: {
        spaceId: input.spaceId,
        title: input.title,
        taskType: input.taskType,
        userPrompt: input.userPrompt,
        relevanceLevel: 3,
        summaryPreference: "balanced",
      },
    });

    return task.id;
  }

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
  if (store.prisma) {
    const count = await store.prisma.task.count({
      where: { id: taskId },
    });

    return count > 0;
  }

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
  if (store.prisma) {
    const row = await store.prisma.source.findUnique({
      where: { id: sourceId },
    });

    return row ? mapPrismaSource(row) : null;
  }

  const row = store.database
    .prepare("SELECT * FROM sources WHERE id = ? LIMIT 1")
    .get(sourceId) as SourceRow | undefined;

  return row ? mapSource(row) : null;
}

export async function getTaskBySourceId(
  store: Store,
  sourceId: string,
): Promise<TaskRecord | null> {
  if (store.prisma) {
    const row = await store.prisma.source.findUnique({
      where: { id: sourceId },
      include: { task: true },
    });

    return row ? mapPrismaTask(row.task) : null;
  }

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
  if (store.prisma) {
    const source = await store.prisma.source.create({
      data: {
        taskId: input.taskId,
        sourceType: input.sourceType,
        title: input.title,
        url: input.url,
        status: "idle",
        syncIntervalMinutes: 360,
        nextSyncAt: new Date(),
      },
    });

    return source.id;
  }

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
  if (store.prisma) {
    const timestamp = new Date();
    const rawContent = input.rawContent ?? input.summary ?? input.title;
    const contentHash =
      input.contentHash ??
      createHash("sha256")
        .update(`${input.canonicalUrl}\n${input.title}\n${rawContent ?? ""}`)
        .digest("hex");
    const fetchedAt = input.fetchedAt ? new Date(input.fetchedAt) : timestamp;

    try {
      const item = await store.prisma.item.create({
        data: {
          sourceId: input.sourceId,
          title: input.title,
          canonicalUrl: input.canonicalUrl,
          summary: input.summary ?? null,
          rawContent,
          origin: input.origin ?? new URL(input.canonicalUrl).hostname,
          language: input.language ?? null,
          contentHash,
          structuredFields:
            (input.structuredFields as Prisma.InputJsonValue | undefined) ??
            undefined,
          publishedAt: input.publishedAt ? new Date(input.publishedAt) : null,
          fetchedAt,
        },
      });

      return mapPrismaItem(item);
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "P2002"
      ) {
        return null;
      }

      throw error;
    }
  }

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
  if (store.prisma) {
    const rows = await store.prisma.source.findMany({
      where: { taskId },
      orderBy: { createdAt: "desc" },
    });

    return rows.map(mapPrismaSource);
  }

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
  if (store.prisma) {
    const rows = await store.prisma.source.findMany({
      where: {
        status: {
          not: "error",
        },
        nextSyncAt: {
          not: null,
          lte: new Date(nowIso),
        },
      },
      orderBy: [{ nextSyncAt: "asc" }, { createdAt: "asc" }],
    });

    return rows.map(mapPrismaSource);
  }

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
  if (store.prisma) {
    const rows = await store.prisma.item.findMany({
      where: { sourceId },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    });

    return rows.map(mapPrismaItem);
  }

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
  if (store.prisma) {
    const rows = await store.prisma.briefItem.findMany({
      where: { briefId },
      include: { item: true },
      orderBy: [{ item: { publishedAt: "desc" } }, { item: { createdAt: "desc" } }],
    });

    return rows.map((row) => mapPrismaItem(row.item));
  }

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
  if (store.prisma) {
    const created = await store.prisma.$transaction(async (tx) => {
      const brief = await tx.brief.create({
        data: {
          taskId: input.taskId,
          title: input.title,
          summary: input.summary,
          whyItMatters: input.whyItMatters,
          sourceCitations: input.sourceCitations,
          relevanceScore: input.relevanceScore ?? 0.5,
          importanceScore: input.importanceScore ?? 0.5,
          tagsJson: input.tags ?? [],
        },
      });

      if (input.itemIds.length > 0) {
        await tx.briefItem.createMany({
          data: input.itemIds.map((itemId) => ({
            briefId: brief.id,
            itemId,
          })),
          skipDuplicates: true,
        });
      }

      return brief.id;
    });

    return created;
  }

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
  if (store.prisma) {
    const rows = await store.prisma.brief.findMany({
      orderBy: [
        { importanceScore: "desc" },
        { relevanceScore: "desc" },
        { createdAt: "desc" },
      ],
      include: {
        task: {
          include: {
            space: true,
          },
        },
      },
    });

    return rows.map(mapPrismaBrief);
  }

  const rows = store.database
    .prepare(
      `SELECT
         briefs.*,
         tasks.title AS task_title,
         spaces.name AS space_name
       FROM briefs
       JOIN tasks ON briefs.task_id = tasks.id
       JOIN spaces ON tasks.space_id = spaces.id
       ORDER BY briefs.importance_score DESC, briefs.relevance_score DESC, briefs.created_at DESC`,
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
  if (store.prisma) {
    const timestamp = new Date();

    await store.prisma.source.update({
      where: { id: input.sourceId },
      data: {
        status: input.status,
        lastSyncedAt: timestamp,
        lastError:
          input.status === "error" ? (input.error ?? "Unknown sync error.") : null,
        updatedAt: timestamp,
      },
    });

    return;
  }

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
  if (store.prisma) {
    const timestamp = new Date();
    await store.prisma.source.update({
      where: { id: sourceId },
      data: {
        syncIntervalMinutes,
        nextSyncAt: new Date(nextSyncAt ?? timestamp.toISOString()),
        updatedAt: timestamp,
      },
    });

    return;
  }

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
  if (store.prisma) {
    const baseTime = Date.parse(baseTimeIso);
    const nextSyncAt = new Date(
      baseTime + syncIntervalMinutes * 60 * 1000,
    ).toISOString();
    const timestamp = new Date();

    await store.prisma.source.update({
      where: { id: sourceId },
      data: {
        nextSyncAt: new Date(nextSyncAt),
        updatedAt: timestamp,
      },
    });

    return nextSyncAt;
  }

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
  if (store.prisma) {
    const run = await store.prisma.syncRun.create({
      data: {
        sourceId: input.sourceId,
        status: "running",
        insertedItemCount: 0,
        createdBriefCount: 0,
        startedAt: new Date(),
      },
    });

    return run.id;
  }

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
  if (store.prisma) {
    await store.prisma.syncRun.update({
      where: { id: input.runId },
      data: {
        status: input.status,
        insertedItemCount: input.insertedItemCount ?? 0,
        createdBriefCount: input.createdBriefCount ?? 0,
        error:
          input.status === "error" ? (input.error ?? "Unknown sync error.") : null,
        finishedAt: new Date(),
      },
    });

    return;
  }

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
  if (store.prisma) {
    const rows = await store.prisma.syncRun.findMany({
      where: { sourceId },
      orderBy: { startedAt: "desc" },
      take: limit,
    });

    return rows.map(mapPrismaSyncRun);
  }

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

async function saveAppSetting(store: Store, key: string, value: string) {
  if (store.prisma) {
    await store.prisma.appSetting.upsert({
      where: { key },
      update: {
        value,
        updatedAt: new Date(),
      },
      create: {
        key,
        value,
        updatedAt: new Date(),
      },
    });

    return;
  }

  const updatedAt = new Date().toISOString();
  store.database
    .prepare(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at`,
    )
    .run(key, value, updatedAt);
}

async function getAppSetting(store: Store, key: string) {
  if (store.prisma) {
    const row = await store.prisma.appSetting.findUnique({
      where: { key },
    });

    return {
      value: row?.value ?? null,
      updatedAt: row?.updatedAt.toISOString() ?? null,
    };
  }

  const row = store.database
    .prepare(
      `SELECT value, updated_at
       FROM app_settings
       WHERE key = ?
       LIMIT 1`,
    )
    .get(key) as AppSettingRow | undefined;

  return {
    value: row?.value ?? null,
    updatedAt: row?.updated_at ?? null,
  };
}

export async function saveWebhookSettings(store: Store, endpoint: string) {
  await saveAppSetting(store, "webhook_endpoint", endpoint);
}

export async function getWebhookSettings(
  store: Store,
): Promise<WebhookSettingsRecord> {
  const row = await getAppSetting(store, "webhook_endpoint");

  return {
    endpoint: row.value,
    updatedAt: row.updatedAt,
  };
}

export async function saveSlackSettings(store: Store, endpoint: string) {
  await saveAppSetting(store, "slack_webhook_endpoint", endpoint);
}

export async function getSlackSettings(
  store: Store,
): Promise<SlackSettingsRecord> {
  const row = await getAppSetting(store, "slack_webhook_endpoint");

  return {
    endpoint: row.value,
    updatedAt: row.updatedAt,
  };
}

export async function saveTelegramSettings(
  store: Store,
  input: {
    botToken: string;
    chatId: string;
  },
) {
  await Promise.all([
    saveAppSetting(store, "telegram_bot_token", input.botToken),
    saveAppSetting(store, "telegram_chat_id", input.chatId),
  ]);
}

export async function getTelegramSettings(
  store: Store,
): Promise<TelegramSettingsRecord> {
  const [tokenRow, chatRow] = await Promise.all([
    getAppSetting(store, "telegram_bot_token"),
    getAppSetting(store, "telegram_chat_id"),
  ]);

  return {
    botToken: tokenRow.value,
    chatId: chatRow.value,
    updatedAt: chatRow.updatedAt ?? tokenRow.updatedAt,
  };
}

export async function saveFeishuSettings(store: Store, endpoint: string) {
  await saveAppSetting(store, "feishu_webhook_endpoint", endpoint);
}

export async function getFeishuSettings(
  store: Store,
): Promise<FeishuSettingsRecord> {
  const row = await getAppSetting(store, "feishu_webhook_endpoint");

  return {
    endpoint: row.value,
    updatedAt: row.updatedAt,
  };
}

export async function createDeliveryLog(
  store: Store,
  input: {
    briefId: string;
    endpoint: string;
    payloadType: "html" | "slack" | "telegram" | "feishu";
  },
) {
  if (store.prisma) {
    const log = await store.prisma.deliveryLog.create({
      data: {
        briefId: input.briefId,
        endpoint: input.endpoint,
        payloadType: input.payloadType,
        status: "running",
        startedAt: new Date(),
      },
    });

    return log.id;
  }

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
    attemptCount?: number | null;
    responseStatus?: number | null;
    error?: string | null;
  },
) {
  if (store.prisma) {
    await store.prisma.$executeRaw(
      Prisma.sql`UPDATE "DeliveryLog"
                 SET "status" = ${input.status},
                     "attemptCount" = ${input.attemptCount ?? null},
                     "responseStatus" = ${input.responseStatus ?? null},
                     "error" = ${
                       input.status === "error"
                         ? (input.error ?? "Unknown delivery error.")
                         : null
                     },
                     "finishedAt" = ${new Date()}
                 WHERE "id" = ${input.logId}`,
    );

    return;
  }

  store.database
    .prepare(
      `UPDATE delivery_logs
       SET status = ?,
           attempt_count = ?,
           response_status = ?,
           error = ?,
           finished_at = ?
       WHERE id = ?`,
    )
    .run(
      input.status,
      input.attemptCount ?? null,
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
  if (store.prisma) {
    const rows = await store.prisma.$queryRaw<PrismaDeliveryLogRow[]>`
      SELECT
        "id",
        "briefId" AS brief_id,
        "endpoint",
        "payloadType" AS payload_type,
        "status",
        "attemptCount" AS attempt_count,
        "responseStatus" AS response_status,
        "error",
        "startedAt" AS started_at,
        "finishedAt" AS finished_at
      FROM "DeliveryLog"
      WHERE "briefId" = ${briefId}
      ORDER BY "startedAt" DESC
      LIMIT ${limit}
    `;

    return rows.map(mapPrismaDeliveryLogRow);
  }

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
  filters: { actorId?: string } = {},
): Promise<DeliveryLogRecord[]> {
  if (store.prisma) {
    const rows = filters.actorId
      ? await store.prisma.$queryRaw<PrismaDeliveryLogRow[]>`
          SELECT
            dl."id",
            dl."briefId" AS brief_id,
            dl."endpoint",
            dl."payloadType" AS payload_type,
            dl."status",
            dl."attemptCount" AS attempt_count,
            dl."responseStatus" AS response_status,
            dl."error",
            dl."startedAt" AS started_at,
            dl."finishedAt" AS finished_at
          FROM "DeliveryLog" dl
          JOIN "Brief" b ON b."id" = dl."briefId"
          JOIN "Task" t ON t."id" = b."taskId"
          JOIN "Space" s ON s."id" = t."spaceId"
          LEFT JOIN "SpaceMember" sm
            ON sm."spaceId" = s."id"
           AND sm."userId" = ${filters.actorId}
          WHERE s."ownerId" = ${filters.actorId}
             OR sm."userId" IS NOT NULL
          ORDER BY dl."startedAt" DESC
          LIMIT ${limit}
        `
      : await store.prisma.$queryRaw<PrismaDeliveryLogRow[]>`
          SELECT
            "id",
            "briefId" AS brief_id,
            "endpoint",
            "payloadType" AS payload_type,
            "status",
            "attemptCount" AS attempt_count,
            "responseStatus" AS response_status,
            "error",
            "startedAt" AS started_at,
            "finishedAt" AS finished_at
          FROM "DeliveryLog"
          ORDER BY "startedAt" DESC
          LIMIT ${limit}
        `;

    return rows.map(mapPrismaDeliveryLogRow);
  }

  const rows = (
    filters.actorId
      ? store.database
          .prepare(
            `SELECT delivery_logs.*
             FROM delivery_logs
             JOIN briefs ON briefs.id = delivery_logs.brief_id
             JOIN tasks ON tasks.id = briefs.task_id
             JOIN spaces ON spaces.id = tasks.space_id
             LEFT JOIN space_members
               ON space_members.space_id = spaces.id
              AND space_members.user_id = ?
             WHERE spaces.owner_id = ?
                OR space_members.user_id IS NOT NULL
             ORDER BY delivery_logs.started_at DESC
             LIMIT ?`,
          )
          .all(filters.actorId, filters.actorId, limit)
      : store.database
          .prepare(
            `SELECT * FROM delivery_logs
             ORDER BY started_at DESC
             LIMIT ?`,
          )
          .all(limit)
  ) as DeliveryLogRow[];

  return rows.map(mapDeliveryLog);
}

export async function listRecentSyncRuns(
  store: Store,
  limit = 20,
  filters: { actorId?: string } = {},
): Promise<SyncRunRecord[]> {
  if (store.prisma) {
    const rows = await store.prisma.syncRun.findMany({
      where: filters.actorId
        ? {
            source: {
              task: {
                space: {
                  OR: [
                    { ownerId: filters.actorId },
                    { members: { some: { userId: filters.actorId } } },
                  ],
                },
              },
            },
          }
        : undefined,
      orderBy: { startedAt: "desc" },
      take: limit,
    });

    return rows.map(mapPrismaSyncRun);
  }

  const rows = (
    filters.actorId
      ? store.database
          .prepare(
            `SELECT sync_runs.*
             FROM sync_runs
             JOIN sources ON sources.id = sync_runs.source_id
             JOIN tasks ON tasks.id = sources.task_id
             JOIN spaces ON spaces.id = tasks.space_id
             LEFT JOIN space_members
               ON space_members.space_id = spaces.id
              AND space_members.user_id = ?
             WHERE spaces.owner_id = ?
                OR space_members.user_id IS NOT NULL
             ORDER BY sync_runs.started_at DESC
             LIMIT ?`,
          )
          .all(filters.actorId, filters.actorId, limit)
      : store.database
          .prepare(
            `SELECT * FROM sync_runs
             ORDER BY started_at DESC
             LIMIT ?`,
          )
          .all(limit)
  ) as SyncRunRow[];

  return rows.map(mapSyncRun);
}

export async function getSourceHealthSummary(
  store: Store,
  filters: { actorId?: string } = {},
): Promise<SourceHealthSummary> {
  const [sources, nowIso] = await Promise.all([
    listSources(store, filters),
    Promise.resolve(new Date().toISOString()),
  ]);

  return sources.reduce<SourceHealthSummary>(
    (summary, source) => {
      summary.total += 1;

      if (source.status === "success") {
        summary.healthy += 1;
      } else if (source.status === "error") {
        summary.errored += 1;
      } else {
        summary.idle += 1;
      }

      if (source.nextSyncAt && source.nextSyncAt <= nowIso) {
        summary.dueNow += 1;
      }

      return summary;
    },
    {
      total: 0,
      healthy: 0,
      errored: 0,
      idle: 0,
      dueNow: 0,
    },
  );
}

export async function getDeliveryHealthSummary(
  store: Store,
  filters: { actorId?: string } = {},
): Promise<DeliveryHealthSummary> {
  const [logs, webhookSettings, slackSettings, telegramSettings, feishuSettings] = await Promise.all([
    listRecentDeliveryLogs(store, 50, filters),
    getWebhookSettings(store),
    getSlackSettings(store),
    getTelegramSettings(store),
    getFeishuSettings(store),
  ]);

  return logs.reduce<DeliveryHealthSummary>(
    (summary, log) => {
      summary.total += 1;
      summary[log.status] += 1;
      return summary;
    },
    {
      total: 0,
      success: 0,
      error: 0,
      running: 0,
      webhookConfigured: Boolean(webhookSettings.endpoint),
      slackConfigured: Boolean(slackSettings.endpoint),
      telegramConfigured: Boolean(
        telegramSettings.botToken && telegramSettings.chatId,
      ),
      feishuConfigured: Boolean(feishuSettings.endpoint),
    },
  );
}

export async function listSources(
  store: Store = defaultStore,
  filters: { actorId?: string } = {},
): Promise<SourceRecord[]> {
  if (store.prisma) {
    const rows = await store.prisma.source.findMany({
      where: filters.actorId
        ? {
            task: {
              space: {
                OR: [
                  { ownerId: filters.actorId },
                  { members: { some: { userId: filters.actorId } } },
                ],
              },
            },
          }
        : undefined,
      orderBy: { createdAt: "desc" },
    });

    return rows.map(mapPrismaSource);
  }

  const rows = (
    filters.actorId
      ? store.database
          .prepare(
            `SELECT DISTINCT sources.*
             FROM sources
             JOIN tasks ON tasks.id = sources.task_id
             JOIN spaces ON spaces.id = tasks.space_id
             LEFT JOIN space_members
               ON space_members.space_id = spaces.id
              AND space_members.user_id = ?
             WHERE spaces.owner_id = ?
                OR space_members.user_id IS NOT NULL
             ORDER BY sources.created_at DESC`,
          )
          .all(filters.actorId, filters.actorId)
      : store.database
          .prepare("SELECT * FROM sources ORDER BY created_at DESC")
          .all()
  ) as SourceRow[];

  return rows.map(mapSource);
}

export async function getBriefById(
  store: Store,
  briefId: string,
  options: { actorId?: string } = {},
): Promise<BriefRecord | null> {
  if (store.prisma) {
    const row = await store.prisma.brief.findUnique({
      where: { id: briefId },
      include: {
        ...(options.actorId
          ? {
              briefReads: {
                where: { actorId: options.actorId },
                select: { actorId: true },
              },
            }
          : {}),
        task: {
          include: {
            space: true,
          },
        },
      },
    });

    return row ? mapPrismaBrief(row) : null;
  }

  const row = store.database
    .prepare(
      `SELECT
         briefs.id,
         briefs.task_id,
         briefs.title,
         briefs.summary,
         briefs.why_it_matters,
         briefs.source_citations,
         briefs.relevance_score,
         briefs.importance_score,
         briefs.tags_json,
         ${
           options.actorId
             ? "CASE WHEN brief_reads.actor_id IS NULL THEN 0 ELSE 1 END"
             : "briefs.is_read"
         } AS is_read,
         briefs.created_at,
         tasks.title AS task_title,
         spaces.name AS space_name
       FROM briefs
       JOIN tasks ON briefs.task_id = tasks.id
       JOIN spaces ON tasks.space_id = spaces.id
       ${
         options.actorId
           ? "LEFT JOIN brief_reads ON brief_reads.brief_id = briefs.id AND brief_reads.actor_id = ?"
           : ""
       }
       WHERE briefs.id = ?
       LIMIT 1`,
    )
    .get(...(options.actorId ? [options.actorId, briefId] : [briefId])) as
    | BriefRow
    | undefined;

  return row ? mapBrief(row) : null;
}

export async function listBriefItemIds(
  store: Store,
  briefId: string,
): Promise<string[]> {
  if (store.prisma) {
    const rows = await store.prisma.briefItem.findMany({
      where: { briefId },
      select: { itemId: true },
    });

    return rows.map((row) => row.itemId);
  }

  const rows = store.database
    .prepare("SELECT item_id FROM brief_items WHERE brief_id = ?")
    .all(briefId) as Array<{ item_id: string }>;

  return rows.map((row) => row.item_id);
}

export async function briefExistsForItem(
  store: Store,
  itemId: string,
): Promise<boolean> {
  if (store.prisma) {
    const count = await store.prisma.briefItem.count({
      where: { itemId },
    });

    return count > 0;
  }

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
  actorId?: string,
): Promise<void> {
  if (store.prisma) {
    if (actorId) {
      await store.prisma.briefRead.upsert({
        where: {
          briefId_actorId: {
            briefId,
            actorId,
          },
        },
        create: {
          briefId,
          actorId,
        },
        update: {
          readAt: new Date(),
        },
      });
    } else {
      await store.prisma.brief.update({
        where: { id: briefId },
        data: { isRead: true },
      });
    }
    return;
  }

  if (actorId) {
    store.database
      .prepare(
        `INSERT INTO brief_reads (brief_id, actor_id, read_at)
         VALUES (?, ?, ?)
         ON CONFLICT(brief_id, actor_id) DO UPDATE SET read_at = excluded.read_at`,
      )
      .run(briefId, actorId, new Date().toISOString());
    return;
  }

  store.database.prepare("UPDATE briefs SET is_read = 1 WHERE id = ?").run(briefId);
}

export async function markBriefUnread(
  store: Store,
  briefId: string,
  actorId?: string,
): Promise<void> {
  if (store.prisma) {
    if (actorId) {
      await store.prisma.briefRead.deleteMany({
        where: {
          briefId,
          actorId,
        },
      });
    } else {
      await store.prisma.brief.update({
        where: { id: briefId },
        data: { isRead: false },
      });
    }
    return;
  }

  if (actorId) {
    store.database
      .prepare("DELETE FROM brief_reads WHERE brief_id = ? AND actor_id = ?")
      .run(briefId, actorId);
    return;
  }

  store.database.prepare("UPDATE briefs SET is_read = 0 WHERE id = ?").run(briefId);
}

export async function countUnreadBriefs(
  store: Store,
  filters: { actorId?: string } = {},
): Promise<number> {
  if (store.prisma) {
    return store.prisma.brief.count({
      where: {
        ...(filters.actorId
          ? { briefReads: { none: { actorId: filters.actorId } } }
          : { isRead: false }),
        ...(filters.actorId
          ? {
              task: {
                space: {
                  OR: [
                    { ownerId: filters.actorId },
                    { members: { some: { userId: filters.actorId } } },
                  ],
                },
              },
            }
          : {}),
      },
    });
  }

  const row = (
    filters.actorId
      ? store.database
          .prepare(
            `SELECT COUNT(*) AS count
             FROM briefs
             JOIN tasks ON briefs.task_id = tasks.id
             JOIN spaces ON tasks.space_id = spaces.id
             LEFT JOIN space_members
               ON space_members.space_id = spaces.id
              AND space_members.user_id = ?
             LEFT JOIN brief_reads
               ON brief_reads.brief_id = briefs.id
              AND brief_reads.actor_id = ?
             WHERE brief_reads.actor_id IS NULL
               AND (spaces.owner_id = ? OR space_members.user_id IS NOT NULL)`,
          )
          .get(filters.actorId, filters.actorId, filters.actorId)
      : store.database
          .prepare("SELECT COUNT(*) AS count FROM briefs WHERE is_read = 0")
          .get()
  ) as { count: number };

  return row.count;
}

export async function listBriefsFiltered(
  store: Store,
  filters: { taskId?: string; unreadOnly?: boolean; actorId?: string } = {},
): Promise<BriefRecord[]> {
  if (store.prisma) {
    const rows = await store.prisma.brief.findMany({
      where: {
        ...(filters.taskId ? { taskId: filters.taskId } : {}),
        ...(filters.unreadOnly
          ? filters.actorId
            ? { briefReads: { none: { actorId: filters.actorId } } }
            : { isRead: false }
          : {}),
        ...(filters.actorId
          ? {
              task: {
                space: {
                  OR: [
                    { ownerId: filters.actorId },
                    { members: { some: { userId: filters.actorId } } },
                  ],
                },
              },
            }
          : {}),
      },
      orderBy: [
        { importanceScore: "desc" },
        { relevanceScore: "desc" },
        { createdAt: "desc" },
      ],
      include: {
        ...(filters.actorId
          ? {
              briefReads: {
                where: { actorId: filters.actorId },
                select: { actorId: true },
              },
            }
          : {}),
        task: {
          include: {
            space: true,
          },
        },
      },
    });

    return rows.map(mapPrismaBrief);
  }

  const conditions: string[] = [];
  const params: string[] = [];

  if (filters.taskId) {
    conditions.push("briefs.task_id = ?");
    params.push(filters.taskId);
  }
  if (filters.unreadOnly) {
    conditions.push(
      filters.actorId ? "brief_reads.actor_id IS NULL" : "briefs.is_read = 0",
    );
  }
  if (filters.actorId) {
    conditions.push("(spaces.owner_id = ? OR space_members.user_id IS NOT NULL)");
    params.push(filters.actorId);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = store.database
    .prepare(
      `SELECT
         briefs.id,
         briefs.task_id,
         briefs.title,
         briefs.summary,
         briefs.why_it_matters,
         briefs.source_citations,
         briefs.relevance_score,
         briefs.importance_score,
         briefs.tags_json,
         ${
           filters.actorId
             ? "CASE WHEN brief_reads.actor_id IS NULL THEN 0 ELSE 1 END"
             : "briefs.is_read"
         } AS is_read,
         briefs.created_at,
         tasks.title AS task_title,
         spaces.name AS space_name
       FROM briefs
       JOIN tasks ON briefs.task_id = tasks.id
       JOIN spaces ON tasks.space_id = spaces.id
       LEFT JOIN space_members
         ON space_members.space_id = spaces.id
        AND space_members.user_id = ?
       ${
         filters.actorId
           ? "LEFT JOIN brief_reads ON brief_reads.brief_id = briefs.id AND brief_reads.actor_id = ?"
           : ""
       }
       ${where}
       ORDER BY briefs.importance_score DESC, briefs.relevance_score DESC, briefs.created_at DESC`,
    )
    .all(
      ...(filters.actorId ? [filters.actorId, filters.actorId, ...params] : ["", ...params]),
    ) as BriefRow[];

  return rows.map(mapBrief);
}

// --- Slice A + B: delete functions ---

export async function deleteBrief(
  store: Store,
  briefId: string,
): Promise<void> {
  if (store.prisma) {
    await store.prisma.brief.delete({
      where: { id: briefId },
    });
    return;
  }

  store.database.prepare("DELETE FROM briefs WHERE id = ?").run(briefId);
}

export async function deleteSource(
  store: Store,
  sourceId: string,
): Promise<void> {
  if (store.prisma) {
    await store.prisma.source.delete({
      where: { id: sourceId },
    });
    return;
  }

  store.database.prepare("DELETE FROM sources WHERE id = ?").run(sourceId);
}

export async function deleteTask(
  store: Store,
  taskId: string,
): Promise<void> {
  if (store.prisma) {
    await store.prisma.task.delete({
      where: { id: taskId },
    });
    return;
  }

  store.database.prepare("DELETE FROM tasks WHERE id = ?").run(taskId);
}

export async function deleteSpace(
  store: Store,
  spaceId: string,
): Promise<void> {
  if (store.prisma) {
    await store.prisma.space.delete({
      where: { id: spaceId },
    });
    return;
  }

  store.database.prepare("DELETE FROM spaces WHERE id = ?").run(spaceId);
}

// --- AI Task Intent, Profiles, Controls & Grounded Chat thread store helpers ---

export async function getTaskById(
  store: Store,
  taskId: string,
): Promise<TaskRecord | null> {
  if (store.prisma) {
    const row = await store.prisma.task.findUnique({
      where: { id: taskId },
    });

    return row ? mapPrismaTask(row) : null;
  }

  const row = store.database
    .prepare("SELECT * FROM tasks WHERE id = ? LIMIT 1")
    .get(taskId) as TaskRow | undefined;

  return row ? mapTask(row) : null;
}

export async function getTaskProfile(
  store: Store,
  taskId: string,
): Promise<TaskProfile | null> {
  if (store.prisma) {
    const task = await store.prisma.task.findUnique({
      where: { id: taskId },
      select: { taskProfile: true },
    });

    return (task?.taskProfile as TaskProfile | null) ?? null;
  }

  const task = await getTaskById(store, taskId);
  return task ? task.taskProfile ?? null : null;
}

export async function saveTaskProfile(
  store: Store,
  taskId: string,
  profile: TaskProfile,
): Promise<void> {
  if (store.prisma) {
    await store.prisma.task.update({
      where: { id: taskId },
      data: {
        taskProfile: profile as Prisma.InputJsonValue,
      },
    });

    return;
  }

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
  if (store.prisma) {
    await store.prisma.$transaction(async (tx) => {
      await tx.recommendationBundle.deleteMany({
        where: { taskId },
      });

      if (bundles.length === 0) {
        return;
      }

      await tx.recommendationBundle.createMany({
        data: bundles.map((bundle, index) => ({
          id: randomUUID(),
          taskId,
          position: index,
          bundleJson: bundle as Prisma.InputJsonValue,
        })),
      });
    });

    return;
  }

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
  if (store.prisma) {
    const rows = await store.prisma.recommendationBundle.findMany({
      where: { taskId },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    });

    return rows.map((row) => row.bundleJson as RecommendationBundle);
  }

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
  if (store.prisma) {
    await store.prisma.task.update({
      where: { id: taskId },
      data: {
        relevanceLevel,
        summaryPreference,
      },
    });

    return;
  }

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
  if (store.prisma) {
    let thread;

    try {
      thread = await store.prisma.chatThread.upsert({
        where: {
          scopeType_scopeId: {
            scopeType,
            scopeId,
          },
        },
        update: {},
        create: {
          scopeType,
          scopeId,
        },
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2002"
      ) {
        thread = await store.prisma.chatThread.findUnique({
          where: {
            scopeType_scopeId: {
              scopeType,
              scopeId,
            },
          },
        });
      } else {
        throw error;
      }
    }

    if (!thread) {
      throw new Error(
        `Failed to resolve chat thread for ${scopeType}:${scopeId}.`,
      );
    }

    return mapChatThread({
      id: thread.id,
      scope_type: thread.scopeType,
      scope_id: thread.scopeId,
      created_at: thread.createdAt.toISOString(),
    });
  }

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
  if (store.prisma) {
    const existing = await store.prisma.chatThread.findUnique({
      where: {
        scopeType_scopeId: {
          scopeType,
          scopeId,
        },
      },
    });

    return existing
      ? mapChatThread({
          id: existing.id,
          scope_type: existing.scopeType,
          scope_id: existing.scopeId,
          created_at: existing.createdAt.toISOString(),
        })
      : null;
  }

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
  if (store.prisma) {
    const message = await store.prisma.chatMessage.create({
      data: {
        threadId: input.threadId,
        role: input.role,
        content: input.content,
        citations:
          (input.citations as Prisma.InputJsonValue | null | undefined) ?? undefined,
        provenance: input.provenance ?? null,
      },
    });

    return mapChatMessage({
      id: message.id,
      thread_id: message.threadId,
      role: message.role as "user" | "assistant",
      content: message.content,
      citations: message.citations ? JSON.stringify(message.citations) : null,
      provenance: message.provenance as "stored" | "mixed" | null,
      created_at: message.createdAt.toISOString(),
    });
  }

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
  if (store.prisma) {
    const rows = await store.prisma.chatMessage.findMany({
      where: { threadId },
      orderBy: { createdAt: "asc" },
    });

    return rows.map((message) =>
      mapChatMessage({
        id: message.id,
        thread_id: message.threadId,
        role: message.role as "user" | "assistant",
        content: message.content,
        citations: message.citations ? JSON.stringify(message.citations) : null,
        provenance: message.provenance as "stored" | "mixed" | null,
        created_at: message.createdAt.toISOString(),
      }),
    );
  }

  const rows = store.database
    .prepare(
      `SELECT * FROM chat_messages
       WHERE thread_id = ?
       ORDER BY created_at ASC`
    )
    .all(threadId) as ChatMessageRow[];

  return rows.map(mapChatMessage);
}

export async function deleteChatMessagesByThreadId(
  store: Store,
  threadId: string,
): Promise<void> {
  if (store.prisma) {
    await store.prisma.chatMessage.deleteMany({
      where: { threadId },
    });
    return;
  }

  store.database
    .prepare("DELETE FROM chat_messages WHERE thread_id = ?")
    .run(threadId);
}
