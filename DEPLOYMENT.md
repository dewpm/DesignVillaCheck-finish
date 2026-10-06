# Vercel + PostgreSQL (Neon)

The website and API run together on https://design-villacheck.vercel.app. `api/index.js` runs the existing Backend as a Vercel Node.js Function. `vercel.json` routes `/api` to that function. No Render service or persistent local disk is needed for this deployment.

## 1. Create the online database

In Vercel, open the `design-villacheck` project → Storage → Create Database → Neon / PostgreSQL. Review the provider's plan before creating the database and connect it to this project. Use a separate database/branch for preview deployments if enabled.

The Backend reads `DATABASE_URL`, or `VillaCheck_DATABASE_URL` when the Neon integration uses the VillaCheck prefix. If the integration adds another name such as `POSTGRES_URL`, copy its PostgreSQL pooled connection URL to a new `DATABASE_URL` environment variable. Use the provider's TLS-enabled connection URL. Do not paste it into frontend code or commit it.

## 2. Configure the production Backend

In Vercel → Settings → Environment Variables, add these values for Production:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Secret PostgreSQL connection URL supplied by Neon |
| `APP_URL` | `https://design-villacheck.vercel.app` (no trailing slash) |
| `ADMIN_EMAIL` | Your real administrator email |
| `ADMIN_PASSWORD` | A new password with at least 12 characters |
| `GOOGLE_CLIENT_ID` | Google OAuth Web application's client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |

The function always disables demo account seeding. It creates the schema and initial Admin account on first startup. Existing Admin passwords are not overwritten when environment variables change. Users and Merchants register through the website. Local SQLite accounts/data are not automatically imported, and the local SQLite file remains intact.

Set Node.js to 24.x in Vercel if project settings override `package.json`. Keep the Vite build command `npm run build` and output directory `dist`. After code and environment changes, redeploy the project.

## 3. Configure Google OAuth

In Google Auth Platform → Clients → your Web application, add this Authorized redirect URI:

```
https://design-villacheck.vercel.app/api/auth/oauth/google/callback
```

Keep `http://localhost:3001/api/auth/oauth/google/callback` for local testing. Add the tester emails in Google's Audience settings if the consent screen is in testing mode. Secrets belong only in Backend environment variables, never variables starting with `VITE_`.

## 4. Verify the deployment

1. Open `https://design-villacheck.vercel.app/api/health`; a configured Backend returns `{"ok":true}`. A 503 means database/Admin configuration must be completed; inspect Vercel function logs.
2. Register a User with email/password, then test Google login with a different email.
3. Log in as Admin using the production credentials from step 2.
4. Register a Merchant, select a package, upload a Villa's ownership document, approve as Admin, and test the QR. Basic activates a free 3-month trial; paid plans still require payment proof and Admin confirmation.
5. Share the Vercel website link with testers.

## Email and payments

Add `PAYMENT_INSTRUCTIONS` and the SMTP settings from `.env.example` to enable proof uploads and automatic approval emails. Vercel uses `waitUntil` for outbox delivery after API requests. Failed deliveries remain in PostgreSQL and are retried on later API requests (or Admin retry); an idle site has no continuously running worker. Configure scheduled delivery separately if retries must run while the site is idle. Lease-based claiming prevents two workers from sending the same mail at the same time, but a crash after SMTP accepts a message may still cause a duplicate retry.

Documents and payment proofs are stored as PostgreSQL `BYTEA`, with the existing 2 MB upload limit. QR references, subscriptions, sessions, and invoices persist across deployments. Backups and retention use your PostgreSQL provider's settings.

## Local development and tests

Keep `.env` `APP_URL=http://localhost:3001`. A blank `DATABASE_URL` continues using local SQLite; filling it connects to PostgreSQL. Do not enable demo accounts against the production database.

`npm run test:backend` runs SQLite regression tests. With `TEST_DATABASE_URL` set, the subscription, User/OAuth, and PostgreSQL tests run in isolated disposable PostgreSQL schemas; they never truncate existing tables. The SQLite persistence tests continue testing the local fallback.

`render.yaml`, `Dockerfile`, and `scripts/configure-vercel.mjs` remain an optional legacy path for hosting SQLite on a separate server. Do not run that script for the Vercel/PostgreSQL deployment; it replaces the native API rewrite with an external Backend rewrite.
