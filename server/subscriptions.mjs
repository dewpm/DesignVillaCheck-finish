import { randomUUID } from "node:crypto"
import { addMonths, packages, createInvoice } from "./database.mjs"
export async function getSubscription(db, ownerId) {
  return await db
    .prepare("SELECT * FROM subscriptions WHERE owner_id=?")
    .get(ownerId)
}
export async function subscriptionDto(db, ownerId) {
  const sub = await getSubscription(db, ownerId)
  if (!sub) return null
  const plan = packages[sub.package_id]
  const used = (
    await db
      .prepare("SELECT count(*) AS n FROM villas WHERE owner_id=?")
      .get(ownerId)
  ).n
  return {
    packageId: sub.package_id,
    name: plan.name,
    amount: plan.amount / 100,
    capacity: plan.capacity,
    used,
    expires: sub.expires,
    active: Boolean(sub.expires && new Date(sub.expires) > new Date()),
    payments: sub.payments,
  }
}
export async function activateSubscription(
  db,
  ownerId,
  months,
  now = new Date(),
) {
  const sub = await getSubscription(db, ownerId)
  const base =
    sub.expires && new Date(sub.expires) > now ? new Date(sub.expires) : now
  const expires = addMonths(base, months)
  await db
    .prepare(
      "UPDATE subscriptions SET expires=?,payments=payments+1 WHERE owner_id=?",
    )
    .run(expires, ownerId)
  for (const villa of await db
    .prepare("SELECT * FROM villas WHERE owner_id=? AND status='approved'")
    .all(ownerId)) {
    await db
      .prepare(
        "UPDATE villas SET qr=?,expires=?,payments=payments+1 WHERE id=?",
      )
      .run(villa.qr || `VC-${randomUUID()}`, expires, villa.id)
  }
}
export async function activateVilla(db, villa) {
  const sub = await getSubscription(db, villa.owner_id)
  if (!sub?.expires || new Date(sub.expires) <= new Date()) return false
  await db
    .prepare("UPDATE villas SET qr=?,expires=?,payments=? WHERE id=?")
    .run(villa.qr || `VC-${randomUUID()}`, sub.expires, sub.payments, villa.id)
  return true
}
export async function subscriptionInvoice(db, villa, appUrl, selectedPlan) {
  const existing = await db
    .prepare(
      "SELECT id FROM invoices WHERE subscription_owner=? AND status!='paid'",
    )
    .get(villa.owner_id)
  if (existing) return existing.id
  const sub = await getSubscription(db, villa.owner_id)
  const planId = selectedPlan || sub.package_id
  const id = await createInvoice(
    db,
    { ...villa, package_id: planId, payments: sub.payments },
    appUrl,
  )
  await db
    .prepare("UPDATE invoices SET subscription_owner=?,package_id=? WHERE id=?")
    .run(villa.owner_id, planId, id)
  const plan = packages[planId]
  await db
    .prepare("UPDATE mails SET subject=?,body=? WHERE invoice_id=?")
    .run(
      `VillaCheck: ${plan.name} สำหรับบัญชี Merchant ${
        plan.amount ? "แจ้งชำระแพ็กเกจ" : "เปิดใช้งานทดลองฟรี"
      }`,
      `เรียน ${villa.merchant}\n\nแพ็กเกจบัญชี Merchant: ${plan.name}\nรองรับ ${plan.capacity} Villa · แต่ละ Villa มี QR ของตัวเอง\nยอดชำระ ฿${plan.amount / 100} ต่อบัญชีแพ็กเกจ\nเลขที่ใบแจ้งชำระ: ${id}\n${appUrl}/#page=owner-package\n${
        plan.amount
          ? "กรุณาแนบสลิปเพื่อให้ Admin ยืนยันการชำระ แล้วระบบจะเปิดใช้ QR ของ Villa ที่อนุมัติแล้ว"
          : "Admin อนุมัติแล้ว เปิดใช้ QR ทดลองฟรี 3 เดือน ไม่มีค่าใช้จ่าย"
      }\nการต่ออายุแพ็กเกจครั้งถัดไปเพิ่มอายุ 1 เดือนให้ QR ภายในแพ็กเกจ โดยใช้รหัสเดิม`,
      id,
    )
  return id
}
