## Getting Started

Start a local Postgres database and export `DATABASE_URL`, then run the development server:

```bash
export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/inflowee"
pnpm prisma generate
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Local verification

1. Reset the local database with `pnpm db:reset`
2. Seed verification data with `pnpm db:seed`
3. Start the app with `pnpm dev`
4. Open `/` and confirm the seeded space and task render
5. Open `/sources` and confirm the seeded RSS source renders
6. Open `/inbox` and confirm a brief appears
7. Open `/inbox/<briefId>/html` and confirm the HTML digest renders

## Deployment

See [docs/deployment/vercel-postgres-inngest.md](/Users/lee/workspaces/ai/Inflowee/docs/deployment/vercel-postgres-inngest.md) for the cloud deployment runbook and smoke-test checklist.

## Release Verification

- [ ] `pnpm prisma generate`
- [ ] `pnpm test`
- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm build`
- [ ] `pnpm db:seed`
- [ ] `POST /api/jobs/sync`
- [ ] Verify `/inbox`
- [ ] Verify `/settings`
- [ ] Verify `/spaces/[spaceId]/tasks/[taskId]`

## Brief Surface Verification

- Run `pnpm test`
- Run `pnpm lint`
- Run `pnpm build`
- Run `pnpm typecheck`
- Open `/inbox`
- Open `/inbox/<briefId>`
- Ask one question from a task or brief chat console
- Confirm citations render and provenance badges show `Stored context` or `Live context`

## Scheduled Sync Verification

- Run `pnpm test`
- Run `pnpm lint`
- Run `pnpm build`
- Run `pnpm typecheck`
- Start the app with `pnpm dev`
- Open `/sources`
- Change one source cadence and confirm the update persists after refresh
- POST to `/api/jobs/sync`
- Confirm due sources update status and recent run rows appear on `/sources`

## Webhook Delivery Verification

- Run `pnpm test`
- Run `pnpm lint`
- Run `pnpm build`
- Run `pnpm typecheck`
- Start the app with `pnpm dev`
- Open `/settings`
- Save one `https://` webhook endpoint
- Open `/inbox/<briefId>`
- Click `Send webhook`
- Confirm the brief detail page shows a success or failure banner
- Confirm `/settings` shows the recent delivery log row
- Open `/inbox/<briefId>/html` and confirm the delivered digest format matches the route output
