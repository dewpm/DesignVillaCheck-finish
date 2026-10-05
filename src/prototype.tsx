import { openSupport } from "./support";
import { useEffect, useState } from "react";

export type Page =
  | "home" | "directory" | "detail" | "scan" | "verify" | "pricing" | "login"
  | "about" | "verification-standard" | "articles" | "article-detail" | "owner-guide"
  | "help" | "contact" | "privacy" | "terms" | "social-facebook" | "social-instagram"
  | "social-line" | "gallery"
  | "owner-auth" | "owner-registration" | "owner-information" | "owner-onboarding-villa"
  | "package-confirmation" | "owner-select-villa" | "package-request-pending"
  | "owner-dashboard" | "owner-villas"
  | "owner-villa-detail" | "owner-villa-edit" | "owner-add-villa" | "owner-preview"
  | "owner-pending" | "owner-analytics" | "owner-reports" | "owner-package"
  | "user-dashboard" | "user-checks" | "user-check-detail" | "user-reports"
  | "user-report-detail" | "user-precheck" | "user-check-success" | "villa-report" | "villa-report-success"
  | "admin-dashboard" | "admin-review" | "admin-owners" | "admin-villas"
  | "admin-checks" | "admin-reports" | "admin-qr" | "admin-packages";

type Go = (page: Page, item?: string) => void;
type Status = "Pending" | "Verified" | "Rejected" | "Suspended" | "Expired";
export type UserReport = { reference: string; villa: string; type: string; guest: boolean };

const publicInfo: Partial<Record<Page, { kicker: string; title: string; description: string; body: string }>> = {
  about: { kicker: "ABOUT VILLACHECK", title: "เกี่ยวกับ VillaCheck", description: "Trust before transfer.", body: "VillaCheck เป็น Prototype แพลตฟอร์มตรวจสอบข้อมูลที่พัก ช่องทางติดต่อ และบัญชีรับเงิน เพื่อช่วยให้ผู้ใช้งานมีข้อมูลประกอบการตัดสินใจก่อนโอน" },
  "verification-standard": { kicker: "VERIFICATION STANDARD", title: "มาตรฐานการตรวจสอบ", description: "หลักการตรวจสอบข้อมูลของ VillaCheck", body: "กระบวนการตัวอย่างครอบคลุมข้อมูลตัวตน ช่องทางติดต่อ บัญชีรับเงิน QR Reference วันตรวจสอบล่าสุด และวันหมดอายุของสถานะ" },
  "owner-guide": { kicker: "OWNER GUIDE", title: "คู่มือสำหรับเจ้าของที่พัก", description: "เริ่มต้นสร้าง Trust Profile ให้ Villa ของคุณ", body: "ศึกษาขั้นตอนลงทะเบียน เพิ่มข้อมูล Villa ส่งข้อมูลตรวจสอบ จัดการ QR และติดตามสถานะผ่าน Owner Dashboard" },
  help: { kicker: "HELP / SUPPORT", title: "ศูนย์ช่วยเหลือ", description: "ค้นหาคำตอบและช่องทางรับความช่วยเหลือ", body: "ดูคำแนะนำเกี่ยวกับการค้นหาที่พัก การตรวจสอบก่อนโอน การสแกน QR การแจ้งปัญหา และการจัดการข้อมูลสำหรับเจ้าของที่พัก" },
  contact: { kicker: "CONTACT VILLACHECK", title: "ติดต่อเรา", description: "ทีมงานพร้อมช่วยเหลือในวันจันทร์–ศุกร์ เวลา 09:00–18:00 น.", body: "ข้อมูลติดต่อใน Prototype เป็นข้อมูลสาธิต ใช้ปุ่มติดต่อเมื่อเปิดใช้งานช่องทางจริงแล้ว" },
  privacy: { kicker: "LEGAL", title: "นโยบายความเป็นส่วนตัว", description: "แนวทางการดูแลข้อมูลสำหรับ VillaCheck Prototype", body: "VillaCheck ใช้ข้อมูลที่จำเป็นต่อการสาธิตระบบเท่านั้น ข้อมูลทั้งหมดใน Prototype เป็นข้อมูลตัวอย่างและไม่มีการรับชำระเงินจริง" },
  terms: { kicker: "LEGAL", title: "ข้อกำหนดและเงื่อนไข", description: "เงื่อนไขการใช้งาน VillaCheck Prototype", body: "สถานะการตรวจสอบเป็นข้อมูลประกอบการตัดสินใจ ผู้ใช้งานควรตรวจสอบชื่อบัญชีและข้อมูลการติดต่อทุกครั้งก่อนดำเนินการโอนเงิน" },
  "social-facebook": { kicker: "SOCIAL MEDIA", title: "VillaCheck บน Facebook", description: "ติดตามข่าวสารและคำแนะนำก่อนโอน", body: "Prototype channel · VillaCheck Thailand" },
  "social-instagram": { kicker: "SOCIAL MEDIA", title: "VillaCheck บน Instagram", description: "Travel intelligence และ Verified Villa stories", body: "Prototype channel · @villacheck.th" },
  "social-line": { kicker: "SOCIAL MEDIA", title: "VillaCheck LINE Official", description: "ช่องทางอัปเดตและติดต่อทีมงาน", body: "Prototype channel · @villacheck" },
  gallery: { kicker: "VILLA GALLERY", title: "Sea Sky Pool Villa", description: "ภาพตัวอย่างที่พัก 12 รูป", body: "แกลเลอรีนี้เป็นข้อมูลสาธิตสำหรับ Stakeholder presentation ภาพและรายละเอียดไม่ใช่ข้อมูลประกาศที่พักจริง" },
};

