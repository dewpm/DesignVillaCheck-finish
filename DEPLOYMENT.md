# VillaCheck deployment — Next.js / NestJS / Prisma

The current application uses **Next.js 16 + React/TypeScript**, **NestJS 12/TypeScript**, **Prisma ORM 7**, and **PostgreSQL**. Vite is no longer the runtime. Next serves the website and forwards `/api/...` through its API route into Nest in the same Vercel function. Nest can also run as a standalone backend on port 3001.

Existing domain services in `server/*.mjs` are reused by a typed Nest DomainService compatibility layer. Production DB queries and atomic transactions run through Prisma; public package reads use the generated typed Prisma model. The compatibility adapter parameterizes legacy SQL and preserves private documents, cookies/CSRF, payment deduplication and persistent Villa QR. Not every legacy business function has been rewritten to TypeScript or individual Nest modules; there is only one implementation of each existing workflow.

## Run locally

1. `npm ci`
2. Set `DATABASE_URL` to PostgreSQL in `.env` (Neon's `VillaCheck_DATABASE_URL` alias also works). Nest requires PostgreSQL; SQLite is retained only for legacy/unit test fixtures.
3. `npm run db:deploy` generates Prisma Client, compiles Nest and safely deploys migrations.
4. `npm run dev` starts Next on `$PORT` or 8443 and watches the Nest TypeScript build. Restart the old Vite development process first if it still owns that port.
5. Open `http://localhost:8443` and use the existing hash links (`/#page=login`, `/#page=admin-dashboard`). Use `APP_URL=http://localhost:8443` for same-origin local OAuth; register its `/api/auth/oauth/google/callback` or Facebook callback with the provider if testing locally.

`npm run backend` runs Nest separately on BACKEND_PORT (default 3001). The integrated Next app does not require that separate process. Production start: `npm run build`, then `npm start`.

## Database migration and compatibility

`prisma/schema.prisma` was introspected from the existing PostgreSQL schema (15 models), preserving table/column names, foreign keys and partial unique indexes. SQL CHECK constraints remain explicitly preserved in migration SQL because Prisma does not model them fully. No enum conversion or destructive table rename was performed.

- `0001_legacy_baseline` represents the already deployed schema.
- `0002_business_requirements` adds the business/payment/catalog/profile fields and tables.
- `scripts/deploy-db.mjs` checks for existing VillaCheck tables. An existing schema without Prisma history is baselined by marking only 0001 applied, then 0002 is deployed. Empty databases get both migrations. A database that does not match the baseline table set is rejected.
- Repeated deploys do not reset or recreate records. No `prisma db push` or `migrate reset` is used. The historical migration files must not be modified after deployment.
- The migration was tested with an empty database, a populated legacy database retaining its exact Villa QR, and repeat deploys. Production Neon was not modified during this task.

## Vercel

Framework preset: **Next.js**. Install: `npm ci`. Build: `npm run build`. Remove any dashboard override that still sets output directory to `dist`; use Next's default output. Keep Node.js 24.x. `vercel.json` now uses Next configuration, and `pages/api/[...route].ts` replaces the old raw Vercel function.

Build generates Prisma Client, compiles Nest, then runs the safe migration script when DATABASE_URL is configured, before building Next. Confirm the target database and back it up before the first production deployment; a Preview database is preferred for the first deploy. The existing Neon prefix is supported. Production must have APP_URL with HTTPS, initial ADMIN_EMAIL/ADMIN_PASSWORD (12+ characters), database URL and any enabled OAuth/SMTP credentials.

Use `NEXT_PUBLIC_SUPPORT_EMAIL`, `NEXT_PUBLIC_SUPPORT_PHONE`, `NEXT_PUBLIC_FACEBOOK_URL`, `NEXT_PUBLIC_INSTAGRAM_URL` for public contact values. Existing VITE_* contact values are explicitly mapped in next.config.mjs for deployment compatibility. Never put SMTP passwords, database URLs or OAuth secrets into NEXT_PUBLIC_. Existing private environment variable names and OAuth callback paths are unchanged.

### Prisma P1002 during the Vercel build

`Timed out trying to acquire a postgres advisory lock` means the database was reached, but another session holds the migration lock. Prisma waits 10 seconds per attempt. The deployment script retries only this error, up to 12 attempts with 5 seconds between attempts (about 3 minutes). Set `MIGRATION_LOCK_MAX_ATTEMPTS` to an integer from 1 to 60 to change the retry count. Other migration errors fail immediately; locking stays enabled.

Set `DIRECT_URL` in the appropriate Vercel environment to the provider's direct, non-pooled PostgreSQL URL. The runtime can keep its pooled `DATABASE_URL`. The script also supports `DATABASE_URL_UNPOOLED`, `VillaCheck_DATABASE_URL_UNPOOLED`, and `VillaCheck_POSTGRES_URL_NON_POOLING`, and removes Neon's `-pooler` hostname suffix as a fallback. Redeploy after changing environment variables, and cancel redundant deployments targeting the same database.

If the lock persists, run this read-only query in the database provider's SQL console to identify its holder:

```sql
SELECT a.pid, a.application_name, a.state, a.query_start, a.query
FROM pg_locks AS l
JOIN pg_stat_activity AS a ON a.pid = l.pid
WHERE l.locktype = 'advisory' AND l.classid = 0
  AND l.objid = 72707369 AND l.objsubid = 1 AND l.granted
  AND a.datname = current_database();
```

Let an active migration finish. If the holder is a confirmed abandoned deployment session, a database administrator can terminate that specific session before retrying. Do not terminate all database connections or disable Prisma advisory locking to bypass contention. The script does not force-release locks or reset the database.

## Migration files and checks

New runtime files: `app/layout.tsx`, `app/page.tsx`, `pages/api/[...route].ts`, `backend/app.module.ts`, `backend/bootstrap.ts`, `backend/main.ts`, `backend/domain.service.ts`, `backend/prisma.service.ts`, `backend/package.service.ts`, `prisma.config.ts`, `prisma/schema.prisma`, `prisma/migrations/*`, `next.config.mjs`, `postcss.config.mjs`, `tsconfig.backend.json`, `eslint.config.mjs`, `scripts/dev.mjs`, `scripts/build-backend.mjs`, `scripts/deploy-db.mjs` and Nest/Next integration tests.

The old Vercel function is retained as `server/legacy-vercel.mjs` only for regression tests. The obsolete Vite shell/config/entrypoint were removed; Next app/layout.tsx and app/page.tsx are the new entrypoints. Docker/Render's optional backend deployment now runs the compiled Nest entrypoint and uses PostgreSQL.

Validation: `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:backend`. For full PostgreSQL + Nest + production Next tests, build first, then supply TEST_DATABASE_URL to `npm run test:backend`; fixtures create/drop isolated schemas. Without TEST_DATABASE_URL those integration tests skip. Legacy domain tests can still use in-memory SQLite.

References used: [Next client-side lazy loading](https://nextjs.org/docs/app/guides/lazy-loading), [Nest serverless integration](https://docs.nestjs.com/faq/serverless), [Prisma ORM 7 migration guide](https://docs.prisma.io/docs/orm/v6/more/upgrades/to-v7).

---

The business workflow details below describe the preserved application behavior; stack migration notes above take precedence over older runtime descriptions.

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

The Nest runtime disables demo account seeding. It creates the schema and initial Admin account on first startup. Existing Admin passwords are not overwritten when environment variables change. Users and Merchants register through the website. Local SQLite accounts/data are not automatically imported, and the local SQLite file remains intact.

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

## Payment verification (Phase 1)

The existing invoice is the payment request; no second payment table is introduced. Runtime remains React/Vite + Node.js + PostgreSQL (SQLite locally), not NestJS/Prisma. Both databases apply additive, idempotent migrations at startup without discarding existing invoices.

Set `PAYMENT_VERIFICATION_MODE=MANUAL` on Vercel and redeploy. `AUTO` currently safely falls back to manual review; it never approves or rejects a payment automatically. Admin approval of a Villa creates its package invoice; Basic trial remains free. Paid package QR activation requires payment verification. Initial validity is three calendar months; renewal is one month.

Payment endpoints (all under `/api`, authenticated session required):

- `GET /admin/payments?status=PENDING_REVIEW` — Admin-only list.
- `GET /admin/payments/:id` — Admin-only details, private authenticated slip link.
- `PATCH /admin/payments/:id/approve` — Admin-only; optional `externalTransactionId` is the bank transaction number checked by Admin (otherwise uses the submitted reference).
- `PATCH /admin/payments/:id/reject` — Admin-only; JSON `{ "reason": "..." }`.
- `POST /payments/:id/slip` — Merchant owns invoice; JSON `{ "reference": "...", "document": { "name": "slip.png", "type": "image/png", "data": "data:image/png;base64,..." } }`, maximum 2 MB decoded file.
- `GET /payments/:id/status` — owning Merchant or Admin.

Mutations require the existing CSRF header and same-origin session. Existing `/invoices/:id/proof|confirm|reject` APIs remain compatible with the current UI. Payment states are WAITING_FOR_SLIP → PENDING_REVIEW → VERIFIED, or REJECTED → resubmit → PENDING_REVIEW. Legacy invoice statuses remain for compatibility. VERIFIED, subscription activation and each approved Villa's unique QR are committed together; repeat approval never adds validity twice. Verified bank transaction IDs have a unique index across invoices. Manual Admin must check the actual bank transaction; an image or merchant-entered reference alone is not evidence.

New invoice fields: payment_status, verification_mode, currency (THB), external_transaction_id (unique), external_provider, updated_at. Existing paid_at, confirmed_by, proof_id, reference and reason provide verifiedAt, verifiedByAdminId, slipUrl and rejectionReason without duplicate data storage.

Future integration goes into AutoPaymentVerificationStrategy in server/payment-verification.mjs, using the contract in payment-verification.d.ts. TODO: implement a provider that verifies authentic transaction, recipient, exact amount/currency; execute provider calls outside DB transactions with bounded timeout; atomically consume transaction ID and call confirmPayment only after rechecking current invoice status. Do not enable automatic activation until those checks and provider-specific integration tests exist. Provider errors must remain PENDING_REVIEW. The database-backed Admin toggle and payment-page QR are implemented in the business update below. NestJS/Prisma migration is complete. Bank-native expiring payment QR remains outstanding; the current QR opens the payment page. Current review controls remain in the existing Admin Villa/payment panel.

## Business requirement update — implementation report

### Architecture and migration

Current runtime: React 19 + Vite + TypeScript frontend; Node.js 24 HTTP backend with service modules; PostgreSQL through `pg` in Vercel; SQLite for local fallback. This repository has no Next.js, NestJS, Prisma schema or Prisma migrations. No shadow Prisma model has been created. Adopting that requested stack is a separate unresolved migration decision; this implementation continues the existing system.

Migrations are additive/idempotent: `business-schema.sql` creates `package_catalog`, `system_settings`, `leads`, `payment_qrs`; `database.mjs` applies SQLite additions; `postgres-schema.sql`/`postgres.mjs` apply PostgreSQL additions. Existing users, villas, subscriptions, invoices, private documents, audit events and mail outbox are reused. Package seeds use ON CONFLICT DO NOTHING, so restarts never overwrite Admin edits. Existing users become typed registration leads. Existing invoices retain their amount snapshots after package prices change.

Internal `owner_id`, `subscription_owner`, legacy `owner-*` route IDs and Owner-named React exports remain for compatibility. Business role/UI text uses Merchant. Existing links/session package intent remain usable. No production database migration was executed by this task.

### Phase A: terminology, leads and dynamic packages

- Pricing and Merchant subscription choices query `/api/packages`; active packages refresh periodically. Prices/features/capacity/trial/entitlements come from the database.
- Admin creates/edits packages, toggles active state, sorts packages, edits descriptions/features/prices/capacity/trial/max verification/banner. A capacity reduction below current usage is rejected.
- Registered Users/Merchants become USER/MERCHANT leads. Public Contact captures typed leads with `CONTACT` source. Admin filters/searches and updates status/notes.
- Currency/billing cycle currently support THB/MONTHLY only, consistent with monthly renewal; alternative billing cycles are not implemented.

### Phase B: documents, payment attempts and review

Pricing → select package → Merchant registration/login → Merchant Information → add Villa and ownership document → Admin review (approve/change/reject). Document states are exposed as PENDING_REVIEW, APPROVED, CHANGE_REQUESTED, REJECTED; existing internal statuses remain. Admin can record actual verification level within package entitlement. Additional DRAFT/SUBMITTED/UNDER_REVIEW/SUSPENDED document workflow states remain outstanding.

Configured trial applies to any package: first approved Villa activates subscription for its configured trialMonths without an invoice/payment QR. Paid approval creates one shared Merchant invoice, a separate payment attempt and queued payment email. Merchant uploads a private PDF/JPEG/PNG slip, Admin approves/rejects with reason; rejected slips may be resubmitted. Verified transaction ID is globally unique. Approval atomically marks payment verified, activates subscription and the approved Villas' unique QR identities. Repeat approval is idempotent. Suspended/cancelled subscriptions cannot silently reactivate through payment approval.

### Payment QR limitation — read before production use

`payment_qrs` is a separate model with generatedAt/expiresAt and ACTIVE/PAID/EXPIRED/CANCELLED states. Expiry is exactly three hours, enforced by the backend; regeneration cancels the previous active attempt. The current QR **opens an authenticated VillaCheck payment page**, where bank instructions and slip upload are shown. It is explicitly labelled PAYMENT_PAGE; it is **not a bank-app PromptPay payment payload**. An expired/cancelled payment-page link is rejected by `/api/payments/attempt`. The system cannot prevent someone independently transferring money from their bank app.

A bank-native QR with enforceable financial expiry requires a payment provider supporting expiry/cancellation. Provider/merchant credentials are still needed; do not claim the existing QR can be paid directly in a bank app. The email includes a QR SVG attachment, merchant/Villa/package/amount, expiry, instructions and upload link. An expired email QR is not reactivated; regenerate in the Merchant payment panel. Email delivery still requires valid SMTP settings; real delivery was not performed during automated tests.

### Phase C: subscription and Villa QR

One Villa has one unique persistent verification QR. Renewals never change it. Trial defaults: Basic three months; first paid activation retains existing three-month validity; subsequent renewal adds one month. Subscription DTO reports ACTIVE, PENDING_RENEWAL, EXPIRED, SUSPENDED or CANCELLED; explicit suspension/cancellation is persisted, date expiry is computed server-side. QR DTO reports PENDING, ACTIVE, EXPIRED, SUSPENDED or INACTIVE from documents + subscription.

Guest API omits full phone, account name/number and bank details and returns masked placeholders. Only an authenticated User receives those contact fields. Public Directory and homepage showcase now query real approved Villa records; approved-but-expired Villas show expired status. Profiles show uploaded photo URL, actual verification level, Merchant, province and a Google Maps search link. Manual QR text input has been removed; camera/image scanning remains. Fixture-only design pages still exist internally and are not used by the live Directory.

### Phase D: actual level, banner and Auto preparation

Package max-level is distinct from Admin-assigned actual level. Pending/expired/suspended Villas show REGISTERED rather than a paid-package badge. A banner requires package entitlement + document approval + active subscription. Buying Premium does not set actual PREMIUM_VERIFIED.

`system_settings.payment_verification_mode` overrides `PAYMENT_VERIFICATION_MODE`. Admin can toggle AUTO/MANUAL. AUTO has no external provider connected and safely stays PENDING_REVIEW. Strategy contract lives in `payment-verification.d.ts`; placeholder implements bounded timeout/error fallback. Future integration must validate authentic bank transaction, recipient, amount/currency and duplicate ID outside DB transactions, then atomically call `confirmPayment` after rechecking invoice status.

### API inventory

Existing auth/session/CSRF/ownership checks remain; role guards are native backend guards rather than NestJS decorators.

| Method | Path under /api | Access |
| --- | --- | --- |
| GET | /packages | Public, active catalog |
| POST | /leads | Public typed contact lead, rate limited |
| GET | /public/villas | Public safe Directory data |
| GET | /public/qr/:code | Guest masked, User contact access |
| GET, POST/PATCH | /merchant/profile | Merchant only |
| GET, POST | /admin/packages | Admin list/create |
| POST/PATCH | /admin/packages/:id | Admin edit |
| GET | /admin/leads?type=&search= | Admin |
| POST/PATCH | /admin/leads/:id | Admin status/notes |
| GET, POST/PATCH | /admin/settings | Admin mode toggle |
| GET | /admin/subscriptions | Admin |
| POST/PATCH | /admin/subscriptions/:merchantId | Admin suspend/cancel/resume |
| GET | /admin/payments?status= | Admin |
| GET | /admin/payments/:id | Admin |
| PATCH | /admin/payments/:id/approve, /reject | Admin |
| POST | /payments/:id/slip | Owning Merchant |
| GET | /payments/:id/status | Owning Merchant/Admin |
| POST | /payments/:id/qr | Owning Merchant, unpaid only |
| GET | /payments/attempt?id= | Owning Merchant/Admin, active attempt only |

Legacy `/subscription`, `/villas`, `/villas/:id/review|resubmit|renew`, `/invoices/:id/proof|confirm|reject`, `/documents/:id`, `/state`, `/mails/:id/retry`, `/admin/users` remain compatible. Mutations require session/CSRF; uploads are validated and limited to 2 MB decoded size.

### Files

New services/schema/tests: `server/catalog.mjs`, `server/admin-business.mjs`, `server/business-schema.sql`, `server/payment-qr.mjs`, `server/payment-service.mjs`, `server/payment-verification.mjs`, `server/payment-verification.d.ts`, `server/payment-verification.test.mjs`, `server/business.test.mjs`.

New frontend: `src/AdminBusiness.tsx`, `src/PaymentQr.tsx`, `src/MerchantProfile.tsx`, `src/ContactLead.tsx`.

Updated: `server/app.mjs`, `server/database.mjs`, `server/index.mjs`, `server/postgres.mjs`, `server/postgres-schema.sql`, `server/subscriptions.mjs`, `server/mail.mjs`, `server/subscriptions.test.mjs`, `src/App.tsx`, `src/Backoffice.tsx`, `src/SubscriptionPanel.tsx`, `src/packagePlans.ts`, `src/merchantStore.ts`, `src/navigation.ts`, `src/prototype.tsx`, `.env.example`, package/lock files and this deployment guide. Existing contact email edits in `src/support.ts` are retained.

### Run, test and outstanding work

- Install: `npm ci`; backend: `npm run backend`; frontend: `npm run dev` (use existing dev server if already running).
- Local validation: `npm run test:backend`, `npx tsc --noEmit`, `npm run build`, `git diff --check`.
- PostgreSQL validation: supply TEST_DATABASE_URL pointing to an isolated test-capable PostgreSQL, then `npm run test:backend`; test fixtures create/drop their own random schema. Never point this at a shared restricted database without permission to create test schemas.
- No dedicated lint script exists. Backend changed files were formatted with oxfmt and checked for JavaScript syntax; TypeScript is checked by tsc. Build has a pre-existing Vite native-loader warning.
- New environment config: PAYMENT_VERIFICATION_MODE=MANUAL (database Admin setting overrides it). APP_URL/SMTP/PAYMENT_INSTRUCTIONS remain required for real payment emails/instructions. No secret uses VITE_ prefixes.
- Outstanding: bank-native expiring payment provider, real SMTP/browser OAuth smoke tests, NestJS/Prisma migration decision, non-monthly billing, extended document workflow states, full browser interaction verification. Google Maps currently uses name/province search; exact coordinates need a location data form.
- Changes are local; GitHub push and Vercel redeploy have not been performed. Take a production DB backup before deploying the additive schema changes and test on Preview first.

Validation for this update: PostgreSQL integration run passed **38/38 tests**, including the new business workflow tests and existing auth/OAuth/payment/rollback tests. `npx tsc --noEmit`, `npm run build`, JavaScript syntax checks and `git diff --check` passed. No dedicated lint command is configured. No browser consent/login or real SMTP delivery was exercised. `public/villa-placeholder.svg` is the new neutral image fallback; actual Villa photos use the Merchant-provided HTTPS URL. Legacy subscription.payments is an activation counter that includes the trial and is preserved for backward compatibility; it is not a financial transaction count.

Stack migration validation: lint, frontend/backend typecheck and Next production build passed. PostgreSQL regression suite passed **41/41**, including real Next → Nest → Prisma HTTP requests, safe migration of a populated legacy schema and repeated deployment preserving the original Villa QR. npm dependency audit after compatible overrides reported 0 vulnerabilities. That stack-migration check preceded deployment. The current repository has since been pushed and deployed to Vercel with Neon migrations and dummy seeding.

## Dummy database for development and Vercel testing

`npm run db:local` starts a persistent PostgreSQL instance bound only to 127.0.0.1:54329, creates villacheck_dummy, updates local DATABASE_URL, applies migrations and seeds twelve labelled dummy Villas (ten public and two private review examples). Keep that process running while using `npm run dev`. Restart with the same command to reuse the data. Local login details are stored in ignored `server/data/demo-accounts.json` (mode 0600). This file and local database credentials are never committed or deployed.

Dummy seed includes Merchant/User accounts, active/pending/change-requested/expired Villas, ownership PDFs and stable Villa QR codes. Bank details clearly say dummy; no invoice or mail is created. Seed is idempotent and does not reset existing account passwords or regenerate Villa QR values.

For Vercel use the online Neon database, not the localhost DATABASE_URL. Set DATABASE_URL or keep VillaCheck_DATABASE_URL in Vercel; never upload the local .env to Vercel. To seed Neon, put its connection URL in local .env, set a strong DEMO_PASSWORD (12+ characters), then run `npm run db:deploy` and `npm run db:seed`. Public/cloud seeding requires DEMO_PASSWORD and creates only dummy Merchant/User accounts, not a public dummy Admin; use the configured real Admin account. Current Vercel builds seed dummy data idempotently unless SEED_PUBLIC_DEMO_DATA=false; existing decisions, passwords and Villa QR values are preserved. Remove dummy records before accepting real production registrations.

## Public dummy photo deployment

For the requested demonstration deployment, Vercel build explicitly seeds the labelled sample Villas after migrations via scripts/seed-public-demo.mjs. Set SEED_PUBLIC_DEMO_DATA=false to disable this before real production use. Rebuilds do not reset QR identities, user passwords or edited photos. A random unlogged password is used unless DEMO_PASSWORD is explicitly configured; there is no public demo Admin account. No payment/email records are generated by this seed.

Six sample Villas use three locally bundled illustration photos from the existing project's Unsplash sources: photo-1520250497591-112f2f40a3f4, photo-1514803400321-3ca29fc47334, photo-1555426104-3a03a4e70b1d. Files are public/demo/villas/villa-1.jpg through villa-3.jpg; these are illustrative photos, not proof of ownership or actual Villa photographs. Photos already edited in the database are preserved.

Demo catalog expansion: 12 stored sample Villas, with 10 public approved entries spanning 10 provinces and 2 private document-review examples. An additional sample Merchant keeps each account within its Villa limit. New bundled photos villa-4.jpg through villa-9.jpg are illustrative Unsplash sources photo-1600596542815-ffad4c1539a9, photo-1613977257363-707ba9348227, photo-1600607687920-4e2a09cf159d, photo-1613490493576-7fde63acd811, photo-1564013799919-ab600027ffc6, photo-1756115377696-0bdbf1c21a02.

Highest-verification banner: PremiumBanner is shown only when the package grants banner entitlement and maximum PREMIUM_VERIFIED, Admin-assigned actual level is PREMIUM_VERIFIED, documents are approved, and QR/subscription is ACTIVE. Admin may POST /api/villas/:id/verification-level for an approved Villa; changes are audited and capped by package entitlement. Two labelled dummy records simulate highest-level results; seeding never overwrites an Admin decision with reviewed_by set.

## LINE Login for User accounts

Create a LINE Login channel with the Web app type in LINE Developers. Enable the email permission and request approval as required by LINE; a verified LINE ID token must include an email to create a new VillaCheck User. Existing email accounts are not automatically linked.

Set server-only `LINE_CHANNEL_ID` and `LINE_CHANNEL_SECRET` in Vercel Production (and local `.env` for local testing). Do not use a public frontend prefix. Register these exact callback URLs:

- Production: `https://design-villacheck.vercel.app/api/auth/oauth/line/callback`
- Local: `http://localhost:8443/api/auth/oauth/line/callback`

Publish the LINE Login channel for users outside its developer/tester roles and redeploy Vercel after adding environment variables. The LINE button stays disabled until both settings exist. The backend verifies the ID token through LINE, including the expected channel, nonce and expiration, and creates only User accounts. Provider credentials and access tokens are never returned to the browser.

Official setup: https://developers.line.biz/en/docs/line-login/integrate-line-login/

## Completed dummy workflows and replacing sample data

Migration `0003_operational_records` adds persisted `support_reports`, `user_checks` and `villa_events`; it preserves existing users, invoices and Villa QR identities. The seed now provides 14 Villas (10 initially public), User Checks, Reports in three review states, seven days of statistics, and two pending document-review scenarios:

- `demo-payment@villacheck.example`: a paid Starter package, document approval → invoice → 3-hour payment-page QR → dummy PDF slip → Admin manual approval.
- `demo-trial@villacheck.example`: Basic trial, document approval → configured trial activation without an invoice.

Local passwords are stored only in ignored `server/data/demo-accounts.json`; seeded public accounts do not have public passwords or demo Admin access. You can also register ordinary User/Merchant accounts with your own credentials to test. Dummy records are visibly labelled and seeding is idempotent; rerunning it does not reset reviewed records, passwords or QR identities.

Admin System Settings controls Demo Mode and Auto Payment Verification. In Demo Mode, the Merchant can generate and submit a synthetic PDF slip. This is a simulated payment request, not a real bank QR or a bank-confirmed transfer. Backend QR expiry is still enforced. The normal upload, rejection, resubmission, duplicate reference protection, transaction, subscription activation and immutable Villa QR workflows all run normally. Email delivery is stored as `demo` in the outbox, with no SMTP transmission. Addresses ending in `.example` are always blocked from real delivery.

Auto verification remains the explicitly requested placeholder; failure/unconfigured AUTO sends payments to manual review. A real bank QR with bank-side expiry requires a bank/payment provider integration; replace the demo payment adapter when switching to actual money transfers.

Additional API routes:

- `POST /api/public/reports`: Guest report or CSRF-protected User-linked report.
- `GET /api/reports`: reports belonging to the current account, with internal Admin notes hidden.
- `GET /api/user/checks`, `POST /api/user/checks`: persisted comparison snapshots; idempotent requests; no manual QR input in the UI.
- `POST /api/public/events`, `GET /api/merchant/analytics`: scoped profile/scan/contact statistics.
- `GET /api/merchant/reports`: complaints for that Merchant's Villas; reporter contact and internal notes hidden.
- `POST /api/merchant/villas/:id`: ownership-checked edit; returns documents to pending review while retaining the QR identity.
- `GET /api/admin/checks`, `GET /api/admin/reports`, `POST /api/admin/reports/:id`: review and respond; separate internal/public notes.
- `GET /api/admin/merchants`, `GET /api/admin/qr`, `POST /api/admin/qr/:villaId`: scoped management; suspension/inactivation/resumption follows backend document/subscription eligibility.
- `POST /api/payments/:id/demo-slip`: Demo Mode only; requires Merchant ownership and an active, unexpired payment request; never marks a payment verified itself.

Package billing cycles are MONTHLY, QUARTERLY and YEARLY. Price is the total per cycle. Renewals activate for 1, 3 or 12 months respectively. Existing first-payment monthly-package behavior (3 months) is retained for backward compatibility and the invoice explicitly shows its duration. Free trial duration remains package-configured.

Before replacing dummy data with actual data:

1. Set `SEED_PUBLIC_DEMO_DATA=false` on Vercel so deployment no longer adds samples.
2. Keep demo data separately or archive only labelled dummy records after backing up; never reset the production database or regenerate Villa QR values.
3. Enter actual Merchant/Villa data through the ownership-checked forms and have Admin review documents.
4. Configure the real payment recipient/provider and SMTP, complete Google/Facebook/LINE provider settings, then switch off Demo Mode in Admin System Settings.
5. Review service/privacy text and contact details for your actual operating policy. Test live OAuth and a controlled payment/email with the provider before opening real payments.

Checks and reports, including Admin responses, persist across browser reloads and sign-ins. Passing tests with dummy data does not validate bank or SMTP credentials, or third-party OAuth consent settings.

## Workflow audit — 2026-10-08

Validation rerun against isolated local PostgreSQL test schemas: 55 tests passed, zero failures/skips; TypeScript and ESLint passed. Browser smoke checks covered 61 guest routes and 38 authenticated User/Merchant/Admin routes with zero JavaScript exceptions. These page checks verify rendering and API loading, not every possible click, camera or third-party consent dialog.

Covered integration flows: registration and role/ownership guards; document upload/review; paid invoice and three-hour payment QR expiry/regeneration; slip rejection/resubmission and atomic manual approval; free trial; subscription expiry/renewal with permanent Villa QR; capacity per package; dynamic packages and typed leads; server-side guest masking; actual verification and Premium entitlement; persisted reports/checks; scoped analytics; QR suspension; dummy mail and AUTO fallback; repeat migrations and seeding.

Production read-only checks: configuration endpoint succeeds with demoMode=true; public directory returns ten Villas with ten photos; unauthenticated Admin user endpoint returns HTTP 401. Provider configuration flags indicate credentials exist, not successful live OAuth consent.

Remaining live checks: real Google/Facebook/LINE login and callback in configured provider consoles; real SMTP delivery; real bank-transfer QR and authentic transaction verification. AUTO is intentionally a future-phase placeholder. The retained first paid MONTHLY invoice covers three months; renewals cover one month. Confirm that commercial rule before accepting real payments. Camera scanning requires a physical-device check.

### Additional interactive dummy checks

Re-ran all 55 integration/regression tests against isolated PostgreSQL schemas (55 passed, zero skips), plus lint/typecheck. Browser interactions on the local dummy database passed: submit User report; reload tracking page with the same reference; submit pre-transfer check and display MATCHED; Admin marks that report RESOLVED and persists a public response without exposing internal notes/contact; Admin suspends and restores the same Villa QR; Admin edits Starter price and public package API reflects the update; Admin saves AUTO then restores MANUAL. Price and settings were restored; all browser mutations used local dummy data.

Confirmed business rule: first paid MONTHLY package invoice covers three months, subsequent monthly renewals cover one month and retain the same Villa QR. This confirmation does not change QUARTERLY/YEARLY or configured free-trial duration.

Mocked OAuth and mail/provider-error tests verify internal handling only. Dummy data cannot establish real provider authorization, actual email delivery, a bank credit, camera hardware behavior, or exhaustive operation of every browser control. No external bank transaction or real SMTP send was attempted in this audit.

## Merchant Villa photos

Merchant lists and detail pages display the saved Villa photo. Add/edit forms accept a JPG or PNG image up to 2 MB with a local preview. The backend checks MIME/signature/size and stores image bytes in PostgreSQL using the existing document storage, with a dedicated public image endpoint that only serves images explicitly linked as Villa photos. Ownership documents remain private. Photo edits follow the existing information-change review rule: pending Admin review, same permanent Villa QR. No new database migration is required.

## Full Villa capacity and package upgrades

At full capacity Merchant cannot add another Villa: backend enforces capacity and the Add Villa form is unavailable. Package page offers only active paid packages with a higher catalog order and greater Villa capacity. Highest tier has no further upgrade. POST /api/subscription/upgrade creates a payment request through the existing payment QR/manual-slip workflow; subscription capacity stays unchanged until Admin verifies payment atomically. Existing Villa QR identities are preserved. A pending invoice or suspended/cancelled subscription blocks another upgrade request. Upgrade invoice uses the target package's configured full price and billing duration; no prorated discount is calculated.

## Email / phone OTP login

Login defaults to phone OTP with an email OTP tab. Facebook, Google and LINE remain available. Email/password is a separate final button; Apple login has been removed. POST /api/auth/otp/request sends a six-digit OTP; POST /api/auth/otp/verify issues the existing session after verification. Migration 0004_login_otp adds expiring hashed challenges. Each challenge expires in five minutes, allows five incorrect attempts, is consumed once; resends invalidate the prior challenge. Destination limits are one request per minute and five per hour, plus shared auth IP throttling. API responses never contain the OTP.

Production setup:
- OTP_SECRET: a random server-only secret of at least 32 characters, e.g. generated by node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))". Add as Secret in Vercel Production; do not use NEXT_PUBLIC_/VITE_ prefixes.
- Email: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM using the existing mail transport. OTP email is immediate and is not suppressed by financial/demo mode. Real delivery requires a valid SMTP account; failures invalidate the challenge and return a generic retry error.
- SMS (default adapter Twilio): TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and either TWILIO_FROM or TWILIO_MESSAGING_SERVICE_SID. Enable the intended destination countries and provide a valid SMS sender. SMS calls have a 15-second timeout. Tests inject a fake transport and do not send real SMS.
- Redeploy after configuring environment variables. GET /api/config returns otp.email / otp.sms capability flags; unconfigured channels remain disabled and the UI directs users to other login methods.

New email users are created as User after verifying ownership. Existing email users keep their role. Phone OTP creates a separate verified User identity, never adopts an unverified Merchant/Admin contact phone, and uses an internal @phone.villacheck.invalid placeholder until an email-linking flow is added. Repeated verified phone login uses the same identity. No automatic account merging is performed. Live email/SMS credentials and delivery must be tested before announcing OTP availability.
