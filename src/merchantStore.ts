export type Document = { name: string; data: string; type: string }
export type Invoice = {
  scope: "merchant" | "villa"
  id: string
  villaId: string
  amount: number
  months: number
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
  subscription: { packageId: string; name: string; amount: number; capacity: number; used: number; expires: string | null; active: boolean; payments: number } | null
  villas: MerchantVilla[]
  mails: Mail[]
  user: Account
  paymentInstructions: string
  paymentConfigured: boolean
  smtpConfigured: boolean
  createdId?: string
}
