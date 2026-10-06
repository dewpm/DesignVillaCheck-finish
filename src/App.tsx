import PremiumBanner from "./PremiumBanner";
import MerchantProfile from "./MerchantProfile";
import AdminBusiness from "./AdminBusiness";
import { usePackages, selectedPlanKey, packageIntentKey } from "./packagePlans";
import { api, currentAccount } from "./api";
import VillaMap from "./VillaMap";
import ProvinceExplorer, { popularProvinces } from "./ProvinceExplorer";
import { UserRegistration, AdminUsers, MemberDashboard } from "./UserAccounts";
import Backoffice, { MerchantVerification } from "./Backoffice";
import { openSupport } from "./support";
import { usePageNavigation } from "./navigation";
import { useEffect, useRef, useState } from "react";
import type { BrowserQRCodeReader, IScannerControls } from "@zxing/browser";
import { LoginPage, OwnerPackageAuth, OwnerRegistration, PublicInfoPage, PublicReportPage, PublicReportSuccess, type Page, type UserReport, UserPages } from "./prototype";
type IconName =
  | "search"
  | "pin"
  | "users"
  | "check"
  | "shield"
  | "arrow"
  | "phone"
  | "mail"
  | "clock"
  | "qr"
  | "chart"
  | "home"
  | "wifi"
  | "pool"
  | "car"
  | "kitchen"
  | "bed"
  | "info"
  | "camera"
  | "upload"
  | "facebook"
  | "instagram"
  | "message"
  | "menu"
  | "close";

const photos = [
  "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=1400&q=88",
  "https://images.unsplash.com/photo-1514803400321-3ca29fc47334?auto=format&fit=crop&w=1200&q=86",
  "https://images.unsplash.com/photo-1555426104-3a03a4e70b1d?auto=format&fit=crop&w=1200&q=86",
  "https://images.unsplash.com/photo-1756115377696-0bdbf1c21a02?auto=format&fit=crop&w=1200&q=86",
];

const villas = [
  { name: "Sea Sky Pool Villa", province: "ชลบุรี", guests: "12 คน", status: "ตรวจสอบข้อมูลแล้ว", updated: "18 มิ.ย. 2568", image: photos[0] },
  { name: "Khao Yai Forest Pool", province: "นครราชสีมา", guests: "10 คน", status: "ตรวจสอบข้อมูลแล้ว", updated: "16 มิ.ย. 2568", image: photos[1] },
  { name: "Hua Hin Blue House", province: "ประจวบคีรีขันธ์", guests: "8 คน", status: "ตรวจสอบข้อมูลแล้ว", updated: "12 มิ.ย. 2568", image: photos[2] },
  { name: "Phuket Ocean Residence", province: "ภูเก็ต", guests: "14 คน", status: "รอตรวจสอบ", updated: "08 มิ.ย. 2568", image: photos[3] },
  { name: "Chiang Mai Garden Villa", province: "เชียงใหม่", guests: "8 คน", status: "ตรวจสอบข้อมูลแล้ว", updated: "06 มิ.ย. 2568", image: photos[1] },
  { name: "Krabi Cliff Pool Villa", province: "กระบี่", guests: "10 คน", status: "ตรวจสอบข้อมูลแล้ว", updated: "04 มิ.ย. 2568", image: photos[2] },
  { name: "Samui Sunset Residence", province: "สุราษฎร์ธานี", guests: "12 คน", status: "รอตรวจสอบ", updated: "02 มิ.ย. 2568", image: photos[0] },
];

const provinces = popularProvinces;

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-5" /></>,
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    phone: <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.63a2 2 0 0 1-.45 2.11L8 9.73a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.85.3 1.73.5 2.63.62A2 2 0 0 1 22 16.92Z" />,
    mail: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 7L2 7" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    qr: <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><path d="M14 14h3v3h-3zM18 18h3v3h-3zM18 13h3M13 20h3" /></>,
    chart: <><path d="M4 19V9M10 19V4M16 19v-7M22 19H2" /></>,
    home: <><path d="m3 11 9-8 9 8" /><path d="M5 10v11h14V10M9 21v-7h6v7" /></>,
    wifi: <><path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0" /><circle cx="12" cy="20" r="1" /></>,
    pool: <><path d="M2 15c2 0 2 2 4 2s2-2 4-2 2 2 4 2 2-2 4-2 2 2 4 2M2 20c2 0 2 2 4 2s2-2 4-2 2 2 4 2 2-2 4-2 2 2 4 2M7 15V5a3 3 0 0 1 6 0M7 10h6" /></>,
    car: <><path d="M5 17h14l1-5-2-5H6l-2 5 1 5Z" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></>,
    kitchen: <><path d="M6 3v8M3 3v5a3 3 0 0 0 6 0V3M6 11v10M16 3v18M16 3c4 2 5 8 0 10" /></>,
    bed: <><path d="M3 20v-8h18v8M3 16h18M7 12V8h5a4 4 0 0 1 4 4" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>,
    camera: <><path d="M14.5 5 13 3h-2L9.5 5H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-4.5Z" /><circle cx="12" cy="12.5" r="4" /></>,
    upload: <><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></>,
    facebook: <path d="M14 8h4V3h-4a6 6 0 0 0-6 6v3H4v5h4v5h5v-5h4l1-5h-5V9a1 1 0 0 1 1-1Z" />,
    instagram: <><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r=".5" fill="currentColor" /></>,
    message: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3 1.7-5A7 7 0 0 1 3 12V8a5 5 0 0 1 5-5h8a5 5 0 0 1 5 5Z" /><path d="M8 10h8M8 14h5" /></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function Logo({ light = false }: { light?: boolean }) {
  return <div className={`logo ${light ? "logo-light" : ""}`}><span className="logo-mark"><Icon name="shield" size={24} /></span><span>Villa<span>Check</span></span></div>;
}

function Badge({ pending = false, children = "ตรวจสอบข้อมูลแล้ว" }: { pending?: boolean; children?: React.ReactNode }) {
  return <span className={`badge ${pending ? "badge-pending" : ""}`}><span className="badge-icon"><Icon name={pending ? "clock" : "check"} size={12} /></span>{children}</span>;
}

function Header({ page, go }: { page: Page; go: (page: Page) => void }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  useEffect(() => { setMobileMenuOpen(false); }, [page]);
  useEffect(() => { const close = (event: KeyboardEvent) => { if (event.key === "Escape") setMobileMenuOpen(false); }; window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close); }, []);
  const reportIssue = () => {
    setMobileMenuOpen(false);
    go("villa-report");
  };
  const showHowItWorks = () => {
    setMobileMenuOpen(false);
    if (page !== "home") go("home");
    window.setTimeout(() => document.getElementById("how")?.scrollIntoView({ behavior: "smooth" }), 50);
  };
  const navigate = (next: Page) => {
    setMobileMenuOpen(false);
    go(next);
  };

  return <header className="header">
    <div className="container nav">
      <button className="logo-button" onClick={() => navigate("home")}><Logo /></button>
      <nav id="public-menu" className={mobileMenuOpen ? "mobile-open" : ""}>
        <button className={page === "home" ? "active" : ""} onClick={() => navigate("home")}>หน้าหลัก</button>
        <button className={page === "directory" || page === "detail" ? "active" : ""} onClick={() => navigate("directory")}>ค้นหาวิลล่า</button>
        <button className={page === "scan" || page === "verify" ? "active" : ""} onClick={() => navigate("scan")}>ตรวจสอบก่อนโอน</button>
        <button onClick={reportIssue}>แจ้งปัญหา</button>
        <button onClick={showHowItWorks}>วิธีการทำงาน</button>
        <button className={page === "pricing" ? "active" : ""} onClick={() => navigate("pricing")}>แพ็กเกจเจ้าของที่พัก</button>
        <button onClick={() => navigate("login")}>เข้าสู่ระบบ</button>
      </nav>
      <div className="nav-actions"><button className="outline-button nav-qr-button" onClick={() => navigate("scan")}><Icon name="qr" size={17} /><span>ตรวจสอบ QR</span></button><button className="mobile-menu-button" aria-label={mobileMenuOpen ? "ปิดเมนู" : "เปิดเมนู"} aria-expanded={mobileMenuOpen} aria-controls="public-menu" onClick={() => setMobileMenuOpen(open => !open)}><Icon name={mobileMenuOpen ? "close" : "menu"} size={22} /></button></div>
    </div>
  </header>;
}

