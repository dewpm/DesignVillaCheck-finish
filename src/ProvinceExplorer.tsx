import { useState } from "react";

export const popularProvinces = ["ชลบุรี", "ประจวบคีรีขันธ์", "นครราชสีมา", "ภูเก็ต", "เชียงใหม่", "กระบี่", "สุราษฎร์ธานี", "ระยอง", "เพชรบุรี", "กรุงเทพมหานคร"];
export const googleMapsUrl = (province: string) => `https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query: `${province} ประเทศไทย` })}`;
function Pin() { return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></svg>; }

const pinPositions = [
  [28, 46], [27, 63], [72, 29], [30, 80], [28, 12],
  [71, 80], [72, 63], [73, 46], [27, 29], [70, 12],
];

export default function ProvinceExplorer({ onSearch }: { onSearch: (query: string, province: string) => void }) {
  const [selected, setSelected] = useState(popularProvinces[0]);
  const openProvince = (province: string) => {
    setSelected(province);
    onSearch("", province);
  };
  return (
    <section className="section province-section">
      <div className="container province-layout">
        <div className="province-copy">
          <span className="kicker">EXPLORE BY PROVINCE</span>
          <h2>เริ่มจากจุดหมาย<br />ที่คุณกำลังจะไป</h2>
          <p>เลือกจังหวัดหรือกดหมุดบนแผนที่ เพื่อดู Villa ในจังหวัดนั้น พร้อมตัวกรองที่พักทันที</p>
          <div className="province-chips">
            {popularProvinces.map(province => (
              <button key={province} className={province === selected ? "active" : ""} onClick={() => openProvince(province)}>
                <Pin />{province}
              </button>
            ))}
          </div>
          <a className="province-google-link" href={googleMapsUrl(selected)} target="_blank" rel="noopener noreferrer">
            ดู {selected} บน Google Maps ↗
          </a>
        </div>
        <div className="province-map province-map-destinations" role="group" aria-label="ปักหมุดจุดหมาย 10 จังหวัด คลิกเพื่อดู Villa">
          <div className="map-route route-one" aria-hidden="true" />
          <div className="map-route route-two" aria-hidden="true" />
          {popularProvinces.map((province, index) => (
            <button
              className={`map-pin province-destination-pin ${province === selected ? "selected" : ""}`}
              key={province}
              style={{ left: `${pinPositions[index][0]}%`, top: `${pinPositions[index][1]}%` }}
              onClick={() => openProvince(province)}
              aria-label={`ดู Villa ในจังหวัด${province}`}
            >
              <i aria-hidden="true" />
              <span>{province === "นครราชสีมา" ? "เขาใหญ่" : province}<small>ดู Villa ในจังหวัด →</small></span>
            </button>
          ))}
          <div className="map-index"><span>POPULAR DESTINATIONS</span><span>10 จังหวัด · คลิกเพื่อดู Villa</span></div>
        </div>
      </div>
    </section>
  );
}
