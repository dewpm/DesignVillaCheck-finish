export default function PremiumBanner({ onSelect }: { onSelect: () => void }) {
  return <section className="premium-merchant-banner premium-package-promo" aria-label="แพ็กเกจ Trust Premium">
    <span className="premium-banner-emblem" aria-hidden="true">✦</span>
    <div className="premium-promo-copy"><small>สำหรับ MERCHANT · TRUST PREMIUM</small>
      <h2>ยกระดับธุรกิจ Villa ด้วยแพ็กเกจสูงสุด</h2>
      <p>฿9,900 / เดือน · รองรับที่พักสูงสุด 10 แห่ง · 1 Villa = 1 QR</p>
      <ul><li>Premium Verification</li><li>Portfolio Dashboard</li><li>Dedicated Account Manager</li></ul>
      <p className="premium-promo-note">รับสิทธิ์การตรวจสอบระดับสูงสุด โดยต้องผ่านการตรวจเอกสารและอนุมัติจาก Admin</p>
    </div>
    <button className="white-button" onClick={onSelect}>เลือก Trust Premium →</button>
  </section>;
}
