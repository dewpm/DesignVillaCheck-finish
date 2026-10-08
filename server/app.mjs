import {demoSlip,demoMode} from "./demo-payment.mjs"
import {createReport, recordEvent, operations} from "./operations.mjs"
import { adminBusiness } from "./admin-business.mjs"
import { generatePaymentQr, paymentQrDto } from "./payment-qr.mjs"
import {
  getPlan,
  listPlans,
  trustDto,
  getVerificationMode,
  levels,
} from "./catalog.mjs"
import { PaymentVerificationService } from "./payment-verification.mjs"
import { confirmPayment } from "./payment-service.mjs"
import {
  getSubscription,
  subscriptionDto,
  activateSubscription,
  activateVilla,
  subscriptionInvoice,
} from "./subscriptions.mjs"
import { createOAuth, oauthProviders } from "./oauth.mjs"
import { createServer } from "node:http"
import { createHash, randomBytes, randomUUID } from "node:crypto"
import { readFileSync, existsSync } from "node:fs"
import { resolve, sep } from "node:path"
import {
  audit,
  createUser,
  packages,
  transaction,
  verifyPassword,
  addMonths,
} from "./database.mjs"
import { createMailWorker } from "./mail.mjs"
class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}
const fail = (status, message) => {
  throw new ApiError(status, message)
}
const hash = (value) => createHash("sha256").update(value).digest("hex")
const text = (value, label, max = 200) => {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > max ||
    /[\x00-\x1f\x7f]/.test(value)
  )
    fail(400, `กรุณาระบุ ${label} ให้ถูกต้อง`)
  return value.trim()
}
function email(value) {
  const normalized = text(value, "อีเมล", 254).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) fail(400, "อีเมลไม่ถูกต้อง")
  return normalized
}
function password(value) {
  if (typeof value !== "string" || value.length < 10 || value.length > 128)
    fail(400, "รหัสผ่านต้องมี 10–128 ตัวอักษร")
  return value
}
async function body(req) {
  if (!req.headers["content-type"]?.startsWith("application/json"))
    fail(415, "ต้องส่งข้อมูล JSON")
  if (req.body !== undefined) {
    const encoded =
      typeof req.body === "string" ? req.body : JSON.stringify(req.body)
    if (Buffer.byteLength(encoded) > 3 * 1024 * 1024)
      fail(413, "ไฟล์มีขนาดใหญ่เกินไป")
    try {
      const data =
        typeof req.body === "string" ? JSON.parse(req.body) : req.body
      if (!data || Array.isArray(data) || typeof data !== "object")
        throw Error()
      return data
    } catch {
      fail(400, "ข้อมูล JSON ไม่ถูกต้อง")
    }
  }
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 3 * 1024 * 1024) fail(413, "ไฟล์มีขนาดใหญ่เกินไป")
    chunks.push(chunk)
  }
  try {
    const data = JSON.parse(Buffer.concat(chunks).toString())
    if (!data || Array.isArray(data) || typeof data !== "object") throw Error()
    return data
  } catch {
    fail(400, "ข้อมูล JSON ไม่ถูกต้อง")
  }
}
function document(value) {
  if (!value || typeof value !== "object") fail(400, "ต้องแนบเอกสาร")
  const name = text(value.name, "ชื่อไฟล์", 180).replace(/[\\/]/g, "_")
  const match =
    typeof value.data === "string" &&
    value.data.match(
      /^data:(application\/pdf|image\/jpeg|image\/png);base64,([A-Za-z0-9+/]+={0,2})$/,
    )
  if (!match) fail(400, "รับเฉพาะ PDF, JPG, PNG")
  const bytes = Buffer.from(match[2], "base64")
  if (bytes.length === 0 || bytes.length > 2 * 1024 * 1024)
    fail(400, "ไฟล์ต้องมีขนาดไม่เกิน 2 MB")
  const mime = match[1]
  const valid =
    mime === "application/pdf"
      ? bytes.subarray(0, 5).toString() === "%PDF-"
      : mime === "image/png"
        ? bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
  if (!valid) fail(400, "เนื้อหาไฟล์ไม่ตรงกับชนิดเอกสาร")
  return { name, mime, bytes }
}
async function insertDocument(db, owner, file) {
  const id = randomUUID()
  await db
    .prepare("INSERT INTO documents VALUES (?,?,?,?,?)")
    .run(id, owner, file.name, file.mime, file.bytes)
  return id
}
export function createApp(db, config, transport) {
  const worker = createMailWorker(db, config, transport)
  const attempts = new Map()
  async function rateLimit(req) {
    // Vercel overwrites this header. Other hosts use only the direct socket IP.
    const address = config.serverless
      ? req.headers["x-vercel-forwarded-for"] ||
        req.headers["x-forwarded-for"] ||
        req.socket.remoteAddress
      : req.socket.remoteAddress
    const key = hash(String(address))
    const now = Date.now()
    if (config.serverless) {
      const entry = await db.transaction(async () => {
        await db.prepare("DELETE FROM rate_limits WHERE expires<=?").run(now)
        return db
          .prepare(
            "INSERT INTO rate_limits(key,count,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=rate_limits.count+1 RETURNING count",
          )
          .get(key, now + 15 * 60000)
      })
      if (entry.count > 30) fail(429, "ลองเข้าสู่ระบบมากเกินไป กรุณารอ 15 นาที")
      return
    }
    if (attempts.size > 10000)
      for (const [id, entry] of attempts)
        if (entry.until <= now) attempts.delete(id)
    const entry = attempts.get(key) || { count: 0, until: now + 15 * 60000 }
    if (entry.until <= now) {
      entry.count = 0
      entry.until = now + 15 * 60000
    }
    entry.count++
    attempts.set(key, entry)
    if (entry.count > 30) fail(429, "ลองเข้าสู่ระบบมากเกินไป กรุณารอ 15 นาที")
  }
  const cookie = (token, age = 28800) =>
    `vc_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${age}${
      config.secureCookies ? "; Secure" : ""
    }`
  async function issueSession(req, user) {
    const old = req.headers.cookie?.match(
      /(?:^|;\s*)vc_session=([a-f0-9]{64})(?:;|$)/,
    )?.[1]
    if (old)
      await db.prepare("DELETE FROM sessions WHERE token_hash=?").run(hash(old))
    await db.prepare("DELETE FROM sessions WHERE expires<=?").run(Date.now())
    const token = randomBytes(32).toString("hex"),
      csrf = randomBytes(24).toString("hex")
    await db
      .prepare("INSERT INTO sessions VALUES (?,?,?,?)")
      .run(hash(token), user.id, csrf, Date.now() + 28800000)
    await db
      .prepare("UPDATE users SET last_login=? WHERE id=?")
      .run(new Date().toISOString(), user.id)
    return { csrf, cookie: cookie(token) }
  }
  const oauth = createOAuth(
    db,
    config,
    issueSession,
    config.oauthFetch || fetch,
  )
  async function session(req) {
    const token = req.headers.cookie?.match(
      /(?:^|;\s*)vc_session=([a-f0-9]{64})(?:;|$)/,
    )?.[1]
    if (!token) fail(401, "กรุณาเข้าสู่ระบบ")
    const row = await db
      .prepare(
        "SELECT s.*,u.id,u.email,u.name,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE token_hash=? AND expires>?",
      )
      .get(hash(token), Date.now())
    if (!row) fail(401, "Session หมดอายุ กรุณาเข้าสู่ระบบใหม่")
    return row
  }
  function checkOrigin(req) {
    const origin = req.headers.origin
    if (origin && !config.allowedOrigins.includes(origin))
      fail(403, "Origin ไม่ได้รับอนุญาต")
    if (req.headers["sec-fetch-site"] === "cross-site")
      fail(403, "ไม่อนุญาตคำขอข้ามเว็บไซต์")
  }
  async function auth(req, role) {
    const user = await session(req)
    if (role && user.role !== role) fail(403, "ไม่มีสิทธิ์ดำเนินการ")
    if (!["GET", "HEAD"].includes(req.method)) {
      checkOrigin(req)
      if (req.headers["x-csrf-token"] !== user.csrf)
        fail(403, "CSRF token ไม่ถูกต้อง กรุณาโหลดหน้าใหม่")
    }
    return user
  }
  async function villaFor(user, id) {
    const villa = await db.prepare("SELECT * FROM villas WHERE id=?").get(id)
    if (!villa || (user.role !== "admin" && villa.owner_id !== user.id))
      fail(404, "ไม่พบ Villa")
    return villa
  }
  async function invoiceFor(user, id) {
    const invoice = await db
      .prepare("SELECT * FROM invoices WHERE id=?")
      .get(id)
    if (!invoice) fail(404, "ไม่พบใบแจ้งชำระ")
    const villa = await villaFor(user, invoice.villa_id)
    return { invoice, villa }
  }
  async function invoiceDto(invoice) {
    const file =
      invoice.proof_id &&
      (await db
        .prepare("SELECT name,mime FROM documents WHERE id=?")
        .get(invoice.proof_id))
    return {
      id: invoice.id,
      packageName: (await getPlan(db,invoice.package_id || (await db.prepare("SELECT package_id FROM villas WHERE id=?").get(invoice.villa_id)).package_id)).name,
      paymentQr: await paymentQrDto(db, invoice.id),
      scope: invoice.subscription_owner ? "merchant" : "villa",
      villaId: invoice.villa_id,
      amount: invoice.amount / 100,
      months: invoice.months,
      status: invoice.status,
      paymentStatus: invoice.payment_status,
      verificationMode: invoice.verification_mode,
      verifiedByAdminId: invoice.confirmed_by,
      externalTransactionId: invoice.external_transaction_id,
      currency: invoice.currency,
      updatedAt: invoice.updated_at || invoice.created,
      verifiedAt: invoice.paid_at,
      rejectionReason: invoice.reason,
      reference: invoice.reference,
      reason: invoice.reason,
      created: invoice.created,
      paidAt: invoice.paid_at,
      proof: file
        ? {
            name: file.name,
            type: file.mime,
            data: `/api/documents/${invoice.proof_id}`,
          }
        : null,
    }
  }
  async function villaDto(v) {
    const file = await db
      .prepare("SELECT name,mime FROM documents WHERE id=?")
      .get(v.document_id)
    const invoices = await db
      .prepare("SELECT * FROM invoices WHERE villa_id=? ORDER BY created DESC")
      .all(v.id)
    return {
      id: v.id,
      name: v.name,
      photoUrl: v.photo_url,
      province: v.province,
      merchant: v.merchant,
      email: v.email,
      package: `${(await getPlan(db, v.package_id)).name} · ฿${(await getPlan(db, v.package_id)).amount / 100} / เดือน`,
      documentReviewStatus: {
        pending: "PENDING_REVIEW",
        approved: "APPROVED",
        changes: "CHANGE_REQUESTED",
        rejected: "REJECTED",
      }[v.status],
      reviewedAt: v.reviewed_at,
      reviewedByAdminId: v.reviewed_by,
      ...(await trustDto(db, v)),
      packageId: v.package_id,
      phone: v.phone,
      bankName: v.bank_name,
      accountName: v.account_name,
      accountNumber: v.account_number,
      status: v.status,
      reason: v.reason,
      qr: v.qr || "",
      expires: v.expires || "",
      payments: v.payments,
      paymentPending: invoices.some((i) => i.status !== "paid"),
      document: {
        name: file.name,
        type: file.mime,
        data: `/api/documents/${v.document_id}`,
      },
      invoices: await Promise.all(invoices.map(invoiceDto)),
    }
  }
  async function state(user) {
    const villas =
      user.role === "admin"
        ? await db.prepare("SELECT * FROM villas ORDER BY created DESC").all()
        : await db
            .prepare(
              "SELECT * FROM villas WHERE owner_id=? ORDER BY created DESC",
            )
            .all(user.id)
    const mails =
      user.role === "admin"
        ? await db.prepare("SELECT * FROM mails ORDER BY created DESC").all()
        : await db
            .prepare(
              "SELECT m.* FROM mails m JOIN villas v ON v.id=m.villa_id WHERE v.owner_id=? ORDER BY m.created DESC",
            )
            .all(user.id)
    return {
      villas: await Promise.all(villas.map(villaDto)),
      mails: mails.map((m) => ({
        id: m.id,
        villaId: m.villa_id,
        to: m.recipient,
        subject: m.subject,
        body: m.body,
        created: m.created,
        status: m.status === "demo" ? "demo" : !transport && m.status !== "sent" ? "waiting_config" : m.status,
        error: m.last_error,
      })),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      subscription: await subscriptionDto(db, user.id),
      demoMode:await demoMode(db,config),
      paymentInstructions:
        (await demoMode(db,config) ? "DEMO: test payment only. Do not transfer real money. Generate a dummy slip for Admin manual review." : config.paymentInstructions) ||
        "ยังไม่ได้ตั้งค่าบัญชีรับชำระ กรุณาติดต่อทีมงานก่อนโอนเงิน",
      paymentVerificationMode: await getVerificationMode(
        db,
        config.paymentVerificationMode || "MANUAL",
      ),
      paymentConfigured: (await demoMode(db,config)) || Boolean(config.paymentInstructions),
      smtpConfigured: Boolean(transport),
    }
  }
  const server = createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff")
    res.setHeader("Referrer-Policy", "same-origin")
    res.setHeader("Cache-Control", "no-store")
    const json = (value, status = 200) => {
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
      })
      res.end(JSON.stringify(value))
    }
    try {
      const url = new URL(req.url, "http://localhost")
      let path = url.pathname
      const adminPaymentAction = path.match(
        /^\/api\/admin\/payments\/([a-f0-9-]+)\/(approve|reject)$/,
      )
      if (req.method === "PATCH" && adminPaymentAction)
        path = `/api/invoices/${adminPaymentAction[1]}/${
          adminPaymentAction[2] === "approve" ? "confirm" : "reject"
        }`
      const slipAction = path.match(/^\/api\/payments\/([a-f0-9-]+)\/slip$/)
      if (slipAction) path = `/api/invoices/${slipAction[1]}/proof`
      const publicReport=path.match(/^\/api\/public\/reports\/(RPT-[A-Za-z0-9-]{1,64})$/)
      if(req.method === "GET" && publicReport){
        const report=await db.prepare("SELECT reference,status,public_note,user_id FROM support_reports WHERE reference=?").get(publicReport[1])
        if(!report)fail(404,"ไม่พบ Report")
        let viewer;try{viewer=await session(req)}catch(error){if(error.status!==401)throw error}
        return json({reference:report.reference,status:report.status,publicNote:report.public_note,linkedToUser:Boolean(viewer && viewer.id===report.user_id)})
      }
      if (req.method === "POST" && ["/api/public/reports","/api/public/events"].includes(path)) {
        checkOrigin(req); await rateLimit(req)
        const data=await body(req)
        if(path==="/api/public/events")return json(await recordEvent(db,data.qr,data.kind))
        let viewer
        try {viewer=await session(req)} catch(error){if(error.status!==401)throw error}
        if(viewer && req.headers["x-csrf-token"]!==viewer.csrf)fail(403,"CSRF token ไม่ถูกต้อง")
        return json(await createReport(db,data,viewer))
      }
      if (req.method === "POST" && path === "/api/leads") {
        await rateLimit(req)
        checkOrigin(req)
        const data = await body(req)
        if (!["USER", "MERCHANT"].includes(data.type))
          fail(400, "ประเภท Lead ไม่ถูกต้อง")
        const name = text(data.name, "ชื่อ"),
          address = email(data.email),
          phone = typeof data.phone === "string" ? data.phone.trim() : ""
        if (phone.length > 30) fail(400, "เบอร์โทรไม่ถูกต้อง")
        const now = new Date().toISOString()
        await db
          .prepare(
            "INSERT INTO leads(id,type,name,email,phone,source,created,updated) VALUES (?,?,?,?,?,'CONTACT',?,?)",
          )
          .run(randomUUID(), data.type, name, address, phone, now, now)
        return json({ ok: true })
      }
      if (req.method === "GET" && path === "/api/packages")
        return json({ packages: await listPlans(db) })
      if (req.method === "GET" && path === "/api/health")
        return json({ ok: true })
      if (req.method === "GET" && path === "/api/config")
        return json({
          localAccounts: Boolean(config.seedDemo),
          paymentConfigured: (await demoMode(db,config)) || Boolean(config.paymentInstructions),
          oauth: oauthProviders(config),
          demoMode: await demoMode(db,config),
        })
      if (
        req.method === "GET" &&
        /^\/api\/auth\/oauth\/(google|facebook)\/start$/.test(path)
      )
        await rateLimit(req)
      if (await oauth(req, res, url)) return
      if (
        req.method === "POST" &&
        [
          "/api/auth/login",
          "/api/auth/register",
          "/api/auth/register-user",
        ].includes(path)
      ) {
        checkOrigin(req)
        await rateLimit(req)
        const data = await body(req)
        let user
        if (path.endsWith("register") || path.endsWith("register-user")) {
          const address = email(data.email)
          const pass = password(data.password)
          const name = text(data.name, "ชื่อผู้สมัคร")
          if (
            await db.prepare("SELECT id FROM users WHERE email=?").get(address)
          )
            fail(409, "อีเมลนี้ถูกใช้งานแล้ว")
          user = await createUser(
            db,
            address,
            pass,
            name,
            path.endsWith("register-user") ? "user" : "merchant",
          )
        } else {
          const address = email(data.email)
          if (typeof data.password !== "string" || data.password.length > 128)
            fail(401, "อีเมลหรือรหัสผ่านไม่ถูกต้อง")
          user = await db
            .prepare("SELECT * FROM users WHERE email=?")
            .get(address)
          // Equal-cost verification for unknown accounts.
          const fakeHash = config.fakeHash
          if (
            !verifyPassword(data.password, user?.password_hash || fakeHash) ||
            !user
          )
            fail(401, "อีเมลหรือรหัสผ่านไม่ถูกต้อง")
        }
        const { csrf, cookie: sessionCookie } = await issueSession(req, user)
        res.setHeader("Set-Cookie", sessionCookie)
        return json({
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
          },
          csrf,
        })
      }
      if (req.method === "GET" && path === "/api/auth/me") {
        const user = await session(req)
        return json({
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
          },
          csrf: user.csrf,
        })
      }
      if (req.method === "POST" && path === "/api/auth/logout") {
        const user = await auth(req)
        const managed = await adminBusiness(
          db,
          user,
          req,
          path,
          url,
          body,
          config,
        )
        if (managed !== undefined) return json(managed)
        await db
          .prepare("DELETE FROM sessions WHERE token_hash=?")
          .run(user.token_hash)
        res.setHeader("Set-Cookie", cookie("", 0))
        return json({ ok: true })
      }
      if (req.method === "GET" && path === "/api/public/villas") {
        const rows = await db
          .prepare(
            "SELECT * FROM villas WHERE status='approved' AND qr IS NOT NULL ORDER BY created DESC",
          )
          .all()
        return json({
          villas: await Promise.all(
            rows.map(async (v) => ({
              id: v.id,
              name: v.name,
              province: v.province,
              qr: v.qr,
              photoUrl: v.photo_url,
              updated: v.created,
              ...(await trustDto(db, v)),
            })),
          ),
        })
      }
      if (req.method === "GET" && path.startsWith("/api/public/qr/")) {
        const v = await db
          .prepare("SELECT * FROM villas WHERE qr=?")
          .get(decodeURIComponent(path.slice(15)))
        if (!v) fail(404, "ไม่พบ QR ในระบบ")
        let viewer
        try {
          viewer = await session(req)
        } catch (error) {
          if (error.status !== 401) throw error
        }
        const unlocked = viewer?.role === "user"
        return json({
          name: v.name,
          photoUrl: v.photo_url,
          province: v.province,
          status: v.status,
          qr: v.qr,
          expires: v.expires,
          valid: (await trustDto(db, v)).qrStatus === "ACTIVE",
          locked: !unlocked,
          maskedPhone: "08X-XXX-XXXX",
          maskedBankAccount: "xxx-x-xxxxx-x",
          documentReviewStatus: {
            pending: "PENDING_REVIEW",
            approved: "APPROVED",
            changes: "CHANGE_REQUESTED",
            rejected: "REJECTED",
          }[v.status],
          reviewedAt: v.reviewed_at,
          reviewedByAdminId: v.reviewed_by,
          ...(await trustDto(db, v)),
          ...(unlocked
            ? {
                phone: v.phone,
                bankName: v.bank_name,
                accountName: v.account_name,
                accountNumber: v.account_number,
              }
            : {}),
        })
      }
      if (path.startsWith("/api/")) {
        const user = await auth(req)
        const operation=await operations(db,user,req,path,url,body)
        if(operation!==undefined)return json(operation)
        if (path === "/api/merchant/profile") {
          if (user.role !== "merchant") fail(403, "เฉพาะ Merchant")
          if (req.method === "POST" || req.method === "PATCH") {
            const data = await body(req)
            await db.transaction(async () => {
              await db
                .prepare(
                  "UPDATE users SET name=?,business_name=?,phone=?,address=? WHERE id=?",
                )
                .run(
                  text(data.contactName, "ชื่อผู้ติดต่อ"),
                  text(data.businessName, "ชื่อธุรกิจ"),
                  text(data.phone, "เบอร์โทร", 30),
                  text(data.address, "ที่อยู่", 2000),
                  user.id,
                )
              await db
                .prepare(
                  "UPDATE leads SET phone=?,name=?,updated=? WHERE user_id=?",
                )
                .run(
                  data.phone,
                  data.contactName,
                  new Date().toISOString(),
                  user.id,
                )
            })
          }
          const profile = await db
            .prepare(
              "SELECT name,business_name,phone,address,email FROM users WHERE id=?",
            )
            .get(user.id)
          return json({
            contactName: profile.name,
            businessName: profile.business_name,
            phone: profile.phone,
            address: profile.address,
            email: profile.email,
          })
        }
        const managed = await adminBusiness(
          db,
          user,
          req,
          path,
          url,
          body,
          config,
        )
        if (managed !== undefined) return json(managed)
        if (req.method === "GET" && path === "/api/admin/users") {
          if (user.role !== "admin") fail(403, "เฉพาะ Admin")
          const users = await db
            .prepare(
              "SELECT id,name,email,role,created,last_login FROM users WHERE role='user' ORDER BY created DESC",
            )
            .all()
          return json({
            users: await Promise.all(
              users.map(async (u) => ({
                id: u.id,
                name: u.name,
                email: u.email,
                created: u.created,
                lastLogin: u.last_login,
                providers: (
                  await db
                    .prepare(
                      "SELECT provider FROM oauth_identities WHERE user_id=?",
                    )
                    .all(u.id)
                ).map((p) => p.provider),
              })),
            ),
          })
        }
        if (!["merchant", "admin"].includes(user.role))
          fail(403, "เฉพาะ Merchant หรือ Admin")
        const assignLevel=path.match(/^\/api\/villas\/([a-f0-9-]+)\/verification-level$/)
        if(req.method === "POST" && assignLevel) {
          if(user.role!=="admin")fail(403,"เฉพาะ Admin")
          const data=await body(req)
          await db.transaction(async()=>{
            const villa=await villaFor(user,assignLevel[1])
            const sub=await getSubscription(db,villa.owner_id)
            const plan=await getPlan(db,sub?.package_id || villa.package_id)
            if(villa.status!=="approved")fail(409,"เอกสารต้องผ่านการอนุมัติก่อน")
            if(!levels.includes(data.verificationLevel) || levels.indexOf(data.verificationLevel)>levels.indexOf(plan.max_level))fail(400,"ระดับเกินสิทธิ์แพ็กเกจ")
            await db.prepare("UPDATE villas SET verification_level=?,reviewed_at=?,reviewed_by=? WHERE id=?").run(data.verificationLevel,new Date().toISOString(),user.id,villa.id)
            await audit(db,user,"villa.verification-level",villa.id)
          })
          return json(await state(user))
        }
        const demoPayment=path.match(/^\/api\/payments\/([a-f0-9-]+)\/demo-slip$/)
        if(req.method === "POST" && demoPayment){
          if(user.role!=="merchant")fail(403,"เฉพาะ Merchant")
          if(!await demoMode(db,config))fail(403,"Demo mode ปิดอยู่")
          const {invoice}=await invoiceFor(user,demoPayment[1])
          const qr=await paymentQrDto(db,invoice.id)
          if(invoice.status!=="pending" || qr?.status!=="ACTIVE")fail(409,"ต้องมี Payment QR ที่ยังใช้งานได้")
          return json(demoSlip(invoice))
        }
        const regenerate = path.match(/^\/api\/payments\/([a-f0-9-]+)\/qr$/)
        if (req.method === "POST" && regenerate) {
          if (user.role !== "merchant") fail(403, "เฉพาะ Merchant")
          const { invoice } = await invoiceFor(user, regenerate[1])
          const qr = await db.transaction(() =>
            generatePaymentQr(db, invoice.id, config.appUrl),
          )
          return json(qr)
        }
        if (req.method === "GET" && path === "/api/payments/attempt") {
          const attempt = await db
            .prepare("SELECT * FROM payment_qrs WHERE id=?")
            .get(url.searchParams.get("id"))
          if (!attempt) fail(404, "ไม่พบ Payment QR")
          await invoiceFor(user, attempt.payment_id)
          const latest = await paymentQrDto(db, attempt.payment_id)
          if (latest?.id !== attempt.id || latest.status !== "ACTIVE")
            fail(410, "Payment QR หมดอายุหรือถูกยกเลิก")
          return json({ paymentId: attempt.payment_id, qr: latest })
        }
        if (req.method === "GET" && path === "/api/admin/payments") {
          if (user.role !== "admin") fail(403, "เฉพาะ Admin")
          const status = url.searchParams.get("status")
          const rows = status
            ? await db
                .prepare(
                  "SELECT * FROM invoices WHERE payment_status=? ORDER BY created DESC",
                )
                .all(status)
            : await db
                .prepare("SELECT * FROM invoices ORDER BY created DESC")
                .all()
          return json({
            payments: await Promise.all(
              rows.map(async (row) => ({
                ...(await invoiceDto(row)),
                ownerId: (await villaFor(user, row.villa_id)).owner_id,
                packageId: row.package_id,
              })),
            ),
          })
        }
        const paymentRead = path.match(
          /^\/api\/(admin\/payments|payments)\/([a-f0-9-]+)(\/status)?$/,
        )
        if (req.method === "GET" && paymentRead) {
          if (paymentRead[1] === "admin/payments" && user.role !== "admin")
            fail(403, "เฉพาะ Admin")
          const { invoice, villa } = await invoiceFor(user, paymentRead[2])
          return json({
            ...(await invoiceDto(invoice)),
            ownerId: villa.owner_id,
            ownerName: villa.merchant,
            villaName: villa.name,
            packageId: invoice.package_id,
          })
        }
        if (req.method === "GET" && path === "/api/state")
          return json(await state(user))
        const docMatch = path.match(/^\/api\/documents\/([a-f0-9-]+)$/)
        if (req.method === "GET" && docMatch) {
          const file = await db
            .prepare("SELECT * FROM documents WHERE id=?")
            .get(docMatch[1])
          if (!file || (user.role !== "admin" && file.owner_id !== user.id))
            fail(404, "ไม่พบเอกสาร")
          res.writeHead(200, {
            "Content-Type": file.mime,
            "Content-Disposition": `attachment; filename="document"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
            "Content-Security-Policy": "default-src 'none'; sandbox",
          })
          return res.end(Buffer.from(file.bytes))
        }
        if (req.method === "POST" && path === "/api/subscription") {
          if (user.role !== "merchant") fail(403, "เฉพาะ Merchant")
          const data = await body(req)
          const selected = await getPlan(db, data.packageId)
          if (!selected.active) fail(400, "แพ็กเกจปิดใช้งาน")
          await transaction(db, async () => {
            const current = await getSubscription(db, user.id)
            if (current && current.package_id !== data.packageId)
              fail(409, "บัญชีนี้สมัครแพ็กเกจแล้ว กรุณาใช้แพ็กเกจปัจจุบัน")
            if (!current) {
              const count = (
                await db
                  .prepare("SELECT count(*) AS n FROM villas WHERE owner_id=?")
                  .get(user.id)
              ).n
              if (count > selected.capacity)
                fail(409, "จำนวน Villa เกินสิทธิ์แพ็กเกจ")
              await db
                .prepare(
                  "INSERT INTO subscriptions(owner_id,package_id,created) VALUES (?,?,?)",
                )
                .run(user.id, data.packageId, new Date().toISOString())
              await audit(db, user, "subscription.select", user.id)
            }
          })
          return json(await state(user))
        }
        if (req.method === "POST" && path === "/api/villas") {
          if (user.role !== "merchant") fail(403, "เฉพาะ Merchant")
          const data = await body(req)
          const name = text(data.name, "ชื่อ Villa"),
            province = text(data.province, "จังหวัด"),
            merchant = text(data.merchant, "ชื่อ Merchant"),
            address = email(data.email)
          const subscription = await getSubscription(db, user.id)
          if (!subscription)
            fail(409, "กรุณาสมัครแพ็กเกจที่บัญชี Merchant ก่อนเพิ่ม Villa")
          const contacts = [
            data.phone || "",
            data.bankName || "",
            data.accountName || "",
            data.accountNumber || "",
          ]
          for (const value of contacts)
            if (
              typeof value !== "string" ||
              value.length > 200 ||
              /[\x00-\x1f]/.test(value)
            )
              fail(400, "ข้อมูลติดต่อหรือบัญชีไม่ถูกต้อง")
          if (contacts[0] && !/^[+0-9 ()-]{8,25}$/.test(contacts[0]))
            fail(400, "เบอร์โทรไม่ถูกต้อง")
          if (contacts[3] && !/^[0-9 -]{6,30}$/.test(contacts[3]))
            fail(400, "เลขบัญชีไม่ถูกต้อง")
          const file = document(data.document)
          const id = await transaction(db, async () => {
            const sub = await getSubscription(db, user.id)
            const used = (
              await db
                .prepare("SELECT count(*) AS n FROM villas WHERE owner_id=?")
                .get(user.id)
            ).n
            if (used >= (await getPlan(db, sub.package_id)).capacity)
              fail(409, "จำนวน Villa ครบสิทธิ์แพ็กเกจแล้ว")
            const docId = await insertDocument(db, user.id, file)
            const id = randomUUID()
            await db
              .prepare(
                "INSERT INTO villas(id,owner_id,name,province,merchant,email,package_id,document_id,created) VALUES (?,?,?,?,?,?,?,?,?)",
              )
              .run(
                id,
                user.id,
                name,
                province,
                merchant,
                address,
                sub.package_id,
                docId,
                new Date().toISOString(),
              )
            await db
              .prepare(
                "UPDATE villas SET phone=?,bank_name=?,account_name=?,account_number=? WHERE id=?",
              )
              .run(...contacts, id)
            const photoUrl = data.photoUrl || ""
            if (
              photoUrl &&
              (typeof photoUrl !== "string" ||
                photoUrl.length > 2000 ||
                !photoUrl.startsWith("https://"))
            )
              fail(400, "Photo URL ต้องเป็น HTTPS")
            await db
              .prepare("UPDATE villas SET photo_url=? WHERE id=?")
              .run(photoUrl, id)
            await audit(db, user, "villa.create", id)
            return id
          })
          return json({ ...(await state(user)), createdId: id }, 201)
        }
        const villaAction = path.match(
          /^\/api\/villas\/([a-f0-9-]+)\/(review|resubmit|renew)$/,
        )
        if (req.method === "POST" && villaAction) {
          const [, id, action] = villaAction
          const data = await body(req)
          await transaction(db, async () => {
            const villa = await villaFor(user, id)
            if (action === "review") {
              if (user.role !== "admin") fail(403, "เฉพาะ Admin")
              if (villa.status !== "pending") fail(409, "Villa นี้ถูกตรวจสอบแล้ว")
              if (!["approved", "changes", "rejected"].includes(data.status))
                fail(400, "สถานะไม่ถูกต้อง")
              const reason =
                data.status === "approved"
                  ? ""
                  : text(data.reason, "เหตุผล", 2000)
              const level = data.verificationLevel || "VERIFIED"
              const entitled = await getPlan(db, villa.package_id)
              if (
                !levels.includes(level) ||
                levels.indexOf(level) > levels.indexOf(entitled.max_level)
              )
                fail(400, "ระดับเกินสิทธิ์แพ็กเกจ")
              await db
                .prepare(
                  "UPDATE villas SET status=?,reason=?,verification_level=?,reviewed_at=?,reviewed_by=? WHERE id=?",
                )
                .run(
                  data.status,
                  reason,
                  level,
                  new Date().toISOString(),
                  user.id,
                  id,
                )
              if (data.status === "approved") {
                const sub = await getSubscription(db, villa.owner_id)
                if (!sub) fail(409, "Merchant ต้องสมัครแพ็กเกจที่บัญชีก่อน")
                if (!(await activateVilla(db, villa))) {
                  const plan = await getPlan(db, sub.package_id)
                  if (plan.trial_months > 0 && sub.payments === 0)
                    await activateSubscription(
                      db,
                      villa.owner_id,
                      plan.trial_months,
                    )
                  else await subscriptionInvoice(db, villa, config.appUrl)
                }
              }

              await audit(db, user, `villa.${data.status}`, id)
            } else if (action === "resubmit") {
              if (user.role !== "merchant") fail(403, "เฉพาะ Merchant")
              if (!["changes", "rejected"].includes(villa.status))
                fail(409, "ยังไม่สามารถส่งเอกสารใหม่ได้")
              const file = document(data.document)
              const docId = await insertDocument(db, user.id, file)
              await db
                .prepare(
                  "UPDATE villas SET document_id=?,status='pending',reason='' WHERE id=?",
                )
                .run(docId, id)
              await audit(db, user, "villa.resubmit", id)
            } else {
              if (user.role !== "merchant") fail(403, "เฉพาะ Merchant")
              if (villa.status !== "approved" || !villa.qr)
                fail(409, "ต้องเปิดใช้ QR ก่อนต่ออายุแพ็กเกจ")
              let sub = await getSubscription(db, villa.owner_id)
              if (!sub) fail(409, "ไม่พบแพ็กเกจ Merchant")
              if ((await getPlan(db, sub.package_id)).amount === 0) {
                if (
                  !(await getPlan(db, data.packageId)).active ||
                  (await getPlan(db, data.packageId)).amount === 0
                )
                  fail(400, "ทดลองฟรีใช้ได้ครั้งเดียว กรุณาเลือกแพ็กเกจชำระเงินเพื่อต่ออายุ")
              }
              await subscriptionInvoice(
                db,
                villa,
                config.appUrl,
                (await getPlan(db, sub.package_id)).amount === 0
                  ? data.packageId
                  : undefined,
              )
              await audit(db, user, "subscription.renew", user.id)
            }
          })
          json(await state(user))
          void worker.run()
          return
        }
        const invoiceAction = path.match(
          /^\/api\/invoices\/([a-f0-9-]+)\/(proof|confirm|reject)$/,
        )
        if (["POST", "PATCH"].includes(req.method) && invoiceAction) {
          const [, id, action] = invoiceAction
          const data = await body(req)
          await transaction(db, async () => {
            const { invoice, villa } = await invoiceFor(user, id)
            if (villa.status !== "approved") fail(409, "Villa ยังไม่ผ่านการอนุมัติ")
            if (action === "proof") {
              if (user.role !== "merchant") fail(403, "เฉพาะ Merchant")

              if (invoice.status !== "pending")
                fail(409, "ใบแจ้งชำระนี้อยู่ระหว่างตรวจสอบหรือชำระแล้ว")
              const reference = text(data.reference, "เลขอ้างอิงการโอน", 150)
              const duplicate = await db
                .prepare(
                  "SELECT id FROM invoices WHERE external_transaction_id=? AND id!=?",
                )
                .get(reference, id)
              if (duplicate) fail(409, "เลขธุรกรรมนี้ถูกใช้ยืนยันการชำระแล้ว")
              const docId = await insertDocument(
                db,
                user.id,
                document(data.document),
              )
              await db
                .prepare(
                  "UPDATE invoices SET status='submitted',payment_status='PENDING_REVIEW',verification_mode=?,updated_at=?,proof_id=?,reference=?,reason='' WHERE id=?",
                )
                .run(
                  await getVerificationMode(
                    db,
                    config.paymentVerificationMode || "MANUAL",
                  ),
                  new Date().toISOString(),
                  docId,
                  reference,
                  id,
                )
              const verification = new PaymentVerificationService(
                await getVerificationMode(
                  db,
                  config.paymentVerificationMode || "MANUAL",
                ),
              )
              await verification.verify(id) // AUTO placeholder safely stays PENDING_REVIEW.
              await audit(db, user, "invoice.proof", id)
            } else {
              if (user.role !== "admin") fail(403, "เฉพาะ Admin")
              if (action === "confirm" && invoice.status === "paid") return
              if (invoice.status !== "submitted" || !invoice.proof_id)
                fail(409, "ต้องมีหลักฐานการชำระรอตรวจสอบ")
              if (action === "reject") {
                await db
                  .prepare(
                    "UPDATE invoices SET status='pending',payment_status='REJECTED',updated_at=?,reason=? WHERE id=?",
                  )
                  .run(
                    new Date().toISOString(),
                    text(data.reason, "เหตุผล", 2000),
                    id,
                  )
              } else {
                const transactionId = data.externalTransactionId
                  ? text(data.externalTransactionId, "เลขธุรกรรม", 150)
                  : invoice.reference
                const duplicate = await db
                  .prepare(
                    "SELECT id FROM invoices WHERE external_transaction_id=? AND id!=?",
                  )
                  .get(transactionId, id)
                if (duplicate) fail(409, "เลขธุรกรรมนี้ถูกใช้ยืนยันการชำระแล้ว")
                await db
                  .prepare(
                    "UPDATE invoices SET external_transaction_id=?,external_provider='MANUAL' WHERE id=?",
                  )
                  .run(transactionId, id)
                await confirmPayment(db, invoice, villa, user.id)
              }
              await audit(db, user, `invoice.${action}`, id)
            }
          })
          return json(await state(user))
        }
        const retry = path.match(/^\/api\/mails\/([a-f0-9-]+)\/retry$/)
        if (req.method === "POST" && retry) {
          if (user.role !== "admin") fail(403, "เฉพาะ Admin")
          if (!transport) fail(409, "ยังไม่ได้ตั้งค่า SMTP")
          const mail = await db
            .prepare("SELECT status FROM mails WHERE id=?")
            .get(retry[1])
          if (!mail) fail(404, "ไม่พบอีเมล")
          if (mail.status === "sending" || mail.status === "sent")
            fail(409, "อีเมลส่งแล้วหรือกำลังส่ง")
          await db
            .prepare(
              "UPDATE mails SET status='queued',attempts=0,next_attempt=0 WHERE id=?",
            )
            .run(retry[1])
          await audit(db, user, "mail.retry", retry[1])
          json(await state(user))
          void worker.run()
          return
        }
        fail(404, "ไม่พบ API")
      }
      if (req.method === "GET" && config.staticDir) {
        const root = resolve(config.staticDir)
        const file = resolve(root, `.${decodeURIComponent(path)}`)
        if (!file.startsWith(root + sep) && file !== root) fail(404, "ไม่พบไฟล์")
        const target =
          file !== root && existsSync(file) && /\.[a-z0-9]+$/i.test(file)
            ? file
            : resolve(root, "index.html")
        const mime = {
          ".js": "text/javascript",
          ".css": "text/css",
          ".html": "text/html",
          ".woff2": "font/woff2",
          ".png": "image/png",
          ".svg": "image/svg+xml",
          ".jpg": "image/jpeg",
          ".ico": "image/x-icon",
          ".txt": "text/plain",
        }
        const extension = target.slice(target.lastIndexOf("."))
        res.setHeader(
          "Content-Type",
          mime[extension] || "application/octet-stream",
        )
        return res.end(readFileSync(target))
      }
      fail(404, "ไม่พบหน้า")
    } catch (error) {
      if (!res.headersSent)
        json(
          {
            error:
              error instanceof ApiError ||
              (error.status >= 400 && error.status < 500)
                ? error.message
                : "เกิดข้อผิดพลาดที่เซิร์ฟเวอร์",
          },
          error.status || 500,
        )
      else res.end()
      if (
        !(error instanceof ApiError) &&
        !(error.status >= 400 && error.status < 500)
      )
        console.error("Backend error:", error.code || error.name)
    }
  })
  server.requestTimeout = 30000
  server.headersTimeout = 15000
  server.on("close", () => worker.stop())
  server.authenticate = auth
  server.runMail = worker.run
  return server
}
