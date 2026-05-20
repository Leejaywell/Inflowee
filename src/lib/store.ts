import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type TaskType = "TOPIC" | "QUESTION";

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

const dataDirectory = join(process.cwd(), "data");
mkdirSync(dataDirectory, { recursive: true });

const database = new DatabaseSync(join(dataDirectory, "inflowee.sqlite"));
database.exec(`
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

  CREATE INDEX IF NOT EXISTS idx_tasks_space_id ON tasks(space_id);
`);

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

export function listSpacesWithTasks(): SpaceRecord[] {
  const spaces = database
    .prepare("SELECT * FROM spaces ORDER BY created_at DESC")
    .all() as SpaceRow[];
  const tasks = database
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

export function createSpaceRecord(input: {
  name: string;
  description?: string;
}) {
  const timestamp = new Date().toISOString();

  database
    .prepare(
      `INSERT INTO spaces (id, name, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      randomUUID(),
      input.name,
      input.description ?? null,
      timestamp,
      timestamp,
    );
}

export function createTaskRecord(input: {
  spaceId: string;
  title: string;
  taskType: TaskType;
  userPrompt: string;
}) {
  const timestamp = new Date().toISOString();

  database
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
      randomUUID(),
      input.spaceId,
      input.title,
      input.taskType,
      input.userPrompt,
      3,
      "balanced",
      timestamp,
      timestamp,
    );
}
