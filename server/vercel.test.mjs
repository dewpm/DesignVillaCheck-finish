import test from "node:test"
import assert from "node:assert/strict"
import { createServer } from "node:http"
import { createVercelHandler } from "../api/index.js"
import { openTestDatabase } from "./test-database.mjs"

async function serve(handler) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost")
    req.query = Object.fromEntries(url.searchParams)
    if (req.method === "POST") {
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      req.body = JSON.parse(Buffer.concat(chunks).toString())
    }
    await handler(req, res)
  })
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  return {
    server,
    base: `http://127.0.0.1:${server.address().port}/api/index?route=`,
  }
}

test("Vercel API reports missing PostgreSQL without creating a local database", async () => {
  const handler = createVercelHandler({})
  const { server, base } = await serve(handler)
  try {
    const response = await fetch(base + "health")
    assert.equal(response.status, 503)
    assert.match((await response.json()).error, /DATABASE_URL/)
  } finally {
    await new Promise((resolve) => server.close(resolve))
    await handler.close()
  }
})

test(
  "Vercel API boots with PostgreSQL, preserves routes and parsed bodies, and shares rate limits",
  { skip: !process.env.TEST_DATABASE_URL },
  async (t) => {
    const db = await openTestDatabase()
    const env = {
      VillaCheck_DATABASE_URL: db.testConnectionString,
      APP_URL: "https://design-villacheck.vercel.app",
      ADMIN_EMAIL: "admin-online@example.com",
      ADMIN_PASSWORD: "Online-admin-1234",
      GOOGLE_CLIENT_ID: "test-client",
      GOOGLE_CLIENT_SECRET: "test-secret",
    }
    const a = createVercelHandler(env),
      b = createVercelHandler(env)
    const one = await serve(a),
      two = await serve(b)
    t.after(async () => {
      await Promise.all([
        new Promise((resolve) => one.server.close(resolve)),
        new Promise((resolve) => two.server.close(resolve)),
      ])
      await a.close()
      await b.close()
      await db.close()
    })
    const [health, config] = await Promise.all([
      fetch(one.base + "health").then((r) => r.json()),
      fetch(two.base + "config").then((r) => r.json()),
    ])
    assert.deepEqual(health, { ok: true })
    assert.equal(config.localAccounts, false)
    assert.equal(config.oauth.google, true)
    const post = (host, route, data, ip = "203.0.113.1") =>
      fetch(host + route, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": ip,
          Origin: env.APP_URL,
        },
        body: JSON.stringify(data),
      })
    const registration = await post(one.base, "auth/register-user", {
      name: "Online User",
      email: "online@example.com",
      password: "Online-password-123",
    })
    assert.equal(registration.status, 200)
    const member = await registration.json()
    assert.equal(member.user.role, "user")
    assert.match(registration.headers.get("set-cookie"), /Secure/)
    const cookie = registration.headers.get("set-cookie").split(";")[0]
    const me = await (
      await fetch(two.base + "auth/me", { headers: { cookie } })
    ).json()
    assert.equal(me.user.id, member.user.id)
    const adminLogin = await post(two.base, "auth/login", {
      email: env.ADMIN_EMAIL,
      password: env.ADMIN_PASSWORD,
    })
    assert.equal(adminLogin.status, 200)
    const adminCookie = adminLogin.headers.get("set-cookie").split(";")[0]
    const members = await (
      await fetch(one.base + "admin/users", {
        headers: { cookie: adminCookie },
      })
    ).json()
    assert.equal(members.users[0].email, "online@example.com")
    for (let i = 0; i < 31; i++) {
      const response = await post(
        i % 2 ? one.base : two.base,
        "auth/login",
        { email: "bad@example.com", password: "wrong" },
        "203.0.113.30",
      )
      assert.equal(response.status, i < 30 ? 401 : 429)
    }
    assert.equal(
      (
        await post(
          one.base,
          "auth/login",
          { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD },
          "203.0.113.31",
        )
      ).status,
      200,
    )
  },
)
