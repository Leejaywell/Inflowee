export type SessionUser = {
  id: string;
  email: string;
};

const DEFAULT_USER_ID = "local-user";
const DEFAULT_USER_EMAIL = "local@inflowee.dev";

export async function getSessionUser(): Promise<SessionUser | null> {
  return {
    id: process.env.INFLOWEE_DEFAULT_USER_ID ?? DEFAULT_USER_ID,
    email: process.env.INFLOWEE_DEFAULT_USER_EMAIL ?? DEFAULT_USER_EMAIL,
  };
}
