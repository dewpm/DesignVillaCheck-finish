import test from "node:test"
import assert from "node:assert/strict"
import { openTestDatabase } from "./test-database.mjs"
import { createUser, hashPassword } from "./database.mjs"
import { createApp } from "./app.mjs"
import { generatePaymentQr, paymentQrDto } from "./payment-qr.mjs"
import { trustDto, getPlan } from "./catalog.mjs"

test("dynamic catalog, trial without invoice, leads, settings, payment QR expiry and immutable Villa identity", async (t) => {
  const db = await openTestDatabase(),
    admin = await createUser(
      db,
      "business-admin@test.com",
      "AdminPassword123",
      "Admin",
      "admin",
    ),
    merchant = await createUser(
      db,
      "business-merchant@test.com",
      "MerchantPassword123",
      "Merchant",
      "merchant",
    )
  const config = {
    appUrl: "http://localhost:3001",
    allowedOrigins: ["http://localhost:3001"],
    fakeHash: hashPassword("fake-password"),
    serverless: true,
  }
  const server = createApp(db, config)
  await new Promise((r) => server.listen(0, "127.0.0.1", r))
  t.after(async () => {
    await new Promise((r) => server.close(r))
    await db.close()
  })
  const base = `http://127.0.0.1:${server.address().port}`
  const request = async (path, data, session, method) => {
    const r = await fetch(base + path, {
      method: method || (data ? "POST" : "GET"),
      headers: {
        "Content-Type": "application/json",
        Origin: config.appUrl,
        ...(session
          ? { Cookie: session.cookie, "X-CSRF-Token": session.csrf }
          : {}),
      },
      body: data ? JSON.stringify(data) : undefined,
    })
    return {
      status: r.status,
      value: await r.json(),
      cookie: r.headers.get("set-cookie")?.split(";")[0],
    }
  }
  const login = async (email, password) => {
    const r = await request("/api/auth/login", { email, password })
    return { cookie: r.cookie, csrf: r.value.csrf }
  }
  const a = await login(admin.email, "AdminPassword123"),
    m = await login(merchant.email, "MerchantPassword123")
  await t.test("public contact records typed leads without exposing private records",async()=>{
    assert.equal((await request("/api/leads",{type:"MERCHANT",name:"Interested",email:"contact@test.com",phone:"0812345678"})).status,200)
    assert.equal((await request("/api/leads",{type:"ADMIN",name:"Bad",email:"contact@test.com"})).status,400)
    const rows=(await request("/api/admin/leads?type=MERCHANT",undefined,a)).value.leads
    assert.ok(rows.some(x=>x.source === "CONTACT" && x.email === "contact@test.com"))
  })
  await t.test(
    "Merchant profile is private and saves contact lead",
    async () => {
      assert.equal(
        (
          await request(
            "/api/merchant/profile",
            {
              businessName: "Business",
              contactName: "Contact",
              phone: "0812345678",
              address: "Bangkok",
            },
            m,
          )
        ).status,
        200,
      )
      assert.equal(
        (await request("/api/merchant/profile", undefined, a)).status,
        403,
      )
      assert.equal(
        (await request("/api/merchant/profile", undefined, m)).value
          .businessName,
        "Business",
      )
    },
  )
  await t.test(
    "package edits reach public API and Merchant cannot edit",
    async () => {
      const plan = await getPlan(db, "starter")
      const changed = {
        ...plan,
        amount: 123400,
        trialMonths: 2,
        showPremiumBanner: true,
        maximumVerificationLevel: "PREMIUM_VERIFIED",
        features: ["Dynamic feature"],
        sort_order: 1,
      }
      assert.equal(
        (await request("/api/admin/packages/starter", changed, m)).status,
        403,
      )
      assert.equal(
        (await request("/api/admin/packages/starter", changed, a)).status,
        200,
      )
      const catalog = await request("/api/packages")
      assert.equal(
        catalog.value.packages.find((x) => x.id === "starter").amount,
        123400,
      )
      assert.deepEqual(
        catalog.value.packages.find((x) => x.id === "starter").features,
        ["Dynamic feature"],
      )
    },
  )
  await t.test(
    "leads separate users and merchants; database AUTO falls back",
    async () => {
      await createUser(
        db,
        "lead-user@test.com",
        "UserPassword123",
        "Customer",
        "user",
      )
      assert.equal(
        (await request("/api/admin/leads?type=USER", undefined, a)).value.leads
          .length,
        1,
      )
      assert.equal(
        (await request("/api/admin/leads", undefined, m)).status,
        403,
      )
      assert.equal(
        (
          await request(
            "/api/admin/settings",
            { paymentVerificationMode: "AUTO" },
            a,
          )
        ).status,
        200,
      )
      assert.equal(
        (await request("/api/admin/settings", undefined, a)).value
          .paymentVerificationMode,
        "AUTO",
      )
    },
  )
  const document = {
    name: "ownership.pdf",
    type: "application/pdf",
    data: `data:application/pdf;base64,${Buffer.from("%PDF-test").toString("base64")}`,
  }
  await request("/api/subscription", { packageId: "starter" }, m)
  await request(
    "/api/villas",
    {
      name: "Dynamic Villa",
      province: "ชลบุรี",
      merchant: "Merchant",
      email: merchant.email,
      document,
    },
    m,
  )
  let state = (await request("/api/state", undefined, m)).value
  const id = state.villas[0].id
  await t.test(
    "Premium entitlement alone does not verify a pending Villa",
    async () => {
      const v = await db.prepare("SELECT * FROM villas WHERE id=?").get(id)
      const trust = await trustDto(db, v)
      assert.equal(trust.premiumBanner, false)
      assert.equal(trust.verificationLevel, "REGISTERED")
    },
  )
  await t.test(
    "config-driven two-month trial makes no invoice or payment QR",
    async () => {
      assert.equal(
        (await request(`/api/villas/${id}/review`, { status: "approved" }, a))
          .status,
        200,
      )
      state = (await request("/api/state", undefined, m)).value
      assert.equal(state.villas[0].invoices.length, 0)
      assert.equal(state.subscription.status, "ACTIVE")
      assert.ok(state.villas[0].qr)
      assert.equal(state.villas[0].premiumBanner, false)
      assert.equal(state.villas[0].verificationLevel, "VERIFIED")
    assert.equal((await request(`/api/villas/${id}/verification-level`,{verificationLevel:"PREMIUM_VERIFIED"},m)).status,403)
    assert.equal((await request(`/api/villas/${id}/verification-level`,{verificationLevel:"PREMIUM_VERIFIED"},a)).status,200)
    assert.equal((await request("/api/state",undefined,m)).value.villas[0].premiumBanner,true)
    },
  )
  const original = state.villas[0].qr
  await t.test(
    "expiry and suspension change status, never identity",
    async () => {
      await db
        .prepare(
          "UPDATE subscriptions SET expires='2000-01-01T00:00:00Z' WHERE owner_id=?",
        )
        .run(merchant.id)
      let v = await db.prepare("SELECT * FROM villas WHERE id=?").get(id)
      assert.equal((await trustDto(db, v)).qrStatus, "EXPIRED")
      assert.equal(v.qr, original)
      await db
        .prepare(
          "UPDATE subscriptions SET expires='2099-01-01T00:00:00Z',lifecycle='SUSPENDED' WHERE owner_id=?",
        )
        .run(merchant.id)
      assert.equal((await trustDto(db, v)).qrStatus, "SUSPENDED")
      await db
        .prepare("UPDATE subscriptions SET lifecycle='ACTIVE' WHERE owner_id=?")
        .run(merchant.id)
    },
  )
  await request(`/api/villas/${id}/renew`, {}, m)
  state = (await request("/api/state", undefined, m)).value
  const invoice = state.villas[0].invoices[0]
  await t.test(
    "payment QR expires in three hours and regeneration cancels old QR",
    async () => {
      assert.equal(invoice.paymentQr.status, "ACTIVE")
      assert.equal(
        Date.parse(invoice.paymentQr.expiresAt) -
          Date.parse(invoice.paymentQr.generatedAt),
        10800000,
      )
      const qr = await db.transaction(() =>
        generatePaymentQr(db, invoice.id, config.appUrl, Date.now() + 1000),
      )
      assert.notEqual(qr.id, invoice.paymentQr.id)
      assert.equal(
        (
          await db
            .prepare("SELECT status FROM payment_qrs WHERE id=?")
            .get(invoice.paymentQr.id)
        ).status,
        "CANCELLED",
      )
      assert.equal(
        (
          await request(
            `/api/payments/attempt?id=${invoice.paymentQr.id}`,
            undefined,
            m,
          )
        ).status,
        410,
      )
      const expired = await paymentQrDto(
        db,
        invoice.id,
        Date.parse(qr.expiresAt),
      )
      assert.equal(expired.status, "EXPIRED")
      assert.equal(expired.qrData, null)
      assert.equal(
        (await db.prepare("SELECT qr FROM villas WHERE id=?").get(id)).qr,
        original,
      )
    },
  )
  await t.test(
    "AUTO placeholder upload remains PENDING_REVIEW and PATCH reject permits resubmission",
    async () => {
      assert.equal(
        (
          await request(
            `/api/payments/${invoice.id}/slip`,
            { reference: "BANK-AUTO-TEST", document },
            m,
          )
        ).status,
        200,
      )
      const pending = (
        await request(`/api/payments/${invoice.id}/status`, undefined, m)
      ).value
      assert.equal(pending.paymentStatus, "PENDING_REVIEW")
      assert.equal(pending.verificationMode, "AUTO")
      assert.equal(
        (
          await request(
            `/api/admin/payments/${invoice.id}/reject`,
            { reason: "ยอดไม่ตรง" },
            a,
            "PATCH",
          )
        ).status,
        200,
      )
      assert.equal(
        (await request(`/api/payments/${invoice.id}/status`, undefined, m))
          .value.paymentStatus,
        "REJECTED",
      )
      assert.equal(
        (
          await request(
            `/api/payments/${invoice.id}/slip`,
            { reference: "BANK-AUTO-CORRECTED", document },
            m,
          )
        ).status,
        200,
      )
      assert.equal(
        (
          await request(
            `/api/admin/payments/${invoice.id}/approve`,
            {},
            a,
            "PATCH",
          )
        ).status,
        200,
      )
      assert.equal(
        (await request(`/api/payments/${invoice.id}/status`, undefined, m))
          .value.paymentStatus,
        "VERIFIED",
      )
    },
  )
})
