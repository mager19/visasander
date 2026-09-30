# Setup

## 1. Neon (database)
1. Create a free project at neon.com. Create a branch `test` for automated tests.
2. Put the main connection string in `.env.local` (`DATABASE_URL`) and the test branch in `.env.test` (`TEST_DATABASE_URL`).
3. `npm run migrate && npm run migrate:test` (expected output: "Applied 7 statements")

## 2. Cloudflare R2 (files)
1. Create a Cloudflare account, then Dashboard → Storage & databases → R2 → enable the R2 subscription (follow the checkout; check whether a payment method is requested).
2. Create a **private** bucket (do not enable public access). Put its name in `R2_BUCKET`.
3. Copy the Account ID into `R2_ACCOUNT_ID`.
4. R2 → Manage API tokens → create a token with Object Read & Write scoped to that bucket → `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`.
5. Bucket → Settings → CORS policy (browsers upload directly with PUT):
```json
[{ "AllowedOrigins": ["http://localhost:3000", "https://YOUR-DOMAIN"], "AllowedMethods": ["PUT"], "AllowedHeaders": ["content-type"], "MaxAgeSeconds": 3600 }]
```
Confirm the current CORS format in the Cloudflare R2 docs if the dashboard rejects it.

## 3. Secrets
- `APP_SECRET`: `openssl rand -base64 48`
- `MANAGER_PASSWORD_HASH`: `npm run hash-password -- "your password"`
- `CRON_SECRET`: any long random string
- `APP_URL`: public URL (used to build applicant links)
- `NEXT_PUBLIC_MANAGER_PATH`: defaults to `gestor`; changing it requires a rebuild.
- `RETENTION_DAYS`: 90 (or 60)

## 4. Vercel
Import the repo, add every variable from `.env.example` in Project Settings → Environment Variables, deploy. `vercel.json` schedules the daily purge; Vercel sends `Authorization: Bearer $CRON_SECRET` automatically when `CRON_SECRET` is set.

## 5. Checks
- `npm test` (set `TEST_DATABASE_URL` to include integration tests)
- `npm run e2e` (needs `.env.local` with working Neon + R2 dev credentials and `E2E_MANAGER_PASSWORD` equal to the password hashed above)

## 6. Security notes
- The manager login and applicant access rate limits key on the `x-forwarded-for` header. Vercel sets and overwrites it, so clients cannot spoof it. If you deploy elsewhere, put the app behind a proxy that also sets and overwrites this header.
- `APP_URL` must be set in production (public origin, no trailing slash) because applicant links are built from it.
- `npm run migrate` should print "Applied 7 statements".
- Retention defaults to 90 days (`RETENTION_DAYS`; 60 is also allowed). The purge cron runs daily at 07:00 UTC (`0 7 * * *` in `vercel.json`) and deletes expired rows together with their R2 objects.
