import PaymentQr from "./PaymentQr";
import { planId } from "./packagePlans";
import SubscriptionPanel from "./SubscriptionPanel";
import { useEffect, useRef, useState } from "react"
import { PortalShell, type Page } from "./prototype"
import type { Document, MerchantVilla, Store, Invoice } from "./merchantStore"
import { api, currentAccount, ApiError } from "./api"

const date = (value: string) =>
  value
    ? new Date(value).toLocaleDateString("th-TH", {
        timeZone: "Asia/Bangkok",
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "ยังไม่เปิดใช้งาน"
function status(v: MerchantVilla) {
  if (v.status === "pending") return "รอ Admin ตรวจสอบ"
  if (v.status === "changes") return "ต้องแก้ไขเอกสาร"
  if (v.status === "rejected") return "ไม่ผ่านการอนุมัติ"
  if (["SUSPENDED","INACTIVE"].includes(v.qrStatus))return "QR ถูกระงับหรือปิดใช้งาน"
  if (!v.qr) return "อนุมัติแล้ว · รอชำระเงิน"
  return new Date(v.expires) <= new Date() ? "QR หมดอายุ" : "QR ใช้งานได้"
}
export function VillaQr({ villa }: { villa: MerchantVilla }) {
  const url = `${window.location.origin}${window.location.pathname}#page=verify&item=${encodeURIComponent(villa.qr)}`
  const qrRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let cancelled = false
    void import("@zxing/browser").then(({ BrowserQRCodeSvgWriter }) => {
      if (cancelled || !qrRef.current) return
      const svg = new BrowserQRCodeSvgWriter().write(url, 220, 220)
      svg.setAttribute("role", "img")
      svg.setAttribute("aria-label", `QR ของ ${villa.name}`)
      qrRef.current.replaceChildren(svg)
    })
    return () => {
      cancelled = true
    }
  }, [url, villa.name])
  return (
    <div className="merchant-qr">
      <div ref={qrRef} />
      <strong>{villa.qr}</strong><p>{villa.qrStatus} · {villa.verificationLevel}</p>
      <small>หมดอายุ {date(villa.expires)}</small>
      <a href={url}>เปิดหน้าตรวจสอบ ↗</a>
    </div>
  )
}

function VillaPhotoInput({url,photo,onChange}:{url:string;photo:Document|null;onChange:(value:Document|null)=>void}){
 const [error,setError]=useState("");
 const inputRef=useRef<HTMLInputElement>(null);
 return <div><label>อัปโหลด / เปลี่ยนรูป Villa (JPG, PNG ไม่เกิน 2 MB)<input ref={inputRef} style={{display:"none"}} type="file" accept="image/jpeg,image/png" onChange={async e=>{const f=e.target.files?.[0];if(!f)return;setError("");if(!["image/jpeg","image/png"].includes(f.type)||f.size>2*1024*1024){setError("เลือกรูป JPG หรือ PNG ไม่เกิน 2 MB");return;}try{const data=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=reject;r.readAsDataURL(f)});onChange({name:f.name,type:f.type,data});}catch{setError("อ่านรูปไม่สำเร็จ")}}}/></label><div className="button-row"><button type="button" className="outline-button" onClick={()=>inputRef.current?.click()}>Browse</button><span>{photo?.name||"JPG / PNG"}</span></div>{(photo?.data||url)&&<img src={photo?.data||url} alt="รูป Villa ที่เลือก" style={{width:"100%",maxHeight:300,objectFit:"cover",borderRadius:12}}/>}{photo&&<button type="button" onClick={()=>onChange(null)}>ยกเลิกรูปที่เลือก</button>}{error&&<p role="alert">{error}</p>}</div>
}

