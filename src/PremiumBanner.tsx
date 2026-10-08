import { usePackages } from "./packagePlans";

export default function PremiumBanner({ onSelect }: { onSelect: (id: string) => void }) {
  const { plans, error } = usePackages();
  const plan = [...plans].filter(p => p.isActive).sort((a, b) => b.amount - a.amount || b.capacity - a.capacity || b.sort_order - a.sort_order)[0];
  if (!plan) return error ? <p role="alert" className="merchant-panel">โหลดแพ็กเกจแนะนำไม่สำเร็จ: {error}</p> : <p role="status">กำลังโหลดแพ็กเกจแนะนำ…</p>;
  return <section className="premium-merchant-banner premium-package-promo" aria-label={`แพ็กเกจสูงสุด ${plan.name}`}>
    <span className="premium-banner-emblem" aria-hidden="true">✦</span>
    <div className="premium-promo-copy"><small>สำหรับ MERCHANT · แพ็กเกจสูงสุด</small>
      <h2>{plan.name} — ยกระดับความน่าเชื่อถือของธุรกิจ Villa</h2>
      <p>{(plan.amount / 100).toLocaleString("th-TH", { style: "currency", currency: plan.currency })} / เดือน · รองรับที่พักสูงสุด {plan.capacity} แห่ง</p>
      <ul>{plan.features.map(feature => <li key={feature}>{feature}</li>)}{plan.maximumVerificationLevel === "PREMIUM_VERIFIED" && <li>สิทธิ์รับการตรวจสอบระดับ Premium</li>}</ul>
      <p className="premium-promo-note">รับสิทธิ์การตรวจสอบระดับสูงสุด โดยต้องผ่านการตรวจเอกสารและอนุมัติจาก Admin</p>
    </div>
    <button className="white-button" onClick={() => onSelect(plan.id)}>เลือก {plan.name} →</button>
  </section>;
}
