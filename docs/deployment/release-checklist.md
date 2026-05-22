# Release Checklist

1. Set `DATABASE_URL`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, and `INNGEST_BASE_URL`.
2. Run `pnpm prisma generate`.
3. Run `pnpm prisma migrate deploy`.
4. Deploy the app.
5. Register `/api/inngest`.
6. Trigger one scheduled sync.
7. Verify inbox, chat, and delivery.
