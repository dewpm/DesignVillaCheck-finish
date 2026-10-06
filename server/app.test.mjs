import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createApp } from "./app.mjs"
import {
  addMonths,
  createUser,
  hashPassword,
  openDatabase,
} from "./database.mjs"

test("calendar months use Bangkok time and clamp end of month", () => {
  assert.equal(addMonths("2026-01-31T12:00:00Z", 1), "2026-02-28T12:00:00.000Z")
  assert.equal(addMonths("2026-01-30T20:00:00Z", 1), "2026-02-27T20:00:00.000Z")
  assert.equal(addMonths("2026-10-06T12:00:00Z", 3), "2027-01-06T12:00:00.000Z")
})

test("real HTTP workflow, authorization, mail outbox and persistent QR", async (t) => {
  const folder = mkdtempSync(join(tmpdir(), "villacheck-test-"))
  let db = openDatabase(join(folder, "test.sqlite"))
  const admin = createUser(
    db,
    "admin@example.com",
    "Admin-password-123",
    "Admin",
    "admin",
  )
  createUser(db, "merchant@example.com", "Merchant-password-123", "Merchant A")
  createUser(db, "other@example.com", "Other-password-123", "Merchant B")
  const delivered = []
  const config = {
    appUrl: "http://localhost:8443",
    allowedOrigins: ["http://localhost:8443"],
    smtpFrom: "system@example.com",
    paymentInstructions: "Test bank account",
    fakeHash: hashPassword("no-account-placeholder"),
    seedDemo: false,
  }
  const transport = {
    sendMail: async (message) => {
      delivered.push(message)
    },
  }
  let server = createApp(db, config, transport)
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  let base = `http://127.0.0.1:${server.address().port}`
  const request = async (path, data, session, extraHeaders = {}) => {
    const response = await fetch(base + path, {
      method: data === undefined ? "GET" : "POST",
      headers: {
        ...(data === undefined ? {} : { "Content-Type": "application/json" }),
        ...(session
          ? { cookie: session.cookie, "X-CSRF-Token": session.csrf }
          : {}),
        ...extraHeaders,
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    })
    const type = response.headers.get("content-type")
    return {
      status: response.status,
      value: type?.includes("json")
        ? await response.json()
        : Buffer.from(await response.arrayBuffer()),
      cookie: response.headers.get("set-cookie"),
    }
  }
  const login = async (email, password) => {
    const response = await request("/api/auth/login", { email, password })
    assert.equal(response.status, 200)
    assert.match(response.cookie, /HttpOnly/)
    assert.match(response.cookie, /SameSite=Lax/)
    return { cookie: response.cookie.split(";")[0], csrf: response.value.csrf }
  }
  const owner = await login("merchant@example.com", "Merchant-password-123")
  assert.equal((await request("/api/subscription", { packageId: "plus" }, owner)).status, 200)
  const operator = await login("admin@example.com", "Admin-password-123")
  const other = await login("other@example.com", "Other-password-123")
  const file = {
    name: "ownership.pdf",
    type: "application/pdf",
    data:
      "data:application/pdf;base64," +
      Buffer.from("%PDF-1.4\ntest fixture").toString("base64"),
  }
  const input = {
    name: "Villa A",
    province: "ชลบุรี",
    merchant: "Merchant A",
    email: "merchant@example.com",
    packageId: "starter",
    document: file,
    status: "approved",
    qr: "attacker-selected-qr",
  }
  let villaId, qr
  await t.test(
    "unauthenticated and cross-origin requests are rejected",
    async () => {
      assert.equal((await request("/api/state")).status, 401)
      assert.equal(
        (
          await request("/api/auth/login", {
            email: "merchant@example.com",
            password: "bad",
          })
        ).status,
        401,
      )
      assert.equal(
        (
          await request(
            "/api/auth/login",
            {
              email: "merchant@example.com",
              password: "Merchant-password-123",
            },
            undefined,
            { Origin: "https://attacker.example" },
          )
        ).status,
        403,
      )
      assert.equal(
        (
          await request("/api/villas", input, owner, {
            "X-CSRF-Token": "wrong",
          })
        ).status,
        403,
      )
    },
  )
  await t.test(
    "registration always creates a merchant and validates passwords",
    async () => {
      assert.equal(
        (
          await request("/api/auth/register", {
            name: "C",
            email: "new@example.com",
            password: "short",
            role: "admin",
          })
        ).status,
        400,
      )
      const response = await request("/api/auth/register", {
        name: "C",
        email: "new@example.com",
        password: "New-password-123",
        role: "admin",
      })
      assert.equal(response.status, 200)
      assert.equal(response.value.user.role, "merchant")
    },
  )
  await t.test(
    "ownership documents are required, validated, and private",
    async () => {
      assert.equal(
        (await request("/api/villas", { ...input, document: null }, owner))
          .status,
        400,
      )
      assert.equal(
        (
          await request(
            "/api/villas",
            {
              ...input,
              document: {
                ...file,
                data: "data:application/pdf;base64,aGVsbG8=",
              },
            },
            owner,
          )
        ).status,
        400,
      )
      const response = await request("/api/villas", input, owner)
      assert.equal(response.status, 201)
      villaId = response.value.createdId
      const v = response.value.villas[0]
      assert.equal(v.status, "pending")
      assert.equal(v.qr, "")
      assert.equal(
        (await request(v.document.data, undefined, owner)).status,
        200,
      )
      assert.equal(
        (await request(v.document.data, undefined, other)).status,
        404,
      )
      assert.equal((await request(v.document.data)).status, 401)
      assert.equal(
        (await request("/api/state", undefined, other)).value.villas.length,
        0,
      )
    },
  )
  await t.test(
    "only admin approves, one invoice and one mail created atomically",
    async () => {
      assert.equal(
        (
          await request(
            `/api/villas/${villaId}/review`,
            { status: "approved" },
            owner,
          )
        ).status,
        403,
      )
      assert.equal(
        (await request(`/api/villas/${villaId}/renew`, {}, other)).status,
        404,
      )
      assert.equal(
        (
          await request(
            `/api/villas/${villaId}/review`,
            { status: "rejected", reason: "" },
            operator,
          )
        ).status,
        400,
      )
      const results = await Promise.all([
        request(
          `/api/villas/${villaId}/review`,
          { status: "approved" },
          operator,
        ),
        request(
          `/api/villas/${villaId}/review`,
          { status: "approved" },
          operator,
        ),
      ])
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 409])
      assert.equal(db.prepare("SELECT count(*) AS n FROM invoices").get().n, 1)
      assert.equal(db.prepare("SELECT count(*) AS n FROM mails").get().n, 1)
      // SMTP worker completes asynchronously; yield to the same event loop.
      await new Promise((resolve) => setTimeout(resolve, 20))
      assert.equal(delivered.length, 1)
      assert.equal(delivered[0].to, "merchant@example.com")
      assert.equal(db.prepare("SELECT status FROM mails").get().status, "sent")
    },
  )
  await t.test(
    "payment needs proof and admin confirmation; repeat confirmation does not extend QR",
    async () => {
      let current = (await request("/api/state", undefined, owner)).value
        .villas[0]
      const invoice = current.invoices[0]
      assert.equal(invoice.months, 3)
      assert.equal(invoice.amount, 4900)
      assert.equal(current.qr, "")
      assert.equal(
        (await request(`/api/invoices/${invoice.id}/confirm`, {}, owner))
          .status,
        403,
      )
      assert.equal(
        (await request(`/api/invoices/${invoice.id}/confirm`, {}, operator))
          .status,
        409,
      )
      assert.equal(
        (
          await request(
            `/api/invoices/${invoice.id}/proof`,
            { reference: "TRANSFER1", document: file },
            owner,
          )
        ).status,
        200,
      )
      assert.equal(
        (
          await request(
            `/api/invoices/${invoice.id}/proof`,
            { reference: "TRANSFER1", document: file },
            owner,
          )
        ).status,
        409,
      )
      const response = await request(
        `/api/invoices/${invoice.id}/confirm`,
        {},
        operator,
      )
      assert.equal(response.status, 200)
      current = response.value.villas[0]
      qr = current.qr
      assert.ok(qr.startsWith("VC-"))
      assert.equal(current.payments, 1)
      const paid = db
        .prepare("SELECT paid_at,confirmed_by FROM invoices WHERE id=?")
        .get(invoice.id)
      assert.equal(paid.confirmed_by, admin.id)
      assert.equal(current.expires, addMonths(paid.paid_at, 3))
      const repeated = await request(
        `/api/invoices/${invoice.id}/confirm`,
        {},
        operator,
      )
      assert.equal(repeated.value.villas[0].expires, current.expires)
      assert.equal(repeated.value.villas[0].payments, 1)
      const publicResult = await request(`/api/public/qr/${qr}`)
      assert.equal(publicResult.value.valid, true)
      assert.equal(publicResult.value.email, undefined)
      assert.equal(publicResult.value.document, undefined)
    },
  )
  await t.test(
    "renewal adds one month to the same QR and concurrent requests make one invoice",
    async () => {
      const previous = (await request("/api/state", undefined, owner)).value
        .villas[0]
      await Promise.all([
        request(`/api/villas/${villaId}/renew`, {}, owner),
        request(`/api/villas/${villaId}/renew`, {}, owner),
      ])
      const current = (await request("/api/state", undefined, owner)).value
        .villas[0]
      const invoice = current.invoices.find((i) => i.status === "pending")
      assert.equal(invoice.months, 1)
      assert.equal(current.invoices.length, 2)
      await request(
        `/api/invoices/${invoice.id}/proof`,
        { reference: "TRANSFER2", document: file },
        owner,
      )
      const result = await request(
        `/api/invoices/${invoice.id}/confirm`,
        {},
        operator,
      )
      assert.equal(result.value.villas[0].qr, qr)
      assert.equal(
        result.value.villas[0].expires,
        addMonths(previous.expires, 1),
      )
    },
  )
  await t.test("second villa gets its own QR under the already paid merchant package", async () => {
    const created = await request("/api/villas", { ...input, name: "Villa B" }, owner);
    assert.equal(created.status, 201);
    const id = created.value.createdId;
    await request(`/api/villas/${id}/review`, { status: "changes", reason: "Need new document" }, operator);
    assert.equal((await request(`/api/villas/${id}/resubmit`, { document: file }, other)).status, 404);
    assert.equal((await request(`/api/villas/${id}/resubmit`, { document: file }, owner)).status, 200);
    const before = db.prepare("SELECT count(*) AS n FROM invoices").get().n;
    const approved = await request(`/api/villas/${id}/review`, { status: "approved" }, operator);
    const second = approved.value.villas.find(v => v.id === id);
    assert.ok(second.qr); assert.notEqual(second.qr, qr);
    assert.equal(db.prepare("SELECT count(*) AS n FROM invoices").get().n, before);
    assert.equal((await request("/api/villas", { ...input, name: "Villa C" }, owner)).status, 409);
    await request(`/api/villas/${villaId}/renew`, {}, owner);
    const invoice = (await request("/api/state", undefined, owner)).value.villas.find(v => v.id === villaId).invoices.find(i => i.status === "pending");
    await request(`/api/invoices/${invoice.id}/proof`, { document: file, reference: "TRANSFER3" }, owner);
    assert.equal((await request(`/api/invoices/${invoice.id}/reject`, { reason: "Amount does not match" }, operator)).status, 200);
    const v = (await request("/api/state", undefined, owner)).value.villas.find(v => v.id === villaId);
    assert.equal(v.invoices.find(i => i.id === invoice.id).status, "pending");
    await request(`/api/invoices/${invoice.id}/proof`, { document: file, reference: "TRANSFER3-RESUBMIT" }, owner);
    await request(`/api/invoices/${invoice.id}/confirm`, {}, operator);
  });
  await t.test(
    "expired QR is unavailable and renewal starts from current time",
    async () => {
      db.exec("UPDATE subscriptions SET expires='2020-01-01T00:00:00.000Z'")
      db.prepare(
        "UPDATE villas SET expires='2020-01-01T00:00:00.000Z' WHERE id=?",
      ).run(villaId)
      assert.equal((await request(`/api/public/qr/${qr}`)).value.valid, false)
      await request(`/api/villas/${villaId}/renew`, {}, owner)
      const v = (
        await request("/api/state", undefined, owner)
      ).value.villas.find((v) => v.id === villaId)
      const invoice = v.invoices.find((i) => i.status === "pending")
      await request(
        `/api/invoices/${invoice.id}/proof`,
        { reference: "TRANSFER4", document: file },
        owner,
      )
      const confirmed = await request(
        `/api/invoices/${invoice.id}/confirm`,
        {},
        operator,
      )
      const paid = db
        .prepare("SELECT paid_at FROM invoices WHERE id=?")
        .get(invoice.id)
      assert.equal(
        confirmed.value.villas.find((v) => v.id === villaId).expires,
        addMonths(paid.paid_at, 1),
      )
    },
  )
  await t.test(
    "SQLite data, sessions, documents and public verification survive restart",
    async () => {
      await new Promise((resolve) => server.close(resolve))
      db.close()
      db = openDatabase(join(folder, "test.sqlite"))
      server = createApp(db, config)
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
      base = `http://127.0.0.1:${server.address().port}`
      const response = await request("/api/state", undefined, owner)
      assert.equal(response.status, 200)
      assert.equal(response.value.villas.find((v) => v.id === villaId).qr, qr)
      assert.equal((await request(`/api/public/qr/${qr}`)).value.valid, true)
      assert.equal(
        (
          await request(
            response.value.villas[0].document.data,
            undefined,
            operator,
          )
        ).status,
        200,
      )
      await request("/api/auth/logout", {}, owner)
      assert.equal((await request("/api/state", undefined, owner)).status, 401)
    },
  )
  await new Promise((resolve) => server.close(resolve))
  db.close()
  rmSync(folder, { recursive: true, force: true })
})

