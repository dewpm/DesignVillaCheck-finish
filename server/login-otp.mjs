import {randomInt,randomUUID,randomBytes,createHmac,timingSafeEqual} from 'node:crypto'
import {createUser} from './database.mjs'
const fail=(status,message)=>{throw Object.assign(Error(message),{status})}
export function otpChannels(config,transport){
 const enabled=typeof config.otpSecret==='string'&&config.otpSecret.length>=32
 return {email:Boolean(enabled&&transport&&config.smtpFrom),sms:Boolean(enabled&&config.thaiBulkSmsApiKey&&config.thaiBulkSmsApiSecret&&config.thaiBulkSmsSender)}
}
export function otpDestination(channel,value){
 if(typeof value!=='string'||value.length>254)fail(400,'อีเมลหรือเบอร์โทรไม่ถูกต้อง')
 if(channel==='email'){const v=value.trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))fail(400,'อีเมลไม่ถูกต้อง');return v}
 if(channel!=='sms')fail(400,'ช่องทาง OTP ไม่ถูกต้อง')
 let v=value.replace(/[ ()-]/g,'');if(/^0[689]\d{8}$/.test(v))v='+66'+v.slice(1)
 if(!/^\+[1-9]\d{7,14}$/.test(v))fail(400,'เบอร์โทรไม่ถูกต้อง เช่น 0812345678 หรือ +66812345678')
 return v
}
const hash=(config,id,code)=>createHmac('sha256',config.otpSecret).update(id+':'+code).digest('hex')
export function createLoginOtp(db,config,transport,fetchSms=fetch){
 return {
  async request(data){
   const channel=data.channel,destination=otpDestination(channel,data.destination)
   if(!otpChannels(config,transport)[channel])fail(503,channel==='email'?'ยังไม่ได้ตั้งค่าการส่ง OTP ทางอีเมล':'ยังไม่ได้ตั้งค่าการส่ง OTP ทาง SMS')
   const id=randomUUID(),code=String(randomInt(0,1000000)).padStart(6,'0'),now=Date.now()
   await db.transaction(async()=>{
    await db.prepare('DELETE FROM login_otps WHERE created<?').run(now-86400000)
    const last=await db.prepare('SELECT created FROM login_otps WHERE destination=? ORDER BY created DESC LIMIT 1').get(destination)
    if(last&&now-Number(last.created)<60000)fail(429,'กรุณารอ 60 วินาทีก่อนขอ OTP ใหม่')
    const count=await db.prepare('SELECT count(*) AS n FROM login_otps WHERE destination=? AND created>?').get(destination,now-3600000)
    if(Number(count.n)>=5)fail(429,'ขอ OTP ครบจำนวนที่อนุญาต กรุณาลองอีกครั้งภายหลัง')
    await db.prepare('UPDATE login_otps SET consumed=1 WHERE destination=? AND consumed=0').run(destination)
    await db.prepare('INSERT INTO login_otps(id,channel,destination,code_hash,expires,created) VALUES (?,?,?,?,?,?)').run(id,channel,destination,hash(config,id,code),now+300000,now)
   })
   try{
    if(channel==='email')await transport.sendMail({from:config.smtpFrom,to:destination,subject:'VillaCheck: รหัสเข้าสู่ระบบ',text:`รหัส OTP ของคุณคือ ${code} ใช้ได้ 5 นาที ห้ามให้รหัสนี้กับผู้อื่น`})
    else{
     const params=new URLSearchParams({msisdn:destination.slice(1),message:`VillaCheck OTP: ${code}. Expires in 5 minutes. Do not share.`,sender:config.thaiBulkSmsSender})
     const r=await fetchSms('https://api-v2.thaibulksms.com/sms',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(config.thaiBulkSmsApiKey+':'+config.thaiBulkSmsApiSecret).toString('base64'),Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'},body:params.toString(),signal:AbortSignal.timeout(15000),redirect:'error'})
     if(!r.ok)throw Error('sms delivery failed')
     const result=await r.json()
     const accepted=result.phone_number_list?.some(p=>typeof p.number==='string'&&p.number.replace(/^\+/,'')===destination.slice(1)&&typeof p.message_id==='string'&&p.message_id.length>0)
     if(!accepted)throw Error('sms recipient not accepted')
    }
   }catch{await db.prepare('UPDATE login_otps SET consumed=1 WHERE id=?').run(id);fail(503,'ส่ง OTP ไม่สำเร็จ กรุณาลองใหม่ภายหลัง')}
   return {challengeId:id,expiresAt:new Date(now+300000).toISOString(),resendAfter:60}
  },
  async verify(data){
   if(typeof data.challengeId!=='string'||!/^[-a-f0-9]{36}$/.test(data.challengeId)||typeof data.code!=='string'||!/^\d{6}$/.test(data.code))fail(401,'OTP ไม่ถูกต้องหรือหมดอายุ')
   if(!config.otpSecret||config.otpSecret.length<32)fail(503,'OTP ยังไม่พร้อมใช้งาน')
   const result=await db.transaction(async()=>{
    const row=await db.prepare('SELECT * FROM login_otps WHERE id=?').get(data.challengeId)
    if(!row||row.consumed||Number(row.expires)<=Date.now()||row.attempts>=5)return {invalid:true}
    const valid=timingSafeEqual(Buffer.from(row.code_hash,'hex'),Buffer.from(hash(config,row.id,data.code),'hex'))
    if(!valid){await db.prepare('UPDATE login_otps SET attempts=attempts+1 WHERE id=?').run(row.id);return {invalid:true}}
    await db.prepare('UPDATE login_otps SET consumed=1 WHERE id=?').run(row.id)
    if(row.channel==='email'){
     const existing=await db.prepare('SELECT * FROM users WHERE email=?').get(row.destination)
     return {user:existing||await createUser(db,row.destination,randomBytes(48).toString('hex'),row.destination.split('@')[0],'user')}
    }
    // Never treat an unverified contact phone on a Merchant/Admin profile as a login identity.
    let user=await db.prepare("SELECT u.* FROM oauth_identities o JOIN users u ON u.id=o.user_id WHERE o.provider='phone_otp' AND o.subject=?").get(row.destination)
    if(!user){user=await createUser(db,`${randomUUID()}@phone.villacheck.invalid`,randomBytes(48).toString('hex'),'สมาชิก VillaCheck','user');await db.prepare('UPDATE users SET phone=? WHERE id=?').run(row.destination,user.id);await db.prepare('INSERT INTO oauth_identities VALUES (?,?,?)').run('phone_otp',row.destination,user.id)}
    return {user}
   })
   if(result.invalid)fail(401,'OTP ไม่ถูกต้องหรือหมดอายุ')
   return result.user
  }
 }
}