const articleBodies: Record<string, string> = {"เช็ก 5 จุดก่อนโอนค่าที่พัก": "ตรวจสอบชื่อที่พัก ตัวตนผู้ประกอบการ ช่องทางติดต่อ บัญชีรับเงิน และสถานะล่าสุดก่อนโอน เก็บหลักฐานประกาศและการสนทนาไว้ประกอบการตรวจสอบ", "QR Verification ช่วยตรวจสอบอะไรบ้าง": "QR เชื่อมไปยังข้อมูลและสถานะของที่พัก ควรตรวจรหัส ชื่อ Villa และวันอัปเดตให้ตรงกับประกาศ การพบ QR ไม่ได้ยืนยันว่าคนที่ส่งประกาศเป็นเจ้าของที่พัก", "วิธีสังเกตช่องทางติดต่อทางการ": "เปรียบเทียบเบอร์โทรและบัญชีสื่อสารกับข้อมูลใน Trust Profile หากมีผู้ขอเปลี่ยนบัญชีรับเงินหรือให้ติดต่อช่องทางใหม่ ควรยืนยันกับช่องทางเดิมก่อน"};

export function PublicInfoPage({ page, go, selectedArticle }: { page: Page; go: Go; selectedArticle?: string }) {
  if (page === "articles") return <main className="page-bg public-info-page"><div className="page-hero container"><span className="kicker">TRAVEL INTELLIGENCE</span><h1>บทความและข่าวสาร</h1><p>ข้อมูลที่ช่วยให้ตรวจสอบที่พักและตัดสินใจก่อนโอนได้ชัดเจนขึ้น</p></div><div className="container info-article-list">{["เช็ก 5 จุดก่อนโอนค่าที่พัก","QR Verification ช่วยตรวจสอบอะไรบ้าง","วิธีสังเกตช่องทางติดต่อทางการ"].map((title, index) => <article key={title}><span>GUIDE 0{index + 1}</span><h2>{title}</h2><p>คำแนะนำจาก VillaCheck สำหรับการตรวจสอบข้อมูลที่พักใน Prototype</p><button className="text-button" onClick={() => go("article-detail", title)}>อ่านบทความ →</button></article>)}</div></main>;
  if (page === "article-detail") return <main className="page-bg public-info-page"><div className="page-hero container"><span className="kicker">VILLACHECK GUIDE</span><h1>{selectedArticle || "เช็ก 5 จุดก่อนโอนค่าที่พัก"}</h1><p>ตรวจสอบตัวตน ช่องทางติดต่อ บัญชีรับเงิน สถานะ และ QR Reference</p></div><article className="container info-body"><p>{articleBodies[selectedArticle || "เช็ก 5 จุดก่อนโอนค่าที่พัก"] || articleBodies["เช็ก 5 จุดก่อนโอนค่าที่พัก"]}</p><button className="outline-button" onClick={() => go("articles")}>กลับไปบทความทั้งหมด</button></article></main>;
  const info = publicInfo[page] ?? publicInfo.about!;
  return <main className="page-bg public-info-page"><div className="page-hero container"><span className="kicker">{info.kicker}</span><h1>{info.title}</h1><p>{info.description}</p></div><div className="container info-body"><p>{info.body}</p><div className="button-row"><button className="primary-button" onClick={() => page === "owner-guide" ? go("pricing") : page === "help" ? go("contact") : go("home")}>{page === "owner-guide" ? "ดูแพ็กเกจ" : page === "help" ? "ติดต่อทีมงาน" : "กลับหน้าหลัก"}</button>{page === "contact" && <button className="outline-button" onClick={() => openSupport("email")}>ส่งอีเมล</button>}</div></div></main>;
}

export function PublicReportPage({ onSubmit }: { onSubmit: (report: Omit<UserReport, "reference" | "guest">) => void }) {
  const [villa, setVilla] = useState("Sea Sky Pool Villa");
  const [type, setType] = useState("ชื่อบัญชีไม่ตรง");
  const [detail, setDetail] = useState("");
  const [reporter, setReporter] = useState("");
  const [contact, setContact] = useState("");
  const [error, setError] = useState("");
  const submit = () => {
    if (!villa.trim() || !detail.trim()) {
      setError("กรุณากรอกชื่อ Villa และรายละเอียดปัญหา");
      return;
    }
    onSubmit({ villa: villa.trim(), type });
  };
  return <main className="page-bg public-report-page">
    <div className="page-hero container"><span className="kicker">PUBLIC REPORT</span><h1>แจ้งปัญหา</h1><p>ส่งข้อมูลให้ทีม VillaCheck ตรวจสอบได้ทันที โดยไม่ต้อง Login หรือ Register</p></div>
    <div className="container report-form-card">
      <div className="report-guest-note"><span>Guest Report</span><strong>ไม่บังคับเข้าสู่ระบบ</strong><p>ข้อมูลผู้แจ้งและช่องทางติดต่อกลับเป็น Optional</p></div>
      <div className="portal-form">
        <label><span>ชื่อ Villa</span><input value={villa} onChange={event => setVilla(event.target.value)} placeholder="ชื่อที่พักที่ต้องการแจ้งปัญหา" /></label>
        <label><span>ประเภทปัญหา</span><select value={type} onChange={event => setType(event.target.value)}><option>ชื่อบัญชีไม่ตรง</option><option>สงสัยเพจปลอม</option><option>ช่องทางติดต่อไม่ตรง</option><option>QR ผิดปกติ</option><option>อื่น ๆ</option></select></label>
        <label><span>รายละเอียด</span><textarea value={detail} onChange={event => setDetail(event.target.value)} placeholder="อธิบายข้อมูลหรือเหตุการณ์ที่พบ" /></label>
        <div className="optional-fields"><label><span>ชื่อผู้แจ้ง (Optional)</span><input value={reporter} onChange={event => setReporter(event.target.value)} placeholder="ไม่จำเป็นต้องระบุ" /></label><label><span>เบอร์โทรหรืออีเมลติดต่อกลับ (Optional)</span><input value={contact} onChange={event => setContact(event.target.value)} placeholder="ไม่จำเป็นต้องระบุ" /></label></div>
        {error && <div className="form-message error-state">{error}</div>}
        <button className="primary-button" onClick={submit}>ส่ง Report</button>
      </div>
    </div>
  </main>;
}

