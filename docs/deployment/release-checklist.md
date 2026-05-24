# Release Checklist

1. Set `DATABASE_URL`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `CRON_SECRET`, and `INFLOWEE_SESSION_SECRET`.
2. Configure at least one browser login method:
   - Operator code login: `INFLOWEE_OPERATOR_EMAIL`, `INFLOWEE_OPERATOR_LOGIN_CODE`
   - Google OAuth: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
   - GitHub OAuth: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`
3. Register OAuth callback URLs:
   - Google: `https://<deployment-url>/api/auth/google/callback`
   - GitHub: `https://<deployment-url>/api/auth/github/callback`
4. Run `pnpm prisma generate`.
5. Run `pnpm prisma migrate deploy`.
6. Deploy the app.
7. Register `/api/inngest`.
8. Confirm `/api/health` returns `200` with `ok: true`.
9. Create at least one monitoring goal and one source in the deployed app.
10. Trigger one scheduled sync.
11. Save one `https://` webhook endpoint in `/settings`.
12. Verify inbox, chat, and delivery.
