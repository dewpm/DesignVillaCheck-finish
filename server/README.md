# VillaCheck Backend

Node.js 24 HTTP API with PostgreSQL (`DATABASE_URL`) or a local SQLite database, private document storage, password hashing, HttpOnly session cookies, CSRF protection, role checks, invoices, audit events, and a durable SMTP outbox. The frontend uses `/api` through the Vite proxy locally. Vercel production runs the API as a Node.js Function; see `../DEPLOYMENT.md` for Neon setup. A standalone server can also serve `dist/`.

## Local development

1. Install Node.js 24 and run `npm install`.
2. Copy `.env.example` to `.env`.
3. Set `ADMIN_EMAIL` and an `ADMIN_PASSWORD` of at least 12 characters. For local testing only, `SEED_DEMO_ACCOUNTS=true` enables the previous local merchant/admin/user accounts.
4. Run `npm run backend`. The existing Vite server proxies `/api` to port 3001. For a new checkout, run `npm run dev` separately.
5. If Vite is unavailable, set `SERVE_FRONTEND=true`, run `npm run build`, set `APP_URL=http://localhost:3001`, and open `http://localhost:3001/#page=login`. Otherwise open the Vite app. Log in, or register a merchant. Upload ownership documents, switch to Admin, review the villa, and approve it.

With `DATABASE_URL` set, database and document bytes persist in PostgreSQL. Otherwise they persist in `server/data/villacheck.sqlite` (ignored by Git). Switching to an empty PostgreSQL database does not import local SQLite data. Browser localStorage prototypes are not imported. Documents can only be downloaded by their merchant or an admin.

## Payments and QR

Set `PAYMENT_INSTRUCTIONS` to the real bank, account holder, account number, and instructions. This implementation uses real **manual bank transfers**: the merchant attaches a slip and transfer reference, and Admin checks the actual bank receipt before confirming. It does not charge cards, contact a bank to verify slips, or integrate a payment gateway.

Merchant subscribes once at the **account** level. Basic, Starter and Pro permit 1 Villa; Plus permits 2; Premium permits 10. `POST /api/subscription` selects the account package before any villa is created. The backend enforces capacity inside the villa creation transaction and ignores client-supplied villa package IDs.

Every villa still needs ownership documents and a separate Admin approval. For a paid package, the first approval creates one account invoice/email; approvals of additional villas reuse that unpaid invoice. Admin confirmation activates the account package and issues a different unique QR to every approved villa. If the account is already active, approving another villa issues its QR immediately without another package charge. Pending or rejected villas never receive QR access.

The initial account term is 3 calendar months. All villa QR expiries follow the account term; a villa added later receives the remaining package validity. Monthly renewal extends the account and all approved villa QRs by 1 calendar month from the later of current expiry and current time, retaining each code. Renewal is billed once per account, and repeated confirmations never extend validity twice.

Basic is a one-time free 3-month trial for 1 Villa, activated by Admin approval without asking for a payment slip. Subsequent renewal requires a paid package. Upgraded capacity is granted only after the paid invoice is confirmed. Changing already-paid package tiers outside the Basic-to-paid transition is not implemented.

The first paid invoice currently charges the package's monthly price (Starter ฿990, Pro ฿2,900, Plus ฿4,900, Premium ฿9,900) and includes the initial 3-month QR term, consistent with the earlier implementation. Confirm this commercial policy before public launch if the initial invoice should charge three months. Existing legacy per-villa invoices are retained for auditing; migration of live legacy subscriptions requires reconciliation rather than automatically charging or granting new entitlements.

