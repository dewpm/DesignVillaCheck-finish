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
  await db.prepare("INSERT INTO system_settings(key,value) VALUES ('demo_mode','true') ON CONFLICT(key) DO NOTHING").run()
  const add=async(email,name,role,pw=password)=>await db.prepare('SELECT * FROM users WHERE email=?').get(email) || await createUser(db,email,pw,name,role)
  const merchant=await add('demo-merchant@villacheck.example','Merchant ตัวอย่าง','merchant')
  const regional=await add('demo-regional@villacheck.example','Merchant จุดหมายตัวอย่าง','merchant')
  const customer=await add('demo-user@villacheck.example','User ตัวอย่าง','user')
  if(adminEmail && adminPassword)await add(adminEmail,'Admin สำหรับทดสอบ','admin',adminPassword)
  const now=new Date().toISOString(),expires=addMonths(new Date(),3)
  await db.prepare("INSERT INTO subscriptions(owner_id,package_id,expires,payments,created,lifecycle) VALUES (?,'premium',?,1,?,'ACTIVE') ON CONFLICT(owner_id) DO NOTHING").run(merchant.id,expires,now)
  await db.prepare("INSERT INTO subscriptions(owner_id,package_id,expires,payments,created,lifecycle) VALUES (?,'premium',?,1,?,'ACTIVE') ON CONFLICT(owner_id) DO NOTHING").run(regional.id,expires,now)
  const samples=[['Sea Sky Demo Villa','ชลบุรี','approved'],['Chiang Mai Demo Villa','เชียงใหม่','approved'],['Phuket Demo Villa','ภูเก็ต','approved'],['Hua Hin Demo Villa','ประจวบคีรีขันธ์','pending'],['Krabi Demo Villa','กระบี่','changes'],['Expired Demo Villa','สุราษฎร์ธานี','approved'],['Krabi Cliff Demo Villa','กระบี่','approved'],['Khao Yai Forest Demo Villa','นครราชสีมา','approved'],['Rayong Ocean Demo Villa','ระยอง','approved'],['Phang Nga Lagoon Demo Villa','พังงา','approved'],['Cha Am Garden Demo Villa','เพชรบุรี','approved'],['Hua Hin Palm Demo Villa','ประจวบคีรีขันธ์','approved']]
  for(const [index,[name,province,status]]of samples.entries()){
   const owner=index>=6?regional:merchant
   const id=uuid(name),doc=uuid(`${name}-document`),expired=name.startsWith('Expired')
   await db.prepare("INSERT INTO documents(id,owner_id,name,mime,bytes) VALUES (?,?,?,?,?) ON CONFLICT(id) DO NOTHING").run(doc,owner.id,'dummy-ownership.pdf','application/pdf',dummyPdf())
   await db.prepare("INSERT INTO villas(id,owner_id,name,province,merchant,email,package_id,document_id,status,qr,expires,created,phone,bank_name,account_name,account_number,verification_level) VALUES (?,?,?,?,?,?,'premium',?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING")
    .run(id,owner.id,name,province,'ธุรกิจสาธิต — ไม่ใช่ที่พักจริง',owner.email,doc,status,status==='approved'?`VC-DEMO-${id}`:null,expired?'2000-01-01T00:00:00.000Z':status==='approved'?expires:null,now,'0800000000','ธนาคารตัวอย่าง — ห้ามโอนเงินจริง','บัญชีสาธิต','0000000000','VERIFIED')
   await db.prepare("UPDATE villas SET photo_url=? WHERE id=? AND (photo_url='' OR photo_url=?)").run(`/demo/villas/villa-${index>=6?index-2:index%3+1}.jpg`,id,`/demo/villas/villa-${index%3+1}.jpg`)
  }
  // Explicit simulated highest-level Admin results for two labelled demo records only.
  for(const name of ['Sea Sky Demo Villa','Khao Yai Forest Demo Villa'])await db.prepare("UPDATE villas SET verification_level='PREMIUM_VERIFIED' WHERE id=? AND status='approved' AND merchant='ธุรกิจสาธิต — ไม่ใช่ที่พักจริง' AND reviewed_by IS NULL").run(uuid(name))
  // An expired subscription must be separate: QR status follows the account subscription.
  const expired=await add('demo-expired@villacheck.example','Merchant หมดอายุ','merchant')
  await db.prepare("INSERT INTO subscriptions(owner_id,package_id,expires,payments,created,lifecycle) VALUES (?,'starter','2000-01-01T00:00:00.000Z',1,?,'ACTIVE') ON CONFLICT(owner_id) DO NOTHING").run(expired.id,now)
  await db.prepare('UPDATE villas SET owner_id=?,package_id=\'starter\' WHERE id=? AND owner_id=?').run(expired.id,uuid('Expired Demo Villa'),merchant.id)
  await db.prepare("UPDATE documents SET owner_id=? WHERE id=?").run(expired.id,uuid("Expired Demo Villa-document"))
  for(const [email,name,plan] of [['demo-payment@villacheck.example','Payment Workflow Demo Villa','starter'],['demo-trial@villacheck.example','Free Trial Demo Villa','basic']]){
   const owner=await add(email,name+' Merchant','merchant'),id=uuid(name),doc=uuid(name+'-document')
   await db.prepare("INSERT INTO subscriptions(owner_id,package_id,payments,created,lifecycle) VALUES (?,?,0,?,'PENDING_RENEWAL') ON CONFLICT(owner_id) DO NOTHING").run(owner.id,plan,now)
   await db.prepare("INSERT INTO documents(id,owner_id,name,mime,bytes) VALUES (?,?,?,?,?) ON CONFLICT(id) DO NOTHING").run(doc,owner.id,'dummy-ownership.pdf','application/pdf',dummyPdf())
   await db.prepare("INSERT INTO villas(id,owner_id,name,province,merchant,email,package_id,document_id,status,created,photo_url,phone,bank_name,account_name,account_number,verification_level) VALUES (?,?,?,'ชลบุรี',?,?,?,?, 'pending',?, '/demo/villas/villa-1.jpg','0800000000','DEMO BANK','DEMO ACCOUNT','0000000000','REGISTERED') ON CONFLICT(id) DO NOTHING").run(id,owner.id,name,'DEMO business - no real bookings',email,plan,doc,now)
  }
  const sampleId=uuid('Sea Sky Demo Villa')
  for(const [index,status] of ['NEW','UNDER_REVIEW','RESOLVED'].entries()){
   const id=uuid('report-'+index)
   await db.prepare('INSERT INTO support_reports(id,reference,user_id,villa_id,villa_name,type,detail,reporter,contact,status,public_note,created,updated) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').run(id,'RPT-DEMO-'+id,customer.id,sampleId,'Sea Sky Demo Villa','DEMO report','Dummy report for workflow testing; no real complaint.','Demo User',customer.email,status,status==='RESOLVED'?'Demo report resolved by test team.':'',now,now)
  }
  for(const [index,status]of ['MATCHED','REVIEW_REQUIRED'].entries()){
   const id=uuid('check-'+index)
   await db.prepare('INSERT INTO user_checks VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').run(id,'CHK-DEMO-'+id,customer.id,sampleId,'Sea Sky Demo Villa','VC-DEMO-'+sampleId,status,'Dummy check snapshot - not a guarantee of bookings.','0000000000','0800000000','demo-'+index,now)
  }
  for(let day=0;day<7;day++)for(const [index,kind]of ['PROFILE_VIEW','QR_SCAN','CONTACT_VIEW'].entries()){
   const stamp=new Date(Date.now()-day*86400000).toISOString(),id=uuid('event-'+stamp.slice(0,10)+'-'+index)
   await db.prepare('INSERT INTO villa_events VALUES (?,?,?,?) ON CONFLICT(id) DO NOTHING').run(id,sampleId,kind,stamp)
  }
  return {merchant:'demo-merchant@villacheck.example',user:'demo-user@villacheck.example',villas:samples.length+2,workflowMerchants:["demo-payment@villacheck.example","demo-trial@villacheck.example"]}
 })
}
