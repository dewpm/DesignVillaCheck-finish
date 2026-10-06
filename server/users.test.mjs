import { openTestDatabase } from "./test-database.mjs"
import { test } from "node:test"
import assert from "node:assert/strict"
import { createApp } from "./app.mjs"
import { createUser, hashPassword, openDatabase } from "./database.mjs"
import { safeReturn } from "./oauth.mjs"
test("user registration and QR contacts are enforced by the API", async (t) => {
  const db = await openTestDatabase()
  const owner = await createUser(
    db,
    "owner@example.com",
    "Owner-password-123",
    "Owner",
  )
  await createUser(
    db,
    "admin@example.com",
    "Admin-password-123",
    "Admin",
    "admin",
  )
  await db
    .prepare("INSERT INTO documents VALUES ('doc',?,?,?,?)")
    .run(owner.id, "ownership.pdf", "application/pdf", Buffer.from("%PDF-"))
  await db
    .prepare(
      "INSERT INTO villas(id,owner_id,name,province,merchant,email,package_id,document_id,status,qr,expires,created,phone,bank_name,account_name,account_number) VALUES ('villa',?,'Villa','Bangkok','Merchant','owner@example.com','starter','doc','approved','VC-test','2099-01-01T00:00:00Z','now','0812345678','Test Bank','Private Account Holder','1234567890')",
    )
    .run(owner.id)
  const config = {
    appUrl: "http://localhost:3001",
    allowedOrigins: ["http://localhost:3001"],
    fakeHash: hashPassword("fake-password-placeholder"),
  }
  const server = createApp(db, config)
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve))
    await db.close()
  })
  const base = `http://127.0.0.1:${server.address().port}`
  const request = async (path, data, cookie) => {
    const response = await fetch(base + path, {
      method: data ? "POST" : "GET",
      headers: {
        ...(data ? { "Content-Type": "application/json" } : {}),
        ...(cookie ? { cookie } : {}),
      },
      body: data ? JSON.stringify(data) : undefined,
    })
    return {
      status: response.status,
      value: await response.json(),
      cookie: response.headers.get("set-cookie")?.split(";")[0],
    }
  }
  const guest = await request("/api/public/qr/VC-test")
  assert.equal(guest.value.locked, true)
  for (const secret of [
    "0812345678",
    "1234567890",
    "Private Account Holder",
    "Test Bank",
  ])
    assert.ok(!JSON.stringify(guest.value).includes(secret))
  const member = await request("/api/auth/register-user", {
    name: "Member",
    email: "member@example.com",
    password: "Member-password-123",
    role: "admin",
  })
  assert.equal(member.status, 200)
  assert.equal(member.value.user.role, "user")
  const visible = await request(
    "/api/public/qr/VC-test",
    undefined,
    member.cookie,
  )
  assert.equal(visible.value.locked, false)
  assert.equal(visible.value.phone, "0812345678")
  assert.equal(visible.value.accountNumber, "1234567890")
  const merchant = await request("/api/auth/login", {
    email: "owner@example.com",
    password: "Owner-password-123",
  })
  assert.equal(
    (await request("/api/public/qr/VC-test", undefined, merchant.cookie)).value
      .locked,
    true,
  )
  assert.equal(
    (await request("/api/admin/users", undefined, member.cookie)).status,
    403,
  )
  const admin = await request("/api/auth/login", {
    email: "admin@example.com",
    password: "Admin-password-123",
  })
  const users = (await request("/api/admin/users", undefined, admin.cookie))
    .value.users
  assert.equal(users.length, 1)
  assert.equal(users[0].email, "member@example.com")
  assert.ok(users[0].created)
  assert.ok(users[0].lastLogin)
  assert.equal(users[0].password_hash, undefined)
  assert.equal(
    (
      await request(
        "/api/public/qr/VC-test",
        undefined,
        "vc_session=" + "a".repeat(64),
      )
    ).value.locked,
    true,
  )
})
test("OAuth state, provider identity, PKCE, return paths and collision handling", async (t) => {
  const db = await openTestDatabase()
  await createUser(
    db,
    "existing@example.com",
    "Existing-password-123",
    "Existing",
  )
  let profile = {
    sub: "google-subject",
    name: "Google Member",
    email: "google@example.com",
    email_verified: true,
  }
  const requests = []
  const config = {
    appUrl: "http://localhost:3001",
    allowedOrigins: ["http://localhost:3001"],
    fakeHash: hashPassword("fake-password-placeholder"),
    googleClientId: "google-id",
    googleClientSecret: "must-stay-server-side",
    facebookClientId: "facebook-id",
    facebookClientSecret: "facebook-secret",
    facebookVersion: "v24.0",
    oauthFetch: async (url, options) => {
      requests.push({ url: String(url), options })
      return {
        ok: true,
        json: async () =>
          String(url).includes("/token") || String(url).includes("access_token")
            ? { access_token: "provider-token" }
            : profile,
      }
    },
  }
  const server = createApp(db, config)
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve))
    await db.close()
  })
  const base = `http://127.0.0.1:${server.address().port}`
  const start = async (provider, returnTo = "#page=verify&item=VC-test") => {
    const response = await fetch(
      `${base}/api/auth/oauth/${provider}/start?${new URLSearchParams({ returnTo })}`,
      { redirect: "manual" },
    )
    assert.equal(response.status, 302)
    const location = new URL(response.headers.get("location"))
    const state = location.searchParams.get("state")
    assert.ok(!location.toString().includes("must-stay-server-side"))
    return {
      cookie: response.headers.get("set-cookie").split(";")[0],
      state,
      location,
    }
  }
  const callback = (provider, flow, query = "code=valid-code") =>
    fetch(
      `${base}/api/auth/oauth/${provider}/callback?state=${flow.state}&${query}`,
      { redirect: "manual", headers: { cookie: flow.cookie } },
    )
  const flow = await start("google")
  assert.equal(flow.location.searchParams.get("code_challenge_method"), "S256")
  const wrong = await callback("google", {
    ...flow,
    cookie: "vc_oauth=" + "f".repeat(64),
  })
  assert.ok(wrong.headers.get("location").includes("invalid_state"))
  assert.equal(requests.length, 0)
  const success = await callback("google", flow)
  assert.equal(
    success.headers.get("location"),
    "http://localhost:3001/#page=verify&item=VC-test",
  )
  assert.ok(success.headers.get("set-cookie").includes("vc_session="))
  assert.ok(new URLSearchParams(requests[0].options.body).get("code_verifier"))
  assert.equal(
    (
      await db
        .prepare("SELECT role FROM users WHERE email='google@example.com'")
        .get()
    ).role,
    "user",
  )
  assert.equal(
    (await db.prepare("SELECT provider FROM oauth_identities").get()).provider,
    "google",
  )
  assert.ok(
    (await callback("google", flow)).headers
      .get("location")
      .includes("invalid_state"),
  )
  const repeat = await start("google")
  await callback("google", repeat)
  assert.equal(
    (
      await db
        .prepare(
          "SELECT count(*) AS n FROM users WHERE email='google@example.com'",
        )
        .get()
    ).n,
    1,
  )
  profile = { ...profile, sub: "new-subject", email: "existing@example.com" }
  const collision = await callback("google", await start("google"))
  assert.ok(collision.headers.get("location").includes("email_exists"))
  assert.equal(
    (await db.prepare("SELECT count(*) AS n FROM oauth_identities").get()).n,
    1,
  )
  profile = {
    ...profile,
    sub: "unverified",
    email: "unverified@example.com",
    email_verified: false,
  }
  assert.ok(
    (await callback("google", await start("google"))).headers
      .get("location")
      .includes("email_required"),
  )
  const expired = await start("google")
  await db.exec("UPDATE oauth_states SET expires=0")
  assert.ok(
    (await callback("google", expired)).headers
      .get("location")
      .includes("invalid_state"),
  )
  const cancelled = await start("google")
  assert.ok(
    (await callback("google", cancelled, "error=access_denied")).headers
      .get("location")
      .includes("cancelled"),
  )
  profile = {
    id: "facebook-subject",
    name: "Facebook Member",
    email: "facebook@example.com",
  }
  const fb = await start("facebook", "https://attacker.example")
  const fbSuccess = await callback("facebook", fb)
  assert.equal(
    fbSuccess.headers.get("location"),
    "http://localhost:3001/#page=user-dashboard",
  )
  assert.ok(requests.at(-1).url.includes("appsecret_proof="))
  assert.equal(
    (
      await db
        .prepare("SELECT role FROM users WHERE email='facebook@example.com'")
        .get()
    ).role,
    "user",
  )
  assert.equal(safeReturn("#page=admin-dashboard"), "#page=user-dashboard")
  assert.equal(safeReturn("//attacker.example"), "#page=user-dashboard")
})
