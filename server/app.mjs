import { getSubscription, subscriptionDto, activateSubscription, activateVilla, subscriptionInvoice } from "./subscriptions.mjs"
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
function insertDocument(db, owner, file) {
  const id = randomUUID()
  db.prepare("INSERT INTO documents VALUES (?,?,?,?,?)").run(
    id,
    owner,
    file.name,
    file.mime,
    file.bytes,
  )
  return id
}
export function createApp(db, config, transport) {
  const worker = createMailWorker(db, config, transport)
  const attempts = new Map()
  function rateLimit(req) {
    // Only trust the direct peer. Deploy behind one trusted proxy or add trusted-proxy handling.
    const key = req.socket.remoteAddress
    const now = Date.now()
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
  function issueSession(req, user) {
    const old = req.headers.cookie?.match(/(?:^|;\s*)vc_session=([a-f0-9]{64})(?:;|$)/)?.[1];
    if (old) db.prepare("DELETE FROM sessions WHERE token_hash=?").run(hash(old));
    db.prepare("DELETE FROM sessions WHERE expires<=?").run(Date.now());
    const token = randomBytes(32).toString("hex"), csrf = randomBytes(24).toString("hex");
    db.prepare("INSERT INTO sessions VALUES (?,?,?,?)").run(hash(token), user.id, csrf, Date.now() + 28800000);
    db.prepare("UPDATE users SET last_login=? WHERE id=?").run(new Date().toISOString(), user.id);
    return { csrf, cookie: cookie(token) };
  }
  const oauth = createOAuth(db, config, issueSession, config.oauthFetch || fetch);
  function session(req) {
    const token = req.headers.cookie?.match(
      /(?:^|;\s*)vc_session=([a-f0-9]{64})(?:;|$)/,
    )?.[1]
    if (!token) fail(401, "กรุณาเข้าสู่ระบบ")
    const row = db
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
  function auth(req, role) {
    const user = session(req)
    if (role && user.role !== role) fail(403, "ไม่มีสิทธิ์ดำเนินการ")
    if (!["GET", "HEAD"].includes(req.method)) {
      checkOrigin(req)
      if (req.headers["x-csrf-token"] !== user.csrf)
        fail(403, "CSRF token ไม่ถูกต้อง กรุณาโหลดหน้าใหม่")
    }
    return user
  }
  function villaFor(user, id) {
    const villa = db.prepare("SELECT * FROM villas WHERE id=?").get(id)
    if (!villa || (user.role !== "admin" && villa.owner_id !== user.id))
      fail(404, "ไม่พบ Villa")
    return villa
  }
  function invoiceFor(user, id) {
    const invoice = db.prepare("SELECT * FROM invoices WHERE id=?").get(id)
    if (!invoice) fail(404, "ไม่พบใบแจ้งชำระ")
    const villa = villaFor(user, invoice.villa_id)
    return { invoice, villa }
  }
  function invoiceDto(invoice) {
    const file =
      invoice.proof_id &&
      db
        .prepare("SELECT name,mime FROM documents WHERE id=?")
        .get(invoice.proof_id)
    return {
      id: invoice.id,
      scope: invoice.subscription_owner ? "merchant" : "villa",
      villaId: invoice.villa_id,
      amount: invoice.amount / 100,
      months: invoice.months,
      status: invoice.status,
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
  function villaDto(v) {
    const file = db
      .prepare("SELECT name,mime FROM documents WHERE id=?")
      .get(v.document_id)
    const invoices = db
      .prepare("SELECT * FROM invoices WHERE villa_id=? ORDER BY created DESC")
      .all(v.id)
    return {
      id: v.id,
      name: v.name,
      province: v.province,
      merchant: v.merchant,
      email: v.email,
      package: `${packages[v.package_id].name} · ฿${packages[v.package_id].amount / 100} / เดือน`,
      packageId: v.package_id,
      phone: v.phone, bankName: v.bank_name, accountName: v.account_name, accountNumber: v.account_number,
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
      invoices: invoices.map(invoiceDto),
    }
  }
  function state(user) {
    const villas =
      user.role === "admin"
        ? db.prepare("SELECT * FROM villas ORDER BY created DESC").all()
        : db
            .prepare(
              "SELECT * FROM villas WHERE owner_id=? ORDER BY created DESC",
            )
            .all(user.id)
    const mails =
      user.role === "admin"
        ? db.prepare("SELECT * FROM mails ORDER BY created DESC").all()
        : db
            .prepare(
              "SELECT m.* FROM mails m JOIN villas v ON v.id=m.villa_id WHERE v.owner_id=? ORDER BY m.created DESC",
            )
            .all(user.id)
    return {
      villas: villas.map(villaDto),
      mails: mails.map((m) => ({
        id: m.id,
        villaId: m.villa_id,
        to: m.recipient,
        subject: m.subject,
        body: m.body,
        created: m.created,
        status: !transport && m.status !== "sent" ? "waiting_config" : m.status,
        error: m.last_error,
      })),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      subscription: subscriptionDto(db, user.id),
      paymentInstructions:
        config.paymentInstructions ||
        "ยังไม่ได้ตั้งค่าบัญชีรับชำระ กรุณาติดต่อทีมงานก่อนโอนเงิน",
      paymentConfigured: Boolean(config.paymentInstructions),
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
      const path = url.pathname
      if (req.method === "GET" && path === "/api/health")
        return json({ ok: true })
      if (req.method === "GET" && path === "/api/config")
        return json({
          localAccounts: Boolean(config.seedDemo),
          paymentConfigured: Boolean(config.paymentInstructions),
          oauth: oauthProviders(config),
        })
      if (req.method === "GET" && /^\/api\/auth\/oauth\/(google|facebook)\/start$/.test(path)) rateLimit(req)
      if (await oauth(req, res, url)) return
      if (
        req.method === "POST" &&
        ["/api/auth/login", "/api/auth/register", "/api/auth/register-user"].includes(path)
      ) {
        checkOrigin(req)
        rateLimit(req)
        const data = await body(req)
        let user
        if (path.endsWith("register") || path.endsWith("register-user")) {
          const address = email(data.email)
          const pass = password(data.password)
          const name = text(data.name, "ชื่อผู้สมัคร")
          if (db.prepare("SELECT id FROM users WHERE email=?").get(address))
            fail(409, "อีเมลนี้ถูกใช้งานแล้ว")
          user = createUser(db, address, pass, name, path.endsWith("register-user") ? "user" : "merchant")
        } else {
          const address = email(data.email)
          if (typeof data.password !== "string" || data.password.length > 128)
            fail(401, "อีเมลหรือรหัสผ่านไม่ถูกต้อง")
          user = db.prepare("SELECT * FROM users WHERE email=?").get(address)
          // Equal-cost verification for unknown accounts.
          const fakeHash = config.fakeHash
          if (
            !verifyPassword(data.password, user?.password_hash || fakeHash) ||
            !user
          )
            fail(401, "อีเมลหรือรหัสผ่านไม่ถูกต้อง")
        }
        const { csrf, cookie: sessionCookie } = issueSession(req, user);
        res.setHeader("Set-Cookie", sessionCookie);
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
        const user = session(req)
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
        const user = auth(req)
        db.prepare("DELETE FROM sessions WHERE token_hash=?").run(
          user.token_hash,
        )
        res.setHeader("Set-Cookie", cookie("", 0))
        return json({ ok: true })
      }
      if (req.method === "GET" && path.startsWith("/api/public/qr/")) {
        const v = db
          .prepare(
            "SELECT name,province,status,qr,expires,phone,bank_name,account_name,account_number FROM villas WHERE qr=?",
          )
          .get(decodeURIComponent(path.slice(15)))
        if (!v) fail(404, "ไม่พบ QR ในระบบ")
        let viewer;
        try { viewer = session(req); } catch (error) { if (error.status !== 401) throw error; }
        const unlocked = viewer?.role === "user";
        return json({ name: v.name, province: v.province, status: v.status, qr: v.qr, expires: v.expires,
          valid: v.status === "approved" && new Date(v.expires).getTime() > Date.now(),
          locked: !unlocked,
          ...(unlocked ? { phone: v.phone, bankName: v.bank_name, accountName: v.account_name, accountNumber: v.account_number } : {}),
        });
      }

      if (path.startsWith("/api/")) {
        const user = auth(req)
        if (req.method === "GET" && path === "/api/admin/users") {
          if (user.role !== "admin") fail(403, "เฉพาะ Admin");
          const users = db.prepare("SELECT id,name,email,role,created,last_login FROM users WHERE role='user' ORDER BY created DESC").all();
          return json({ users: users.map(u => ({ id: u.id, name: u.name, email: u.email, created: u.created, lastLogin: u.last_login,
            providers: db.prepare("SELECT provider FROM oauth_identities WHERE user_id=?").all(u.id).map(p => p.provider),
          })) });
        }
        if (!["merchant", "admin"].includes(user.role))
          fail(403, "เฉพาะ Merchant หรือ Admin")
        if (req.method === "GET" && path === "/api/state")
          return json(state(user))
        const docMatch = path.match(/^\/api\/documents\/([a-f0-9-]+)$/)
        if (req.method === "GET" && docMatch) {
          const file = db
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
          if (user.role !== "merchant") fail(403, "เฉพาะ Merchant");
          const data = await body(req);
          if (!Object.hasOwn(packages, data.packageId)) fail(400, "แพ็กเกจไม่ถูกต้อง");
          transaction(db, () => {
            const current = getSubscription(db, user.id);
            if (current && current.package_id !== data.packageId) fail(409, "บัญชีนี้สมัครแพ็กเกจแล้ว กรุณาใช้แพ็กเกจปัจจุบัน");
            if (!current) {
              const count = db.prepare("SELECT count(*) AS n FROM villas WHERE owner_id=?").get(user.id).n;
              if (count > packages[data.packageId].capacity) fail(409, "จำนวน Villa เกินสิทธิ์แพ็กเกจ");
              db.prepare("INSERT INTO subscriptions(owner_id,package_id,created) VALUES (?,?,?)").run(user.id, data.packageId, new Date().toISOString());
              audit(db, user, "subscription.select", user.id);
            }
          });
          return json(state(user));
        }
        if (req.method === "POST" && path === "/api/villas") {
          if (user.role !== "merchant") fail(403, "เฉพาะ Merchant")
          const data = await body(req)
          const name = text(data.name, "ชื่อ Villa"),
            province = text(data.province, "จังหวัด"),
            merchant = text(data.merchant, "ชื่อ Merchant"),
            address = email(data.email)
          const subscription = getSubscription(db, user.id);
          if (!subscription) fail(409, "กรุณาสมัครแพ็กเกจที่บัญชี Merchant ก่อนเพิ่ม Villa");
          const contacts = [data.phone || "", data.bankName || "", data.accountName || "", data.accountNumber || ""];
          for (const value of contacts) if (typeof value !== "string" || value.length > 200 || /[\x00-\x1f]/.test(value)) fail(400, "ข้อมูลติดต่อหรือบัญชีไม่ถูกต้อง");
          if (contacts[0] && !/^[+0-9 ()-]{8,25}$/.test(contacts[0])) fail(400, "เบอร์โทรไม่ถูกต้อง");
          if (contacts[3] && !/^[0-9 -]{6,30}$/.test(contacts[3])) fail(400, "เลขบัญชีไม่ถูกต้อง");
          const file = document(data.document)
          const id = transaction(db, () => {
            const sub = getSubscription(db, user.id);
            const used = db.prepare("SELECT count(*) AS n FROM villas WHERE owner_id=?").get(user.id).n;
            if (used >= packages[sub.package_id].capacity) fail(409, "จำนวน Villa ครบสิทธิ์แพ็กเกจแล้ว");
            const docId = insertDocument(db, user.id, file)
            const id = randomUUID()
            db.prepare(
              "INSERT INTO villas(id,owner_id,name,province,merchant,email,package_id,document_id,created) VALUES (?,?,?,?,?,?,?,?,?)",
            ).run(
              id,
              user.id,
              name,
              province,
              merchant,
              address,
              subscription.package_id,
              docId,
              new Date().toISOString(),
            )
            db.prepare("UPDATE villas SET phone=?,bank_name=?,account_name=?,account_number=? WHERE id=?").run(...contacts, id);
            audit(db, user, "villa.create", id)
            return id
          })
          return json({ ...state(user), createdId: id }, 201)
        }
        const villaAction = path.match(
          /^\/api\/villas\/([a-f0-9-]+)\/(review|resubmit|renew)$/,
        )
        if (req.method === "POST" && villaAction) {
          const [, id, action] = villaAction
          const data = await body(req)
          transaction(db, () => {
            const villa = villaFor(user, id)
            if (action === "review") {
              if (user.role !== "admin") fail(403, "เฉพาะ Admin")
              if (villa.status !== "pending") fail(409, "Villa นี้ถูกตรวจสอบแล้ว")
              if (!["approved", "changes", "rejected"].includes(data.status))
                fail(400, "สถานะไม่ถูกต้อง")
              const reason =
                data.status === "approved"
                  ? ""
                  : text(data.reason, "เหตุผล", 2000)
              db.prepare("UPDATE villas SET status=?,reason=? WHERE id=?").run(
                data.status,
                reason,
                id,
              )
              if (data.status === "approved") {
                const sub = getSubscription(db, villa.owner_id);
                if (!sub) fail(409, "Merchant ต้องสมัครแพ็กเกจที่บัญชีก่อน");
                if (!activateVilla(db, villa)) {
                  const invoiceId = subscriptionInvoice(db, villa, config.appUrl);
                  if (sub.package_id === "basic" && sub.payments === 0) {
                    db.prepare("UPDATE invoices SET status='paid',paid_at=?,confirmed_by=? WHERE id=?").run(new Date().toISOString(), user.id, invoiceId);
                    activateSubscription(db, villa.owner_id, 3);
                  }
                }
              }
              audit(db, user, `villa.${data.status}`, id)
            } else if (action === "resubmit") {
              if (user.role !== "merchant") fail(403, "เฉพาะ Merchant")
              if (!["changes", "rejected"].includes(villa.status))
                fail(409, "ยังไม่สามารถส่งเอกสารใหม่ได้")
              const file = document(data.document)
              const docId = insertDocument(db, user.id, file)
              db.prepare(
                "UPDATE villas SET document_id=?,status='pending',reason='' WHERE id=?",
              ).run(docId, id)
              audit(db, user, "villa.resubmit", id)
            } else {
              if (user.role !== "merchant") fail(403, "เฉพาะ Merchant")
              if (villa.status !== "approved" || !villa.qr) fail(409, "ต้องเปิดใช้ QR ก่อนต่ออายุแพ็กเกจ");
              let sub = getSubscription(db, villa.owner_id);
              if (!sub) fail(409, "ไม่พบแพ็กเกจ Merchant");
              if (sub.package_id === "basic") {
                if (!Object.hasOwn(packages, data.packageId) || data.packageId === "basic") fail(400, "ทดลองฟรีใช้ได้ครั้งเดียว กรุณาเลือกแพ็กเกจชำระเงินเพื่อต่ออายุ");


              }
              subscriptionInvoice(db, villa, config.appUrl, sub.package_id === "basic" ? data.packageId : undefined);
              audit(db, user, "subscription.renew", user.id);
            }
          })
          json(state(user))
          void worker.run()
          return
        }
        const invoiceAction = path.match(
          /^\/api\/invoices\/([a-f0-9-]+)\/(proof|confirm|reject)$/,
        )
        if (req.method === "POST" && invoiceAction) {
          const [, id, action] = invoiceAction
          const data = await body(req)
          transaction(db, () => {
            const { invoice, villa } = invoiceFor(user, id)
            if (villa.status !== "approved") fail(409, "Villa ยังไม่ผ่านการอนุมัติ")
            if (action === "proof") {
              if (user.role !== "merchant") fail(403, "เฉพาะ Merchant")
              if (!config.paymentInstructions) fail(409, "ยังไม่ได้ตั้งค่าบัญชีรับชำระ")
              if (invoice.status !== "pending")
                fail(409, "ใบแจ้งชำระนี้อยู่ระหว่างตรวจสอบหรือชำระแล้ว")
              const reference = text(data.reference, "เลขอ้างอิงการโอน", 150)
              const docId = insertDocument(db, user.id, document(data.document))
              db.prepare(
                "UPDATE invoices SET status='submitted',proof_id=?,reference=?,reason='' WHERE id=?",
              ).run(docId, reference, id)
              audit(db, user, "invoice.proof", id)
            } else {
              if (user.role !== "admin") fail(403, "เฉพาะ Admin")
              if (action === "confirm" && invoice.status === "paid") return
              if (invoice.status !== "submitted" || !invoice.proof_id)
                fail(409, "ต้องมีหลักฐานการชำระรอตรวจสอบ")
              if (action === "reject") {
                db.prepare(
                  "UPDATE invoices SET status='pending',reason=? WHERE id=?",
                ).run(text(data.reason, "เหตุผล", 2000), id)
              } else {
                const now = new Date()
                const base =
                  villa.expires && new Date(villa.expires) > now
                    ? new Date(villa.expires)
                    : now
                const expires = addMonths(base, invoice.months)
                db.prepare(
                  "UPDATE invoices SET status='paid',paid_at=?,confirmed_by=? WHERE id=?",
                ).run(now.toISOString(), user.id, id)
                if (invoice.subscription_owner) {
                  if (invoice.package_id) {
                    db.prepare("UPDATE subscriptions SET package_id=? WHERE owner_id=?").run(invoice.package_id, invoice.subscription_owner);
                    db.prepare("UPDATE villas SET package_id=? WHERE owner_id=?").run(invoice.package_id, invoice.subscription_owner);
                  }
                  activateSubscription(db, invoice.subscription_owner, invoice.months, now);
                }
                else db.prepare("UPDATE villas SET qr=?,expires=?,payments=payments+1 WHERE id=?").run(villa.qr || `VC-${randomUUID()}`, expires, villa.id);
              }
              audit(db, user, `invoice.${action}`, id)
            }
          })
          return json(state(user))
        }
        const retry = path.match(/^\/api\/mails\/([a-f0-9-]+)\/retry$/)
        if (req.method === "POST" && retry) {
          if (user.role !== "admin") fail(403, "เฉพาะ Admin")
          if (!transport) fail(409, "ยังไม่ได้ตั้งค่า SMTP")
          const mail = db
            .prepare("SELECT status FROM mails WHERE id=?")
            .get(retry[1])
          if (!mail) fail(404, "ไม่พบอีเมล")
          if (mail.status === "sending" || mail.status === "sent")
            fail(409, "อีเมลส่งแล้วหรือกำลังส่ง")
          db.prepare(
            "UPDATE mails SET status='queued',attempts=0,next_attempt=0 WHERE id=?",
          ).run(retry[1])
          audit(db, user, "mail.retry", retry[1])
          json(state(user))
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
              error instanceof ApiError
                ? error.message
                : "เกิดข้อผิดพลาดที่เซิร์ฟเวอร์",
          },
          error.status || 500,
        )
      else res.end()
      if (!(error instanceof ApiError))
        console.error("Backend error:", error.code || error.name)
    }
  })
  server.requestTimeout = 30000
  server.headersTimeout = 15000
  server.on("close", () => worker.stop())
  return server
}
