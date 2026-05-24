## Getting Started

Local development uses SQLite by default. Run the development server:

```bash
pnpm prisma generate
pnpm dev
```

The default SQLite database lives at `data/inflowee.sqlite`. Set
`INFLOWEE_SQLITE_PATH` to use a different local file.

Set `DATABASE_URL` only when you explicitly want local development to use
Postgres instead of SQLite.

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Local verification

1. Start the app with `pnpm dev`
2. Open `/` and create a monitoring goal
3. Open `/sources` and add a source for that goal
4. Open `/inbox` after syncing and confirm a brief appears
5. Open `/inbox/<briefId>/html` and confirm the HTML digest renders

## Deployment

See [docs/deployment/vercel-postgres-inngest.md](/Users/lee/workspaces/ai/Inflowee/docs/deployment/vercel-postgres-inngest.md) for the cloud deployment runbook and production smoke tests. Use [docs/deployment/release-checklist.md](/Users/lee/workspaces/ai/Inflowee/docs/deployment/release-checklist.md) for the final release checklist.

## Final Cloud Release Verification

- Run the full release verification suite:

```bash
pnpm test && pnpm lint && pnpm typecheck && pnpm build
```

- [ ] `pnpm prisma generate`
- [ ] `pnpm test && pnpm lint && pnpm typecheck && pnpm build`
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