## SMTP

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM`, then restart the backend. Port 587 requires STARTTLS; for port 465 set `SMTP_SECURE=true`. Credentials remain on the server.

Approval/renewal immediately queues an email, and the worker sends it automatically. Without SMTP it remains queued and the UI explicitly displays “waiting for configuration.” Failures retry with backoff up to eight attempts and are visible to Admin, who can retry manually. A stable Message-ID is reused. SMTP delivery is at-least-once: a process crash after the provider accepts mail but before recording success may cause a duplicate. “Sent” means SMTP accepted the message, not guaranteed inbox delivery. A `.test` address cannot receive real mail; use a deliverable merchant email.

## Production

1. Use a clean production database with `SEED_DEMO_ACCOUNTS=false`; startup refuses databases containing local demo users.
2. Set `NODE_ENV=production`, your public HTTPS `APP_URL`, a real Admin account, payment instructions, and SMTP settings.
3. Run `npm run build`, then `npm start` behind an HTTPS reverse proxy. Proxy to 127.0.0.1:3001. Bind `BACKEND_HOST=0.0.0.0` only when needed by your hosting/container setup.
4. Persist and back up the database directory, including SQLite WAL/SHM files. The DB contains private documents; restrict host access and use encrypted volumes/backups. Keep a single API process for this SQLite/outbox deployment.

Standalone login rate limiting keys by direct socket IP. Vercel uses its trusted forwarded client IP and stores counters in PostgreSQL across function instances. Configure rate limiting at your trusted proxy for other reverse-proxy deployments. Account recovery, email address verification, automated receipt verification, malware scanning, and external monitoring remain deployment extensions. API guards and data isolation are implemented, but the rest of the public directory/User pages still contain the existing presentation fixtures.

## Tests

`npm run test:backend` exercises real HTTP requests, login/registration, role and merchant isolation, CSRF/origin checks, private files, atomic approval, mail transport, proof review, repeated payment confirmation, expiry/renewal, and persistence after restarting SQLite. Tests use isolated temporary databases and a fake SMTP transport; they do not send external mail.

## User accounts and privacy

Users can register with name, email, and password (`POST /api/auth/register-user`). Merchant registration remains separate (`POST /api/auth/register`). Clients cannot select or elevate their role. Admin has a Users page backed by `GET /api/admin/users`, showing member names, email addresses, creation dates, last login dates, and OAuth providers. Password hashes, sessions, and provider tokens are never returned. Existing accounts receive a creation baseline at the first schema migration because their earlier creation dates were not recorded.

Merchants provide the villa's official phone, bank, account holder, and account number on the Add Villa form. `/api/public/qr/:reference` omits **all** these fields for guests, expired sessions, merchants, and admins. It returns them only for a logged-in User. The frontend displays placeholders and returns members to the same QR after login/registration. Existing villas without contact data show “not specified”; no sample bank account is assigned to them.

### Google and Facebook OAuth

Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` or `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, and `FACEBOOK_GRAPH_VERSION` in `.env`. The Facebook version must be the supported version selected in the Meta app, in `vXX.0` format. Restart the backend after configuration. Disabled provider buttons become available once their configuration is present.

Register these exact authorized callback URLs with the providers, using your actual `APP_URL`:

- Google: `http://localhost:3001/api/auth/oauth/google/callback` for the local setup, or `https://your-domain/api/auth/oauth/google/callback` for production.
- Facebook: `https://your-domain/api/auth/oauth/facebook/callback`. Configure the domain, Facebook Login product, email/public_profile permissions, app testers and live-mode/review requirements in Meta's dashboard.

The backend exchanges authorization codes over HTTPS and fetches the provider profile. Google uses PKCE and requires a verified email. Facebook uses app-secret proof on its profile request and requires the email permission. Both flows bind a short-lived, one-time state to an HttpOnly browser cookie. Return destinations are restricted to the User dashboard or a QR verification page. Secrets and access tokens never reach frontend code and provider tokens are not persisted.

OAuth creates User accounts only. It never automatically links a provider to an existing email/password, Merchant, or Admin account merely because an email matches. The member must use their existing login method when an email already exists; an explicit provider-linking workflow is not implemented. No configured provider credentials were available during development: protocol behavior is covered with mocked provider HTTP responses, but real provider consent and login must be verified after configuration.

### Province links and maps

The homepage has ten curated destination pins on the original rounded decorative map (not an analytics ranking or a geographic map). Clicking a pin or a province chip opens the villa directory filtered to that province. A separate Google Maps link opens the selected province through a [Google Maps URL](https://developers.google.com/maps/documentation/urls/get-started); it does not require an API key.


Additional routes:

- `POST /api/auth/register-user`
- `GET /api/auth/oauth/:provider/start`, `GET /api/auth/oauth/:provider/callback`
- `GET /api/admin/users` (Admin only)

## Merchant API

- `GET /api/health`, `GET /api/config`
- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`
- `GET /api/state` (only own villas/mail for merchant; all for admin)
- `POST /api/subscription` (merchant account package), `POST /api/villas`, `POST /api/villas/:id/resubmit`, `POST /api/villas/:id/renew`
- `POST /api/villas/:id/review` (admin)
- `GET /api/documents/:id` (owner or admin)
- `POST /api/invoices/:id/proof` (merchant), `POST /api/invoices/:id/confirm`, `POST /api/invoices/:id/reject` (admin)
- `POST /api/mails/:id/retry` (admin)
- `GET /api/public/qr/:reference` (public; name/province/status/expiry only)

Authenticated POST requests require the `X-CSRF-Token` returned by login or `/api/auth/me`. Clients cannot choose roles, verification status, QR references, invoice amounts, expiry dates, or payment state.

Implementation references: [Node SQLite](https://nodejs.org/api/sqlite.html), [Nodemailer SMTP](https://nodemailer.com/smtp).

## PostgreSQL tests

Set `TEST_DATABASE_URL` and run `npm run test:backend` to run the subscription and User/OAuth workflow tests against isolated PostgreSQL schemas, plus transaction rollback, binary documents, epoch timestamp and concurrent outbox claims. SQLite persistence tests remain enabled.
