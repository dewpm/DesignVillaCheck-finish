import { randomUUID } from "node:crypto"
import { listPlans, getPlan, levels, getVerificationMode } from "./catalog.mjs"
function invalid(message) {
  throw Object.assign(Error(message), { status: 400 })
}
export async function adminBusiness(
  db,
  user,
  req,
  path,
  url,
  readBody,
  config,
) {
  if (!/^\/api\/admin\/(packages|leads|settings|subscriptions)/.test(path))
    return undefined
  if (user.role !== "admin")
    throw Object.assign(Error("เฉพาะ Admin"), { status: 403 })
  if (path === "/api/admin/packages" && req.method === "GET")
    return { packages: await listPlans(db, true) }
  const pkg = path.match(/^\/api\/admin\/packages(?:\/([a-z0-9-]+))?$/)
  if (pkg && ["POST", "PATCH"].includes(req.method)) {
    const data = await readBody(req),
      id = pkg[1] || randomUUID(),
      old = pkg[1] ? await getPlan(db, id) : {},
      merged = { ...old, ...data }
    const amount =
      data.price !== undefined
        ? Math.round(Number(data.price) * 100)
        : merged.amount
    if (
      !Number.isSafeInteger(amount) ||
      amount < 0 ||
      !Number.isInteger(merged.capacity) ||
      merged.capacity < 1 ||
      !Number.isInteger(merged.trialMonths) ||
      merged.trialMonths < 0 ||
      merged.trialMonths > 36
    )
      invalid("ราคา จำนวน Villa หรือ trial ไม่ถูกต้อง")
    if (
      !levels.includes(merged.maximumVerificationLevel) ||
      !Array.isArray(merged.features) ||
      merged.features.some((x) => typeof x !== "string" || x.length > 500) ||
      merged.features.length > 50
    )
      invalid("ระดับหรือ features ไม่ถูกต้อง")
    for (const k of ["name", "slug", "description"])
      if (
        typeof merged[k] !== "string" ||
        merged[k].length > 2000 ||
        (k !== "description" && !merged[k].trim())
      )
        invalid("ข้อมูลแพ็กเกจไม่ครบ")
    if (
      !/^[a-z0-9-]+$/.test(merged.slug) ||
      merged.currency !== "THB" ||
      merged.billingCycle !== "MONTHLY" ||
      typeof merged.showPremiumBanner !== "boolean" ||
      typeof merged.isActive !== "boolean" ||
      !Number.isInteger(merged.sort_order)
    )
      invalid("ตั้งค่าแพ็กเกจไม่ถูกต้อง (รองรับ THB/MONTHLY)")
    const now = new Date().toISOString()
    await db.transaction(async () => {
      const count = await db
        .prepare(
          "SELECT s.owner_id,count(v.id) AS n FROM subscriptions s LEFT JOIN villas v ON v.owner_id=s.owner_id WHERE s.package_id=? GROUP BY s.owner_id",
        )
        .all(id)
      if (count.some((x) => x.n > merged.capacity))
        invalid("ลดจำนวน Villa ต่ำกว่าที่ Merchant ใช้อยู่ไม่ได้")
      await db
        .prepare(
          "INSERT INTO package_catalog(id,name,slug,description,amount,currency,billing_cycle,trial_months,capacity,features,max_level,banner,active,sort_order,created,updated) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,slug=excluded.slug,description=excluded.description,amount=excluded.amount,currency=excluded.currency,billing_cycle=excluded.billing_cycle,trial_months=excluded.trial_months,capacity=excluded.capacity,features=excluded.features,max_level=excluded.max_level,banner=excluded.banner,active=excluded.active,sort_order=excluded.sort_order,updated=excluded.updated",
        )
        .run(
          id,
          merged.name,
          merged.slug,
          merged.description,
          amount,
          "THB",
          "MONTHLY",
          merged.trialMonths,
          merged.capacity,
          JSON.stringify(merged.features),
          merged.maximumVerificationLevel,
          merged.showPremiumBanner ? 1 : 0,
          merged.isActive ? 1 : 0,
          merged.sort_order,
          old.created || now,
          now,
        )
    })
    return await getPlan(db, id)
  }
  if (path === "/api/admin/settings") {
    if (req.method === "PATCH" || req.method === "POST") {
      const data = await readBody(req)
      if (!["MANUAL", "AUTO"].includes(data.paymentVerificationMode))
        invalid("โหมดไม่ถูกต้อง")
      await db
        .prepare(
          "INSERT INTO system_settings(key,value) VALUES ('payment_verification_mode',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        )
        .run(data.paymentVerificationMode)
    }
    return {
      paymentVerificationMode: await getVerificationMode(
        db,
        config.paymentVerificationMode || "MANUAL",
      ),
      autoProviderConfigured: false,
    }
  }
  if (path === "/api/admin/leads" && req.method === "GET") {
    const type = url.searchParams.get("type"),
      q = (url.searchParams.get("search") || "").toLowerCase()
    const rows = await db
      .prepare("SELECT * FROM leads ORDER BY created DESC")
      .all()
    return {
      leads: rows.filter(
        (x) =>
          (!type || x.type === type) &&
          `${x.name} ${x.email} ${x.phone}`.toLowerCase().includes(q),
      ),
    }
  }
  const lead = path.match(/^\/api\/admin\/leads\/([a-f0-9-]+)$/)
  if (lead && ["POST", "PATCH"].includes(req.method)) {
    const data = await readBody(req)
    if (
      !["NEW", "CONTACTED", "QUALIFIED", "CLOSED"].includes(data.status) ||
      typeof data.notes !== "string" ||
      data.notes.length > 4000
    )
      invalid("สถานะหรือ notes ไม่ถูกต้อง")
    await db
      .prepare("UPDATE leads SET status=?,notes=?,updated=? WHERE id=?")
      .run(data.status, data.notes, new Date().toISOString(), lead[1])
    return { ok: true }
  }
  if (path === "/api/admin/subscriptions" && req.method === "GET")
    return {
      subscriptions: (
        await db
          .prepare(
            "SELECT s.*,u.name,u.email FROM subscriptions s JOIN users u ON u.id=s.owner_id",
          )
          .all()
      ).map((s) => ({
        ...s,
        status: ["SUSPENDED", "CANCELLED"].includes(s.lifecycle)
          ? s.lifecycle
          : s.expires
            ? Date.parse(s.expires) > Date.now()
              ? "ACTIVE"
              : "EXPIRED"
            : "PENDING_RENEWAL",
      })),
    }
  const sub = path.match(/^\/api\/admin\/subscriptions\/([a-f0-9-]+)$/)
  if (sub && ["POST", "PATCH"].includes(req.method)) {
    const data = await readBody(req)
    if (!["ACTIVE", "SUSPENDED", "CANCELLED"].includes(data.status))
      invalid("สถานะไม่ถูกต้อง")
    await db
      .prepare("UPDATE subscriptions SET lifecycle=? WHERE owner_id=?")
      .run(data.status, sub[1])
    return { ok: true }
  }
  return undefined
}
