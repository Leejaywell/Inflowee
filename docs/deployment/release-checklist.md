# Release Checklist

1. Set `DATABASE_URL`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `INNGEST_BASE_URL`, `CRON_SECRET`, `INFLOWEE_SESSION_SECRET`, `INFLOWEE_OPERATOR_EMAIL`, and `INFLOWEE_OPERATOR_LOGIN_CODE`.
2. Run `pnpm prisma generate`.
3. Run `pnpm prisma migrate deploy`.
4. Deploy the app.
5. Register `/api/inngest`.
6. Confirm `/api/health` returns `200` with `ok: true`.
7. Create at least one space, one task, and one source in the deployed app.
8. Trigger one scheduled sync.
9. Save one `https://` webhook endpoint in `/settings`.
10. Verify inbox, chat, and delivery.
