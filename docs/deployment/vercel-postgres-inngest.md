# Vercel + Postgres + Inngest Deployment Runbook

## Environment

Set these environment variables in the deployment target:

- `DATABASE_URL`
- `INNGEST_EVENT_KEY`
- `INNGEST_SIGNING_KEY`
- `INNGEST_BASE_URL`
- `INFLOWEE_SESSION_SECRET`
- `INFLOWEE_OPERATOR_EMAIL`
- `INFLOWEE_OPERATOR_LOGIN_CODE`

## Deploy Order

1. Provision a PostgreSQL database.
2. Set the environment variables in Vercel.
3. Run `pnpm prisma generate`.
4. Run `pnpm prisma migrate deploy`.
5. Deploy the Next.js app.
6. Register `/api/inngest` with Inngest.
7. Trigger `POST /api/jobs/sync`.

## Final Production Smoke-Test Commands

Run the release verification suite from the repo before the final deploy:

```bash
pnpm test && pnpm lint && pnpm typecheck && pnpm build
```

Trigger one scheduled sync against the deployed app:

```bash
curl -X POST https://<deployment-url>/api/jobs/sync
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
