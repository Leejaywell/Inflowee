# Vercel + Postgres + Inngest Deployment Runbook

## Environment

Set these environment variables in the deployment target:

- `DATABASE_URL`
- `INNGEST_EVENT_KEY`
- `INNGEST_SIGNING_KEY`
- `CRON_SECRET`
- `INFLOWEE_SESSION_SECRET`
- `INFLOWEE_OPERATOR_EMAIL`
- `INFLOWEE_OPERATOR_LOGIN_CODE`

`INNGEST_BASE_URL` is optional and is only needed when pointing a local app at a
local Inngest dev server.

## Deploy Order

1. Provision a PostgreSQL database.
2. Set the environment variables in Vercel.
3. Run `pnpm prisma generate`.
4. Run `pnpm prisma migrate deploy`.
5. Deploy the Next.js app.
6. Register `/api/inngest` with Inngest.
7. Trigger `POST /api/jobs/sync`.
8. Confirm `GET /api/health` returns `200` and `ok: true`.

## Cron note

The checked-in `vercel.json` uses a **daily** cron schedule (`0 0 * * *`) so the project can deploy on a Vercel Hobby account. If the project moves to Pro, the schedule can be tightened without changing the route contract.

## Prisma on Vercel

This project pins `pnpm@10` and runs Prisma through the app's `prebuild` hook. In Vercel builds, the hook executes `prisma migrate deploy` and `prisma generate`; outside Vercel it only runs `prisma generate`. That avoids relying on dependency lifecycle scripts that Vercel's pnpm sandbox may ignore during install, while still keeping local builds free from production-only migration side effects.

## Final Production Smoke-Test Commands

Run the release verification suite from the repo before the final deploy:

```bash
pnpm test && pnpm lint && pnpm typecheck && pnpm build
```

Trigger one scheduled sync against the deployed app:

```bash
curl -X POST https://<deployment-url>/api/jobs/sync \
  -H "Authorization: Bearer $CRON_SECRET"
```

Verify release health:

```bash
curl https://<deployment-url>/api/health
```

## Smoke Tests

1. Create at least one space and one task in the deployed app.
2. Open `/sources` for that task and create a source.
3. Trigger one sync and confirm a sync run appears.
4. Open `/inbox` and confirm a brief renders.
5. Open `/settings`, save one `https://` webhook endpoint, and confirm the Slack payload preview still renders.
6. Open one brief detail page and confirm the HTML digest renders at `/inbox/<briefId>/html`.
7. Send one webhook from the brief detail page and confirm the success or failure banner appears.
8. Open `/settings` and confirm the recent delivery log row appears.
9. Open one task page and confirm grounded chat still responds.
