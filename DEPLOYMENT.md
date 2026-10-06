# Vercel frontend and persistent Backend

The public entry point remains https://design-villacheck.vercel.app. Vercel forwards `/api` to the Backend using an external rewrite. Cookies and OAuth callbacks use the Vercel domain.

The current Backend uses SQLite for users, sessions, subscriptions, and uploaded documents. Deploy it as one Render service with the persistent disk defined in `render.yaml`. This requires a paid Render service and disk; review pricing before creating it. No cloud resources have been created by these files.

1. Push these project files to the Git repository used for deployment. Do not commit `.env` or `server/data`.
2. In Render, choose New → Blueprint and select that repository. Review the plan and disk before deploying.
3. Enter `ADMIN_EMAIL`, a new `ADMIN_PASSWORD` with at least 12 characters, and the Google OAuth credentials from your local `.env`. Render creates a fresh database; local test accounts and data are not copied.
4. Wait for Backend deployment and copy its actual HTTPS service URL. Verify `/api/health` returns `{"ok":true}`.
5. Run `node scripts/configure-vercel.mjs https://YOUR-ACTUAL-BACKEND.onrender.com` locally. Commit the generated `vercel.json`, push, and redeploy the existing Vercel project.
6. In Google Auth Platform → Clients, register `https://design-villacheck.vercel.app/api/auth/oauth/google/callback` as an authorized redirect URI. Keep the localhost callback for local testing. If Google requires test users, add the testers in Audience.
7. Check `https://design-villacheck.vercel.app/api/health`, register a User, test Google Login, and log in with the production Admin account. Register Merchant accounts from the website.

OAuth secrets belong in Render's Backend environment. The frontend does not need Google Client Secret. Keep local `APP_URL=http://localhost:3001`; Render uses the Vercel URL from its Blueprint.

Set payment instructions and SMTP environment variables on Render to enable payment proofs and email delivery. Facebook requires its separate provider configuration. Back up the persistent database before changes; keep a single Backend instance with SQLite.
