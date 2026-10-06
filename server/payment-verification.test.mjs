import test from "node:test"
import assert from "node:assert/strict"
import {
  PaymentVerificationService,
  AutoPaymentVerificationStrategy,
} from "./payment-verification.mjs"
test("manual and unconfigured AUTO never approve payments", async () => {
  for (const mode of ["MANUAL", "AUTO"])
    assert.equal(
      (await new PaymentVerificationService(mode).verify("payment")).verified,
      false,
    )
  assert.throws(() => new PaymentVerificationService("INVALID"))
})
test("external errors fall back to review instead of rejecting", async () => {
  const strategy = new AutoPaymentVerificationStrategy({
    verify: async () => {
      throw Error("timeout")
    },
  })
  const result = await strategy.verify("payment")
  assert.equal(result.verified, false)
  assert.match(result.reason, /manual review/)
})

test("payment activation failure rolls back the payment record", async () => {
  const { openDatabase, createUser } = await import("./database.mjs")
  const { confirmPayment } = await import("./payment-service.mjs")
  const db = openDatabase(":memory:")
  try {
    const owner = await createUser(
      db,
      "merchant@rollback.test",
      "LongPassword123",
      "Merchant",
      "merchant",
    )
    await db
      .prepare(
        "INSERT INTO documents(id,owner_id,name,mime,bytes) VALUES (?,?,?,?,?)",
      )
      .run("doc", owner.id, "proof", "image/png", Buffer.from("data"))
    await db
      .prepare(
        "INSERT INTO villas(id,owner_id,name,province,merchant,email,package_id,document_id,created) VALUES (?,?,?,?,?,?,?,?,?)",
      )
      .run(
        "villa",
        owner.id,
        "Villa",
        "ชลบุรี",
        "Merchant",
        "merchant@rollback.test",
        "starter",
        "doc",
        new Date().toISOString(),
      )
    await db
      .prepare(
        "INSERT INTO invoices(id,villa_id,amount,months,status,subscription_owner,created) VALUES (?,?,?,?,?,?,?)",
      )
      .run(
        "payment",
        "villa",
        99000,
        3,
        "submitted",
        owner.id,
        new Date().toISOString(),
      )
    const invoice = await db
      .prepare("SELECT * FROM invoices WHERE id=?")
      .get("payment")
    const villa = await db
      .prepare("SELECT * FROM villas WHERE id=?")
      .get("villa")
    // Missing subscription forces activation to fail after the payment UPDATE.
    await assert.rejects(
      db.transaction(() => confirmPayment(db, invoice, villa, owner.id)),
    )
    const after = await db
      .prepare("SELECT * FROM invoices WHERE id=?")
      .get("payment")
    assert.equal(after.status, "submitted")
    assert.equal(after.paid_at, null)
    assert.equal(
      (await db.prepare("SELECT qr FROM villas WHERE id=?").get("villa")).qr,
      null,
    )
  } finally {
    await db.close()
  }
})
