import { DatabaseSync } from "node:sqlite"
import { wrapSqlite } from "./database-adapter.mjs"
import { mkdirSync, chmodSync, readFileSync } from "node:fs"
import { dirname } from "node:path"
import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto"
export const packages = {
  basic: { name: "Basic Trust QR", amount: 0, capacity: 1 },
  starter: { name: "Trust Starter", amount: 99000, capacity: 1 },
  pro: { name: "Trust Pro", amount: 290000, capacity: 1 },
  plus: { name: "Trust Plus", amount: 490000, capacity: 2 },
  premium: { name: "Trust Premium", amount: 990000, capacity: 10 },
}
export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex")
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`
}
export function verifyPassword(password, value) {
  const [salt, hash] = value.split(":")
  return timingSafeEqual(
    Buffer.from(hash, "hex"),
    scryptSync(password, salt, 64),
  )
}
export function openDatabase(path) {
  if (path !== ":memory:")
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const db = new DatabaseSync(path)
  if (path !== ":memory:") chmodSync(path, 0o600)
  db.exec(`
    CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS subscriptions (
      owner_id TEXT PRIMARY KEY REFERENCES users(id), package_id TEXT NOT NULL,
      expires TEXT, payments INTEGER NOT NULL DEFAULT 0, created TEXT NOT NULL
    );
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('merchant','admin','user'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
      csrf TEXT NOT NULL, expires INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL, mime TEXT NOT NULL, bytes BLOB NOT NULL
    );
    CREATE TABLE IF NOT EXISTS villas (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL,
      province TEXT NOT NULL, merchant TEXT NOT NULL, email TEXT NOT NULL, package_id TEXT NOT NULL,
      document_id TEXT NOT NULL REFERENCES documents(id),
      status TEXT NOT NULL CHECK(status IN ('pending','approved','changes','rejected')) DEFAULT 'pending',
      reason TEXT NOT NULL DEFAULT '', qr TEXT UNIQUE, expires TEXT, payments INTEGER NOT NULL DEFAULT 0,
      created TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY, villa_id TEXT NOT NULL REFERENCES villas(id), amount INTEGER NOT NULL,
      months INTEGER NOT NULL CHECK(months IN (1,3)),
      status TEXT NOT NULL CHECK(status IN ('pending','submitted','paid')) DEFAULT 'pending',
      proof_id TEXT REFERENCES documents(id), reference TEXT NOT NULL DEFAULT '', reason TEXT NOT NULL DEFAULT '',
      created TEXT NOT NULL, paid_at TEXT, confirmed_by TEXT REFERENCES users(id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS one_open_invoice ON invoices(villa_id) WHERE status != 'paid';
    CREATE TABLE IF NOT EXISTS mails (
      id TEXT PRIMARY KEY, villa_id TEXT NOT NULL REFERENCES villas(id), invoice_id TEXT NOT NULL UNIQUE REFERENCES invoices(id),
      recipient TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, created TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued', attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt INTEGER NOT NULL DEFAULT 0, last_error TEXT NOT NULL DEFAULT '', sent_at TEXT
    );
    CREATE TABLE IF NOT EXISTS audits (
      id TEXT PRIMARY KEY, actor_id TEXT NOT NULL REFERENCES users(id), action TEXT NOT NULL,
      target_id TEXT NOT NULL, created TEXT NOT NULL
    );
  `)
  db.exec(
    readFileSync(new URL("./business-schema.sql", import.meta.url), "utf8"),
  )
  // A worker interrupted before receiving SMTP's response retries on restart.
  db.exec("UPDATE mails SET status='queued' WHERE status='sending'")
  // Add columns without discarding existing merchant/admin data.
  const migrate = (table, column, definition) => {
    if (
      !db
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .some((row) => row.name === column)
    )
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
  migrate(
    "invoices",
    "payment_status",
    "TEXT NOT NULL DEFAULT 'WAITING_FOR_SLIP'",
  )
  migrate("invoices", "verification_mode", "TEXT NOT NULL DEFAULT 'MANUAL'")
  migrate("invoices", "currency", "TEXT NOT NULL DEFAULT 'THB'")
  migrate("invoices", "external_transaction_id", "TEXT")
  migrate("invoices", "external_provider", "TEXT")
  migrate("invoices", "updated_at", "TEXT")
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS unique_payment_transaction ON invoices(external_transaction_id) WHERE external_transaction_id IS NOT NULL",
  )
  db.exec(
    "UPDATE invoices SET payment_status=CASE WHEN status='paid' THEN 'VERIFIED' WHEN status='submitted' THEN 'PENDING_REVIEW' ELSE payment_status END",
  )
  migrate(
    "subscriptions",
    "lifecycle",
    "TEXT NOT NULL DEFAULT 'PENDING_RENEWAL'",
  )
  migrate("villas", "verification_level", "TEXT NOT NULL DEFAULT 'VERIFIED'")
  migrate("villas", "photo_url", "TEXT NOT NULL DEFAULT ''")
  migrate("villas", "reviewed_at", "TEXT")
  migrate("villas", "reviewed_by", "TEXT")
  migrate("users", "created", "TEXT NOT NULL DEFAULT ''")
  migrate("users", "last_login", "TEXT")
  for (const field of ["business_name", "phone", "address"])
    migrate("users", field, "TEXT NOT NULL DEFAULT ''")
  migrate("invoices", "subscription_owner", "TEXT REFERENCES users(id)")
  migrate("invoices", "package_id", "TEXT")
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS one_open_subscription_invoice ON invoices(subscription_owner) WHERE status != 'paid' AND subscription_owner IS NOT NULL",
  )
  for (const column of ["phone", "bank_name", "account_name", "account_number"])
    migrate("villas", column, "TEXT NOT NULL DEFAULT ''")
  db.prepare("UPDATE users SET created=? WHERE created=''").run(
    new Date().toISOString(),
  )
  db.exec(`
    CREATE TABLE IF NOT EXISTS oauth_identities (
      provider TEXT NOT NULL, subject TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id),
      PRIMARY KEY(provider, subject), UNIQUE(provider, user_id)
    );
    CREATE TABLE IF NOT EXISTS oauth_states (
      state_hash TEXT PRIMARY KEY, provider TEXT NOT NULL, verifier TEXT NOT NULL,
      return_to TEXT NOT NULL, expires INTEGER NOT NULL
    );
  `)
  for (const [id, plan] of Object.entries(packages))
    db.prepare(
      "INSERT INTO package_catalog(id,name,slug,description,amount,capacity,trial_months,max_level,banner,sort_order,created,updated) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING",
    ).run(
      id,
      plan.name,
      id,
      "แพ็กเกจ Merchant",
      plan.amount,
      plan.capacity,
      id === "basic" ? 3 : 0,
      id === "premium" ? "PREMIUM_VERIFIED" : "VERIFIED",
      id === "premium" ? 1 : 0,
      Object.keys(packages).indexOf(id),
      new Date().toISOString(),
      new Date().toISOString(),
    )
  db.exec(
    "INSERT INTO leads(id,user_id,type,name,email,source,created,updated) SELECT id,id,UPPER(role),name,email,'REGISTRATION',created,created FROM users WHERE role IN ('user','merchant') AND id NOT IN (SELECT user_id FROM leads WHERE user_id IS NOT NULL)",
  )
  return wrapSqlite(db)
}
export async function transaction(db, work) {
  return db.transaction(work)
}
export async function createUser(db, email, password, name, role = "merchant") {
  const id = randomUUID()
  await db
    .prepare(
      "INSERT INTO users(id,email,name,password_hash,role) VALUES (?,?,?,?,?)",
    )
    .run(id, email.toLowerCase(), name, hashPassword(password), role)
  await db
    .prepare("UPDATE users SET created=? WHERE id=?")
    .run(new Date().toISOString(), id)
  if (["user", "merchant"].includes(role))
    await db
      .prepare(
        "INSERT INTO leads(id,user_id,type,name,email,source,created,updated) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO NOTHING",
      )
      .run(
        randomUUID(),
        id,
        role.toUpperCase(),
        name,
        email.toLowerCase(),
        "REGISTRATION",
        new Date().toISOString(),
        new Date().toISOString(),
      )
  return { id, email: email.toLowerCase(), name, role }
}
export async function audit(db, actor, action, target) {
  await db
    .prepare("INSERT INTO audits VALUES (?,?,?,?,?)")
    .run(randomUUID(), actor.id, action, target, new Date().toISOString())
}
// Calculate calendar months in Bangkok, independent of the server's timezone.
export function addMonths(value, months) {
  const local = new Date(new Date(value).getTime() + 7 * 3600000)
  const day = local.getUTCDate()
  local.setUTCDate(1)
  local.setUTCMonth(local.getUTCMonth() + months)
  const end = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 0),
  ).getUTCDate()
  local.setUTCDate(Math.min(day, end))
  return new Date(local.getTime() - 7 * 3600000).toISOString()
}
export async function createInvoice(db, villa, appUrl) {
  const id = randomUUID()
  const plan = await db
    .prepare("SELECT * FROM package_catalog WHERE id=?")
    .get(villa.package_id)
  const cycleMonths={MONTHLY:1,QUARTERLY:3,YEARLY:12}[plan.billing_cycle] || 1
  const months=plan.billing_cycle === "MONTHLY" && villa.payments === 0 ? 3 : cycleMonths
  const created = new Date().toISOString()
  // The first payment covers the selected monthly package and includes a 3-month QR validity.
  await db
    .prepare(
      "INSERT INTO invoices(id,villa_id,amount,months,created,updated_at) VALUES (?,?,?,?,?,?)",
    )
    .run(id, villa.id, plan.amount, months, created, created)
  const subject = `VillaCheck: ${villa.name} ${
    months === 3 ? "ผ่านการอนุมัติ" : "ต่ออายุ QR"
  } กรุณาชำระแพ็กเกจ`
  const body = `เรียน ${villa.merchant}\n\nVilla: ${villa.name}\nแพ็กเกจ: ${plan.name}\nยอดชำระ: ฿${(plan.amount / 100).toLocaleString("th-TH")}\nเลขที่ใบแจ้งชำระ: ${id}\n\nเข้าสู่ระบบที่ ${appUrl}/#page=owner-package เพื่อดูวิธีชำระและแนบสลิป\nAdmin จะตรวจยืนยันการชำระ จากนั้น QR มีอายุ ${months} เดือน\n1 Villa = 1 QR การต่ออายุใช้รหัสเดิม`
  await db
    .prepare(
      "INSERT INTO mails(id,villa_id,invoice_id,recipient,subject,body,created) VALUES (?,?,?,?,?,?,?)",
    )
    .run(randomUUID(), villa.id, id, villa.email, subject, body, created)
  return id
}
