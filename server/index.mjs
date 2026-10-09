import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { createApp } from "./app.mjs"
import { createUser, hashPassword, openDatabase } from "./database.mjs"
import { openPostgres } from "./postgres.mjs"
/** @param {NodeJS.ProcessEnv} env
 * @param {{listen?: boolean, databaseFactory?: (url?: string) => Promise<any>}} options */
export async function startServer(env = process.env, { listen = true, databaseFactory } = {}) {
  env = {
    ...env,
    DATABASE_URL: env.DATABASE_URL || env.VillaCheck_DATABASE_URL,
  }
  const production = env.NODE_ENV === "production"
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
  const appUrl = (env.APP_URL || "http://localhost:8443").replace(/\/$/, "")
  if (production && (!env.APP_URL || !appUrl.startsWith("https://")))
    throw Error("APP_URL must be your public HTTPS URL in production")
  if (production && env.SEED_DEMO_ACCOUNTS === "true")
    throw Error("Demo accounts cannot be enabled in production")
  const seedDemo = !production && env.SEED_DEMO_ACCOUNTS === "true"
  const db = databaseFactory ? await databaseFactory(env.DATABASE_URL) : env.DATABASE_URL
    ? await openPostgres(env.DATABASE_URL)
    : openDatabase(
        env.DATABASE_PATH || resolve(root, "server/data/villacheck.sqlite"),
      )
  let server
  try {
    const add = async (email, password, name, role) => {
      // Existing accounts need no write transaction on a serverless cold start.
      if (await db.prepare("SELECT id FROM users WHERE email=?").get(email)) return
      return db.transaction(async () => {
        if (
          !(await db.prepare("SELECT id FROM users WHERE email=?").get(email))
        )
          await createUser(db, email, password, name, role)
      })
    }
    if (env.ADMIN_EMAIL && env.ADMIN_PASSWORD) {
      if (env.ADMIN_PASSWORD.length < 12)
        throw Error("ADMIN_PASSWORD must have at least 12 characters")
      await add(
        env.ADMIN_EMAIL.toLowerCase(),
        env.ADMIN_PASSWORD,
        "Administrator",
        "admin",
      )
    }
    if (seedDemo) {
      await add(
        "owner@villacheck.test",
        "Owner1234",
        "Demo Merchant",
        "merchant",
      )
      await add("admin@villacheck.test", "Admin1234", "Demo Admin", "admin")
      await add("user@villacheck.test", "User1234", "Demo User", "user")
    }
    if (
      production &&
      (await db
        .prepare(
          "SELECT id FROM users WHERE email IN ('owner@villacheck.test','admin@villacheck.test','user@villacheck.test')",
        )
        .get())
    )
      throw Error("Use a clean production database without local demo users")
    if (
      production &&
      !(await db.prepare("SELECT id FROM users WHERE role='admin'").get())
    )
      throw Error("Set ADMIN_EMAIL and ADMIN_PASSWORD for initial setup")
    let transport
    if (env.SMTP_HOST && env.SMTP_FROM) {
      const { default: nodemailer } = await import("nodemailer")
      transport = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: Number(env.SMTP_PORT || 587),
        secure: env.SMTP_SECURE === "true",
        requireTLS: env.SMTP_SECURE !== "true",
        auth: env.SMTP_USER
          ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
          : undefined,
        connectionTimeout: 10000,
        socketTimeout: 20000,
        greetingTimeout: 10000,
      })
    }
    const config = {
      appUrl,
      demoMode:env.DEMO_MODE === "true",
      paymentVerificationMode: env.PAYMENT_VERIFICATION_MODE || "MANUAL",
      appleClientId: env.APPLE_CLIENT_ID,
      appleTeamId: env.APPLE_TEAM_ID,
      appleKeyId: env.APPLE_KEY_ID,
      applePrivateKey: env.APPLE_PRIVATE_KEY,
      lineClientId: env.LINE_CHANNEL_ID,
      lineClientSecret: env.LINE_CHANNEL_SECRET,
      googleClientId: env.GOOGLE_CLIENT_ID,
      googleClientSecret: env.GOOGLE_CLIENT_SECRET,
      facebookClientId: env.FACEBOOK_APP_ID,
      facebookClientSecret: env.FACEBOOK_APP_SECRET,
      facebookVersion: env.FACEBOOK_GRAPH_VERSION,
      seedDemo,
      serverless: !listen,
      secureCookies: production || env.COOKIE_SECURE === "true",
      allowedOrigins: [
        new URL(appUrl).origin,
        ...(!production
          ? [
              "http://localhost:8443",
              "http://127.0.0.1:8443",
              "http://localhost:3001",
            ]
          : []),
      ],
      smtpFrom: env.SMTP_FROM,
      paymentInstructions: env.PAYMENT_INSTRUCTIONS,
      staticDir:
        env.SERVE_FRONTEND === "true" || production
          ? resolve(root, "dist")
          : undefined,
      fakeHash: hashPassword("unmatchable-placeholder-password"),
    }
    server = createApp(db, config, transport)
    if (!listen) return { server, db }
    await new Promise((resolve, reject) => {
      server.once("error", reject)
      server.listen(
        Number(env.BACKEND_PORT || env.PORT || 3001),
        env.BACKEND_HOST || "127.0.0.1",
        resolve,
      )
    })
    console.log(
      `VillaCheck Backend: http://${env.BACKEND_HOST || "127.0.0.1"}:${server.address().port}`,
    )
    console.log(
      `SMTP: ${
        transport ? "configured" : "not configured; messages remain queued"
      }`,
    )
    return { server, db }
  } catch (error) {
    server?.emit("close")
    await db.close()
    throw error
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { server, db } = await startServer()
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => {
      server.close(async () => {
        await db.close()
        process.exit(0)
      })
    })
}
