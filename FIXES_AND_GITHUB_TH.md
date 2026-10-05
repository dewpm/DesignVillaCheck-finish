# VillaCheck V1 — แก้ navigation และ action

วันที่แก้: 4 ตุลาคม 2026

## จุดที่แก้

- แก้ปุ่มนัดคุยกับทีมงานใน Pricing ที่เรียก go โดยไม่ได้รับ prop
- แก้การเลือกแพ็กเกจของ Owner ที่ล็อกอินอยู่และการ Login ผ่านหน้าแพ็กเกจ ให้เลือก Villa ก่อนยืนยัน
- แก้การ์ด Villa ให้เปิดที่พักตามที่เลือก ไม่เปิด Sea Sky ทุกใบ
- แก้บทความและ Report Detail ให้ตรงกับรายการที่เลือก
- ออกจากระบบล้างสถานะ Owner/User

- เพิ่ม URL แบบ #page=... และ item สำหรับรายการที่เลือก รองรับ Back/Forward และการเปิดลิงก์หน้าสาธิตโดยตรง
- ปุ่มติดต่อไม่เปิดอีเมล .test/เบอร์สมมติหรือหน้า Facebook/Instagram ทั่วไป หากยังไม่ได้ตั้งค่าจะแสดงข้อความว่าไม่ได้เปิดช่องทางติดต่อในเว็บสาธิต

## วิธีนำขึ้น GitHub เดิม

1. แตก ZIP ของเวอร์ชันนี้
2. เปิดโฟลเดอร์ repo เดิมของเวอร์ชันเดียวกันใน VS Code
3. คัดลอกไฟล์ด้านในโฟลเดอร์ DesignVillaCheck1-main ทับใน root ของ repo เดิม (ตำแหน่งเดียวกับ package.json) รวมไฟล์ซ่อน เช่น .figma และ .env.example อย่าวางเป็นโฟลเดอร์ซ้อนอีกชั้น
4. เปิด Terminal ที่ root ของ repo แล้วรัน:

```bash
npm ci
npm run build
git add .
git commit -m "Fix VillaCheck navigation and actions"
git push origin main
```

ถ้าใช้ GitHub ผ่านหน้าเว็บ ให้ใช้ Add file → Upload files แล้วอัปโหลดไฟล์ที่เปลี่ยน พร้อมรักษาตำแหน่ง src/ และไฟล์ package/lock จากชุดนี้ อย่าอัปโหลดไฟล์ ZIP เป็น source และอย่าอัปโหลด node_modules หรือ dist

ถ้าใช้ pnpm กับ V1/V2 ให้ใช้ pnpm install และ pnpm build แทนคำสั่ง npm
ถ้า Vercel เชื่อมกับ repo และสาขา main นี้อยู่ การ push จะเริ่ม deployment ตามการตั้งค่าปัจจุบันของโปรเจกต์ ไม่ต้องสร้าง repo หรือโปรเจกต์ใหม่

## ช่องทางติดต่อจริง

เพิ่มค่าต่อไปนี้ใน Environment Variables ของ Vercel แล้ว redeploy (หรือใส่ใน .env.local เพื่อใช้บนเครื่อง):

```text
VITE_SUPPORT_EMAIL=อีเมลจริง
VITE_SUPPORT_PHONE=เบอร์จริง
VITE_FACEBOOK_URL=https://...หน้าธุรกิจจริง...
VITE_INSTAGRAM_URL=https://...หน้าธุรกิจจริง...
```

ค่าที่ขึ้นต้นด้วย VITE_ จะอยู่ในโค้ด frontend จึงให้ใส่เฉพาะข้อมูลติดต่อสาธารณะ ห้ามใส่รหัสผ่านหรือ secret

## ผลตรวจและขอบเขต

- ทั้ง 3 เวอร์ชันผ่าน TypeScript check และ production build บน Node 24
- ตรวจ render DOM จำลองผ่านทุก page state: V1 54 หน้า / V2 45 หน้า / V3 54 หน้า
- ตรวจ flow ที่แก้ผ่าน 14 assertions เช่นเลือก Villa, Back/Forward, Pricing → Contact, Owner login → Select Villa, V2 เปลี่ยนแพ็กเกจและเปิด QR
- ตรวจ JSX ไม่พบ button/Button ที่ไม่มี onClick หรือ submit และไม่พบ anchor placeholder ในไฟล์แอปที่ตรวจ
- ไม่ได้ทดสอบกล้องจริงหรือ visual layout ในเบราว์เซอร์จริง เนื่องจาก runtime ไม่มี Chromium และดาวน์โหลดไม่สำเร็จ การทดสอบ DOM ไม่ยืนยันการจัดวางบนมือถือ
- QR สาธิตที่รองรับยังเป็นรหัสใน source เดิม: V1/V3 VC-TH-2025-01842; V2 VC-PH-02481
- Login/Owner/Admin/Reports/Package requests เป็น prototype และ state ใน frontend ไม่มี backend หรือฐานข้อมูลจริง ข้อมูลฟอร์มหลายหน้าจะไม่คงอยู่หลัง refresh
- ที่พักอื่นใน V1/V3 แสดงข้อมูลจากการ์ดที่เลือก เช่นชื่อ จังหวัด รูป ผู้พักและสถานะ ไม่คัดลอกข้อมูลบัญชี/ผู้ติดต่อของ Sea Sky ไปใส่ที่พักอื่น
- ตัวเลข สถานะ Verified รูปภาพภายนอก และบทความเป็นข้อมูลสาธิต ไม่ใช่ข้อมูลตรวจสอบที่พักจริง
- URL รูปภาพภายนอกและบริการจริงยังไม่ได้ตรวจ HTTP แบบครบทุก URL; การแก้ชุดนี้ครอบคลุม navigation/action ใน source

ZIP นี้มี source และไฟล์ dependency lock พร้อมใช้งาน ไม่รวม node_modules, dist และไฟล์ลับ
