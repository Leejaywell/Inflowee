import { createHmac, timingSafeEqual } from "node:crypto";

import { headers } from "next/headers";

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
const SESSION_SECRET_ENV = "INFLOWEE_SESSION_SECRET";
const ACTOR_ID_HEADER = "x-inflowee-actor-id";
const ACTOR_EMAIL_HEADER = "x-inflowee-actor-email";
const ACTOR_SIGNATURE_HEADER = "x-inflowee-actor-signature";

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

function getOperatorActor(): SessionActor | null {
  return getFallbackSessionUser();
}

function signActorIdentity(id: string, email: string, secret: string) {
  return createHmac("sha256", secret)
    .update(`${id}:${email}`)
    .digest("hex");
}

function signaturesMatch(expected: string, received: string) {
  const expectedBytes = Buffer.from(expected);
  const receivedBytes = Buffer.from(received);

  if (expectedBytes.length !== receivedBytes.length) {
    return false;
  }

  return timingSafeEqual(expectedBytes, receivedBytes);
}

async function getValidatedRequestActor():
  Promise<SessionActor | null | "invalid"> {
  const secret = process.env[SESSION_SECRET_ENV];

  if (!secret) {
    return null;
  }

  try {
    const headerStore = await headers();
    const id = headerStore.get(ACTOR_ID_HEADER);
    const email = headerStore.get(ACTOR_EMAIL_HEADER);
    const signature = headerStore.get(ACTOR_SIGNATURE_HEADER);

    if (!id && !email && !signature) {
      return null;
    }

    if (!id || !email || !signature) {
      return "invalid";
    }

    const expectedSignature = signActorIdentity(id, email, secret);

    if (!signaturesMatch(expectedSignature, signature)) {
      return "invalid";
    }

    return { id, email };
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
  const requestActor = await getValidatedRequestActor();

  if (requestActor === "invalid") {
    throw new Error("Unauthorized");
  }

  return requestActor ?? getOperatorActor();
}

export async function requireSessionActor(): Promise<SessionActor> {
  const actor = await getSessionUser();

  if (!actor) {
    throw new Error("Unauthorized");
  }

  return actor;
}

export async function requireOperatorSessionActor(): Promise<SessionActor> {
  const actor = await requireSessionActor();
  const operator = getOperatorActor();

  if (!operator || actor.id !== operator.id) {
    throw new Error("Forbidden");
  }

  return actor;
}

export function getActorScopedChatScopeId(actorId: string, scopeId: string) {
  return `${scopeId}:actor:${actorId}`;
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
