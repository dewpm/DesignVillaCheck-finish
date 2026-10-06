/** @typedef {{verified:boolean, transactionId?:string, provider?:string, reason?:string}} VerificationResult */
/** Strategy contract: verify(paymentId:string): Promise<VerificationResult>. */
export class ManualPaymentVerificationStrategy {
  async verify() {
    return { verified: false, reason: "Manual review required" }
  }
}
export class AutoPaymentVerificationStrategy {
  constructor(provider) {
    this.provider = provider
  }
  async verify(paymentId) {
    if (!this.provider)
      return { verified: false, reason: "Auto provider not configured" }
    // Provider must validate recipient, amount, currency and authentic transaction.
    let timer
    try {
      return await Promise.race([
        this.provider.verify(paymentId),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(Error("Provider timeout")), 10000)
        }),
      ])
    } catch {
      return {
        verified: false,
        reason: "Provider unavailable; manual review required",
      }
    } finally {
      clearTimeout(timer)
    }
  }
}
export class PaymentVerificationService {
  constructor(mode = "MANUAL", provider) {
    if (!["MANUAL", "AUTO"].includes(mode))
      throw Error("Invalid PAYMENT_VERIFICATION_MODE")
    this.mode = mode
    this.strategy =
      mode === "AUTO"
        ? new AutoPaymentVerificationStrategy(provider)
        : new ManualPaymentVerificationStrategy()
  }
  async verify(paymentId) {
    return this.strategy.verify(paymentId)
  }
}
