import { createHmac, timingSafeEqual } from "node:crypto";

import { cookies, headers } from "next/headers";

import {
  defaultStore,
  hasBriefOwner,
  hasSourceOwner,
  hasTopicOwner,
  type Store,
} from "./store";
import {
  ACTOR_EMAIL_HEADER,
  ACTOR_ID_HEADER,
  ACTOR_SIGNATURE_HEADER,
  DEFAULT_USER_EMAIL,
  DEFAULT_USER_ID,
  OPERATOR_EMAIL_ENV,
  OPERATOR_LOGIN_CODE_ENV,
  SESSION_COOKIE_NAME,
  SESSION_SECRET_ENV,
} from "./auth-config";

export type SessionUser = {
  id: string;
  email: string;
};

export type SessionActor = SessionUser;

type TopicAccessInput = {
  actorId: string;
  topicId: string;
  minimumRole?: "viewer" | "editor" | "owner";
};

type SourceAccessInput = {
  actorId: string;
  sourceId: string;
  minimumRole?: "viewer" | "editor" | "owner";
};

type BriefAccessInput = {
  actorId: string;
  briefId: string;
  minimumRole?: "viewer" | "editor" | "owner";
};

function getFallbackSessionUser(): SessionUser | null {
  const explicitId = process.env.INFLOWEE_DEFAULT_USER_ID ?? null;
  const explicitEmail = process.env.INFLOWEE_DEFAULT_USER_EMAIL ?? null;

  if (explicitId && explicitEmail) {
    return { id: explicitId, email: explicitEmail };
  }

  if (process.env.NODE_ENV === "production") {
    return null;
  }

  const id = explicitId ?? DEFAULT_USER_ID;
  const email = explicitEmail ?? DEFAULT_USER_EMAIL;

  if (!id || !email) {
    return null;
  }

  return { id, email };
}

function getOperatorActor(): SessionActor | null {
  return getFallbackSessionUser();
}

function getOperatorEmail() {
  return process.env[OPERATOR_EMAIL_ENV] ?? getFallbackSessionUser()?.email ?? null;
}

export function hasConfiguredSessionAuth() {
  return Boolean(process.env[SESSION_SECRET_ENV]);
}

export function hasConfiguredOperatorLogin() {
  return Boolean(getOperatorEmail() && process.env[OPERATOR_LOGIN_CODE_ENV]);
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

function encodeActorSessionCookieValue(actor: SessionActor, secret: string) {
  return Buffer.from(
    JSON.stringify({
      id: actor.id,
      email: actor.email,
      signature: signActorIdentity(actor.id, actor.email, secret),
    }),
    "utf8",
  ).toString("base64url");
}

export function createSessionCookieValue(actor: SessionActor) {
  const secret = process.env[SESSION_SECRET_ENV];

  if (!secret) {
    throw new Error("Session auth is not configured.");
  }

  return encodeActorSessionCookieValue(actor, secret);
}

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  };
}

function decodeActorSessionCookieValue(value: string, secret: string):
  SessionActor | "invalid" {
  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as {
      id?: unknown;
      email?: unknown;
      signature?: unknown;
    };

    if (
      typeof parsed.id !== "string" ||
      typeof parsed.email !== "string" ||
      typeof parsed.signature !== "string"
    ) {
      return "invalid";
    }

    const expectedSignature = signActorIdentity(parsed.id, parsed.email, secret);

    if (!signaturesMatch(expectedSignature, parsed.signature)) {
      return "invalid";
    }

    return {
      id: parsed.id,
      email: parsed.email,
    };
  } catch {
    return "invalid";
  }
}

async function getCookieSessionActor(
  secret: string,
): Promise<SessionActor | null | "invalid"> {
  const cookieStore = await cookies();
  const value = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!value) {
    return null;
  }

  return decodeActorSessionCookieValue(value, secret);
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
    return "invalid";
  }
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const secret = process.env[SESSION_SECRET_ENV];

  if (!secret) {
    return getOperatorActor();
  }

  const [requestActor, cookieActor] = await Promise.all([
    getValidatedRequestActor(),
    getCookieSessionActor(secret),
  ]);

  if (requestActor === "invalid" || cookieActor === "invalid") {
    throw new Error("Unauthorized");
  }

  return requestActor ?? cookieActor ?? null;
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

export async function setSessionActorCookie(actor: SessionActor) {
  const secret = process.env[SESSION_SECRET_ENV];

  if (!secret) {
    return;
  }

  const cookieStore = await cookies();
  cookieStore.set(
    SESSION_COOKIE_NAME,
    encodeActorSessionCookieValue(actor, secret),
    getSessionCookieOptions(),
  );
}

export async function clearSessionActorCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function createOperatorSessionActor(input: {
  email: string;
  loginCode: string;
}): Promise<SessionActor> {
  const configuredEmail = getOperatorEmail();
  const configuredCode = process.env[OPERATOR_LOGIN_CODE_ENV];
  const normalizedEmail = input.email.trim().toLowerCase();

  if (!configuredEmail || !configuredCode) {
    throw new Error("Operator login is not configured.");
  }

  if (
    normalizedEmail !== configuredEmail.trim().toLowerCase() ||
    input.loginCode !== configuredCode
  ) {
    throw new Error("Invalid login credentials.");
  }

  return {
    id: process.env.INFLOWEE_DEFAULT_USER_ID ?? DEFAULT_USER_ID,
    email: configuredEmail,
  };
}

export function getActorScopedChatScopeId(actorId: string, scopeId: string) {
  return `${scopeId}:actor:${actorId}`;
}

export async function assertTopicAccess(input: TopicAccessInput): Promise<void>;
export async function assertTopicAccess(
  store: Store,
  input: TopicAccessInput,
): Promise<void>;
export async function assertTopicAccess(
  storeOrInput: Store | TopicAccessInput,
  maybeInput?: TopicAccessInput,
): Promise<void> {
  const store = maybeInput ? (storeOrInput as Store) : defaultStore;
  const input = maybeInput ?? (storeOrInput as TopicAccessInput);

  if (!(await hasTopicOwner(store, input.actorId, input.topicId))) {
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

  if (!(await hasSourceOwner(store, input.actorId, input.sourceId))) {
    throw new Error("Forbidden");
  }
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

  if (!(await hasBriefOwner(store, input.actorId, input.briefId))) {
    throw new Error("Forbidden");
  }
}