export function PublicReportSuccess({ go, reference, linkedToUser }: { go: Go; reference: string; linkedToUser: boolean }) {
  return <main className="page-bg public-report-page"><div className="page-hero container"><span className="kicker">REPORT RECEIVED</span><h1>ได้รับข้อมูลแล้ว</h1><p>ทีม VillaCheck จะตรวจสอบต่อ</p></div><div className="container report-success-card"><StatusBadge status="Pending" /><span>Reference Number</span><strong>{reference}</strong><p>กรุณาเก็บหมายเลขนี้ไว้สำหรับติดตามสถานะ{linkedToUser ? " · Report นี้ถูกเพิ่มในหน้า Report ของฉันแล้ว" : " · ส่งในรูปแบบ Guest Report"}</p><div className="button-row">{linkedToUser && <button className="primary-button" onClick={() => go("user-reports")}>ไปที่ Report ของฉัน</button>}<button className="outline-button" onClick={() => go("home")}>กลับหน้าหลัก</button></div></div></main>;
}

const testAccounts = [
  { role: "User", email: "user@villacheck.test", password: "User1234" },
  { role: "Owner", email: "owner@villacheck.test", password: "Owner1234" },
  { role: "Admin", email: "admin@villacheck.test", password: "Admin1234" },
];

export function LoginPage({ go, onAuthenticated }: { go: Go; onAuthenticated?: (role: "User" | "Owner" | "Admin") => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const login = () => {
    const account = testAccounts.find(item => item.email === email && item.password === password);
    if (!account) {
      setError("อีเมลหรือรหัสผ่านไม่ถูกต้อง กรุณาใช้บัญชีทดสอบด้านล่าง");
      return;
    }
    setError("");
    setLoading(true);
    window.setTimeout(() => {
      onAuthenticated?.(account.role as "User" | "Owner" | "Admin");
      go(account.role === "User" ? "user-dashboard" : account.role === "Owner" ? "owner-dashboard" : "admin-dashboard");
    }, 650);
  };

  return <main className="auth-page">
    <div className="auth-card">
      <button className="text-button auth-back" onClick={() => go("home")}>← กลับหน้าหลัก</button>
      <span className="kicker">VILLACHECK ACCOUNT</span>
      <h1>เข้าสู่ระบบ</h1>
      <p>เข้าสู่พื้นที่ใช้งานตามบทบาทของคุณ</p>
      <div className="form-stack">
        <label><span>อีเมล</span><input value={email} onChange={event => setEmail(event.target.value)} placeholder="name@example.com" /></label>
        <label><span>รหัสผ่าน</span><input value={password} onChange={event => setPassword(event.target.value)} type="password" placeholder="รหัสผ่าน" /></label>
        {error && <div className="form-message error-state">{error}</div>}
        <button className="primary-button full" onClick={login} disabled={loading}>{loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}</button>
      </div>
      <div className="test-accounts">
        <strong>บัญชีทดสอบสำหรับ Stakeholder</strong>
        {testAccounts.map(account => <button key={account.role} onClick={() => { setEmail(account.email); setPassword(account.password); setError(""); }}>
          <span>{account.role}</span><small>{account.email}<br />{account.password}</small>
        </button>)}
      </div>
    </div>
  </main>;
}

export const packageCatalog: Record<string, { price: string; features: string[] }> = {
  "Basic Trust QR": { price: "ฟรี 90 วัน", features: ["Trust Profile พื้นฐาน", "QR Verification", "Verified Badge", "อัปเดตข้อมูล 1 ครั้ง"] },
  "Trust Starter": { price: "฿990 / เดือน", features: ["ทุกอย่างใน Basic", "อัปเดตข้อมูลรายเดือน", "สถิติการเข้าชมพื้นฐาน", "QR ดาวน์โหลดคุณภาพสูง"] },
  "Trust Pro": { price: "฿2,900 / เดือน", features: ["ทุกอย่างใน Trust Starter", "Pro Verification", "Analytics แบบละเอียด", "แสดงผลเด่นใน Directory"] },
  "Trust Plus": { price: "฿4,900 / เดือน", features: ["ทุกอย่างใน Trust Pro", "รองรับที่พัก 2 แห่ง", "รายงานประจำเดือน", "Priority Support"] },
  "Trust Premium": { price: "฿9,900 / เดือน", features: ["รองรับสูงสุด 10 แห่ง", "Premium Verification", "Portfolio Dashboard", "Dedicated Account Manager"] },
};

export function OwnerPackageAuth({ go, packageName, onOwnerLogin }: { go: Go; packageName: string; onOwnerLogin: () => void }) {
  const [showLogin, setShowLogin] = useState(false);
  const [email, setEmail] = useState("owner@villacheck.test");
  const [password, setPassword] = useState("Owner1234");
  const [error, setError] = useState("");
  const login = () => {
    if (email !== "owner@villacheck.test" || password !== "Owner1234") return setError("กรุณาใช้บัญชี Owner สำหรับทดสอบ");
    onOwnerLogin();
    go("owner-select-villa");
  };
  return <FlowPage kicker="OWNER REGISTER / LOGIN" title="เริ่มต้นใช้งานแพ็กเกจ" subtitle={`${packageName} · ${packageCatalog[packageName].price}`} onBack={() => go("pricing")}>
    {!showLogin ? <div className="auth-choice"><button className="primary-button" onClick={() => go("owner-information")}>ลงทะเบียน Owner ใหม่</button><button className="outline-button" onClick={() => setShowLogin(true)}>Login สำหรับ Owner</button></div> :
      <div className="form-stack"><label><span>Owner email</span><input value={email} onChange={event => setEmail(event.target.value)} /></label><label><span>รหัสผ่าน</span><input type="password" value={password} onChange={event => setPassword(event.target.value)} /></label>{error && <div className="form-message error-state">{error}</div>}<button className="primary-button full" onClick={login}>Login และดำเนินการต่อ</button><button className="text-button" onClick={() => setShowLogin(false)}>กลับไปเลือกการลงทะเบียน</button></div>}
  </FlowPage>;
}

export function OwnerRegistration({ go, packageName }: { go: Go; packageName: string }) {
  const [name, setName] = useState("");
  const [villa, setVilla] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const submit = () => {
    if (!name || !villa || !phone) return setError("กรุณากรอกข้อมูลให้ครบทุกช่อง");
    setError("");
    go("owner-onboarding-villa");
  };
  return <FlowPage kicker="OWNER INFORMATION" title="ข้อมูลเจ้าของที่พัก" subtitle={`แพ็กเกจที่เลือก: ${packageName}`} onBack={() => go("owner-auth")}>
    <div className="form-stack">
      <label><span>ชื่อ–นามสกุล</span><input value={name} onChange={event => setName(event.target.value)} placeholder="ชื่อผู้ดูแลที่พัก" /></label>
      <label><span>ชื่อธุรกิจหรือแบรนด์</span><input value={villa} onChange={event => setVilla(event.target.value)} placeholder="ชื่อธุรกิจ" /></label>
      <label><span>เบอร์โทรศัพท์</span><input value={phone} onChange={event => setPhone(event.target.value)} placeholder="08X-XXX-XXXX" /></label>
      {error && <div className="form-message error-state">{error}</div>}
      <button className="primary-button full" onClick={submit}>บันทึกและเพิ่ม Villa</button>
    </div>
  </FlowPage>;
}

export function OwnerOnboardingVilla({ go, onVillaAdded }: { go: Go; onVillaAdded: (name: string) => void }) {
  const [name, setName] = useState("");
  const [province, setProvince] = useState("ชลบุรี");
  return <FlowPage kicker="ADD VILLA" title="เพิ่ม Villa แรกของคุณ" subtitle="ข้อมูลนี้จะถูกส่งพร้อมคำขอแพ็กเกจ" onBack={() => go("owner-information")}>
    <div className="form-stack"><label><span>ชื่อ Villa</span><input value={name} onChange={event => setName(event.target.value)} placeholder="ชื่อที่พัก" /></label><label><span>จังหวัด</span><select value={province} onChange={event => setProvince(event.target.value)}>{["ชลบุรี","ประจวบคีรีขันธ์","นครราชสีมา","ภูเก็ต","เชียงใหม่","กระบี่","สุราษฎร์ธานี"].map(item => <option key={item}>{item}</option>)}</select></label><button className="primary-button full" disabled={!name} onClick={() => { onVillaAdded(name); go("package-confirmation"); }}>บันทึก Villa และดำเนินการต่อ</button></div>
  </FlowPage>;
}

export function PackageConfirmation({ go, packageName, villaName, onConfirm }: { go: Go; packageName: string; villaName: string; onConfirm: () => void }) {
  const selectedPackage = packageCatalog[packageName];
  return <FlowPage kicker="PACKAGE CONFIRMATION" title="ยืนยันแพ็กเกจ" subtitle="ตรวจสอบรายละเอียดก่อนส่งคำขอ · ยังไม่มี Payment System" onBack={() => go("pricing")}>
    <div className="confirmation-box package-confirmation">
      <div><span>Package ที่เลือก</span><strong>{packageName}</strong><b>{selectedPackage.price}</b></div>
      <div><span>Villa ที่เลือก</span><strong>{villaName || "ยังไม่ได้เลือก Villa"}</strong><button className="text-button" onClick={() => go("owner-select-villa")}>{villaName ? "เปลี่ยน Villa" : "Select Villa"} →</button></div>
      <div><span>Features</span><ul>{selectedPackage.features.map(feature => <li key={feature}>✓ {feature}</li>)}</ul></div>
      <p>ไม่มีการเรียกเก็บเงินใน Prototype ทีมงานจะตรวจสอบและติดต่อกลับหลังอนุมัติคำขอ</p>
    </div>
    <button className="primary-button full" disabled={!villaName} onClick={onConfirm}>ยืนยันแพ็กเกจ</button>
  </FlowPage>;
}

export function OwnerSelectVilla({ go, onSelect }: { go: Go; onSelect: (villa: string) => void }) {
  return <FlowPage kicker="SELECT VILLA" title="เลือก Villa สำหรับแพ็กเกจ" subtitle="เลือกที่พักที่ต้องการใช้แพ็กเกจนี้" onBack={() => go("package-confirmation")}>
    <div className="villa-choice"><button onClick={() => { onSelect("Sea Sky Pool Villa"); go("package-confirmation"); }}><span>Sea Sky Pool Villa</span><small>ชลบุรี · VillaCheck VERIFIED</small></button><button onClick={() => { onSelect("Hua Hin Blue House"); go("package-confirmation"); }}><span>Hua Hin Blue House</span><small>ประจวบคีรีขันธ์ · Pending</small></button></div>
  </FlowPage>;
}

export function PackageRequestPending({ go, packageName }: { go: Go; packageName: string }) {
  return <FlowPage kicker="REQUEST SUBMITTED" title="ส่งคำขอแพ็กเกจเรียบร้อยแล้ว" subtitle="ทีมงาน VillaCheck จะตรวจสอบข้อมูลก่อนเปิดใช้งาน" onBack={() => go("package-confirmation")}>
    <div className="state-panel"><StatusBadge status="Pending" /><h2>รอดำเนินการ / Pending</h2><p>{packageName} · ไม่มีการชำระเงินในขั้นตอนนี้</p></div>
    <button className="primary-button full" onClick={() => go("owner-dashboard")}>ไป Owner Dashboard</button>
  </FlowPage>;
}

function FlowPage({ kicker, title, subtitle, onBack, children }: { kicker: string; title: string; subtitle: string; onBack: () => void; children: React.ReactNode }) {
  return <main className="page-bg flow-page"><div className="flow-card">
    <button className="text-button" onClick={onBack}>← ย้อนกลับ</button>
    <span className="kicker">{kicker}</span><h1>{title}</h1><p>{subtitle}</p>{children}
  </div></main>;
}

const ownerNav: [string, Page][] = [
  ["Dashboard", "owner-dashboard"], ["Villas", "owner-villas"], ["Add Villa", "owner-add-villa"],
  ["QR", "scan"], ["Analytics", "owner-analytics"], ["Reports", "owner-reports"], ["Package", "owner-package"],
];
const adminNav: [string, Page][] = [
  ["Dashboard", "admin-dashboard"], ["Owners", "admin-owners"], ["Villas", "admin-villas"],
  ["Checks", "admin-checks"], ["Reports", "admin-reports"], ["QR", "admin-qr"], ["Packages", "admin-packages"],
];
const userNav: [string, Page][] = [
  ["Dashboard", "user-dashboard"], ["Checks", "user-checks"], ["Report ของฉัน", "user-reports"],
  ["Directory", "directory"], ["Check Before Transfer", "user-precheck"],
];

function PortalShell({ role, page, go, children }: { role: "Owner" | "Admin" | "User"; page: Page; go: Go; children: React.ReactNode }) {
  const nav = role === "Owner" ? ownerNav : role === "Admin" ? adminNav : userNav;
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = (target: Page) => { setMenuOpen(false); go(target); };
  useEffect(() => { setMenuOpen(false); }, [page]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  return <main className="portal-page">
    <aside className={`portal-side ${menuOpen ? "portal-menu-open" : ""}`}>
      <div className="portal-mobile-bar">
        <button className="portal-brand" onClick={() => navigate("home")}>Villa<span>Check</span></button>
        <button className="portal-menu-toggle" aria-expanded={menuOpen} aria-controls="portal-menu" onClick={() => setMenuOpen(value => !value)}>{menuOpen ? "ปิดเมนู ✕" : "เมนู ☰"}</button>
      </div>
      <small>{role.toUpperCase()} PORTAL</small>
      <nav id="portal-menu" aria-label={`เมนู ${role}`}>{nav.map(([label, target]) => <button key={target} aria-current={page === target ? "page" : undefined} className={page === target ? "active" : ""} onClick={() => navigate(target)}>{label}</button>)}</nav>
      <button className="portal-logout" onClick={() => navigate("login")}>ออกจากระบบ</button>
    </aside>
    <section className="portal-content">{children}</section>
  </main>;
}

function PortalHead({ title, subtitle, action }: { title: string; subtitle: string; action?: React.ReactNode }) {
  return <div className="portal-head"><div><span className="kicker">VILLACHECK PROTOTYPE</span><h1>{title}</h1><p>{subtitle}</p></div>{action}</div>;
}

function StatusBadge({ status }: { status: Status }) {
  return <span className={`status-badge status-${status.toLowerCase()}`}>{status}</span>;
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="metric-card"><span>{label}</span><strong>{value}</strong><small>{note}</small></div>;
}

export function OwnerPages({ page, go, packageName, packageStatus, setPackageName, onPackageChange }: { page: Page; go: Go; packageName: string; packageStatus: string; setPackageName: (name: string) => void; onPackageChange: () => void }) {
  if (page === "owner-dashboard") return <PortalShell role="Owner" page={page} go={go}>
    <PortalHead title="Owner Dashboard" subtitle="ภาพรวม Sea Sky Pool Villa" action={<button className="primary-button" onClick={() => go("owner-add-villa")}>+ Add Villa</button>} />
    <div className="package-strip"><span>แพ็กเกจปัจจุบัน</span><strong>{packageName}</strong><StatusBadge status={packageStatus.includes("Pending") ? "Pending" : "Verified"} /><small>{packageStatus}</small><button onClick={() => go("owner-package")}>เปลี่ยน Package</button></div>
    <div className="metric-grid"><Metric label="Villas" value="1" note="1 Verified" /><Metric label="QR Scans" value="248" note="+18% เดือนนี้" /><Metric label="Checks" value="91" note="Success 88" /><Metric label="Reports" value="2" note="Pending 1" /></div>
    <div className="portal-grid"><ActionCard title="จัดการ Villa" text="ดูรายละเอียด แก้ไข และสถานะ" action="เปิด Villas" onClick={() => go("owner-villas")} /><ActionCard title="Verification QR" text="เปิดหน้าสแกนและผลตรวจสอบ" action="เปิด QR" onClick={() => go("scan")} /><ActionCard title="Analytics" text="ดูสถิติการเข้าชม" action="ดู Analytics" onClick={() => go("owner-analytics")} /></div>
  </PortalShell>;

  if (page === "owner-villas") return <PortalShell role="Owner" page={page} go={go}><PortalHead title="Villas" subtitle="จัดการที่พักทั้งหมด" action={<button className="primary-button" onClick={() => go("owner-add-villa")}>+ Add Villa</button>} /><DataRow title="Sea Sky Pool Villa" detail="บางแสน, ชลบุรี" status="Verified" action="ดูรายละเอียด" onClick={() => go("owner-villa-detail")} /></PortalShell>;
  if (page === "owner-villa-detail") return <PortalShell role="Owner" page="owner-villas" go={go}><PortalHead title="Sea Sky Pool Villa" subtitle="Villa Detail · VC-TH-2025-01842" action={<button className="primary-button" onClick={() => go("owner-villa-edit")}>Edit</button>} /><DetailPanel /><button className="outline-button" onClick={() => go("verify")}>เปิด Verification Page</button></PortalShell>;
  if (page === "owner-villa-edit") return <PortalShell role="Owner" page="owner-villas" go={go}><PortalHead title="Edit Villa" subtitle="แก้ไขข้อมูลที่พัก" /><VillaForm submitLabel="บันทึกการแก้ไข" onSubmit={() => go("owner-villa-detail")} /></PortalShell>;
  if (page === "owner-add-villa") return <PortalShell role="Owner" page={page} go={go}><PortalHead title="Add Villa" subtitle="กรอกข้อมูลที่พักเพื่อส่งตรวจสอบ" /><VillaForm submitLabel="Preview" onSubmit={() => go("owner-preview")} /></PortalShell>;
  if (page === "owner-preview") return <PortalShell role="Owner" page="owner-add-villa" go={go}><PortalHead title="Preview Villa" subtitle="ตรวจสอบข้อมูลก่อน Submit" /><DetailPanel /><div className="button-row"><button className="outline-button" onClick={() => go("owner-add-villa")}>กลับไปแก้ไข</button><button className="primary-button" onClick={() => go("owner-pending")}>Submit</button></div></PortalShell>;
  if (page === "owner-pending") return <PortalShell role="Owner" page="owner-villas" go={go}><PortalHead title="Pending Review" subtitle="ส่งข้อมูลเข้าระบบสำเร็จ" /><StatePanel status="Pending" title="กำลังรอ Admin ตรวจสอบ" /><button className="primary-button" onClick={() => go("owner-villas")}>กลับไปหน้า Villas</button></PortalShell>;
  if (page === "owner-analytics") return <PortalShell role="Owner" page={page} go={go}><PortalHead title="Analytics" subtitle="ข้อมูลสาธิต 30 วันล่าสุด" /><div className="metric-grid"><Metric label="Profile Views" value="1,248" note="+14%" /><Metric label="QR Scans" value="248" note="+18%" /><Metric label="Contact Clicks" value="93" note="+7%" /></div><div className="chart-demo">{[42,68,51,82,60,91,75].map((_, index) => <i key={index} className={`chart-bar-${index + 1}`} />)}</div></PortalShell>;
  if (page === "owner-reports") return <PortalShell role="Owner" page={page} go={go}><PortalHead title="Reports" subtitle="รายการแจ้งปัญหาที่เกี่ยวข้องกับที่พัก" /><DataRow title="REP-1048" detail="ผู้ใช้แจ้งข้อมูลบัญชีไม่ตรง" status="Pending" action="รับทราบ" onClick={() => window.alert("บันทึกการรับทราบรายงานแล้ว")} /><DataRow title="REP-1022" detail="ข้อมูลติดต่อได้รับการแก้ไขแล้ว" status="Verified" action="ดูรายละเอียด" onClick={() => window.alert("รายงาน REP-1022: ดำเนินการสำเร็จ")} /></PortalShell>;
  return <PortalShell role="Owner" page="owner-package" go={go}><PortalHead title="Package" subtitle={`แพ็กเกจปัจจุบัน: ${packageName} · ${packageStatus}`} /><PackagePicker selected={packageName} onSelect={name => { setPackageName(name); onPackageChange(); window.alert(`ส่งคำขอเปลี่ยนแพ็กเกจเป็น ${name} แล้ว`); }} /></PortalShell>;
}

function VillaForm({ submitLabel, onSubmit }: { submitLabel: string; onSubmit: () => void }) {
  const [name, setName] = useState("Sea Sky Pool Villa");
  const [province, setProvince] = useState("ชลบุรี");
  const [contact, setContact] = useState("08X-XXX-4289");
  return <div className="portal-form">
    <label><span>ชื่อ Villa</span><input value={name} onChange={event => setName(event.target.value)} /></label>
    <label><span>จังหวัด</span><select value={province} onChange={event => setProvince(event.target.value)}>{["ชลบุรี","ประจวบคีรีขันธ์","นครราชสีมา","ภูเก็ต","เชียงใหม่","กระบี่","สุราษฎร์ธานี"].map(item => <option key={item}>{item}</option>)}</select></label>
    <label><span>Official Contact</span><input value={contact} onChange={event => setContact(event.target.value)} /></label>
    <label><span>รายละเอียด</span><textarea defaultValue="พูลวิลล่าส่วนตัว พร้อมสระว่ายน้ำและพื้นที่สำหรับครอบครัว" /></label>
    <button className="primary-button" onClick={onSubmit} disabled={!name || !contact}>{submitLabel}</button>
  </div>;
}

function DetailPanel() {
  return <div className="detail-panel"><div><span>ชื่อที่พัก</span><strong>Sea Sky Pool Villa</strong></div><div><span>จังหวัด</span><strong>ชลบุรี</strong></div><div><span>Official Contact</span><strong>08X-XXX-4289</strong></div><div><span>Status</span><StatusBadge status="Verified" /></div></div>;
}

function PackagePicker({ selected, onSelect }: { selected: string; onSelect: (name: string) => void }) {
  return <div className="package-picker">{["Basic Trust QR","Trust Starter","Trust Pro","Trust Plus","Trust Premium"].map(name => <button key={name} className={selected === name ? "active" : ""} onClick={() => onSelect(name)}><span>{name}</span><small>{selected === name ? "แพ็กเกจปัจจุบัน" : "เลือกแพ็กเกจ"}</small></button>)}</div>;
}

export function AdminPages({ page, go, villaStatus, setVillaStatus }: { page: Page; go: Go; villaStatus: Status; setVillaStatus: (status: Status) => void }) {
  if (page === "admin-dashboard") return <PortalShell role="Admin" page={page} go={go}><PortalHead title="Admin Dashboard" subtitle="ภาพรวมระบบ VillaCheck" /><div className="metric-grid"><Metric label="Pending Villas" value="4" note="รอตรวจสอบ" /><Metric label="Owners" value="128" note="Active 123" /><Metric label="Checks" value="2,481" note="เดือนนี้" /><Metric label="Reports" value="12" note="Open 3" /></div><ActionCard title="Pending Villa" text="Sea Sky Pool Villa รอการตรวจสอบ" action="Review" onClick={() => go("admin-review")} /><StateGallery /></PortalShell>;
  if (page === "admin-review") return <PortalShell role="Admin" page="admin-villas" go={go}><PortalHead title="Review Villa" subtitle="ตรวจสอบข้อมูล Sea Sky Pool Villa" /><DetailPanel /><div className="review-actions"><button className="primary-button" onClick={() => { setVillaStatus("Verified"); go("admin-villas"); }}>Approve</button><button className="outline-button" onClick={() => { setVillaStatus("Pending"); window.alert("ส่งคำขอแก้ไขให้ Owner แล้ว"); }}>Request Change</button><button className="danger-button" onClick={() => { setVillaStatus("Rejected"); go("admin-villas"); }}>Reject</button></div></PortalShell>;
  const configs: Partial<Record<Page, [string,string]>> = {
    "admin-owners": ["Owners", "บัญชีเจ้าของที่พักและสถานะการใช้งาน"],
    "admin-villas": ["Villas", "รายการ Villa และสถานะล่าสุด"],
    "admin-checks": ["Checks", "ประวัติการตรวจสอบก่อนโอน"],
    "admin-reports": ["Reports", "รายงานปัญหาจากผู้ใช้งาน"],
    "admin-qr": ["QR", "QR Reference และสถานะ"],
    "admin-packages": ["Packages", "แพ็กเกจที่ Owner ใช้งาน"],
  };
  const [title, subtitle] = configs[page] ?? ["Admin", "จัดการระบบ"];
  return <PortalShell role="Admin" page={page} go={go}><PortalHead title={title} subtitle={subtitle} />
    {page === "admin-owners" && <><DataRow title="Sea Sky Co., Ltd." detail="owner@villacheck.test" status="Verified" action="เปิด Owner" onClick={() => window.alert("Owner: Sea Sky Co., Ltd.")} /><DataRow title="North Stay Group" detail="สถานะถูกระงับชั่วคราว" status="Suspended" action="ตรวจสอบ" onClick={() => window.alert("บัญชี Suspended")} /></>}
    {page === "admin-villas" && <DataRow title="Sea Sky Pool Villa" detail="VC-TH-2025-01842" status={villaStatus} action="Review" onClick={() => go("admin-review")} />}
    {page === "admin-checks" && <DataRow title="CHK-2081" detail="Sea Sky Pool Villa · Success" status="Verified" action="ดู Check" onClick={() => window.alert("CHK-2081 · Verification Success · Sea Sky Pool Villa")} />}
    {page === "admin-reports" && <DataRow title="REP-1048" detail="ข้อมูลบัญชีไม่ตรง" status="Pending" action="เปิด Report" onClick={() => window.alert("REP-1048 · อยู่ระหว่างตรวจสอบข้อมูลบัญชี")} />}
    {page === "admin-qr" && <><DataRow title="VC-TH-2025-01842" detail="Sea Sky Pool Villa" status="Verified" action="Verification Page" onClick={() => go("verify")} /><DataRow title="VC-TH-2024-00991" detail="QR หมดอายุ" status="Expired" action="ดูรายละเอียด" onClick={() => window.alert("QR นี้หมดอายุแล้ว")} /></>}
    {page === "admin-packages" && <PackagePicker selected="Trust Pro" onSelect={name => window.alert(`เปิดรายละเอียด ${name}`)} />}
  </PortalShell>;
}

function StateGallery() {
  const [state, setState] = useState("Loading");
  const states = ["Loading","Empty","Success","Error","Pending","Verified","Rejected","Suspended","Expired"];
  return <div className="state-gallery"><strong>Interaction States</strong><div>{states.map(item => <button key={item} className={state === item ? "active" : ""} onClick={() => setState(item)}>{item}</button>)}</div><p>{state === "Loading" ? "กำลังโหลดข้อมูล..." : state === "Empty" ? "ยังไม่มีข้อมูลในรายการนี้" : `ตัวอย่างสถานะ ${state}`}</p></div>;
}

export function UserPages({ page, go, reports, selectedReference }: { page: Page; go: Go; reports: UserReport[]; selectedReference?: string }) {
  if (page === "user-dashboard") return <PortalShell role="User" page={page} go={go}><PortalHead title="User Dashboard" subtitle="ตรวจสอบที่พักก่อนโอนอย่างมั่นใจ" action={<button className="primary-button" onClick={() => go("user-precheck")}>Check Before Transfer</button>} /><div className="metric-grid"><Metric label="Checks" value="3" note="Verified 2" /><Metric label="Reports" value={String(reports.length)} note="กำลังดำเนินการ" /></div><div className="portal-grid"><ActionCard title="Checks" text="ดูประวัติการตรวจสอบ" action="เปิด Checks" onClick={() => go("user-checks")} /><ActionCard title="Report ของฉัน" text="ติดตามรายงานปัญหา" action="เปิด Report" onClick={() => go("user-reports")} /><ActionCard title="Directory" text="ค้นหา Villa ที่ตรวจสอบข้อมูลแล้ว" action="ค้นหา Villa" onClick={() => go("directory")} /></div></PortalShell>;
  if (page === "user-checks") return <PortalShell role="User" page={page} go={go}><PortalHead title="Checks" subtitle="ประวัติการตรวจสอบก่อนโอน" /><DataRow title="CHK-2081" detail="Sea Sky Pool Villa · 20 มิ.ย. 2568" status="Verified" action="Check Detail" onClick={() => go("user-check-detail")} /></PortalShell>;
  if (page === "user-check-detail") return <PortalShell role="User" page="user-checks" go={go}><PortalHead title="Check Detail" subtitle="Reference CHK-2081" /><StatePanel status="Verified" title="VillaCheck VERIFIED" /><DetailPanel /><button className="outline-button" onClick={() => go("detail")}>ดู Trust Profile</button></PortalShell>;
  if (page === "user-reports") return <PortalShell role="User" page={page} go={go}><PortalHead title="Report ของฉัน" subtitle="รายงานที่ผูกกับบัญชี User ของคุณ" action={<button className="primary-button" onClick={() => go("villa-report")}>+ แจ้งปัญหา</button>} />{reports.length ? reports.map(report => <DataRow key={report.reference} title={report.reference} detail={`${report.villa} · ${report.type}`} status="Pending" action="Report Detail" onClick={() => go("user-report-detail", report.reference)} />) : <StatePanel status="Pending" title="ยังไม่มี Report" />}</PortalShell>;
  if (page === "user-report-detail") return <PortalShell role="User" page="user-reports" go={go}><PortalHead title="Report Detail" subtitle={`Reference ${reports.find(report => report.reference === selectedReference)?.reference ?? reports[0]?.reference ?? "RPT-1042"}`} /><StatePanel status="Pending" title="ทีมงานกำลังตรวจสอบ" /><p className="portal-note">ระบบได้รับข้อมูลแล้ว และจะแจ้งผลเมื่อดำเนินการเสร็จสิ้น</p><button className="outline-button" onClick={() => go("user-reports")}>กลับไป Report ของฉัน</button></PortalShell>;
  if (page === "user-check-success") return <PortalShell role="User" page="user-precheck" go={go}><PortalHead title="สร้างรายการตรวจสอบสำเร็จ" subtitle="บันทึกข้อมูลเรียบร้อยแล้ว" /><StatePanel status="Verified" title="CHK-2081" /><button className="primary-button" onClick={() => go("user-check-detail")}>ดู Check Detail</button></PortalShell>;
  return <PortalShell role="User" page="user-precheck" go={go}><PortalHead title="Check Before Transfer" subtitle="กรอกข้อมูลก่อนโอนเพื่อสร้างรายการตรวจสอบ" /><PrecheckForm onSubmit={() => go("user-check-success")} /></PortalShell>;
}

function PrecheckForm({ onSubmit }: { onSubmit: () => void }) {
  const [villa, setVilla] = useState("");
  const [account, setAccount] = useState("");
  const [contact, setContact] = useState("");
  return <div className="portal-form"><label><span>ชื่อ Villa</span><input value={villa} onChange={event => setVilla(event.target.value)} placeholder="ชื่อที่พัก" /></label><label><span>เลขบัญชีที่ได้รับ</span><input value={account} onChange={event => setAccount(event.target.value)} placeholder="XXX-X-XXXXX-X" /></label><label><span>ช่องทางติดต่อ</span><input value={contact} onChange={event => setContact(event.target.value)} placeholder="เบอร์โทรหรือ LINE" /></label><button className="primary-button" disabled={!villa || !account || !contact} onClick={onSubmit}>Submit</button></div>;
}

function ActionCard({ title, text, action, onClick }: { title: string; text: string; action: string; onClick: () => void }) {
  return <article className="action-card"><h3>{title}</h3><p>{text}</p><button className="text-button" onClick={onClick}>{action} →</button></article>;
}

function DataRow({ title, detail, status, action, onClick }: { title: string; detail: string; status: Status; action: string; onClick: () => void }) {
  return <div className="data-row"><div><strong>{title}</strong><span>{detail}</span></div><StatusBadge status={status} /><button className="outline-button" onClick={onClick}>{action}</button></div>;
}

function StatePanel({ status, title }: { status: Status; title: string }) {
  return <div className="state-panel"><StatusBadge status={status} /><h2>{title}</h2><p>สถานะล่าสุดจากระบบ Prototype ของ VillaCheck</p></div>;
}
