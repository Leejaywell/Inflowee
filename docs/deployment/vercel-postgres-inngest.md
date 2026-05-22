# Vercel + Postgres + Inngest Deployment Runbook

## Environment

Set these environment variables in the deployment target:

- `DATABASE_URL`
- `INNGEST_EVENT_KEY`
- `INNGEST_SIGNING_KEY`
- `INNGEST_BASE_URL`

## Deploy Order

1. Provision a PostgreSQL database.
2. Set the environment variables in Vercel.
3. Run `pnpm prisma generate`.
4. Run `pnpm prisma migrate deploy`.
5. Deploy the Next.js app.
6. Register `/api/inngest` with Inngest.
7. Trigger `POST /api/jobs/sync`.

## Smoke Tests

1. Open `/sources` and create a source.
2. Trigger one sync and confirm a sync run appears.
3. Open `/inbox` and confirm a brief renders.
4. Open one brief detail page and send a webhook.
5. Open one task page and confirm grounded chat still responds.
