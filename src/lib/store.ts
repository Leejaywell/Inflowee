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

      CREATE TABLE IF NOT EXISTS sources (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        source_type TEXT NOT NULL CHECK(source_type IN ('RSS')),
        title TEXT NOT NULL,
        url TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'idle' CHECK(status IN ('idle', 'success', 'error')),
        last_synced_at TEXT,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_tasks_space_id ON tasks(space_id);
      CREATE INDEX IF NOT EXISTS idx_sources_task_id ON sources(task_id);
    `);

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
