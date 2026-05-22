import { cookies, headers } from "next/headers";

import {
  defaultStore,
  getSpaceMembership,
  getSpaceMembershipForTask,
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
const ACTOR_ID_COOKIE = "inflowee_actor_id";
const ACTOR_EMAIL_COOKIE = "inflowee_actor_email";
const ACTOR_ID_HEADER = "x-inflowee-actor-id";
const ACTOR_EMAIL_HEADER = "x-inflowee-actor-email";

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

function getFallbackSessionUser(): SessionUser | null {
  const id = process.env.INFLOWEE_DEFAULT_USER_ID ?? DEFAULT_USER_ID;
  const email = process.env.INFLOWEE_DEFAULT_USER_EMAIL ?? DEFAULT_USER_EMAIL;

  if (!id || !email) {
    return null;
  }

  return { id, email };
}

async function getRequestSessionUser(): Promise<SessionUser | null> {
  try {
    const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
    const id =
      cookieStore.get(ACTOR_ID_COOKIE)?.value ??
      headerStore.get(ACTOR_ID_HEADER) ??
      null;
    const email =
      cookieStore.get(ACTOR_EMAIL_COOKIE)?.value ??
      headerStore.get(ACTOR_EMAIL_HEADER) ??
      null;

    if (!id) {
      return null;
    }

    return {
      id,
      email: email ?? `${id}@inflowee.local`,
    };
  } catch {
    return null;
  }
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
  return (await getRequestSessionUser()) ?? getFallbackSessionUser();
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
