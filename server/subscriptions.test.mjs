import { openTestDatabase } from "./test-database.mjs"
import { test } from "node:test"
import assert from "node:assert/strict"
import { createApp } from "./app.mjs"
import {
  openDatabase,
  createUser,
  hashPassword,
  packages,
} from "./database.mjs"
test("merchant package capacity, one bill, separate villa QR, shared renewal and Basic trial", async (t) => {
  const db = await openTestDatabase()
  await createUser(
    db,
    "admin@example.com",
    "Admin-password-123",
    "Admin",
    "admin",
  )
  const server = createApp(db, {
    appUrl: "http://localhost:3001",
    allowedOrigins: [],
    paymentInstructions: "Bank",
    fakeHash: hashPassword("fake-password-placeholder"),
  })
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve))
    await db.close()
  })
  const base = `http://127.0.0.1:${server.address().port}`
  const request = async (path, data, auth) => {
    const response = await fetch(base + path, {
      method: data === undefined ? "GET" : "POST",
      headers: {
        ...(data === undefined ? {} : { "Content-Type": "application/json" }),
        ...(auth ? { cookie: auth.cookie, "X-CSRF-Token": auth.csrf } : {}),
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    })
    const value = await response.json()
    return {
      status: response.status,
      value,
      cookie: response.headers.get("set-cookie")?.split(";")[0],
      csrf: value.csrf,
    }
  }
  const admin = await request("/api/auth/login", {
    email: "admin@example.com",
    password: "Admin-password-123",
  })
  const document = {
    name: "proof.pdf",
    data:
      "data:application/pdf;base64," +
      Buffer.from("%PDF-1.4\nfixture").toString("base64"),
  }
  for (const [planId, plan] of Object.entries(packages)) {
    await t.test(
      `${plan.name}: ${plan.capacity} villas, ${plan.capacity} unique QR codes`,
      async () => {
        await createUser(
          db,
          `${planId}@example.com`,
          "Merchant-password-123",
          plan.name,
        )
        const owner = await request("/api/auth/login", {
          email: `${planId}@example.com`,
          password: "Merchant-password-123",
        })
        const villaData = {
          name: "Villa",
          province: "Chonburi",
          merchant: plan.name,
          email: `${planId}@example.com`,
          document,
          packageId: "premium",
        }
        assert.equal(
          (await request("/api/villas", villaData, owner)).status,
          409,
        )
        assert.equal(
          (await request("/api/subscription", { packageId: planId }, owner))
            .status,
          200,
        )
        assert.equal(
          (await request("/api/subscription", { packageId: "invalid" }, owner))
            .status,
          400,
        )
        const ids = []
        for (let i = 0; i < plan.capacity; i++) {
          const created = await request(
            "/api/villas",
            { ...villaData, name: `Villa ${i}` },
            owner,
          )
          assert.equal(created.status, 201)
          ids.push(created.value.createdId)
          assert.equal(
            created.value.villas.find((v) => v.id === created.value.createdId)
              .packageId,
            planId,
          )
        }
        assert.equal(
          (await request("/api/villas", villaData, owner)).status,
          409,
        )
        for (const id of ids)
          assert.equal(
            (
              await request(
                `/api/villas/${id}/review`,
                { status: "approved" },
                admin,
              )
            ).status,
            200,
          )
        let state = (await request("/api/state", undefined, owner)).value
        const invoices = state.villas.flatMap((v) => v.invoices)
        assert.equal(invoices.length, 1)
        assert.equal(invoices[0].amount, plan.amount / 100)
        assert.equal(invoices[0].scope, "merchant")
        const invoice = invoices[0]
        if (plan.amount) {
          assert.ok(state.villas.every((v) => !v.qr))
          await request(
            `/api/invoices/${invoice.id}/proof`,
            { document, reference: "BANK-TRANSFER" },
            owner,
          )
          assert.equal(
            (await request(`/api/invoices/${invoice.id}/confirm`, {}, admin))
              .status,
            200,
          )
        } else assert.equal(invoice.status, "paid")
        state = (await request("/api/state", undefined, owner)).value
        assert.equal(state.subscription.active, true)
        assert.equal(state.subscription.used, plan.capacity)
        assert.equal(new Set(state.villas.map((v) => v.qr)).size, plan.capacity)
        assert.ok(
          state.villas.every(
            (v) => v.qr && v.expires === state.subscription.expires,
          ),
        )
        const before = state.villas.map((v) => v.qr).sort()
        const expiry = state.subscription.expires
        if (planId === "basic") {
          assert.equal(
            (await request(`/api/villas/${ids[0]}/renew`, {}, owner)).status,
            400,
          )
          await request(
            `/api/villas/${ids[0]}/renew`,
            { packageId: "premium" },
            owner,
          )
          // Upgrade capacity is not granted until payment is confirmed.
          assert.equal(
            (await request("/api/state", undefined, owner)).value.subscription
              .capacity,
            1,
          )
          assert.equal(
            (await request("/api/villas", villaData, owner)).status,
            409,
          )
        } else {
          await Promise.all(
            ids.map((id) => request(`/api/villas/${id}/renew`, {}, owner)),
          )
        }
        state = (await request("/api/state", undefined, owner)).value
        const pending = state.villas
          .flatMap((v) => v.invoices)
          .filter((i) => i.status === "pending")
        assert.equal(pending.length, 1)
        assert.equal(pending[0].months, 1)
        await request(
          `/api/invoices/${pending[0].id}/proof`,
          { document, reference: "RENEWAL-TRANSFER" },
          owner,
        )
        await request(`/api/invoices/${pending[0].id}/confirm`, {}, admin)
        state = (await request("/api/state", undefined, owner)).value
        assert.deepEqual(state.villas.map((v) => v.qr).sort(), before)
        assert.ok(state.subscription.expires > expiry)
        assert.ok(
          state.villas.every((v) => v.expires === state.subscription.expires),
        )
        if (planId === "basic") assert.equal(state.subscription.capacity, 10)
        const renewed = state.subscription.expires
        await request(`/api/invoices/${pending[0].id}/confirm`, {}, admin)
        assert.equal(
          (await request("/api/state", undefined, owner)).value.subscription
            .expires,
          renewed,
        )
      },
    )
  }
})