function VillaCard({ villa, onClick }: { villa: typeof villas[0]; onClick: () => void }) {
  return <article className="villa-card" onClick={onClick}>
    <div className="card-image"><img src={villa.image} alt={`ภาพ ${villa.name}`} /><Badge pending={villa.status !== "ตรวจสอบข้อมูลแล้ว"}>{villa.status}</Badge></div>
    <div className="card-body">
      <h3>{villa.name}</h3>
      <div className="villa-meta"><span><Icon name="pin" size={17} />{villa.province}</span>{villa.guests !== "ไม่ระบุ" && <span><Icon name="users" size={17} />สูงสุด {villa.guests}</span>}</div>
      <div className="card-foot"><span><Icon name="clock" size={15} />อัปเดตล่าสุด {villa.updated}</span><button aria-label={`ดู ${villa.name}`} onClick={event => { event.stopPropagation(); onClick(); }}><Icon name="arrow" size={18} /></button></div>
    </div>
  </article>;
}

function SearchBox({ onSearch }: { onSearch: (query: string, province: string) => void }) {
  const [query, setQuery] = useState("");
  const [province, setProvince] = useState("");
  return <div className="search-box">
    <label><span>ชื่อวิลล่าหรือที่พัก</span><div><Icon name="search" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="ค้นหาชื่อวิลล่า..." /></div></label>
    <label><span>จังหวัด</span><div><Icon name="pin" /><select value={province} onChange={event => setProvince(event.target.value)}><option value="">ทุกจังหวัด</option>{provinces.map(item => <option key={item}>{item}</option>)}</select></div></label>
    <button className="primary-button" onClick={() => onSearch(query, province)}><Icon name="search" size={18} />ค้นหา</button>
  </div>;
}

function ShowcaseCard({ villa, featured = false, onClick }: { villa: typeof villas[0] & {premiumBanner?:boolean}; featured?: boolean; onClick: () => void }) {
  return <article className={`showcase-card ${featured ? "featured" : ""}`} onClick={onClick}>
    <img src={villa.image} alt={`ภาพ ${villa.name}`} />
    <div className="showcase-overlay" />

    <div className="showcase-status"><Icon name={villa.status === "ตรวจสอบข้อมูลแล้ว" ? "shield" : "clock"} size={14} />{villa.status === "ตรวจสอบข้อมูลแล้ว" ? "VillaCheck VERIFIED" : villa.status}</div>
    <div className="showcase-copy"><span><Icon name="pin" size={14} />{villa.province}</span><h3>{villa.name}</h3><div><small>Last checked</small><strong>{villa.updated}</strong><button aria-label={`ดู Trust Profile ของ ${villa.name}`} onClick={event => { event.stopPropagation(); onClick(); }}><Icon name="arrow" size={18} /></button></div></div>
  </article>;
}

function VillaShowcase({ go }: { go: (p: Page, item?: string) => void }) {
  const [active, setActive] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const [items,setItems]=useState<(typeof villas[number] & {qr:string;premiumBanner:boolean;createdAt:string})[]>([]);
  useEffect(()=>{let active=true;void api<{villas:{name:string;province:string;qr:string;qrStatus:string;photoUrl:string;updated:string;premiumBanner:boolean}[]}>("/public/villas").then(data=>{if(active)setItems(data.villas.slice(0,4).map(v=>({...v,createdAt:v.updated,updated:new Date(v.updated).toLocaleDateString("th-TH",{day:"numeric",month:"short",year:"numeric",timeZone:"Asia/Bangkok"}),guests:"ไม่ระบุ",status:v.qrStatus === "ACTIVE" ? "ตรวจสอบข้อมูลแล้ว" : "หมดอายุ",image:v.photoUrl || "/villa-placeholder.svg"})));}).catch(()=>{});return()=>{active=false;};},[]);
  const scrollToSlide = (index: number) => {
    const next = Math.max(0, Math.min(items.length - 1, index));
    const element = trackRef.current?.children[next] as HTMLElement | undefined;
    element?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
    setActive(next);
  };
  const updateActive = () => {
    const track = trackRef.current;
    if (!track) return;
    const children = Array.from(track.children) as HTMLElement[];
    const nearest = children.reduce((best, child, index) => Math.abs(child.offsetLeft - track.scrollLeft) < Math.abs(children[best].offsetLeft - track.scrollLeft) ? index : best, 0);
    setActive(nearest);
  };
  if(!items.length)return <p>ยังไม่มี Villa ที่ผ่านการตรวจสอบ</p>;
  return <div className="showcase-carousel">
    <div className="showcase-track" ref={trackRef} onScroll={updateActive}>{items.map((villa, index) => <ShowcaseCard key={villa.name} villa={villa} featured={index === 0} onClick={() => go("verify", villa.qr)} />)}</div>
    <div className="carousel-controls"><button aria-label="Villa ก่อนหน้า" onClick={() => scrollToSlide(active - 1)} disabled={active === 0}>←</button><div className="carousel-dots">{items.map((villa, index) => <button key={villa.name} aria-label={`ไป Villa ภาพที่ ${index + 1}`} className={active === index ? "active" : ""} onClick={() => scrollToSlide(index)} />)}</div><span>{active + 1}/{items.length}</span><button aria-label="Villa ถัดไป" onClick={() => scrollToSlide(active + 1)} disabled={active === items.length - 1}>→</button></div>
  </div>;
}

