import { merchantPlans, packageIntentKey } from "./packagePlans";
import type { Store } from "./merchantStore";

export default function SubscriptionPanel({ store, chosenPlan, setChosenPlan, renewalPlan, setRenewalPlan, busy, perform, onSubscribed }: {
  store: Store;
  chosenPlan: string;
  setChosenPlan: (id: string) => void;
  renewalPlan: string;
  setRenewalPlan: (id: string) => void;
  busy: boolean;
  perform: (path: string, data: unknown, message: string) => Promise<Store | null>;
  onSubscribed: () => void;
}) {
  const sub = store.subscription;
  const renewalVilla = store.villas.find(v => v.status === "approved" && v.qr);
  const unpaid = store.villas.some(v => v.invoices.some(i => i.scope === "merchant" && i.status !== "paid"));
  return <section className="merchant-panel subscription-panel">
    <h2>แพ็กเกจบัญชี Merchant</h2>
    {sub ? <>
      <p><strong>{sub.name}</strong> · ใช้สิทธิ์ {sub.used}/{sub.capacity} Villa</p>
      <p>สมัครแพ็กเกจครั้งเดียวที่บัญชี Merchant · แต่ละ Villa ได้ 1 QR แยกกัน</p>
      <p>{sub.active ? `แพ็กเกจใช้งานได้ถึง ${new Date(sub.expires!).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok" })}` : sub.expires ? "แพ็กเกจหมดอายุ กรุณาต่ออายุเพื่อเปิดใช้ QR" : "รออนุมัติ Villa และเปิดใช้แพ็กเกจ"}</p>
      {sub.used >= sub.capacity && <p>ใช้สิทธิ์ Villa ครบตามแพ็กเกจแล้ว</p>}
      {sub.packageId === "basic" && sub.payments > 0 && <label>เลือกแพ็กเกจชำระเงินสำหรับต่ออายุ <select value={renewalPlan} onChange={e => setRenewalPlan(e.target.value)}>{merchantPlans.filter(p => p.id !== "basic").map(p => <option key={p.id} value={p.id}>{p.name} · ฿{p.amount.toLocaleString("th-TH")}/เดือน · {p.capacity} Villa</option>)}</select></label>}
      {renewalVilla && !unpaid && <div className="button-row"><button disabled={busy} className="primary-button" onClick={() => void perform(`/villas/${renewalVilla.id}/renew`, { packageId: renewalPlan }, "สร้างใบแจ้งชำระต่ออายุแพ็กเกจบัญชี Merchant 1 เดือนแล้ว")}>ต่ออายุแพ็กเกจและ QR ทั้งหมด +1 เดือน</button></div>}
    </> : <>
      <p>เลือกแพ็กเกจสำหรับบัญชี Merchant ก่อนเพิ่ม Villa จากนั้นแนบเอกสารของแต่ละแห่งให้ Admin ตรวจสอบ</p>
      <div className="subscription-options">{merchantPlans.map(p => <button key={p.id} className={chosenPlan === p.id ? "active" : ""} aria-pressed={chosenPlan === p.id} onClick={() => setChosenPlan(p.id)}><strong>{p.name}</strong><span>{p.amount ? `฿${p.amount.toLocaleString("th-TH")}/เดือน` : "ทดลองฟรี 3 เดือน"}</span><small>{p.capacity} Villa = สูงสุด {p.capacity} QR</small></button>)}</div>
      <button disabled={busy} className="primary-button" onClick={async () => { if (await perform("/subscription", { packageId: chosenPlan }, "สมัครแพ็กเกจบัญชี Merchant แล้ว กรุณาเพิ่ม Villa")) { sessionStorage.removeItem(packageIntentKey); onSubscribed(); } }}>สมัครแพ็กเกจนี้และเพิ่ม Villa →</button>
    </>}
  </section>;
}
