export default function PremiumBanner({compact=false}:{compact?:boolean}) {
 return <div className={`premium-merchant-banner ${compact?"compact":""}`}><span className="premium-banner-emblem" aria-hidden="true">✦</span><div><small>VILLACHECK · HIGHEST VERIFICATION</small><strong>Premium Verified Merchant</strong>{!compact&&<p>ผ่านการตรวจสอบระดับสูงสุดโดย VillaCheck · สถานะการรับรองยังใช้งานได้</p>}</div><span className="premium-banner-check" aria-hidden="true">✓</span></div>;
}