function Home({ go, onSearch }: { go: (p: Page, item?: string) => void; onSearch: (query: string, province: string) => void }) {
  const [heroSlide, setHeroSlide] = useState(0);
  const [heroAutoPlay, setHeroAutoPlay] = useState(true);
  const heroTouchStart = useRef(0);
  const changeHeroSlide = (next: number, userInitiated = true) => {
    setHeroSlide((next + photos.length) % photos.length);
    if (userInitiated) setHeroAutoPlay(false);
  };
  useEffect(() => {
    if (!heroAutoPlay) return;
    const timer = window.setInterval(() => setHeroSlide(current => (current + 1) % photos.length), 5200);
    return () => window.clearInterval(timer);
  }, [heroAutoPlay]);

  return <>
    <section className="hero">
      <div className="hero-orb hero-orb-one" /><div className="hero-orb hero-orb-two" />
      <div className="hero-map-line hero-map-line-one" /><div className="hero-map-line hero-map-line-two" />
      <div className="hero-brand-monogram" aria-hidden="true">VC</div>
      <div className="hero-launch-index" aria-hidden="true"><span>01</span><i /><small>PUBLIC TRUST LAYER</small></div>
      <div className="container hero-grid">
        <div className="hero-copy">
          <div className="eyebrow"><Icon name="shield" size={16} />TRUST INTELLIGENCE FOR TRAVEL</div>
          <h1>เช็กให้ชัด<br />ก่อนออกเดินทาง<br /><span>ก่อนโอนทุกครั้ง</span></h1>
          <p>ค้นหาและตรวจสอบ Villa ผ่านข้อมูลตัวตน ช่องทางติดต่อ บัญชีรับเงิน และ QR Verification ในมุมมองเดียว</p>
          <SearchBox onSearch={onSearch} />
          <div className="trust-row"><span><Icon name="check" size={14} />ตรวจสอบฟรี</span><span><Icon name="check" size={14} />ไม่ต้องสมัครสมาชิก</span><span><Icon name="check" size={14} />ข้อมูลอัปเดตสม่ำเสมอ</span></div>
        </div>
        <div className="hero-visual">
          <div className="hero-image-frame" />
          <div className="hero-photo" onMouseEnter={() => setHeroAutoPlay(false)} onPointerDown={() => setHeroAutoPlay(false)} onTouchStart={event => { heroTouchStart.current = event.touches[0].clientX; setHeroAutoPlay(false); }} onTouchEnd={event => { const distance = event.changedTouches[0].clientX - heroTouchStart.current; if (Math.abs(distance) > 45) changeHeroSlide(heroSlide + (distance < 0 ? 1 : -1)); }}>
            {photos.map((photo, index) => <img key={photo} className={`hero-slide ${heroSlide === index ? "active" : ""}`} src={photo} alt={`พูลวิลล่าตัวอย่างภาพที่ ${index + 1}`} />)}
            <div className="hero-photo-caption"><span>SEA SKY / CHONBURI</span><strong>Travel with proof.</strong></div>
            <button className="hero-slide-arrow previous" aria-label="ภาพ Hero ก่อนหน้า" onClick={() => changeHeroSlide(heroSlide - 1)}>←</button><button className="hero-slide-arrow next" aria-label="ภาพ Hero ถัดไป" onClick={() => changeHeroSlide(heroSlide + 1)}>→</button>
            <div className="hero-slide-indicator"><span>{heroSlide + 1}/{photos.length}</span>{photos.map((photo, index) => <button key={photo} aria-label={`ไปภาพ Hero ที่ ${index + 1}`} className={heroSlide === index ? "active" : ""} onClick={() => changeHeroSlide(index)} />)}</div>
          </div>
          <div className="hero-secondary-photo"><img src={photos[3]} alt="รายละเอียดสถาปัตยกรรมพูลวิลล่า" /><span>PROPERTY / 01842</span></div>
          <div className="hero-trust-radar" aria-hidden="true"><i /><i /><i /><span><Icon name="shield" size={20} /></span></div>
          <div className="verified-float trust-float">
            <span className="verified-seal"><Icon name="shield" size={27} /></span>
            <div><strong>VillaCheck VERIFIED</strong><span>Verified Property</span><small>Last checked · 18 Jun 2025</small></div>
          </div>
          <div className="hero-qr-float"><div className="hero-mini-qr"><QrPattern /></div><div><small>QR ACTIVE</small><strong>VC-01842</strong></div></div>
          <div className="hero-location-float"><Icon name="pin" size={18} /><div><small>PROVINCE</small><strong>ชลบุรี</strong></div></div>
          <div className="hero-data-rail"><span><i />Verified</span><span>98<small>/100 Trust</small></span></div>
        </div>
      </div>
      <div className="container hero-signal-strip">
        <div><span className="signal-pulse" /><small>TRUST SIGNAL</small><strong>Live prototype</strong></div>
        <div><small>VERIFICATION LAYER</small><strong>Identity · Contact · Account</strong></div>
        <div><small>DESTINATION INTELLIGENCE</small><strong>10 popular destinations</strong></div>
        <button onClick={() => go("scan")}><span>SCAN / VERIFY</span><Icon name="arrow" size={17} /></button>
      </div>
    </section>
    <div className="container premium-promo-wrap"><PremiumBanner onSelect={() => go("pricing")} /></div>

    <section className="section how-section" id="how">
      <div className="container">
        <div className="timeline-head"><div><span className="kicker">TRUST JOURNEY / 01—03</span><h2>ตรวจสอบใน 3 ขั้นตอน</h2></div><p>จากการค้นหา ไปจนถึงหลักฐานที่ตรวจสอบย้อนกลับได้<br />ออกแบบเพื่อช่วงเวลาก่อนตัดสินใจโอน</p></div>
        <div className="steps trust-timeline">
          {[["01", "search", "ค้นหาวิลล่า", "ค้นหาจากชื่อที่พักหรือเลือกจังหวัดที่ต้องการ"], ["02", "shield", "เช็ก Trust Profile", "ตรวจสอบสถานะ ข้อมูลติดต่อ และบัญชีทางการ"], ["03", "qr", "สแกน QR ยืนยัน", "เช็ก QR Verification ที่ได้รับจากเจ้าของที่พัก"]].map((s, i) =>
            <div className="step" key={s[0]}><span className="step-no">{s[0]}</span><span className="step-icon"><Icon name={s[1] as IconName} size={28} /></span><h3>{s[2]}</h3><p>{s[3]}</p>{i < 2 && <span className="step-line"><Icon name="arrow" size={18} /></span>}</div>
          )}
        </div>
      </div>
    </section>

    <ProvinceExplorer onSearch={onSearch} />

    <section className="section verified-section showcase-section">
      <div className="container">
        <div className="section-head"><div><span className="kicker">VERIFIED VILLA SHOWCASE</span><h2>ที่พักพร้อมหลักฐาน<br />ไม่ใช่แค่ภาพสวย</h2><p>สำรวจ Trust metadata ที่สำคัญก่อนตัดสินใจ</p></div><button className="text-button" onClick={() => go("directory")}>เปิด Directory <Icon name="arrow" size={18} /></button></div>
        <VillaShowcase go={go} />
      </div>
    </section>

    <section className="section qr-section">
      <div className="container split-panel">
        <div className="qr-copy"><span className="kicker light-kicker">LIVE TRUST SIGNAL</span><h2>หนึ่งสแกน<br />เห็นหลักฐานที่จำเป็น</h2><p>QR ของ VillaCheck เชื่อมผู้เดินทางกับข้อมูลตรวจสอบล่าสุด โดยไม่พาเข้าสู่ขั้นตอนจองหรือชำระเงิน</p><ul><li><Icon name="check" />Official Contact ที่ตรวจสอบข้อมูลแล้ว</li><li><Icon name="check" />บัญชีรับเงินแบบ Masked</li><li><Icon name="check" />Last Checked และ Expire Date</li></ul><button className="sun-button" onClick={() => go("scan")}>เปิด QR Scanner <Icon name="arrow" size={18} /></button></div>
        <div className="qr-demo">
          <div className="qr-orbit qr-orbit-one" /><div className="qr-orbit qr-orbit-two" />
          <div className="phone-card">
            <Logo /><div className="mini-qr"><QrPattern /></div><Badge>VillaCheck VERIFIED</Badge><h3>Sea Sky Pool Villa</h3><p>ชลบุรี · VC-TH-2025-01842</p><div className="mini-status"><Icon name="shield" /><div><span>สถานะการตรวจสอบ</span><strong>ตรวจสอบข้อมูลแล้ว</strong></div></div>
          </div>
          <div className="scan-preview-card"><span>SCAN PREVIEW</span><strong>Identity match</strong><small>Official contact · Active</small></div>
        </div>
      </div>
    </section>

    <section className="section owner-section">
      <div className="container owner-grid">
        <div><span className="kicker">FOR VILLA MERCHANTS</span><h2>สร้างความน่าเชื่อถือ<br />ให้ที่พักของคุณ</h2><p>เปลี่ยนความมั่นใจให้เป็นโอกาสทางธุรกิจ ด้วย Trust Profile, QR Verification และข้อมูลเชิงลึกที่ช่วยให้ลูกค้าตัดสินใจง่ายขึ้น</p><button className="primary-button" onClick={() => go("pricing")}>ดูแพ็กเกจทั้งหมด <Icon name="arrow" size={18} /></button></div>
        <div className="feature-stack">
          <div><span><Icon name="shield" /></span><p><strong>Trust Profile</strong>โปรไฟล์ที่พักพร้อมสถานะตรวจสอบ</p></div>
          <div><span><Icon name="qr" /></span><p><strong>QR Verification</strong>QR เฉพาะสำหรับแชร์ให้ลูกค้าตรวจสอบ</p></div>
          <div><span><Icon name="chart" /></span><p><strong>Analytics</strong>ดูสถิติการเข้าชมและการสแกน</p></div>
        </div>
      </div>
    </section>

    <section className="section pricing-preview">
      <div className="container pricing-banner premium-pricing">
        <div className="pricing-number">05</div>
        <div><span className="kicker">TRUST INFRASTRUCTURE FOR MERCHANTS</span><h2>ทำให้ความน่าเชื่อถือ<br />มองเห็นและตรวจสอบได้</h2><p>เริ่มต้น Basic Trust QR ฟรี 3 เดือน พร้อม Trust Profile และ QR Verification</p></div>
        <div><small>START FROM</small><strong>ฟรี</strong><span>3 เดือน · ไม่มีค่าใช้จ่าย</span><button className="sun-button" onClick={() => go("pricing")}>สำรวจทุกแพ็กเกจ</button></div>
      </div>
    </section>
  </>;
}

