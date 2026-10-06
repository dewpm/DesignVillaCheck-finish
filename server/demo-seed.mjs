import {createHash,randomUUID} from "node:crypto"
import {createUser,addMonths} from "./database.mjs"
import {seedCatalog} from "./catalog.mjs"
const uuid=(name)=>{const h=createHash('sha256').update(`villacheck-demo:${name}`).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`}
function dummyPdf(){
 const content='BT /F1 14 Tf 40 150 Td (VillaCheck dummy document - NOT legal evidence) Tj ET';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 500 220] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',`<< /Length ${content.length} >>\nstream\n${content}\nendstream`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
 let data='%PDF-1.4\n';const offsets=[0];for(const [i,object]of objects.entries()){offsets.push(Buffer.byteLength(data));data+=`${i+1} 0 obj\n${object}\nendobj\n`;}
 const xref=Buffer.byteLength(data);data+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(x=>String(x).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
 return Buffer.from(data);
}
export async function seedDemo(db,{password,adminEmail,adminPassword}={}){
 if(!password || password.length<12)throw Error('DEMO_PASSWORD must have at least 12 characters')
 return db.transaction(async()=>{
  await seedCatalog(db)
  const add=async(email,name,role,pw=password)=>await db.prepare('SELECT * FROM users WHERE email=?').get(email) || await createUser(db,email,pw,name,role)
  const merchant=await add('demo-merchant@villacheck.example','Merchant ตัวอย่าง','merchant')
  const customer=await add('demo-user@villacheck.example','User ตัวอย่าง','user')
  if(adminEmail && adminPassword)await add(adminEmail,'Admin สำหรับทดสอบ','admin',adminPassword)
  const now=new Date().toISOString(),expires=addMonths(new Date(),3)
  await db.prepare("INSERT INTO subscriptions(owner_id,package_id,expires,payments,created,lifecycle) VALUES (?,'premium',?,1,?,'ACTIVE') ON CONFLICT(owner_id) DO NOTHING").run(merchant.id,expires,now)
  const samples=[['Sea Sky Demo Villa','ชลบุรี','approved'],['Chiang Mai Demo Villa','เชียงใหม่','approved'],['Phuket Demo Villa','ภูเก็ต','approved'],['Hua Hin Demo Villa','ประจวบคีรีขันธ์','pending'],['Krabi Demo Villa','กระบี่','changes'],['Expired Demo Villa','สุราษฎร์ธานี','approved']]
  for(const [index,[name,province,status]]of samples.entries()){
   const id=uuid(name),doc=uuid(`${name}-document`),expired=name.startsWith('Expired')
   await db.prepare("INSERT INTO documents(id,owner_id,name,mime,bytes) VALUES (?,?,?,?,?) ON CONFLICT(id) DO NOTHING").run(doc,merchant.id,'dummy-ownership.pdf','application/pdf',dummyPdf())
   await db.prepare("INSERT INTO villas(id,owner_id,name,province,merchant,email,package_id,document_id,status,qr,expires,created,phone,bank_name,account_name,account_number,verification_level) VALUES (?,?,?,?,?,?,'premium',?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING")
    .run(id,merchant.id,name,province,'ธุรกิจสาธิต — ไม่ใช่ที่พักจริง','demo-merchant@villacheck.example',doc,status,status==='approved'?`VC-DEMO-${id}`:null,expired?'2000-01-01T00:00:00.000Z':status==='approved'?expires:null,now,'0800000000','ธนาคารตัวอย่าง — ห้ามโอนเงินจริง','บัญชีสาธิต','0000000000','VERIFIED')
   await db.prepare("UPDATE villas SET photo_url=? WHERE id=? AND photo_url=''").run(`/demo/villas/villa-${index%3+1}.jpg`,id)
  }
  // An expired subscription must be separate: QR status follows the account subscription.
  const expired=await add('demo-expired@villacheck.example','Merchant หมดอายุ','merchant')
  await db.prepare("INSERT INTO subscriptions(owner_id,package_id,expires,payments,created,lifecycle) VALUES (?,'starter','2000-01-01T00:00:00.000Z',1,?,'ACTIVE') ON CONFLICT(owner_id) DO NOTHING").run(expired.id,now)
  await db.prepare('UPDATE villas SET owner_id=?,package_id=\'starter\' WHERE id=? AND owner_id=?').run(expired.id,uuid('Expired Demo Villa'),merchant.id)
  await db.prepare("UPDATE documents SET owner_id=? WHERE id=?").run(expired.id,uuid("Expired Demo Villa-document"))
  return {merchant:'demo-merchant@villacheck.example',user:'demo-user@villacheck.example',villas:samples.length}
 })
}
