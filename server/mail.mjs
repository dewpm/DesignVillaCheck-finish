import {demoMode} from "./demo-payment.mjs"
import { qrSvg, paymentQrDto } from "./payment-qr.mjs"
export function createMailWorker(db, config, transport) {
  let active
  function run() {
    if (!active)
      active = drain().finally(() => {
        active = undefined
      })
    return active
  }
  async function drain() {
    const demo=await demoMode(db,config)
    if(!transport && !demo)return
    // Delivery leases allow retry after an interrupted function invocation.
    for (let i = 0; i < (config.serverless ? 1 : 10); i++) {
      const now = Date.now()
      const mail = await db.transaction(() =>
        db.prepare(
          "UPDATE mails SET status='sending',attempts=attempts+1,next_attempt=? WHERE id=(SELECT id FROM mails WHERE status IN ('queued','failed','sending') AND next_attempt<=? AND attempts<8 ORDER BY created LIMIT 1) RETURNING *",
        ).get(now + 120000, now),
      )
      if (!mail) break
      try {
        if(demo || /\.example$/.test(mail.recipient)){
          await db.prepare("UPDATE mails SET status='demo',sent_at=?,last_error='' WHERE id=?").run(new Date().toISOString(),mail.id)
          continue
        }
        const qr = await paymentQrDto(db, mail.invoice_id)
        await transport.sendMail({
          attachments: qr?.payload
            ? [
                {
                  filename: "payment-qr.svg",
                  content: qrSvg(qr.payload),
                  contentType: "image/svg+xml",
                },
              ]
            : [],
          from: config.smtpFrom,
          to: mail.recipient,
          subject: mail.subject,
          text: `${mail.body}\n\n${config.paymentInstructions || "กรุณาติดต่อทีมงานเพื่อรับข้อมูลบัญชีชำระเงิน"}`,
          messageId: `<${mail.id}@villacheck.local>`,
        })
        await db
          .prepare(
            "UPDATE mails SET status='sent',sent_at=?,last_error='' WHERE id=?",
          )
          .run(new Date().toISOString(), mail.id)
      } catch (error) {
        // Do not store SMTP credentials, connection URLs, or transport error details.
        const reason =
          error.code === "EAUTH"
            ? "SMTP authentication failed"
            : "SMTP delivery failed; check server SMTP configuration"
        await db
          .prepare(
            "UPDATE mails SET status='failed',last_error=?,next_attempt=? WHERE id=?",
          )
          .run(
            reason,
            Date.now() + Math.min(3600000, 30000 * 2 ** mail.attempts),
            mail.id,
          )
      }
    }
  }
  const timer = config.serverless
    ? null
    : setInterval(
        () =>
          void run().catch(() =>
            console.error("Mail outbox processing failed"),
          ),
        10000,
      )
  timer?.unref()
  if (!config.serverless)
    void run().catch(() => console.error("Mail outbox processing failed"))
  return { run, stop: () => clearInterval(timer) }
}