function Directory({ go, initialQuery = "", initialProvince = "" }: { go: (p: Page, item?: string) => void; initialQuery?: string; initialProvince?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [province, setProvince] = useState(initialProvince);
  const [status, setStatus] = useState("");
  const [guests, setGuests] = useState("");
  const [sort, setSort] = useState("ล่าสุด");
  const [liveVillas,setLiveVillas]=useState<(typeof villas[number] & {qr:string;premiumBanner:boolean;createdAt:string})[]>([]);
  const [directoryError,setDirectoryError]=useState("");
  useEffect(()=>{let active=true;void api<{villas:{name:string;province:string;qr:string;qrStatus:string;photoUrl:string;updated:string;premiumBanner:boolean}[]}>("/public/villas").then(data=>{if(active)setLiveVillas(data.villas.map(v=>({...v,createdAt:v.updated,updated:new Date(v.updated).toLocaleDateString("th-TH",{day:"numeric",month:"short",year:"numeric",timeZone:"Asia/Bangkok"}),guests:"ไม่ระบุ",status:v.qrStatus === "ACTIVE" ? "ตรวจสอบข้อมูลแล้ว" : "หมดอายุ",image:v.photoUrl || "/villa-placeholder.svg"})));}).catch(e=>{if(active)setDirectoryError(e.message);});return()=>{active=false;};},[]);
  const filtered = [...liveVillas]
    .filter(v => v.name.toLowerCase().includes(query.toLowerCase()))
    .filter(v => !province || v.province === province)
    .filter(v => !status || v.status === status)
    .filter(v => !guests || (guests === "1–8 คน" ? Number.parseInt(v.guests) <= 8 : Number.parseInt(v.guests) >= 9))
    .sort((a, b) => sort === "A–Z" ? a.name.localeCompare(b.name) : Date.parse(b.createdAt)-Date.parse(a.createdAt));
  return <main className="page-bg">
    <div className="page-hero container"><span className="kicker">VILLA DIRECTORY</span><h1>ค้นหาวิลล่าที่ไว้ใจได้</h1><p>ตรวจสอบข้อมูลและสถานะของพูลวิลล่าทั่วไทย ก่อนตัดสินใจโอนเงิน</p></div>
    <div className="container filter-panel">
      <label className="wide"><span>ค้นหาชื่อวิลล่า</span><div><Icon name="search" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="เช่น Sea Sky Pool Villa" /></div></label>
      <label><span>จังหวัด</span><div><Icon name="pin" /><select value={province} onChange={event => setProvince(event.target.value)}><option value="">ทุกจังหวัด</option>{provinces.map(item => <option key={item}>{item}</option>)}</select></div></label>
      <label><span>จำนวนผู้พัก</span><div><Icon name="users" /><select value={guests} onChange={event => setGuests(event.target.value)}><option value="">ไม่จำกัด</option><option>1–8 คน</option><option>9–14 คน</option></select></div></label>
      <label><span>สถานะ</span><div><Icon name="shield" /><select value={status} onChange={event => setStatus(event.target.value)}><option value="">ทุกสถานะ</option><option>ตรวจสอบข้อมูลแล้ว</option><option>รอตรวจสอบ</option></select></div></label>
      <button className="primary-button" onClick={() => window.scrollTo({ top: 300, behavior: "smooth" })}><Icon name="search" size={18} />ค้นหา</button>
    </div>
    <section className="container directory-results">
      <div className="results-head"><div><h2>Villa ที่ผ่านการตรวจสอบ</h2><p>แสดง {filtered.length} รายการ</p>{directoryError&&<p role="alert">{directoryError}</p>}</div><select aria-label="เรียงลำดับ" value={sort} onChange={event => setSort(event.target.value)}><option value="ล่าสุด">อัปเดตล่าสุด</option><option>A–Z</option></select></div>
      {filtered.length ? <div className="villa-grid directory-grid">{filtered.map(v => <div key={v.qr}><VillaCard villa={v} onClick={() => go("verify", v.qr)} /></div>)}</div> : <div className="empty-results"><strong>ไม่พบ Villa ที่ตรงกับการค้นหา</strong><p>ลองเปลี่ยนคำค้นหาหรือจังหวัด</p><button className="outline-button" onClick={() => { setQuery(""); setProvince(""); setStatus(""); setGuests(""); }}>ล้างตัวกรอง</button></div>}
    </section>
  </main>;
}

function TrustRow({ label, children, icon }: { label: string; children: React.ReactNode; icon: IconName }) {
  return <div className="trust-info-row"><span><Icon name={icon} /></span><div><small>{label}</small><strong>{children}</strong></div></div>;
}

function QrPattern() {
  return <div className="qr-pattern" aria-label="ตัวอย่างคิวอาร์โค้ด">
    {Array.from({ length: 81 }, (_, i) => <i key={i} className={([0,1,2,9,11,15,17,18,19,20,23,25,27,28,31,32,35,37,39,40,41,43,44,47,49,52,54,55,57,59,61,63,64,67,69,71,72,73,75,77,79,80].includes(i)) ? "on" : ""} />)}
  </div>;
}

function VillaGallery() {
  const [active, setActive] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const touchStart = useRef(0);
  const show = (index: number) => setActive((index + photos.length) % photos.length);
  const onTouchStart = (event: React.TouchEvent) => { touchStart.current = event.touches[0].clientX; };
  const onTouchEnd = (event: React.TouchEvent) => {
    const distance = event.changedTouches[0].clientX - touchStart.current;
    if (Math.abs(distance) > 45) show(active + (distance < 0 ? 1 : -1));
  };
  useEffect(() => {
    if (!lightboxOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLightboxOpen(false);
      if (event.key === "ArrowLeft") show(active - 1);
      if (event.key === "ArrowRight") show(active + 1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [active, lightboxOpen]);

  return <>
    <div className="container gallery gallery-interactive">
      <div className="gallery-stage" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <button className="gallery-image-button" aria-label="เปิดภาพขนาดใหญ่" onClick={() => setLightboxOpen(true)}><img src={photos[active]} alt={`Sea Sky Pool Villa ภาพที่ ${active + 1}`} /></button>
        <button className="gallery-nav previous" aria-label="ภาพก่อนหน้า" onClick={() => show(active - 1)}>←</button><button className="gallery-nav next" aria-label="ภาพถัดไป" onClick={() => show(active + 1)}>→</button>
        <span className="gallery-count">{active + 1}/{photos.length}</span>
        <div className="gallery-dots">{photos.map((photo, index) => <button key={photo} aria-label={`ไปภาพที่ ${index + 1}`} className={active === index ? "active" : ""} onClick={() => show(index)} />)}</div>
      </div>
      <div className="gallery-thumbnails">{photos.slice(0, 2).map((photo, index) => <button key={photo} className={active === index ? "active" : ""} onClick={() => show(index)}><img src={photo} alt={`ภาพตัวอย่างที่ ${index + 1}`} /></button>)}<button className="gallery-all" onClick={() => setLightboxOpen(true)}><img src={photos[2]} alt="เปิดแกลเลอรีทั้งหมด" /><span>ดูทั้งหมด<br />{photos.length} รูป</span></button></div>
    </div>
    {lightboxOpen && <div className="gallery-lightbox" role="dialog" aria-modal="true" aria-label="แกลเลอรี Sea Sky Pool Villa" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <button className="lightbox-close" aria-label="ปิดแกลเลอรี" onClick={() => setLightboxOpen(false)}><Icon name="close" /></button>
      <button className="lightbox-nav previous" aria-label="ภาพก่อนหน้า" onClick={() => show(active - 1)}>←</button>
      <img src={photos[active]} alt={`Sea Sky Pool Villa ภาพขนาดใหญ่ที่ ${active + 1}`} />
      <button className="lightbox-nav next" aria-label="ภาพถัดไป" onClick={() => show(active + 1)}>→</button>
      <div className="lightbox-footer"><span>{active + 1}/{photos.length}</span><div>{photos.map((photo, index) => <button key={photo} aria-label={`ไปภาพที่ ${index + 1}`} className={active === index ? "active" : ""} onClick={() => show(index)} />)}</div></div>
    </div>}
  </>;
}

function Detail({ go, villa }: { go: (p: Page, item?: string) => void; villa: typeof villas[number] }) {
  if (villa.name !== villas[0].name) return <main className="page-bg"><div className="container page-hero"><button className="outline-button" onClick={() => go("directory")}>← กลับไปค้นหา Villa</button><h1>{villa.name}</h1><p>{villa.province} · {villa.guests}</p><img src={villa.image} alt={villa.name} style={{ width: "100%", maxHeight: 480, objectFit: "cover", borderRadius: 24 }} /><h2>{villa.status}</h2><p>อัปเดต {villa.updated} · ข้อมูลที่พักสาธิต</p><VillaMap name={villa.name} /><button className="outline-button" onClick={() => go("villa-report")}>แจ้งปัญหา</button></div></main>;
  return <main className="detail-page">
    <div className="container breadcrumbs"><button onClick={() => go("home")}>หน้าหลัก</button><span>/</span><button onClick={() => go("directory")}>ค้นหาวิลล่า</button><span>/</span><strong>Sea Sky Pool Villa</strong></div>
    <VillaGallery />
    <div className="container detail-grid">
      <div className="detail-main">
        <div className="title-block"><div><Badge>VillaCheck VERIFIED</Badge><h1>Sea Sky Pool Villa</h1><p><Icon name="pin" size={18} />บางแสน, ชลบุรี · รองรับสูงสุด 12 คน</p></div><span className="trust-score"><strong>98</strong><small>TRUST<br />SCORE</small></span></div>
        <div className="notice"><Icon name="shield" /><div><strong>Verified Property · ตรวจสอบข้อมูลแล้ว</strong><p>VillaCheck ตรวจสอบตัวตน ช่องทางติดต่อ และบัญชีรับเงินของเจ้าของที่พักเมื่อ 18 มิถุนายน 2568</p></div></div>
        <section className="verification-ledger" aria-labelledby="verification-heading"><div className="ledger-heading"><span className="kicker">VERIFICATION RECORD</span><h2 id="verification-heading">ข้อมูลที่ตรวจสอบ</h2><p>รายการตัวอย่างสำหรับเปรียบเทียบดีไซน์</p></div><div className="ledger-items">{[["01", "ตัวตนเจ้าของ", "เอกสารและชื่อผู้ดูแล"], ["02", "ช่องทางติดต่อ", "โทรศัพท์และ LINE ทางการ"], ["03", "บัญชีรับเงิน", "ชื่อผู้รับเงินตรงกับข้อมูล"]].map(([number, title, description]) => <div key={number}><span className="ledger-number">{number}</span><div><strong>{title}</strong><small>{description}</small></div><span className="ledger-check"><Icon name="check" size={16} />ตรวจแล้ว</span></div>)}</div></section>
        <section className="detail-section"><h2>เกี่ยวกับที่พัก</h2><p>พูลวิลล่าส่วนตัวบรรยากาศสงบ ใกล้หาดบางแสน เหมาะสำหรับครอบครัวและกลุ่มเพื่อน พร้อมสระว่ายน้ำระบบเกลือ พื้นที่ปิ้งย่าง และห้องนั่งเล่นกว้างขวาง</p></section>
        <section className="detail-section"><h2>สิ่งอำนวยความสะดวก</h2><div className="amenities">{[["pool","สระว่ายน้ำส่วนตัว"],["bed","4 ห้องนอน"],["wifi","Wi-Fi ฟรี"],["kitchen","ห้องครัว"],["car","ที่จอดรถ 4 คัน"],["home","พื้นที่ปิ้งย่าง"]].map(a => <span key={a[1]}><Icon name={a[0] as IconName} />{a[1]}</span>)}</div></section>
        <VillaMap name={villa.name} />
      </div>
      <aside className="trust-card">
        <div className="trust-card-head"><span><Icon name="shield" size={26} /></span><div><small>VILLACHECK VERIFIED</small><h3>ตรวจสอบข้อมูลแล้ว</h3></div></div>
        <div className="status-line"><span /><div><small>ตรวจสอบล่าสุด</small><strong>18 มิถุนายน 2568</strong></div></div>
        <div className="status-line future"><span /><div><small>ตรวจสอบครั้งถัดไป</small><strong>18 กันยายน 2568</strong></div></div>
        <hr />
        <h4>ช่องทางติดต่อทางการ</h4>
        <TrustRow label="โทรศัพท์" icon="phone">08X-XXX-4289</TrustRow>
        <TrustRow label="LINE Official" icon="mail">@seaskypoolvilla</TrustRow>
        <hr />
        <h4>บัญชีรับเงินที่ตรวจสอบข้อมูลแล้ว</h4>
        <div className="bank-box"><span className="bank-mark">K</span><div><small>ธนาคารกสิกรไทย</small><strong>XXX-X-X4289-X</strong><p>ชื่อบัญชี บจก. ซีสกาย วิลล่า</p></div><Icon name="check" /></div>
        <div className="secure-note"><Icon name="info" size={17} />ตรวจสอบชื่อบัญชีให้ตรงกันทุกครั้งก่อนโอน</div>
        <div className="qr-side"><QrPattern /><div><strong>สแกนเพื่อตรวจสอบ</strong><span>VC-TH-2025-01842</span></div></div>
        <button className="primary-button full" onClick={() => go("scan")}><Icon name="qr" size={18} />เปิดหน้าตรวจสอบ QR</button>
        <button className="outline-button full report-button" onClick={() => go("villa-report")}><Icon name="info" size={18} />Report Villa</button>
      </aside>
    </div>
  </main>;
}

function ScanQr({ go, onVerified }: { go: (p: Page, item?: string) => void; onVerified: (reference: string) => void }) {
  const [scanState, setScanState] = useState<"idle" | "requesting" | "scanning" | "loading" | "success" | "permission-error" | "not-found" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [scannedReference, setScannedReference] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const readerRef = useRef<BrowserQRCodeReader | null>(null);
  const cameraActive = scanState === "requesting" || scanState === "scanning";
  const busy = scanState === "requesting" || scanState === "loading" || scanState === "success";

  const stopCamera = () => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  };

  const getQrReader = async () => {
    if (!readerRef.current) {
      const { BrowserQRCodeReader: QrReader } = await import("@zxing/browser");
      readerRef.current = new QrReader();
    }
    return readerRef.current;
  };

  const completeScan = (reference: string, controls?: IScannerControls) => {
    controls?.stop();
    stopCamera();
    setScannedReference(reference || "VC-TH-2025-01842");
    setErrorMessage("");
    setScanState("success");
  };

  const startCamera = async () => {
    stopCamera();
    setErrorMessage("");
    setScanState("requesting");
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMessage("Browser นี้ไม่รองรับการเปิดกล้อง กรุณาอัปโหลดรูป QR แทน");
      setScanState("error");
      return;
    }
    try {
      const reader = await getQrReader();
      const controls = await reader.decodeFromConstraints(
        { audio: false, video: { facingMode: { ideal: "environment" } } },
        videoRef.current ?? undefined,
        (result, _error, activeControls) => {
          if (result) completeScan(result.getText(), activeControls);
        },
      );
      controlsRef.current = controls;
      setScanState("scanning");
      timeoutRef.current = window.setTimeout(() => {
        stopCamera();
        setErrorMessage("ไม่พบ QR Code กรุณาลองใหม่");
        setScanState("not-found");
      }, 15000);
    } catch (error) {
      const cameraError = error as DOMException;
      const permissionDenied = cameraError.name === "NotAllowedError" || cameraError.name === "PermissionDeniedError";
      setErrorMessage(permissionDenied ? "ไม่สามารถเข้าถึงกล้องได้ กรุณาอนุญาต Camera permission แล้วลองอีกครั้ง" : "เปิดกล้องไม่สำเร็จ กรุณาตรวจสอบว่ากล้องไม่ได้ถูกใช้งานโดยแอปอื่น");
      setScanState(permissionDenied ? "permission-error" : "error");
    }
  };

  const uploadQr = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    stopCamera();
    setErrorMessage("");
    setScanState("loading");
    const imageUrl = URL.createObjectURL(file);
    try {
      const reader = await getQrReader();
      const result = await reader.decodeFromImageUrl(imageUrl);
      completeScan(result.getText());
    } catch {
      setErrorMessage("ไม่พบ QR Code กรุณาลองใหม่");
      setScanState("not-found");
    } finally {
      URL.revokeObjectURL(imageUrl);
      event.target.value = "";
    }
  };

  const simulateScan = () => {
    stopCamera();
    setScanState("loading");
    window.setTimeout(() => completeScan("VC-TH-2025-01842"), 700);
  };

  useEffect(() => {
    if (scanState === "success") {
      const resultTimer = window.setTimeout(() => onVerified(scannedReference), 700);
      return () => window.clearTimeout(resultTimer);
    }
  }, [onVerified, scanState, scannedReference]);

  useEffect(() => () => stopCamera(), []);

  return <main className="scan-page">
    <div className="verify-top"><div className="container"><Logo light /><button onClick={() => { stopCamera(); go("home"); }}><Icon name="close" />ปิดหน้าสแกน</button></div></div>
    <div className="scan-bg">
      <div className="scan-intro">
        <span className="kicker light-kicker">SCAN QR CODE</span>
        <h1>สแกน QR เพื่อตรวจสอบที่พัก</h1>
        <p>สแกน QR ของ VillaCheck เพื่อดูข้อมูลการตรวจสอบก่อนตัดสินใจโอน</p>
      </div>
      <div className="scanner-card">
        <div className={`camera-scanner ${cameraActive ? "camera-active" : ""} ${busy ? "is-scanning" : ""} ${scanState === "success" ? "scan-success" : ""} ${errorMessage ? "scan-error" : ""}`}>
          <video ref={videoRef} className={cameraActive ? "camera-preview active" : "camera-preview"} muted playsInline />
          <div className="scanner-overlay">
            <div className="qr-frame"><span /><span /><span /><span />{!cameraActive && <Icon name={scanState === "loading" ? "search" : scanState === "success" ? "check" : "qr"} size={54} />}</div>
            <strong>{scanState === "requesting" ? "กำลังขอสิทธิ์เข้าถึงกล้อง..." : scanState === "scanning" ? "กำลังสแกน QR Code" : scanState === "loading" ? "กำลังตรวจสอบ QR Code..." : scanState === "success" ? "Scan Success" : errorMessage ? "ไม่สามารถอ่าน QR Code" : "Camera Scanner"}</strong>
            <p>{scanState === "success" ? "พบข้อมูล VillaCheck VERIFIED" : errorMessage || "วาง QR Code ให้อยู่ในกรอบ"}</p>
            {(scanState === "scanning" || scanState === "loading") && <span className="scan-line" />}
          </div>
        </div>
        {errorMessage && <div className="scanner-error"><Icon name="info" size={18} /><span>{errorMessage}</span><button onClick={startCamera}>ลองอีกครั้ง</button></div>}
        <div className="scanner-actions">
          <button className="primary-button" onClick={startCamera} disabled={busy}><Icon name="camera" size={18} />{cameraActive ? "กำลังเปิดกล้อง" : "เปิดกล้อง"}</button>
          <label className="outline-button upload-button"><Icon name="upload" size={18} />อัปโหลดรูป QR<input type="file" accept="image/*" onChange={uploadQr} disabled={busy} /></label>
        </div>
        <div className="prototype-scan">
          <span>สำหรับ Prototype</span>
          <button className="sun-button" onClick={simulateScan} disabled={busy}>{scanState === "loading" ? "กำลังสแกน..." : scanState === "success" ? "สแกนสำเร็จ" : "จำลองการสแกน QR"}</button>
        </div>
      </div>
      <p className="scan-security"><Icon name="shield" size={15} />VillaCheck ไม่มีบริการรับจองหรือรับชำระเงิน</p>
    </div>
  </main>;
}

function Verify({ go, reference }: { go: (p: Page, item?: string) => void; reference: string }) {
  const [status, setStatus] = useState<"verified" | "pending" | "expired">("verified");
  const meta = status === "verified"
    ? { label: "VillaCheck VERIFIED", title: "Verified Property", date: "18 กันยายน 2568" }
    : status === "pending"
      ? { label: "PENDING", title: "อยู่ระหว่างการตรวจสอบ", date: "—" }
      : { label: "EXPIRED", title: "สถานะหมดอายุ", date: "18 มิถุนายน 2568" };
  return <main className="verify-page">
    <div className="verify-top"><div className="container"><Logo light /><button onClick={() => go("home")}><Icon name="close" />ปิดหน้าตรวจสอบ</button></div></div>
    <div className="verify-bg">
      <div className="verify-intro"><span className="kicker light-kicker">QR VERIFICATION</span><h1>ผลการตรวจสอบที่พัก</h1><p>ข้อมูลจากระบบ VillaCheck ณ วันที่ 20 มิถุนายน 2568 เวลา 14:42 น.</p></div>
      <div className={`verification-card ${status}`}>
        <div className="verify-status">
          <span className="status-shield"><Icon name={status === "verified" ? "shield" : "clock"} size={40} /></span>
          <div className="verify-label">{meta.label}</div><h2>{meta.title}</h2>
          <p>{status === "verified" ? "ตรวจสอบข้อมูลที่พักและเจ้าของแล้วโดย VillaCheck" : "โปรดติดต่อที่พักและตรวจสอบข้อมูลเพิ่มเติมก่อนโอน"}</p>
        </div>
        <div className="verify-body">
          <div className="verified-villa"><img src={photos[0]} alt="Sea Sky Pool Villa" /><div><small>ชื่อที่พัก</small><h3>Sea Sky Pool Villa</h3><p><Icon name="pin" size={16} />บางแสน, ชลบุรี</p></div></div>
          <div className="verify-details">
            <TrustRow label="QR Reference" icon="qr">{reference}</TrustRow>
            <TrustRow label="Verification Status" icon="shield">ตรวจสอบข้อมูลแล้ว</TrustRow>
            <TrustRow label="Official Contact" icon="phone">08X-XXX-4289 · @seaskypoolvilla</TrustRow>
            <TrustRow label="บัญชีรับเงินแบบ Masked" icon="users">กสิกรไทย · XXX-X-X4289-X</TrustRow>
          </div>
          <div className="date-grid"><div><span>Last Checked</span><strong>18 มิถุนายน 2568</strong></div><div><span>Expire Date</span><strong>{meta.date}</strong></div></div>
          <div className="warning-note"><Icon name="info" /><p><strong>ก่อนโอนเงินทุกครั้ง</strong> ตรวจสอบชื่อบัญชีให้ตรงกับข้อมูลด้านบน VillaCheck ไม่มีบริการรับจองหรือรับชำระเงิน</p></div>
          <button className="outline-button full" onClick={() => go("detail")}>ดู Trust Profile <Icon name="arrow" size={18} /></button>
          <button className="text-button report-result-link" onClick={() => go("villa-report")}><Icon name="info" size={16} />พบข้อมูลผิดปกติ? แจ้งปัญหา</button>
        </div>
      </div>
      <div className="prototype-switch"><span>Prototype:</span>{(["verified","pending","expired"] as const).map(s => <button key={s} onClick={() => setStatus(s)} className={status === s ? "active" : ""}>{s}</button>)}</div>
    </div>
  </main>;
}

function Pricing({ onSelect, go }: { onSelect: (name: string) => void; go: (page: Page) => void }) {
  const {plans,error} = usePackages();
  return <main className="page-bg pricing-page">
    <div className="page-hero container"><span className="kicker">PRICING FOR MERCHANTS</span><h1>แพ็กเกจที่เติบโตไปพร้อมธุรกิจคุณ</h1><p>สมัครแพ็กเกจที่บัญชี Merchant แล้วเพิ่ม Villa ตามจำนวนสิทธิ์<br />1 Villa = 1 QR · ตรวจเอกสารโดย Admin ก่อนเปิดใช้งาน</p></div>
    {error && <p role="alert" className="container">{error}</p>}
    <div className="container premium-promo-wrap"><PremiumBanner onSelect={() => { const premium = plans.find(p => p.maximumVerificationLevel === "PREMIUM_VERIFIED"); if (premium) onSelect(premium.id); }} /></div>
    <div className="container plan-grid">
      {plans.map(plan => <article className={`plan-card ${plan.showPremiumBanner ? "recommended" : ""}`} key={plan.name}>
        {plan.showPremiumBanner && <div className="recommended-label">แนะนำสำหรับคุณ</div>}
        <div className="plan-head"><h2>{plan.name}</h2><p>{plan.description}</p><div><strong>{plan.amount ? `฿${(plan.amount / 100).toLocaleString("th-TH")}` : "ฟรี"}</strong><span>{plan.amount ? "/ เดือน" : `${plan.trialMonths} เดือน`}</span></div></div>
        <hr /><ul>{plan.features.map(f => <li key={f}><span><Icon name="check" size={14} /></span>{f}</li>)}</ul>
        <button className={plan.showPremiumBanner ? "primary-button full" : "outline-button full"} onClick={() => onSelect(plan.id)}>เลือกแพ็กเกจ</button>
      </article>)}
    </div>
    <div className="container no-payment"><Icon name="info" /><p><strong>ชำระค่าบริการแพ็กเกจหลังเอกสารผ่านการอนุมัติ</strong><br />ระบบส่งอีเมลแจ้งยอดและลิงก์ชำระเงิน จากนั้น Merchant แนบสลิปให้ Admin ตรวจสอบ</p></div>
    <section className="container compare-strip"><div><span className="kicker light-kicker">TRUST FIRST</span><h2>ไม่แน่ใจว่าแพ็กเกจไหนเหมาะกับคุณ?</h2><p>ทีมงานของเราพร้อมช่วยประเมินและแนะนำแพ็กเกจที่เหมาะกับธุรกิจ</p></div><button className="white-button" onClick={() => go("contact")}><Icon name="phone" size={18} />นัดคุยกับทีมงาน</button></section>
  </main>;
}

function Footer({ go }: { go: (p: Page, item?: string) => void }) {
  return <footer className="public-footer">
    <div className="container footer-grid">
      <div className="footer-brand">
        <button className="footer-logo" onClick={() => go("home")}><Logo light /></button>
        <p>แพลตฟอร์มตรวจสอบข้อมูลพูลวิลล่า ช่องทางติดต่อ และบัญชีรับเงิน เพื่อช่วยให้ทุกการตัดสินใจก่อนโอนมีข้อมูลที่ชัดเจนขึ้น</p>
        <div className="footer-social"><button aria-label="Facebook" onClick={() => go("social-facebook")}><Icon name="facebook" size={16} /></button><button aria-label="Instagram" onClick={() => go("social-instagram")}><Icon name="instagram" size={16} /></button><button aria-label="LINE Official" onClick={() => go("social-line")}><Icon name="message" size={16} /></button></div>
      </div>
      <div><strong>เกี่ยวกับ VillaCheck</strong><button onClick={() => go("about")}>เกี่ยวกับเรา</button><button onClick={() => go("verification-standard")}>มาตรฐานการตรวจสอบ</button><button onClick={() => go("articles")}>บทความและข่าวสาร</button><button onClick={() => go("login")}>เข้าสู่ระบบ</button></div>
      <div><strong>สำหรับผู้ใช้งาน</strong><button onClick={() => go("directory")}>ค้นหาที่พัก</button><button onClick={() => go("scan")}>ตรวจสอบ QR</button><button onClick={() => go("user-precheck")}>ตรวจสอบก่อนโอน</button><button onClick={() => go("villa-report")}>แจ้งปัญหา</button></div>
      <div><strong>สำหรับเจ้าของที่พัก</strong><button onClick={() => go("pricing")}>แพ็กเกจ</button><button onClick={() => go("owner-guide")}>สำหรับเจ้าของที่พัก</button><button onClick={() => go("owner-auth")}>ลงทะเบียนที่พัก</button><button onClick={() => go("login")}>เข้าสู่ระบบ</button></div>
      <div className="footer-support"><strong>ช่วยเหลือและติดต่อ</strong><button onClick={() => go("help")}>Help / Support</button><button onClick={() => go("contact")}>Contact</button><button onClick={() => openSupport("email")}><Icon name="mail" size={14} />อีเมลทีมงาน</button><button onClick={() => openSupport("phone")}><Icon name="phone" size={14} />โทรทีมงาน</button><small>จันทร์–ศุกร์ 09:00–18:00 น.</small></div>
    </div>
    <div className="container footer-bottom"><span>© 2025 VillaCheck. สงวนลิขสิทธิ์</span><div><button onClick={() => go("privacy")}>นโยบายความเป็นส่วนตัว</button><button onClick={() => go("terms")}>ข้อกำหนดและเงื่อนไข</button></div><span>Trust before transfer.</span></div>
  </footer>;
}

export default function App() {
  const [page, navigate, selectedItem] = usePageNavigation<Page>();
  const [selectedPackage, setSelectedPackage] = useState(() => sessionStorage.getItem(selectedPlanKey) || "Trust Starter");
  const [directorySearch, setDirectorySearch] = useState({ query: "", province: "" });
  const [qrReference, setQrReference] = useState("VC-TH-2025-01842");
  const [ownerLoggedIn, setOwnerLoggedIn] = useState(false);
  const [userLoggedIn, setUserLoggedIn] = useState(false);
  const [reportReference, setReportReference] = useState("RPT-1042");
  const [reportCounter, setReportCounter] = useState(1042);
  const [userReports, setUserReports] = useState<UserReport[]>([
    { reference: "RPT-1038", villa: "Sea Sky Pool Villa", type: "ช่องทางติดต่อไม่ตรง", guest: false },
  ]);
  const go = (next: Page, item?: string) => { if (next === "login") { setOwnerLoggedIn(false); setUserLoggedIn(false); } navigate(next, item); };
  const search = (query: string, province: string) => {
    setDirectorySearch({ query, province });
    go("directory");
  };
  const selectPackage = async (name: string) => {
    setSelectedPackage(name);
    sessionStorage.setItem(selectedPlanKey, name);
    sessionStorage.setItem(packageIntentKey, "true");
    try { const account = await currentAccount(); go(account.role === "merchant" ? "owner-add-villa" : "owner-auth"); }
    catch { go("owner-auth"); }
  };
  const showVerificationResult = (reference: string) => {
    let code = reference.trim();
    try { const url = new URL(code); code = new URLSearchParams(url.hash.slice(1)).get("item") || code; } catch { /* Raw QR reference. */ }
    setQrReference(code);
    go("verify", code);
  };
  const submitReport = (report: Omit<UserReport, "reference" | "guest">) => {
    const reference = `RPT-${reportCounter}`;
    setReportReference(reference);
    setReportCounter(current => current + 1);
    if (userLoggedIn) setUserReports(current => [{ ...report, reference, guest: false }, ...current]);
    go("villa-report-success");
  };
  const isOwnerPage = page.startsWith("owner-") && !["owner-auth", "owner-registration", "owner-information", "owner-onboarding-villa", "owner-select-villa"].includes(page);
  const isAdminPage = page.startsWith("admin-");
  const isUserPage = page.startsWith("user-");
  const isPublicInfoPage = ["about", "verification-standard", "articles", "article-detail", "owner-guide", "help", "contact", "privacy", "terms", "social-facebook", "social-instagram", "social-line", "gallery"].includes(page);
  const content =
    page === "home" ? <Home go={go} onSearch={search} /> :
    page === "directory" ? <Directory go={go} initialQuery={directorySearch.query} initialProvince={directorySearch.province} /> :
    page === "detail" ? <Detail go={go} villa={villas.find(v => v.name === selectedItem) || villas[0]} /> :
    page === "scan" ? <ScanQr go={go} onVerified={showVerificationResult} /> :
    page === "verify" ? <MerchantVerification go={go} reference={selectedItem || qrReference} /> :
    page === "pricing" ? <Pricing onSelect={selectPackage} go={go} /> :
    isPublicInfoPage ? <PublicInfoPage page={page} go={go} selectedArticle={selectedItem} /> :
    page === "villa-report" ? <PublicReportPage onSubmit={submitReport} /> :
    page === "villa-report-success" ? <PublicReportSuccess go={go} reference={reportReference} linkedToUser={userLoggedIn} /> :
    page === "user-registration" ? <UserRegistration go={go} reference={selectedItem} /> :
    ["admin-packages","admin-leads","admin-settings","admin-subscriptions"].includes(page) ? <AdminBusiness page={page} go={go} /> :
    page === "admin-users" ? <AdminUsers go={go} /> :
    page === "user-dashboard" ? <MemberDashboard go={go} /> :
    page === "login" ? <LoginPage reference={selectedItem} go={go} onAuthenticated={role => { if (role === "Merchant") setOwnerLoggedIn(true); if (role === "User") setUserLoggedIn(true); }} /> :
    page === "owner-auth" ? <OwnerPackageAuth go={go} packageName={selectedPackage} onOwnerLogin={() => setOwnerLoggedIn(true)} /> :
    page === "owner-information" || page === "owner-profile" ? <MerchantProfile page={page} go={go} /> :
    page === "owner-registration" ? <OwnerRegistration go={go} packageName={selectedPackage} /> :
    page === "owner-onboarding-villa" ? <Backoffice page={page} go={go} initialPackage={selectedPackage} /> :
    page === "owner-select-villa" ? <Backoffice page="owner-villas" go={go} /> :
    page === "package-confirmation" ? <Backoffice page="owner-package" go={go} /> :
    page === "package-request-pending" ? <Backoffice page="owner-package" go={go} /> :
    isOwnerPage ? <Backoffice page={page} go={go} initialPackage={selectedPackage} /> :
    isAdminPage ? <Backoffice page={page} go={go} initialPackage={selectedPackage} /> :
    <UserPages page={page} go={go} reports={userReports} selectedReference={selectedItem} />;
  const isStandalone = page === "scan" || page === "verify" || page === "login" || page === "owner-auth" || page === "owner-registration" || page === "owner-information" || page === "owner-onboarding-villa" || page === "owner-select-villa" || page === "package-confirmation" || page === "package-request-pending" || isOwnerPage || isAdminPage || isUserPage;
  const showPublicFooter = ["home", "directory", "detail", "pricing", "scan", "verify", "villa-report", "villa-report-success"].includes(page) || isPublicInfoPage;
  return <div className="app">{!isStandalone && <Header page={page} go={go} />}{content}{showPublicFooter && <Footer go={go} />}</div>;
}
