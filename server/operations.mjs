import {saveVillaPhoto} from './villa-photo.mjs'
import { randomUUID } from 'node:crypto'
import { trustDto } from './catalog.mjs'
import { audit } from './database.mjs'
const error=(status,message)=>{throw Object.assign(Error(message),{status})}
const clean=(value,label,max=200,required=true)=>{
 if(typeof value!=='string'||value.trim().length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)||(required&&!value.trim()))error(400,`ข้อมูล ${label} ไม่ถูกต้อง`)
 return value.trim()
}
const ref=prefix=>`${prefix}-${randomUUID()}`
export async function createReport(db,data,user){
 const name=clean(data.villa,'Villa'),type=clean(data.type,'ประเภท'),detail=clean(data.detail,'รายละเอียด',4000),reporter=clean(data.reporter||'','ผู้แจ้ง',200,false),contact=clean(data.contact||'','ติดต่อ',254,false)
 let villa
 if(data.qr) villa=await db.prepare('SELECT id,name FROM villas WHERE qr=?').get(clean(data.qr,'QR',100))
 else {const matches=await db.prepare('SELECT id,name FROM villas WHERE name=?').all(name);if(matches.length===1)villa=matches[0]}
 const id=randomUUID(),reference=ref('RPT'),now=new Date().toISOString()
 await db.prepare('INSERT INTO support_reports(id,reference,user_id,villa_id,villa_name,type,detail,reporter,contact,created,updated) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id,reference,user?.role==='user'?user.id:null,villa?.id||null,name,type,detail,reporter,contact,now,now)
 return {id,reference,linkedToUser:user?.role==='user'}
}
export async function recordEvent(db,qr,kind){
 if(!['PROFILE_VIEW','QR_SCAN','CONTACT_VIEW'].includes(kind))error(400,'ประเภทสถิติไม่ถูกต้อง')
 const villa=await db.prepare("SELECT * FROM villas WHERE qr=? AND status='approved'").get(clean(qr,'QR',100))
 if(!villa)error(404,'ไม่พบ Villa')
 await db.prepare('INSERT INTO villa_events VALUES (?,?,?,?)').run(randomUUID(),villa.id,kind,new Date().toISOString())
 return {ok:true}
}
export async function operations(db,user,req,path,url,readBody){
 if(!/^\/api\/(user\/checks|reports|merchant\/(analytics|reports|villas)|admin\/(checks|reports|merchants|qr))/.test(path))return undefined
 const admin=user.role==='admin',merchant=user.role==='merchant'
 if(path.startsWith('/api/admin/')&&!admin)error(403,'เฉพาะ Admin')
 if(path.startsWith('/api/merchant/')&&!merchant)error(403,'เฉพาะ Merchant')
 if(path.startsWith('/api/user/')&&user.role!=='user')error(403,'เฉพาะ User')
 const villaEdit=path.match(/^\/api\/merchant\/villas\/([a-f0-9-]+)$/)
 if(villaEdit&&['POST','PATCH'].includes(req.method)){
  const data=await readBody(req),villa=await db.prepare('SELECT * FROM villas WHERE id=? AND owner_id=?').get(villaEdit[1],user.id)
  if(!villa)error(404,'ไม่พบ Villa')
  const values=['name','province','merchant','phone','bankName','accountName','accountNumber'].map(k=>clean(data[k]||'',k,200,['name','province','merchant'].includes(k)))
  const photo=clean(data.photoUrl||'','photo',2000,false)
  if(photo&&!/^\/api\/public\/villa-photo\/[a-f0-9-]+$/.test(photo)&&!/^https:\/\//.test(photo)&&!/^\/demo\/villas\/villa-\d+\.jpg$/.test(photo))error(400,'Photo must be HTTPS')
  await db.transaction(async()=>{const storedPhoto=data.photo?await saveVillaPhoto(db,user.id,data.photo):photo;await db.prepare("UPDATE villas SET name=?,province=?,merchant=?,phone=?,bank_name=?,account_name=?,account_number=?,photo_url=?,status='pending',verification_level='REGISTERED',reason='Information changed; pending Admin review' WHERE id=?").run(...values,storedPhoto,villa.id);await audit(db,user,'villa.update',villa.id)})
  return {ok:true}
 }
 if(path==='/api/user/checks'&&req.method==='POST'){
  const data=await readBody(req),key=clean(data.requestKey,'request key',100)
  return db.transaction(async()=>{
   const existing=await db.prepare('SELECT * FROM user_checks WHERE user_id=? AND request_key=?').get(user.id,key);if(existing)return existing
   const qr=clean(data.qr||'','QR',100,false),name=clean(data.villa||'','Villa',200,!qr)
   let villa=qr?await db.prepare('SELECT * FROM villas WHERE qr=?').get(qr):null
   if(!qr){const matches=await db.prepare("SELECT * FROM villas WHERE name=? AND status='approved'").all(name);if(matches.length===1)villa=matches[0]}
   const account=clean(data.account||'','บัญชี',50,false),contact=clean(data.contact||'','ติดต่อ',200,false)
   const trust=villa?await trustDto(db,villa):null
   const normalize=v=>String(v||'').replace(/[\s-]/g,'')
   const matched=trust?.qrStatus==='ACTIVE'&&(!account||(villa.account_number&&normalize(account)===normalize(villa.account_number)))&&(!contact||(villa.phone&&normalize(contact)===normalize(villa.phone)))
   const status=matched?'MATCHED':'REVIEW_REQUIRED'
   const result=!villa?'ไม่พบที่พักที่ระบุในระบบ':trust.qrStatus!=='ACTIVE'?`QR ไม่พร้อมใช้งาน: ${trust.qrStatus}`:matched?'ข้อมูลตรงกับทะเบียน ณ เวลาตรวจสอบ ไม่ใช่การรับประกันการจอง':'บัญชีหรือช่องทางติดต่อไม่ตรง กรุณาตรวจสอบกับที่พักก่อนโอน'
   const id=randomUUID(),reference=ref('CHK'),created=new Date().toISOString()
   await db.prepare('INSERT INTO user_checks VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(id,reference,user.id,villa?.id||null,villa?.name||name,qr,status,result,account,contact,key,created)
   return await db.prepare('SELECT * FROM user_checks WHERE id=?').get(id)
  })
 }
 if(['/api/user/checks','/api/admin/checks'].includes(path)&&req.method==='GET'){
  return {checks:admin?await db.prepare('SELECT c.*,u.name AS user_name FROM user_checks c JOIN users u ON u.id=c.user_id ORDER BY c.created DESC LIMIT 500').all():await db.prepare('SELECT * FROM user_checks WHERE user_id=? ORDER BY created DESC LIMIT 500').all(user.id)}
 }
 if(['/api/reports','/api/merchant/reports','/api/admin/reports'].includes(path)&&req.method==='GET'){
  if(!admin&&!merchant&&user.role!=='user')error(403,'ไม่มีสิทธิ์')
  let rows=admin?await db.prepare('SELECT * FROM support_reports ORDER BY created DESC LIMIT 500').all():merchant?await db.prepare('SELECT r.* FROM support_reports r JOIN villas v ON v.id=r.villa_id WHERE v.owner_id=? ORDER BY r.created DESC LIMIT 500').all(user.id):await db.prepare('SELECT * FROM support_reports WHERE user_id=? ORDER BY created DESC LIMIT 500').all(user.id)
  rows=rows.map(r=>{if(admin)return r;const {admin_note,reporter,contact,user_id,...safe}=r;return safe})
  return {reports:rows}
 }
 const report=path.match(/^\/api\/admin\/reports\/([a-f0-9-]+)$/)
 if(report&&['POST','PATCH'].includes(req.method)){
  const data=await readBody(req);if(!['NEW','UNDER_REVIEW','RESOLVED','REJECTED'].includes(data.status))error(400,'สถานะไม่ถูกต้อง')
  const row=await db.prepare('SELECT id FROM support_reports WHERE id=?').get(report[1]);if(!row)error(404,'ไม่พบ Report')
  await db.transaction(async()=>{await db.prepare('UPDATE support_reports SET status=?,admin_note=?,public_note=?,updated=? WHERE id=?').run(data.status,clean(data.adminNote||'','บันทึกภายใน',4000,false),clean(data.publicNote||'','คำตอบผู้แจ้ง',4000,false),new Date().toISOString(),row.id);await audit(db,user,'report.'+data.status,row.id)})
  return {ok:true}
 }
 if(path==='/api/merchant/analytics'&&req.method==='GET'){
  const since=new Date(Date.now()-30*86400000).toISOString()
  const totals=await db.prepare('SELECT e.kind,count(*) AS total FROM villa_events e JOIN villas v ON v.id=e.villa_id WHERE v.owner_id=? AND e.created>=? GROUP BY e.kind').all(user.id,since)
  const daily=await db.prepare('SELECT substr(e.created,1,10) AS day,count(*) AS total FROM villa_events e JOIN villas v ON v.id=e.villa_id WHERE v.owner_id=? AND e.created>=? GROUP BY substr(e.created,1,10) ORDER BY day').all(user.id,since)
  return {totals,daily,since}
 }
 if(path==='/api/admin/merchants'&&req.method==='GET'){
  return {merchants:await db.prepare("SELECT u.id,u.name,u.email,u.business_name,u.phone,u.address,u.created,s.package_id,s.expires,s.lifecycle,(SELECT count(*) FROM villas v WHERE v.owner_id=u.id) AS villa_count FROM users u LEFT JOIN subscriptions s ON s.owner_id=u.id WHERE u.role='merchant' ORDER BY u.created DESC").all()}
 }
 if(path==='/api/admin/qr'&&req.method==='GET'){
  const villas=await db.prepare('SELECT * FROM villas ORDER BY created DESC').all();return {qrs:await Promise.all(villas.map(async v=>({id:v.id,name:v.name,merchant:v.merchant,qr:v.qr,expires:v.expires,...await trustDto(db,v)})))}
 }
 const qr=path.match(/^\/api\/admin\/qr\/([a-f0-9-]+)$/)
 if(qr&&['POST','PATCH'].includes(req.method)){
  const data=await readBody(req);if(!['SUSPENDED','INACTIVE','DEFAULT'].includes(data.status))error(400,'สถานะ QR ไม่ถูกต้อง')
  const v=await db.prepare('SELECT id FROM villas WHERE id=?').get(qr[1]);if(!v)error(404,'ไม่พบ Villa')
  await db.transaction(async()=>{await db.prepare('INSERT INTO system_settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('villa_qr:'+v.id,data.status);await audit(db,user,'qr.'+data.status,v.id)})
  return {ok:true}
 }
 return undefined
}