test("SMTP failure remains visible and can be retried", async () => {
  const db = openDatabase(":memory:")
  const user = createUser(
    db,
    "merchant@example.com",
    "Merchant-password",
    "Merchant",
  )
  db.prepare("INSERT INTO documents VALUES ('doc',?,?,?,?)").run(
    user.id,
    "file.pdf",
    "application/pdf",
    Buffer.from("%PDF-"),
  )
  db.prepare(
    "INSERT INTO villas(id,owner_id,name,province,merchant,email,package_id,document_id,created) VALUES ('villa',?,'Villa','Bangkok','Merchant','merchant@example.com','starter','doc','now')",
  ).run(user.id)
  db.prepare(
    "INSERT INTO invoices(id,villa_id,amount,months,created) VALUES ('invoice','villa',99000,3,'now')",
  ).run()
  db.prepare(
    "INSERT INTO mails(id,villa_id,invoice_id,recipient,subject,body,created) VALUES ('mail','villa','invoice','merchant@example.com','subject','body','now')",
  ).run()
  const { createMailWorker } = await import("./mail.mjs")
  const worker = createMailWorker(db, { smtpFrom: "sender@example.com" }, {
    sendMail: async () => {
      throw Object.assign(Error("secret-error-must-not-leak"), {
        code: "EAUTH",
      })
    },
  })
  await new Promise((resolve) => setTimeout(resolve, 20))
  const mail = db.prepare("SELECT * FROM mails").get()
  assert.equal(mail.status, "failed")
  assert.equal(mail.attempts, 1)
  assert.ok(mail.next_attempt > Date.now())
  assert.ok(!mail.last_error.includes("secret"))
  worker.stop()
  db.close()
})