export default function Backoffice({
  page,
  go,
  initialPackage = "Trust Starter",
  initialItem = "",
}: {
  page: Page
  go: (page: Page, item?: string) => void
  initialItem?: string
  initialPackage?: string
}) {
  const admin = page.startsWith("admin-")
  const [store, setStore] = useState<Store | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [chosenPlan, setChosenPlan] = useState(planId(initialPackage));
  const [renewalPlan, setRenewalPlan] = useState("starter");
  const [selected, setSelected] = useState(initialItem)
  const [message, setMessage] = useState("")
  const [verificationLevel,setVerificationLevel]=useState("VERIFIED")
  const [reason, setReason] = useState("")
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState("all")
  const [upload, setUpload] = useState<Document | null>(null)
  const [uploading, setUploading] = useState(false)
  const [mailOpen, setMailOpen] = useState("")
  const [form, setForm] = useState({
    name: "",
    province: "",
    merchant: "",
    email: "",
    photoUrl: "", phone: "", bankName: "", accountName: "", accountNumber: "",
    package: "",
  })
  useEffect(() => {
    setMessage("")
  }, [page])
  useEffect(() => {
    setLoading(true)
    setStore(null)
    setSelected("")
    let cancelled = false
    let fetching = false
    const load = async () => {
      if (fetching || busyRef.current) return
      fetching = true
      try {
        const user = await currentAccount()
        if (user.role !== (admin ? "admin" : "merchant")) {
          if (!cancelled)
            go(
              user.role === "admin"
                ? "admin-dashboard"
                : user.role === "merchant"
                  ? "owner-dashboard"
                  : "user-dashboard",
            )
          return
        }
        const next = await api<Store>("/state")
        const attempt=new URLSearchParams(window.location.search).get("paymentAttempt")
        if(attempt && !admin) {
          try { await api(`/payments/attempt?id=${encodeURIComponent(attempt)}`) }
          catch(e) { if(!cancelled)setMessage(e instanceof Error ? e.message : "Payment QR ไม่พร้อมใช้งาน") }
        }
        if (!cancelled && !busyRef.current) setStore(next)
      } catch (error) {
        if (!cancelled) {
          if (error instanceof ApiError && error.status === 401) go("login")
          else
            setMessage(
              error instanceof Error ? error.message : "โหลดข้อมูลไม่สำเร็จ",
            )
        }
      } finally {
        fetching = false
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    const timer = window.setInterval(() => void load(), 10000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [admin])
  const perform = async (path: string, data: unknown, success: string) => {
    if (busyRef.current) return null
    busyRef.current = true
    setBusy(true)
    try {
      const next = await api<Store>(path, data)
      setStore(next)
      setMessage(success)
      return next
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) go("login")
      setMessage(error instanceof Error ? error.message : "ดำเนินการไม่สำเร็จ")
      return null
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }
  const readFile = async (file?: File) => {
    setUpload(null)
    if (!file) return
    if (
      !["application/pdf", "image/jpeg", "image/png"].includes(file.type) ||
      file.size > 2 * 1024 * 1024
    ) {
      setMessage("กรุณาเลือก PDF, JPG หรือ PNG ขนาดไม่เกิน 2 MB")
      return
    }
    setUploading(true)
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      setUpload({ name: file.name, data, type: file.type })
      setMessage("")
    } catch {
      setMessage("อ่านไฟล์ไม่สำเร็จ กรุณาลองใหม่")
    } finally {
      setUploading(false)
    }
  }
  const [photo,setPhoto]=useState<Document|null>(null);
  useEffect(()=>setPhoto(null),[selected,page]);
  useEffect(()=>{
    const v=store?.villas.find(v=>v.id===initialItem);
    if(!v)return;
    setSelected(v.id);
    setForm(current=>({...current,name:v.name,province:v.province,merchant:v.merchant,email:v.email,photoUrl:v.photoUrl||"",phone:v.phone,bankName:v.bankName,accountName:v.accountName,accountNumber:v.accountNumber,package:v.packageId}));
    setVerificationLevel(v.status==="approved"?v.verificationLevel:"VERIFIED");
  },[initialItem,store]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!upload) {
      setMessage("กรุณาแนบเอกสารแสดงกรรมสิทธิ์ Villa ก่อนส่งตรวจสอบ")
      return
    }
    const next = await perform(
      "/villas",
      {
        ...form,
        packageId: store?.subscription?.packageId,
        document: upload,
        photo,
      },
      "ส่ง Villa ให้ Admin ตรวจสอบแล้ว",
    )
    if (next) {
      setSelected(next.createdId || "")
      setPhoto(null)
      setUpload(null)
      setForm({
        name: "",
        province: "",
        merchant: "",
        email: "",
        photoUrl: "", phone: "", bankName: "", accountName: "", accountNumber: "",
        package: form.package,
      })
      go("owner-villas")
    }
  }
  const review = async (v: MerchantVilla, next: MerchantVilla["status"]) => {
    if (next !== "approved" && !reason.trim()) {
      setMessage("กรุณาระบุเหตุผลเพื่อให้ Merchant ดำเนินการต่อ")
      return
    }
    if (
      await perform(
        `/villas/${v.id}/review`,
        { status: next, reason, verificationLevel },
        next === "approved"
          ? "อนุมัติเอกสารแล้ว เปิด Trial หรือสร้างใบแจ้งชำระตามแพ็กเกจ"
          : "บันทึกผลตรวจสอบแล้ว",
      )
    )
      setReason("")
  }
  if (loading || !store)
    return (
      <PortalShell role={admin ? "Admin" : "Merchant"} page={page} go={go}>
        <h1>{loading ? "กำลังเชื่อมต่อ Backend…" : "เชื่อมต่อ Backend ไม่สำเร็จ"}</h1>
        <p role="alert">{message}</p>
        <button
          className="outline-button"
          onClick={() => window.location.reload()}
        >
          ลองใหม่
        </button>
      </PortalShell>
    )
  const active = store.villas.find((v) => v.id === selected)
  const adding = page === "owner-add-villa" || page === "owner-onboarding-villa"
  const billing = page === "owner-package" || page === "admin-payments"
  const reviewing = page === "admin-review"
  const dashboard = page.endsWith("dashboard")
  const editing = page === "owner-villa-edit"
  const detailPage = page === "owner-villa-detail"
  const list = store.villas.filter(
    (v) =>
      (v.name + v.merchant + v.email)
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (filter === "all" || (billing ? v.invoices.some(i=>i.paymentStatus===filter) : v.status === filter)),
  )
  const showDetails = (v: MerchantVilla, edit=false) => {
    setVerificationLevel(v.status === "approved" ? v.verificationLevel : "VERIFIED")
    setSelected(v.id)
    setForm({...form,name:v.name,province:v.province,merchant:v.merchant,email:v.email,photoUrl:v.photoUrl||"",phone:v.phone,bankName:v.bankName,accountName:v.accountName,accountNumber:v.accountNumber,package:v.packageId})
    setReason("")
    setUpload(null)
    go(admin ? "admin-review" : edit ? "owner-villa-edit" : "owner-villa-detail",v.id)
  }
  return (
    <PortalShell role={admin ? "Admin" : "Merchant"} page={page} go={go}>
      <div className="portal-head">
        <div>
          <span className="kicker">
            {admin ? "OPERATIONS / VILLACHECK" : "YOUR PROPERTY, VERIFIED"}
          </span>
          <h1>
            {adding
              ? "เพิ่ม Villa"
              : reviewing
                ? "ตรวจสอบกรรมสิทธิ์ Villa"
                : billing
                  ? "แพ็กเกจและการชำระเงิน"
                  : page === "admin-owners"
                    ? "Merchants"
                    : page === "admin-qr"
                      ? "ทะเบียน QR"
                      : dashboard
                        ? `${admin ? "Admin" : "Merchant"} Dashboard`
                        : "Villa ของคุณ"}
          </h1>
          <p>1 Villa = 1 QR · อายุใช้งานตามแพ็กเกจและใบแจ้งชำระ · ต่ออายุใช้ QR เดิม</p>
        </div>
        {!admin && !adding && (
          <button
            className="primary-button"
            disabled={Boolean(store.subscription && store.subscription.used >= store.subscription.capacity)}
            onClick={() => go("owner-add-villa")}
          >
            + เพิ่ม Villa
          </button>
        )}
      </div>
      <div className="merchant-demo">
        แพ็กเกจผูกกับบัญชี Merchant · แต่ละ Villa มี QR ของตัวเองและต้องผ่าน Admin อนุมัติ
        · แพ็กเกจชำระเงินต้องยืนยันการชำระก่อนเปิดใช้ QR
      </div>
      {!admin&&store.subscription&&store.subscription.used>=store.subscription.capacity&&!billing&&<section className="merchant-panel"><p>ใช้สิทธิ์ครบ {store.subscription.used}/{store.subscription.capacity} Villa แล้ว ไม่สามารถเพิ่ม Villa ได้</p><button className="outline-button" onClick={()=>go("owner-package")}>ดูสิทธิ์แพ็กเกจและตัวเลือกอัปเกรด</button></section>}
      {!admin && (billing || dashboard || (adding && !store.subscription)) && <SubscriptionPanel store={store} chosenPlan={chosenPlan} setChosenPlan={setChosenPlan} renewalPlan={renewalPlan} setRenewalPlan={setRenewalPlan} busy={busy} perform={perform} onSubscribed={() => go("owner-add-villa")} />}
      {!admin && billing && store.villas.some(v => v.invoices.length > 0) && <section className="merchant-panel"><h2>การชำระแพ็กเกจบัญชี Merchant</h2><p>ชำระแพ็กเกจครั้งเดียว ครอบคลุม Villa ภายในจำนวนสิทธิ์ แต่ละแห่งมี QR ของตัวเอง</p>{store.villas.flatMap(v => v.invoices).map(invoice => <PaymentPanel key={invoice.id} invoice={invoice} admin={false} instructions={store.paymentInstructions} configured={store.paymentConfigured}
                      demo={store.demoMode} busy={busy} perform={perform} />)}</section>}
      {message && (
        <div className="form-message" role="status">
          {message}
        </div>
      )}
      {dashboard && (
        <>
          <div className="metric-grid">
            {[
              ["Villa ทั้งหมด", store.villas.length],
              [
                "รอตรวจเอกสาร",
                store.villas.filter((v) => v.status === "pending").length,
              ],
              [
                "QR ใช้งานได้",
                store.villas.filter(
                  (v) => v.qrStatus === "ACTIVE",
                ).length,
              ],
              [
                "รอชำระเงิน",
                store.villas.filter((v) => v.paymentPending).length,
              ],
            ].map(([label, count]) => (
              <div className="metric-card" key={label}>
                <span>{label}</span>
                <strong>{count}</strong>
                <small>อัปเดตจากรายการในระบบ</small>
              </div>
            ))}
          </div>
          <div className="merchant-steps">
            {[
              "01 สมัครแพ็กเกจบัญชี Merchant",
              "02 เพิ่ม Villa ตามจำนวนสิทธิ์",
              "03 Admin อนุมัติ / ชำระแพ็กเกจ",
              "04 1 Villa ได้ 1 QR แยกกัน",
            ].map((step) => (
              <span key={step}>{step}</span>
            ))}
          </div>
        </>
      )}
      {adding && store.subscription && store.subscription.used >= store.subscription.capacity ? <section className="merchant-panel"><h2>สิทธิ์ Villa เต็มแล้ว</h2><p>ไม่สามารถเพิ่ม Villa ได้ กรุณาดูตัวเลือกอัปเกรดที่หน้า Package</p></section> : adding && store.subscription ? (
        <form className="portal-form merchant-panel" onSubmit={submit}>
          <h2>ข้อมูลที่พักและ Merchant</h2>
          <div className="merchant-form-grid">
            {([
              ["name", "ชื่อ Villa"],
              ["province", "จังหวัด"],
              ["merchant", "ชื่อ Merchant / บริษัท"],
              ["email", "อีเมลรับแจ้งชำระเงิน"],
              ["photoUrl", "URL รูป Villa (HTTPS)"],
              ["phone", "เบอร์โทรทางการของ Villa"],
              ["bankName", "ธนาคารรับเงิน"],
              ["accountName", "ชื่อบัญชีรับเงิน"],
              ["accountNumber", "เลขที่บัญชีรับเงิน"],
            ] as const).map(([key, label]) => (
              <label key={key}>
                <span>{label} *</span>
                <input
                  required={key !== "photoUrl"}
                  type={key === "email" ? "email" : "text"}
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                />
              </label>
            ))}
          </div>
          <VillaPhotoInput url={form.photoUrl} photo={photo} onChange={setPhoto}/>
          <label className="merchant-upload">
            <strong>แนบหลักฐานการเป็นเจ้าของ Villa *</strong>
            <span>
              เช่น โฉนด หรือเอกสารแสดงกรรมสิทธิ์ · PDF, JPG, PNG ไม่เกิน 2 MB
            </span>
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              onChange={(e) => void readFile(e.target.files?.[0])}
            />
            <small>
              {uploading ? "กำลังอ่านเอกสาร…" : upload?.name || "ยังไม่ได้แนบเอกสาร"}
            </small>
          </label>
          <p>Admin จะตรวจเอกสารก่อนอนุมัติ จากนั้นแจ้งให้ชำระแพ็กเกจทางอีเมล</p>
          <button
            type="submit"
            className="primary-button"
            disabled={uploading || busy || store.subscription.used >= store.subscription.capacity}
          >
            ส่งให้ Admin ตรวจสอบ →
          </button>
        </form>
      ) : (
        <>
          {!billing && !editing && !detailPage && <>
          <div className="merchant-toolbar">
            <input
              aria-label="ค้นหา Villa หรือ Merchant"
              placeholder="ค้นหา Villa หรือ Merchant…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              aria-label="กรองสถานะ"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">ทุกสถานะ</option>
              {billing && ["WAITING_FOR_SLIP","PENDING_REVIEW","VERIFIED","REJECTED"].map(s=><option key={s} value={s}>{s}</option>)}
              {!billing&&<option value="pending">รอตรวจสอบ</option>}
              {!billing&&<option value="approved">อนุมัติแล้ว</option>}
              {!billing&&<option value="changes">ต้องแก้ไข</option>}
              {!billing&&<option value="rejected">ไม่อนุมัติ</option>}
            </select>
          </div>
          {!list.length && (
            <div className="merchant-empty">
              <span>◇</span>
              <h2>
                {store.villas.length ? "ไม่พบรายการที่ค้นหา" : "เริ่มต้นจาก Villa แรก"}
              </h2>
              <p>
                {admin
                  ? "รายการที่ Merchant ส่งพร้อมเอกสารจะปรากฏที่นี่"
                  : "เพิ่มที่พักและแนบหลักฐานกรรมสิทธิ์เพื่อเริ่มรับการตรวจสอบ"}
              </p>
              {!admin && (
          <button
            className="primary-button"
            disabled={Boolean(store.subscription && store.subscription.used >= store.subscription.capacity)}
            onClick={() => go("owner-add-villa")}
                >
                  + เพิ่ม Villa
                </button>
              )}
            </div>
          )}
          <div className="merchant-list">
            {list.map((v) => (
              <article className="merchant-panel merchant-villa" key={v.id}>
                {v.photoUrl&&<img src={v.photoUrl} alt={v.name} style={{width:"100%",height:220,objectFit:"cover",borderRadius:12,marginBottom:16}}/>}
                <div className="merchant-villa-top">
                  <div>
                    <small>
                      {v.province} · MERCHANT {v.merchant}
                    </small>
                    <h2>{v.name}</h2>
                    <p>{v.email}</p>
                  </div>
                  {v.premiumBanner&&<span className="merchant-status">Premium Verified</span>}
                  <span className={`merchant-status ${v.status}`}>
                    {status(v)}
                  </span>
                </div>
                <div className="merchant-villa-meta">
                  <span>
                    แพ็กเกจ<strong>{v.package}</strong>
                  </span>
                  <span>
                    QR Reference<strong>{v.qr || "เปิดใช้หลังชำระเงิน"}</strong>
                  </span>
                  <span>
                    วันหมดอายุ<strong>{date(v.expires)}</strong>
                  </span>
                </div>
                {v.reason && (
                  <p className="merchant-reason">เหตุผลจาก Admin: {v.reason}</p>
                )}
                <div className="button-row">
                  <button
                    className="outline-button"
                    onClick={() => showDetails(v)}
                  >
                    {admin ? "ตรวจเอกสาร / รายละเอียด" : "ดูเอกสารและ QR"}
                  </button>
                  {!admin&&<button className="primary-button" onClick={()=>showDetails(v,true)}>แก้ไขข้อมูล Villa / เปลี่ยนรูป</button>}
                </div>
                {v.qr && <VillaQr villa={v} />}
                {admin && v.status === "approved" &&
                  v.invoices.map((invoice) => (
                    <PaymentPanel
                      key={invoice.id}
                      invoice={invoice}
                      admin={admin}
                      instructions={store.paymentInstructions}
                      configured={store.paymentConfigured}
                      demo={store.demoMode}
                      busy={busy}
                      perform={perform}
                    />
                  ))}
              </article>
            ))}
          </div>
          </>}
          {active &&
            (reviewing ||
              page === "owner-villa-detail" ||
              page === "owner-villa-edit") && (
              <section className="merchant-panel merchant-detail">
                {!admin&&<div className="button-row"><button className="outline-button" onClick={()=>go("owner-villas")}>กลับรายการ Villa</button>{!editing&&<button className="primary-button" onClick={()=>showDetails(active,true)}>แก้ไขข้อมูล Villa / เปลี่ยนรูป</button>}</div>}
                {!admin&&editing&&<form className="portal-form" onSubmit={async e=>{e.preventDefault();try{await api(`/merchant/villas/${active.id}`,{...form,photo});setPhoto(null);await perform("/state",undefined,"Updated; pending document review");}catch(e){setMessage(e instanceof Error?e.message:"Update failed")}}}><h2>แก้ไขข้อมูล Villa</h2><VillaPhotoInput url={form.photoUrl} photo={photo} onChange={setPhoto}/><p>การแก้ข้อมูลจะส่งให้ Admin ตรวจใหม่ โดยคง QR เดิม</p>{(["name","province","merchant","phone","bankName","accountName","accountNumber"] as const).map(k=><label key={k}>{k}<input required={["name","province","merchant"].includes(k)} value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})}/></label>)}<button disabled={busy} className="primary-button">บันทึกและส่งตรวจใหม่</button></form>}
                {!editing&&active.photoUrl&&<img src={active.photoUrl} alt={active.name} style={{width:"100%",maxHeight:360,objectFit:"cover",borderRadius:12}}/>}
                <h2>เอกสารกรรมสิทธิ์ · {active.name}</h2>
                <p>{active.document.name}</p>
                <div className="merchant-villa-meta">
                  <span>เบอร์โทรทางการ<strong>{active.phone || "ยังไม่ได้ระบุ"}</strong></span>
                  <span>บัญชีรับเงิน<strong>{active.bankName || "ยังไม่ได้ระบุ"} · {active.accountNumber || "—"}</strong></span>
                  <span>ชื่อบัญชี<strong>{active.accountName || "ยังไม่ได้ระบุ"}</strong></span>
                </div>
                <a
                  className="outline-button"
                  href={active.document.data}
                  download={active.document.name}
                >
                  ดาวน์โหลดเอกสาร
                </a>
                {active.document.type.startsWith("image/") && (
                  <img
                    className="merchant-document"
                    src={active.document.data}
                    alt="เอกสารกรรมสิทธิ์ Villa"
                  />
                )}
                {admin && active.status === "approved" && <div className="portal-form"><label>ระดับ Verification ที่ Admin ตรวจจริง<select value={verificationLevel} onChange={e=>setVerificationLevel(e.target.value)}>{["REGISTERED","BASIC_CHECKED","VERIFIED","PREMIUM_VERIFIED"].map(x=><option key={x}>{x}</option>)}</select></label><button className="primary-button" disabled={busy} onClick={()=>void perform(`/villas/${active.id}/verification-level`,{verificationLevel},"บันทึกระดับ Verification แล้ว")}>บันทึกระดับที่ตรวจสอบแล้ว</button></div>}
                {admin && active.status === "pending" && <label>ระดับที่ Admin ตรวจจริง<select value={verificationLevel} onChange={e=>setVerificationLevel(e.target.value)}>{["REGISTERED","BASIC_CHECKED","VERIFIED","PREMIUM_VERIFIED"].map(x=><option key={x}>{x}</option>)}</select></label>}
                {admin && active.status === "pending" && (
                  <div className="portal-form">
                    <label>
                      <span>เหตุผล / ข้อเสนอแนะ (จำเป็นสำหรับขอแก้ไขหรือไม่อนุมัติ)</span>
                      <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      />
                    </label>
                    <div className="button-row">
                      <button
                        className="primary-button"
                        disabled={busy}
                        onClick={() => void review(active, "approved")}
                      >
                        Approve และสร้างอีเมลแจ้งชำระ
                      </button>
                      <button
                        className="outline-button"
                        disabled={busy}
                        onClick={() => void review(active, "changes")}
                      >
                        ขอแก้ไขเอกสาร
                      </button>
                      <button
                        className="danger-button"
                        disabled={busy}
                        onClick={() => void review(active, "rejected")}
                      >
                        ไม่อนุมัติ
                      </button>
                    </div>
                  </div>
                )}
                {!admin && ["changes", "rejected"].includes(active.status) && (
                  <div className="portal-form">
                    <label>
                      <span>แนบเอกสารใหม่เพื่อส่งตรวจอีกครั้ง</span>
                      <input
                        type="file"
                        accept="application/pdf,image/jpeg,image/png"
                        onChange={(e) => void readFile(e.target.files?.[0])}
                      />
                    </label>
                    <button
                      disabled={!upload || uploading || busy}
                      className="primary-button"
                      onClick={async () => {
                        if (
                          upload &&
                          (await perform(
                            `/villas/${active.id}/resubmit`,
                            { document: upload },
                            "ส่งเอกสารใหม่ให้ Admin ตรวจสอบแล้ว",
                          ))
                        )
                          setPhoto(null)
      setUpload(null)
                      }}
                    >
                      ส่งตรวจสอบอีกครั้ง
                    </button>
                  </div>
                )}
                {!editing && active.qr && <VillaQr villa={active} />}
              </section>
            )}
          {(admin || billing) && (
            <section className="merchant-panel merchant-mail">
              <h2>
                ประวัติการส่งอีเมล <small>{store.mails.length} รายการ</small>
              </h2>
              <p>
                {store.demoMode ? "DEMO · อีเมลถูกบันทึกให้ตรวจดูในระบบ ไม่ส่งผ่าน SMTP จริง" : store.smtpConfigured
                  ? "ส่งผ่าน SMTP อัตโนมัติ มีการลองใหม่เมื่อส่งไม่สำเร็จ"
                  : "ยังไม่ได้ตั้งค่า SMTP · อีเมลเก็บในคิวและจะส่งเมื่อเชื่อมบริการแล้ว"}
              </p>
              {!store.mails.length && <p>ยังไม่มีอีเมลแจ้งชำระเงิน</p>}
              {store.mails.map((mail) => (
                <div key={mail.id}>
                  <button
                    className="merchant-mail-row"
                    onClick={() =>
                      setMailOpen(mailOpen === mail.id ? "" : mail.id)
                    }
                  >
                    <span>
                      <strong>{mail.subject}</strong>
                      <small>
                        ถึง {mail.to} · {date(mail.created)} ·{" "}
                        {mail.status === "sent"
                          ? "ส่งแล้ว"
                          : mail.status === "demo" ? "DEMO · เก็บอีเมลตัวอย่าง ไม่ส่งจริง"
                          : mail.status === "waiting_config"
                            ? "รอตั้งค่า SMTP"
                            : mail.status === "failed"
                              ? "ส่งไม่สำเร็จ"
                              : "กำลังรอส่ง"}
                      </small>
                    </span>
                    <span>ดูอีเมล ↗</span>
                  </button>
                  {mailOpen === mail.id && (
                    <div>
                      <pre>{mail.body}</pre>
                      {mail.error && <p>{mail.error}</p>}
                      {admin && mail.status === "failed" && (
                        <button
                          disabled={busy}
                          className="outline-button"
                          onClick={() =>
                            void perform(
                              `/mails/${mail.id}/retry`,
                              {},
                              "นำอีเมลเข้าคิวส่งใหม่แล้ว",
                            )
                          }
                        >
                          ลองส่งอีกครั้ง
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </PortalShell>
  )
}

export function MerchantVerification({
  reference,
  go,
}: {
  reference: string
  go: (page: Page, item?: string) => void
}) {
  const [villa, setVilla] = useState<{
    name: string
    province: string
    photoUrl: string
    verificationLevel: string
    premiumBanner: boolean
    qrStatus: string
    merchantName: string
    expires: string
    valid: boolean
    locked: boolean
    phone?: string
    bankName?: string
    accountName?: string
    accountNumber?: string
  } | null>(null)
  const activityLogged = useRef("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setVilla(null)
    setError("")
    void api<{ photoUrl: string; verificationLevel: string; premiumBanner: boolean; qrStatus: string; merchantName: string; name: string; province: string; expires: string; valid: boolean; locked: boolean; phone?: string; bankName?: string; accountName?: string; accountNumber?: string }>(
      `/public/qr/${encodeURIComponent(reference)}`,
    )
      .then((value) => {
        if (!cancelled) {
          setVilla(value)
          const activityKey=reference+":"+value.locked
          if(activityLogged.current===activityKey)return
          activityLogged.current=activityKey
          void api("/public/events",{qr:reference,kind:"PROFILE_VIEW"}).catch(()=>{})
          if(sessionStorage.getItem("villacheck-scan-reference")===reference){sessionStorage.removeItem("villacheck-scan-reference");void api("/public/events",{qr:reference,kind:"QR_SCAN"}).catch(()=>{})}
          if(!value.locked){
            void api("/public/events",{qr:reference,kind:"CONTACT_VIEW"}).catch(()=>{})
            void currentAccount().then(()=>api("/user/checks",{qr:reference,requestKey:crypto.randomUUID()})).catch(()=>{})
          }
        }
      })
      .catch((error) => {
        if (!cancelled) setError(error.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [reference])
  return (
    <main className="page-bg">
      <div className="container merchant-verification merchant-panel">
        <span className="kicker">VILLACHECK / QR VERIFICATION</span>
        <h1>
          {loading ? "กำลังตรวจสอบ QR…" : villa?.name || "ตรวจสอบ QR ไม่สำเร็จ"}
        </h1>
        {error && <p role="alert">{error}</p>}
        {villa && (
          <>
            <span className="merchant-status">
              {villa.valid
                ? "QR ใช้งานได้ · Admin อนุมัติแล้ว"
                : "QR หมดอายุหรือไม่พร้อมใช้งาน"}
            </span>
            {villa.photoUrl && <img src={villa.photoUrl} alt={villa.name} style={{maxWidth:"100%",maxHeight:360}}/>}
            <p>{villa.province} · {villa.merchantName} · {villa.verificationLevel} · {villa.qrStatus}</p>
            {villa.premiumBanner && <p className="merchant-status">✦ Premium Verified · เอกสารผ่านและ Subscription ใช้งานได้</p>}
            <a href={`https://www.google.com/maps/search/?${new URLSearchParams({api:"1",query:`${villa.name} ${villa.province}`})}`} target="_blank" rel="noopener noreferrer">ดูที่ตั้งบน Google Maps</a>
            <p>วันหมดอายุ: {date(villa.expires)}</p>
            <button onClick={()=>go("villa-report",reference)}>แจ้งปัญหาเกี่ยวกับที่พักนี้</button>
            <section className={`verification-contact ${villa.locked ? "locked" : ""}`}>
              <div className="verification-contact-head"><h2>ข้อมูลติดต่อและบัญชีรับเงิน</h2><span>{villa.locked ? "สำหรับสมาชิก User" : "เข้าสู่ระบบ User แล้ว"}</span></div>
              <dl>
                <div><dt>เบอร์โทรศัพท์ทางการ</dt><dd>{villa.locked ? "•••-•••-••••" : villa.phone || "ยังไม่ได้ระบุ"}</dd></div>
                <div><dt>ธนาคาร</dt><dd>{villa.locked ? "ข้อมูลถูกซ่อน" : villa.bankName || "ยังไม่ได้ระบุ"}</dd></div>
                <div><dt>ชื่อบัญชี</dt><dd>{villa.locked ? "ข้อมูลถูกซ่อน" : villa.accountName || "ยังไม่ได้ระบุ"}</dd></div>
                <div><dt>เลขที่บัญชีรับเงิน</dt><dd>{villa.locked ? "•••-•-•••••-•" : villa.accountNumber || "ยังไม่ได้ระบุ"}</dd></div>
              </dl>
              {villa.locked ? <div className="verification-login"><p>เข้าสู่ระบบด้วยบัญชี User เพื่อดูเบอร์โทรและเลขบัญชีเต็ม โดยกลับมาตรวจ QR นี้ได้ทันที</p><div className="button-row"><button className="primary-button" onClick={() => go("login", reference)}>เข้าสู่ระบบเพื่อดูข้อมูล</button><button className="outline-button" onClick={() => go("user-registration", reference)}>สมัครสมาชิก User</button></div></div> : <p className="verification-reminder">ตรวจสอบชื่อบัญชีและช่องทางติดต่อให้ตรงกับประกาศก่อนโอนทุกครั้ง</p>}
            </section>
          </>
        )}
        <p>QR Reference: {reference}</p>
        <button className="outline-button" onClick={() => go("home")}>
          กลับหน้าหลัก
        </button>
      </div>
    </main>
  )
}

type Perform = (
  path: string,
  data: unknown,
  message: string,
) => Promise<Store | null>
function PaymentPanel({
  invoice,
  admin,
  instructions,
  configured,
  demo,
  busy,
  perform,
}: {
  invoice: Invoice
  admin: boolean
  instructions: string
  configured: boolean
  demo: boolean
  busy: boolean
  perform: Perform
}) {
  const [file, setFile] = useState<Document | null>(null)
  const [reference, setReference] = useState("")
  const [bankTransaction, setBankTransaction] = useState(invoice.reference)
  const [reason, setReason] = useState("")
  const [error, setError] = useState("")
  const [reading, setReading] = useState(false)
  const selectProof = (selected?: File) => {
    setFile(null)
    setError("")
    if (!selected) return
    if (
      !["application/pdf", "image/jpeg", "image/png"].includes(selected.type) ||
      selected.size > 2 * 1024 * 1024
    ) {
      setError("ใช้ PDF, JPG, PNG ไม่เกิน 2 MB")
      return
    }
    setReading(true)
    const reader = new FileReader()
    reader.onload = () => {
      setFile({
        name: selected.name,
        type: selected.type,
        data: String(reader.result),
      })
      setReading(false)
    }
    reader.onerror = () => {
      setError("อ่านไฟล์ไม่สำเร็จ")
      setReading(false)
    }
    reader.readAsDataURL(selected)
  }
  return (
    <div className="payment-panel">
      <strong>
        ใบแจ้งชำระ{invoice.scope === "merchant" ? "แพ็กเกจ Merchant" : " Villa"} ฿{invoice.amount.toLocaleString("th-TH")} · อายุ QR{" "}
        {invoice.months} เดือน
      </strong>
      <small>{invoice.id} · {invoice.packageName} · สร้าง {date(invoice.created)}</small>
      <p>Payment: {invoice.paymentStatus} · QR: {invoice.paymentQr?.status||"ไม่มี QR"} · หมดอายุ {date(invoice.paymentQr?.expiresAt||"")}</p>
      {invoice.proof&&<p>อัปเดตหลักฐาน {new Date(invoice.updatedAt).toLocaleString("th-TH")}</p>}
      {!admin && invoice.status === "pending" && <PaymentQr paymentId={invoice.id} initial={invoice.paymentQr} />}
      <p>
        {invoice.status === "paid"
          ? `ยืนยันชำระแล้ว ${date(invoice.paidAt || "")}`
          : invoice.paymentStatus === "REJECTED" ? "สลิปถูกปฏิเสธ กรุณาแนบใหม่"
          : invoice.status === "submitted"
            ? "แนบสลิปแล้ว รอ Admin ตรวจยืนยัน"
            : "รอชำระเงินและแนบสลิป"}
      </p>
      {invoice.reason && <p>เหตุผลจาก Admin: {invoice.reason}</p>}
      {demo && invoice.status === "pending" && !admin && <div className="merchant-panel"><strong>DEMO · ไม่มีการโอนเงินจริง</strong><p>สร้างสลิปตัวอย่างและส่งเข้าคิวให้ Admin ตรวจ Manual</p><button disabled={busy} onClick={async()=>{try{const slip=await api<{reference:string;document:Document}>(`/payments/${invoice.id}/demo-slip`,{});await perform(`/invoices/${invoice.id}/proof`,slip,"ส่งสลิป dummy ให้ Admin ตรวจแล้ว");}catch(e){setError(e instanceof Error?e.message:"สร้างสลิปไม่สำเร็จ")}}}>สร้างและแนบสลิป dummy</button>{error&&<p role="alert">{error}</p>}</div>}
      {invoice.status === "pending" && !admin && (
        <div className="portal-form">
          <p className="payment-instructions">{instructions}</p>
          {(
            <>
              <label>
                <span>เลขอ้างอิงการโอน</span>
                <input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              </label>
              <label>
                <span>หลักฐานการชำระเงิน (ไม่เกิน 2 MB)</span>
                <input
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  onChange={(e) => selectProof(e.target.files?.[0])}
                />
              </label>
              <button
                disabled={busy || reading || !file || !reference.trim()}
                className="primary-button"
                onClick={() =>
                  void perform(
                    `/invoices/${invoice.id}/proof`,
                    { document: file, reference },
                    "ส่งหลักฐานชำระเงินให้ Admin แล้ว",
                  )
                }
              >
                ส่งหลักฐานการชำระ
              </button>
            </>
          )}
          {error && <p role="alert">{error}</p>}
        </div>
      )}
      {invoice.proof && admin && (
        <a href={invoice.proof.data} className="outline-button" download>
          ดาวน์โหลดสลิป · {invoice.proof.name}
        </a>
      )}
      {invoice.status === "submitted" && admin && (
        <div className="portal-form">
          <p>เลขอ้างอิง: {invoice.reference} · ตรวจยอดเข้าบัญชีก่อนยืนยัน</p>
          <label><span>เลขธุรกรรมธนาคารที่ตรวจสอบแล้ว</span><input value={bankTransaction} onChange={e => setBankTransaction(e.target.value)} /></label>
          <label>
            <span>เหตุผลหากไม่ผ่าน</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <div className="button-row">
            <button
              disabled={busy}
              className="primary-button"
              onClick={() =>
                void perform(
                  `/invoices/${invoice.id}/confirm`,
                  { externalTransactionId: bankTransaction },
                  "ยืนยันการชำระแล้ว เปิดใช้ / ต่ออายุ QR เรียบร้อย",
                )
              }
            >
              ยืนยันได้รับชำระและเปิดใช้ QR
            </button>
            <button
              disabled={busy || !reason.trim()}
              className="outline-button"
              onClick={() =>
                void perform(
                  `/invoices/${invoice.id}/reject`,
                  { reason },
                  "ส่งกลับให้ Merchant แนบสลิปใหม่แล้ว",
                )
              }
            >
              ไม่ผ่าน / แนบสลิปใหม่
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
