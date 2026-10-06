import { packages } from "./database.mjs"
export const levels = [
  "REGISTERED",
  "BASIC_CHECKED",
  "VERIFIED",
  "PREMIUM_VERIFIED",
]
export async function seedCatalog(db) {
  for (const [id, plan] of Object.entries(packages)) {
    await db
      .prepare(
        "INSERT INTO package_catalog(id,name,slug,description,amount,currency,billing_cycle,trial_months,capacity,features,max_level,banner,active,sort_order,created,updated) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING",
      )
      .run(
        id,
        plan.name,
        id,
        "แพ็กเกจบัญชี Merchant",
        plan.amount,
        "THB",
        "MONTHLY",
        id === "basic" ? 3 : 0,
        plan.capacity,
        JSON.stringify([
          "1 Villa = 1 QR",
          "เอกสารต้องผ่าน Admin",
          `รองรับ ${plan.capacity} Villa`,
        ]),
        id === "premium" ? "PREMIUM_VERIFIED" : "VERIFIED",
        id === "premium" ? 1 : 0,
        1,
        Object.keys(packages).indexOf(id),
        new Date().toISOString(),
        new Date().toISOString(),
      )
  }
}
export async function getPlan(db, id) {
  if (typeof id !== "string" || !id)
    throw Object.assign(Error("แพ็กเกจไม่ถูกต้อง"), { status: 400 })
  const row = await db
    .prepare("SELECT * FROM package_catalog WHERE id=?")
    .get(id)
  if (!row) throw Object.assign(Error("ไม่พบแพ็กเกจ"), { status: 400 })
  return {
    ...row,
    features: JSON.parse(row.features),
    trialMonths: row.trial_months,
    maximumVerificationLevel: row.max_level,
    showPremiumBanner: Boolean(row.banner),
    isActive: Boolean(row.active),
    billingCycle: row.billing_cycle,
  }
}
export async function listPlans(db, all = false) {
  const rows = await db
    .prepare(
      `SELECT id FROM package_catalog ${
        all ? "" : "WHERE active=1"
      } ORDER BY sort_order,id`,
    )
    .all()
  return Promise.all(rows.map((row) => getPlan(db, row.id)))
}
export async function getVerificationMode(db, fallback = "MANUAL") {
  const row = await db
    .prepare(
      "SELECT value FROM system_settings WHERE key='payment_verification_mode'",
    )
    .get()
  return row?.value || fallback
}
export function qrState(villa, subscription, now = Date.now()) {
  if (villa.status === "changes" || villa.status === "rejected")
    return "SUSPENDED"
  if (subscription?.lifecycle === "SUSPENDED" || villa.status === "suspended")
    return "SUSPENDED"
  if (subscription?.lifecycle === "CANCELLED") return "INACTIVE"
  if (villa.status !== "approved" || !villa.qr) return "PENDING"
  return new Date(subscription?.expires || villa.expires).getTime() > now
    ? "ACTIVE"
    : "EXPIRED"
}
export async function trustDto(db, villa) {
  const sub = await db
    .prepare("SELECT * FROM subscriptions WHERE owner_id=?")
    .get(villa.owner_id)
  const plan = await getPlan(db, sub?.package_id || villa.package_id)
  const qrStatus = qrState(villa, sub)
  const actual = qrStatus === "ACTIVE" ? villa.verification_level : "REGISTERED"
  return {
    qrStatus,
    verificationStatus:
      qrStatus === "EXPIRED"
        ? "EXPIRED"
        : villa.status === "approved"
          ? "APPROVED"
          : villa.status === "rejected"
            ? "REJECTED"
            : "PENDING_REVIEW",
    verificationLevel:
      levels.indexOf(actual) <= levels.indexOf(plan.max_level)
        ? actual
        : plan.max_level,
    premiumBanner:
      qrStatus === "ACTIVE" &&
      villa.status === "approved" &&
      Boolean(plan.banner) &&
      plan.max_level === "PREMIUM_VERIFIED" &&
      actual === "PREMIUM_VERIFIED",
    merchantName: villa.merchant,
    packageName: plan.name,
  }
}
