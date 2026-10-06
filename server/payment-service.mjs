import { randomUUID } from "node:crypto"
import { addMonths } from "./database.mjs"
import { activateSubscription } from "./subscriptions.mjs"
// Caller owns one DB transaction covering payment, subscription and Villa QR.
export async function confirmPayment(db, invoice, villa, adminId) {
  if (invoice.status === "paid") return
  const sub = invoice.subscription_owner
    ? await db
        .prepare("SELECT lifecycle FROM subscriptions WHERE owner_id=?")
        .get(invoice.subscription_owner)
    : null
  if (["SUSPENDED", "CANCELLED"].includes(sub?.lifecycle))
    throw Object.assign(Error("Subscription ถูกระงับหรือยกเลิก"), { status: 409 })
  const now = new Date()
  await db
    .prepare(
      "UPDATE invoices SET status='paid',payment_status='VERIFIED',paid_at=?,confirmed_by=?,updated_at=?,reason='' WHERE id=?",
    )
    .run(now.toISOString(), adminId, now.toISOString(), invoice.id)
  await db
    .prepare(
      "UPDATE payment_qrs SET status='PAID',updated=? WHERE payment_id=? AND status='ACTIVE'",
    )
    .run(now.toISOString(), invoice.id)
  if (invoice.subscription_owner) {
    if (invoice.package_id) {
      await db
        .prepare("UPDATE subscriptions SET package_id=? WHERE owner_id=?")
        .run(invoice.package_id, invoice.subscription_owner)
      await db
        .prepare("UPDATE villas SET package_id=? WHERE owner_id=?")
        .run(invoice.package_id, invoice.subscription_owner)
    }
    await activateSubscription(
      db,
      invoice.subscription_owner,
      invoice.months,
      now,
    )
  } else {
    const base =
      villa.expires && new Date(villa.expires) > now
        ? new Date(villa.expires)
        : now
    await db
      .prepare(
        "UPDATE villas SET qr=?,expires=?,payments=payments+1 WHERE id=?",
      )
      .run(
        villa.qr || `VC-${randomUUID()}`,
        addMonths(base, invoice.months),
        villa.id,
      )
  }
}
