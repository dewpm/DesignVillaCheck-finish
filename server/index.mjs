import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createApp } from "./app.mjs"
import { createUser, hashPassword, openDatabase } from "./database.mjs"

export async function startServer(env = process.env) {
  const production = env.NODE_ENV === "production"
  const root = resolve(fileURLToPath(new URL("..", import.meta.url)))
  const appUrl = (env.APP_URL || "http://localhost:8443").replace(/\/$/, "")
  if (production && (!env.APP_URL || !appUrl.startsWith("https://")))
    throw Error("APP_URL must be your public HTTPS URL in production")
  if (production && env.SEED_DEMO_ACCOUNTS === "true")
    throw Error("Demo accounts cannot be enabled in production")
  const seedDemo = !production && env.SEED_DEMO_ACCOUNTS === "true"
  const db = openDatabase(
    env.DATABASE_PATH || resolve(root, "server/data/villacheck.sqlite"),
  )
  const add = (email, password, name, role) => {
    if (!db.prepare("SELECT id FROM users WHERE email=?").get(email))
      createUser(db, email, password, name, role)
  }
  if (env.ADMIN_EMAIL && env.ADMIN_PASSWORD) {
    if (env.ADMIN_PASSWORD.length < 12)
      throw Error("ADMIN_PASSWORD must have at least 12 characters")
    add(
      env.ADMIN_EMAIL.toLowerCase(),
      env.ADMIN_PASSWORD,
      "Administrator",
      "admin",
    )
  }
  if (seedDemo) {
    add("owner@villacheck.test", "Owner1234", "Demo Merchant", "merchant")
    add("admin@villacheck.test", "Admin1234", "Demo Admin", "admin")
    add("user@villacheck.test", "User1234", "Demo User", "user")
  }
  if (
    production &&
    db
      .prepare(
        "SELECT id FROM users WHERE email IN ('owner@villacheck.test','admin@villacheck.test','user@villacheck.test')",
      )
      .get()
  )
    throw Error("Use a clean production database without local demo users")
  if (
    production &&
    !db.prepare("SELECT id FROM users WHERE role='admin'").get()
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
    googleClientId: env.GOOGLE_CLIENT_ID, googleClientSecret: env.GOOGLE_CLIENT_SECRET,
    facebookClientId: env.FACEBOOK_APP_ID, facebookClientSecret: env.FACEBOOK_APP_SECRET,
    facebookVersion: env.FACEBOOK_GRAPH_VERSION,
    seedDemo,
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
  const server = createApp(db, config, transport)
  await new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(
      Number(env.BACKEND_PORT || 3001),
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
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { server, db } = await startServer()
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => {
      server.close(() => {
        db.close()
        process.exit(0)
      })
    })
}
