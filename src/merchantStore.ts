import type { PaymentQrData } from "./PaymentQr";
export type Document = { name: string; data: string; type: string }
export type Invoice = {
  packageName: string
  updatedAt: string
  paymentQr: PaymentQrData | null
  scope: "merchant" | "villa"
  id: string
  villaId: string
  amount: number
  months: number
  paymentStatus: "WAITING_FOR_SLIP" | "PENDING_REVIEW" | "VERIFYING" | "VERIFIED" | "REJECTED" | "FAILED"
  verificationMode: "MANUAL" | "AUTO"
  status: "pending" | "submitted" | "paid"
  reference: string
  reason: string
  created: string
  paidAt: string | null
  proof: Document | null
}
export type MerchantVilla = {
  id: string
  name: string
  photoUrl: string
  province: string
  phone: string
  bankName: string
  accountName: string
  accountNumber: string
  merchant: string
  email: string
  package: string
  packageId: string
  document: Document
  status: "pending" | "approved" | "changes" | "rejected"
  qrStatus: string
  verificationLevel: string
  premiumBanner: boolean
  reason: string
  qr: string
  expires: string
  payments: number
  paymentPending: boolean
  invoices: Invoice[]
}
export type Mail = {
  id: string
  villaId: string
  to: string
  subject: string
  body: string
  created: string
  status: string
  error: string
}
export type Account = {
  id: string
  name: string
  email: string
  role: "merchant" | "admin" | "user"
}
export type Store = {
  subscription: { packageId: string; name: string; amount: number; billingCycle: string; billingMonths: number; capacity: number; used: number; expires: string | null; active: boolean; status: string; renewalDate: string | null; payments: number } | null
  villas: MerchantVilla[]
  mails: Mail[]
  user: Account
  paymentInstructions: string
  paymentConfigured: boolean
  demoMode: boolean
  smtpConfigured: boolean
  createdId?: string
}
