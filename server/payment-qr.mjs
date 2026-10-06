import { randomUUID } from "node:crypto"
import zxing from "@zxing/library"
export function qrSvg(payload) {
  const matrix = new zxing.QRCodeWriter().encode(
    payload,
    zxing.BarcodeFormat.QR_CODE,
    256,
    256,
    new Map(),
  )
  let path = ""
  for (let y = 0; y < matrix.getHeight(); y++)
    for (let x = 0; x < matrix.getWidth(); x++)
      if (matrix.get(x, y)) path += `M${x} ${y}h1v1h-1z`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect width="256" height="256" fill="white"/><path d="${path}" fill="black"/></svg>`
}
export async function paymentQrDto(db, paymentId, now = Date.now()) {
  await db
    .prepare(
      "UPDATE payment_qrs SET status='EXPIRED',updated=? WHERE payment_id=? AND status='ACTIVE' AND expires_at<=?",
    )
    .run(new Date(now).toISOString(), paymentId, new Date(now).toISOString())
  const qr = await db
    .prepare(
      "SELECT * FROM payment_qrs WHERE payment_id=? ORDER BY CASE WHEN status='ACTIVE' THEN 0 WHEN status='PAID' THEN 1 WHEN status='EXPIRED' THEN 2 ELSE 3 END,created DESC,id DESC LIMIT 1",
    )
    .get(paymentId)
  if (!qr) return null
  return {
    id: qr.id,
    status: qr.status,
    generatedAt: qr.generated_at,
    expiresAt: qr.expires_at,
    payload: qr.status === "ACTIVE" ? qr.payload : null,
    qrData:
      qr.status === "ACTIVE"
        ? `data:image/svg+xml;base64,${Buffer.from(qrSvg(qr.payload)).toString("base64")}`
        : null,
    kind: "PAYMENT_PAGE",
    serverTime: new Date(now).toISOString(),
  }
}
export async function generatePaymentQr(
  db,
  paymentId,
  appUrl,
  now = Date.now(),
) {
  const payment = await db
    .prepare("SELECT * FROM invoices WHERE id=?")
    .get(paymentId)
  if (!payment || payment.status !== "pending")
    throw Object.assign(Error("Payment ไม่อยู่ในสถานะสร้าง QR"), { status: 409 })
  const stamp = new Date(now).toISOString(),
    expiry = new Date(now + 3 * 3600000).toISOString(),
    id = randomUUID()
  await db
    .prepare(
      "UPDATE payment_qrs SET status='CANCELLED',updated=? WHERE payment_id=? AND status='ACTIVE'",
    )
    .run(stamp, paymentId)
  const payload = `${appUrl}/?paymentAttempt=${id}#page=owner-package`
  await db
    .prepare(
      "INSERT INTO payment_qrs(id,payment_id,payload,generated_at,expires_at,status,created,updated) VALUES (?,?,?,?,?,'ACTIVE',?,?)",
    )
    .run(id, paymentId, payload, stamp, expiry, stamp, stamp)
  return paymentQrDto(db, paymentId, now)
}
