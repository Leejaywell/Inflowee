import {
  defaultStore,
  getSpaceMembership,
  getSpaceMembershipForBrief,
  getSpaceMembershipForTask,
  getTaskBySourceId,
  type SpaceRole,
  type Store,
} from "./store";

export type SessionUser = {
  id: string;
  email: string;
};

export type SessionActor = SessionUser;

const DEFAULT_USER_ID = "local-user";
const DEFAULT_USER_EMAIL = "local@inflowee.dev";

type SpaceAccessInput = {
  actorId: string;
  spaceId: string;
  minimumRole: SpaceRole;
};

type TaskAccessInput = {
  actorId: string;
  taskId: string;
  minimumRole: SpaceRole;
};

type SourceAccessInput = {
  actorId: string;
  sourceId: string;
  minimumRole: SpaceRole;
};

type BriefAccessInput = {
  actorId: string;
  briefId: string;
  minimumRole: SpaceRole;
};

function getFallbackSessionUser(): SessionUser | null {
  const id = process.env.INFLOWEE_DEFAULT_USER_ID ?? DEFAULT_USER_ID;
  const email = process.env.INFLOWEE_DEFAULT_USER_EMAIL ?? DEFAULT_USER_EMAIL;

  if (!id || !email) {
    return null;
  }

  return { id, email };
}

function roleSatisfies(role: SpaceRole, minimumRole: SpaceRole) {
  const rank: Record<SpaceRole, number> = {
    viewer: 0,
    editor: 1,
    owner: 2,
  };

  return rank[role] >= rank[minimumRole];
}

export async function getSessionUser(): Promise<SessionUser | null> {
  return getFallbackSessionUser();
}

export async function requireSessionActor(): Promise<SessionActor> {
  const actor = await getSessionUser();

  if (!actor) {
    throw new Error("Unauthorized");
  }

  return actor;
}

export async function assertSpaceAccess(
  input: SpaceAccessInput,
): Promise<void>;
export async function assertSpaceAccess(
  store: Store,
  input: SpaceAccessInput,
): Promise<void>;
export async function assertSpaceAccess(
  storeOrInput: Store | SpaceAccessInput,
  maybeInput?: SpaceAccessInput,
): Promise<void> {
  const store = maybeInput ? (storeOrInput as Store) : defaultStore;
  const input = maybeInput ?? (storeOrInput as SpaceAccessInput);
  const membership = await getSpaceMembership(store, input.actorId, input.spaceId);

  if (!membership || !roleSatisfies(membership.role, input.minimumRole)) {
    throw new Error("Forbidden");
  }
}

export async function assertTaskAccess(input: TaskAccessInput): Promise<void>;
export async function assertTaskAccess(
  store: Store,
  input: TaskAccessInput,
): Promise<void>;
export async function assertTaskAccess(
  storeOrInput: Store | TaskAccessInput,
  maybeInput?: TaskAccessInput,
): Promise<void> {
  const store = maybeInput ? (storeOrInput as Store) : defaultStore;
  const input = maybeInput ?? (storeOrInput as TaskAccessInput);
  const membership = await getSpaceMembershipForTask(store, input.actorId, input.taskId);

  if (!membership || !roleSatisfies(membership.role, input.minimumRole)) {
    throw new Error("Forbidden");
  }
}

export async function assertSourceAccess(
  input: SourceAccessInput,
): Promise<void>;
export async function assertSourceAccess(
  store: Store,
  input: SourceAccessInput,
): Promise<void>;
export async function assertSourceAccess(
  storeOrInput: Store | SourceAccessInput,
  maybeInput?: SourceAccessInput,
): Promise<void> {
  const store = maybeInput ? (storeOrInput as Store) : defaultStore;
  const input = maybeInput ?? (storeOrInput as SourceAccessInput);
  const task = await getTaskBySourceId(store, input.sourceId);

  if (!task) {
    throw new Error("Forbidden");
  }

  await assertTaskAccess(store, {
    actorId: input.actorId,
    taskId: task.id,
    minimumRole: input.minimumRole,
  });
}

export async function assertBriefAccess(input: BriefAccessInput): Promise<void>;
export async function assertBriefAccess(
  store: Store,
  input: BriefAccessInput,
): Promise<void>;
export async function assertBriefAccess(
  storeOrInput: Store | BriefAccessInput,
  maybeInput?: BriefAccessInput,
): Promise<void> {
  const store = maybeInput ? (storeOrInput as Store) : defaultStore;
  const input = maybeInput ?? (storeOrInput as BriefAccessInput);
  const membership = await getSpaceMembershipForBrief(store, input.actorId, input.briefId);

  if (!membership || !roleSatisfies(membership.role, input.minimumRole)) {
    throw new Error("Forbidden");
  }
}
