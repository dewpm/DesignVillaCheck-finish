export interface VerificationResult {
  verified: boolean;
  transactionId?: string;
  provider?: string;
  reason?: string;
}
export interface PaymentVerificationStrategy {
  verify(paymentId: string): Promise<VerificationResult>;
}
export class ManualPaymentVerificationStrategy implements PaymentVerificationStrategy {
  verify(paymentId: string): Promise<VerificationResult>;
}
export class AutoPaymentVerificationStrategy implements PaymentVerificationStrategy {
  constructor(provider?: PaymentVerificationStrategy);
  verify(paymentId: string): Promise<VerificationResult>;
}
export class PaymentVerificationService implements PaymentVerificationStrategy {
  constructor(mode?: "MANUAL" | "AUTO", provider?: PaymentVerificationStrategy);
  verify(paymentId: string): Promise<VerificationResult>;
}
