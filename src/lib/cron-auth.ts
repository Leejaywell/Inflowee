export function getCronSecret() {
  return process.env.CRON_SECRET ?? process.env.SYNC_API_SECRET ?? null;
}

export function hasValidCronAuthorizationHeader(
  authorizationHeader: string | null,
) {
  const secret = getCronSecret();

  if (!secret) {
    return true;
  }

  return authorizationHeader === `Bearer ${secret}`;
}
