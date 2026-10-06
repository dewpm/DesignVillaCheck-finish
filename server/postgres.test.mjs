import test from "node:test"
import assert from "node:assert/strict"
import { openTestDatabase } from "./test-database.mjs"
import { postgresSql } from "./postgres.mjs"
import { createUser, transaction } from "./database.mjs"
import { createMailWorker } from "./mail.mjs"

test("PostgreSQL parameters preserve quoted question marks", () => {
  assert.equal(
    postgresSql("SELECT '?' AS label, \"?\", ? AS a, ? AS b"),
    "SELECT '?' AS label, \"?\", $1 AS a, $2 AS b",
  )
})

test(
  "PostgreSQL transactions, binary documents, epoch integers and isolated requests",
  { skip: !process.env.TEST_DATABASE_URL },
  async (t) => {
    const db = await openTestDatabase()
    t.after(() => db.close())
    const user = await createUser(
      db,
      "pg@example.com",
      "Test-password-123",
      "PG User",
    )
    const bytes = Buffer.from([0, 1, 128, 255])
    await db
      .prepare("INSERT INTO documents VALUES ('doc',?,?,?,?)")
      .run(user.id, "proof.pdf", "application/pdf", bytes)
    assert.deepEqual(
      (await db.prepare("SELECT bytes FROM documents WHERE id='doc'").get())
        .bytes,
      bytes,
    )
    const expiry = Date.now() + 28800000
    await db
      .prepare("INSERT INTO sessions VALUES ('token',?,'csrf',?)")
      .run(user.id, expiry)
    assert.equal(
      (await db.prepare("SELECT expires FROM sessions").get()).expires,
      expiry,
    )
    await assert.rejects(
      transaction(db, async () => {
        await db
          .prepare("UPDATE users SET name='rolled-back' WHERE id=?")
          .run(user.id)
        throw Error("rollback")
      }),
      /rollback/,
    )
    assert.equal(
      (await db.prepare("SELECT name FROM users WHERE id=?").get(user.id)).name,
      "PG User",
    )
    let release, started
    const gate = new Promise((resolve) => {
      release = resolve
    })
    const ready = new Promise((resolve) => {
      started = resolve
    })
    const pending = transaction(db, async () => {
      await db
        .prepare("UPDATE users SET name='committed' WHERE id=?")
        .run(user.id)
      started()
      await gate
    })
    await ready
    assert.equal(
      (await db.prepare("SELECT name FROM users WHERE id=?").get(user.id)).name,
      "PG User",
    )
    release()
    await pending
    assert.equal(
      (await db.prepare("SELECT name FROM users WHERE id=?").get(user.id)).name,
      "committed",
    )
  },
)

test("concurrent mail workers claim each invoice once", async (t) => {
  const db = await openTestDatabase()
  t.after(() => db.close())
  const user = await createUser(
    db,
    "mail@example.com",
    "Test-password-123",
    "Merchant",
  )
  await db
    .prepare(
      "INSERT INTO documents VALUES ('doc',?,'proof.pdf','application/pdf',?)",
    )
    .run(user.id, Buffer.from("%PDF-"))
  await db
    .prepare(
      "INSERT INTO villas(id,owner_id,name,province,merchant,email,package_id,document_id,created) VALUES ('villa',?,'Villa','Bangkok','Merchant','mail@example.com','basic','doc','now')",
    )
    .run(user.id)
  await db
    .prepare(
      "INSERT INTO invoices(id,villa_id,amount,months,created) VALUES ('invoice','villa',0,3,'now')",
    )
    .run()
  await db
    .prepare(
      "INSERT INTO mails(id,villa_id,invoice_id,recipient,subject,body,created) VALUES ('mail','villa','invoice','mail@example.com','test','test','now')",
    )
    .run()
  let sent = 0
  const transport = {
    sendMail: async () => {
      sent++
      await new Promise((resolve) => setTimeout(resolve, 10))
    },
  }
  const a = createMailWorker(db, { serverless: true }, transport)
  const b = createMailWorker(db, { serverless: true }, transport)
  t.after(() => {
    a.stop()
    b.stop()
  })
  await Promise.all([a.run(), a.run(), b.run()])
  assert.equal(sent, 1)
  assert.equal(
    (await db.prepare("SELECT status FROM mails").get()).status,
    "sent",
  )
})
