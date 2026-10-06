export function createMailWorker(db, config, transport) {
  let busy = false
  async function run() {
    if (busy || !transport) return
    busy = true
    try {
      const mails = db
        .prepare(
          "SELECT * FROM mails WHERE status IN ('queued','failed') AND next_attempt <= ? AND attempts < 8 ORDER BY created LIMIT 10",
        )
        .all(Date.now())
      for (const mail of mails) {
        db.prepare(
          "UPDATE mails SET status='sending', attempts=attempts+1 WHERE id=?",
        ).run(mail.id)
        try {
          await transport.sendMail({
            from: config.smtpFrom,
            to: mail.recipient,
            subject: mail.subject,
            text: mail.body,
            messageId: `<${mail.id}@villacheck.local>`,
          })
          db.prepare(
            "UPDATE mails SET status='sent',sent_at=?,last_error='' WHERE id=?",
          ).run(new Date().toISOString(), mail.id)
        } catch (error) {
          // Do not store SMTP credentials, connection URLs, or transport error details.
          const reason =
            error.code === "EAUTH"
              ? "SMTP authentication failed"
              : "SMTP delivery failed; check server SMTP configuration"
          db.prepare(
            "UPDATE mails SET status='failed',last_error=?,next_attempt=? WHERE id=?",
          ).run(
            reason,
            Date.now() + Math.min(3600000, 30000 * 2 ** mail.attempts),
            mail.id,
          )
        }
      }
    } finally {
      busy = false
    }
  }
  const timer = setInterval(() => void run(), 10000)
  timer.unref()
  void run()
  return { run, stop: () => clearInterval(timer) }
}
