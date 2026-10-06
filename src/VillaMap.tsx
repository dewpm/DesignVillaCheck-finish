const dummyLocations: Record<string, { latitude: number; longitude: number; area: string }> = {
  "Sea Sky Pool Villa": { latitude: 13.285, longitude: 100.925, area: "บางแสน · ชลบุรี" },
  "Khao Yai Forest Pool": { latitude: 14.535, longitude: 101.395, area: "เขาใหญ่ · นครราชสีมา" },
  "Hua Hin Blue House": { latitude: 12.565, longitude: 99.955, area: "หัวหิน · ประจวบคีรีขันธ์" },
  "Phuket Ocean Residence": { latitude: 7.825, longitude: 98.305, area: "กะตะ · ภูเก็ต" },
  "Chiang Mai Garden Villa": { latitude: 18.795, longitude: 98.965, area: "เมืองเชียงใหม่ · เชียงใหม่" },
  "Krabi Cliff Pool Villa": { latitude: 8.045, longitude: 98.825, area: "อ่าวนาง · กระบี่" },
  "Samui Sunset Residence": { latitude: 9.535, longitude: 100.045, area: "เกาะสมุย · สุราษฎร์ธานี" },
};

export default function VillaMap({ name }: { name: string }) {
  const location = dummyLocations[name];
  if (!location) return null;
  const coordinates = `${location.latitude},${location.longitude}`;
  const embed = `https://maps.google.com/maps?${new URLSearchParams({ q: coordinates, z: "14", output: "embed" })}`;
  const mapsUrl = `https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query: coordinates })}`;
  const directions = `https://www.google.com/maps/dir/?${new URLSearchParams({ api: "1", destination: coordinates })}`;
  return <section className="detail-section villa-location-section">
    <div className="villa-map-heading"><div><h2>ตำแหน่งที่ตั้ง</h2><p>{name} · {location.area}</p></div><span>ตำแหน่งจำลอง</span></div>
    <iframe key={name} className="villa-google-map" title={`Google Maps ตำแหน่งจำลองของ ${name}`} src={embed} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
    <div className="villa-map-actions"><small>พิกัดตัวอย่างสำหรับแสดงผล ยังไม่ใช่ตำแหน่งจริงของที่พัก</small><div className="button-row"><a className="outline-button" href={mapsUrl} target="_blank" rel="noopener noreferrer">เปิด Google Maps ↗</a><a className="primary-button" href={directions} target="_blank" rel="noopener noreferrer">ดูเส้นทาง ↗</a></div></div>
  </section>;
}
