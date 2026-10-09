import {randomInt,randomUUID,randomBytes,createHmac,timingSafeEqual,createCipheriv,createDecipheriv,createHash} from 'node:crypto'
import {createUser} from './database.mjs'
const fail=(status,message)=>{throw Object.assign(Error(message),{status})}
export function otpChannels(config,transport){
 const enabled=typeof config.otpSecret==='string'&&config.otpSecret.length>=32
 return {email:Boolean(enabled&&(config.thaiBulkSmsEmailOtpTemplateId?config.thaiBulkSmsApiKey&&config.thaiBulkSmsApiSecret:transport&&config.smtpFrom)),sms:Boolean(enabled&&(config.thaiBulkSmsOtpKey||config.thaiBulkSmsOtpSecret?config.thaiBulkSmsOtpKey&&config.thaiBulkSmsOtpSecret:config.thaiBulkSmsApiKey&&config.thaiBulkSmsApiSecret&&config.thaiBulkSmsSender))}
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
const tokenKey=config=>createHash('sha256').update(config.otpSecret).digest()
function encryptToken(config,token){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',tokenKey(config),iv);const bytes=Buffer.concat([cipher.update(token,'utf8'),cipher.final()]);return 'tbs:'+Buffer.concat([iv,cipher.getAuthTag(),bytes]).toString('base64')}
function decryptToken(config,value){const bytes=Buffer.from(value.slice(4),'base64'),cipher=createDecipheriv('aes-256-gcm',tokenKey(config),bytes.subarray(0,12));cipher.setAuthTag(bytes.subarray(12,28));return Buffer.concat([cipher.update(bytes.subarray(28)),cipher.final()]).toString('utf8')}
async function providerOtp(config,fetchProvider,action,fields){
 const r=await fetchProvider('https://otp.thaibulksms.com/v2/otp/'+action,{method:'POST',headers:{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({key:config.thaiBulkSmsOtpKey,secret:config.thaiBulkSmsOtpSecret,...fields}).toString(),signal:AbortSignal.timeout(15000),redirect:'error'});
 const result=await r.json();return {ok:r.ok,status:r.status,result}
}
async function providerEmailOtp(config,fetchProvider,action,fields){
 const r=await fetchProvider('https://email-api.thaibulksms.com/email/v1/otp/'+action,{method:'POST',headers:{Authorization:'Basic '+Buffer.from(config.thaiBulkSmsApiKey+':'+config.thaiBulkSmsApiSecret).toString('base64'),Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify(fields),signal:AbortSignal.timeout(15000),redirect:'error'});
 return {ok:r.ok,status:r.status,result:await r.json()}
}
export function smsDiagnostic(config,status,result){
 const clean=v=>{let s=typeof v==='string'?v:typeof v==='object'&&v!==null?JSON.stringify(v):String(v??'');for(const secret of [config.thaiBulkSmsApiKey,config.thaiBulkSmsApiSecret,config.thaiBulkSmsOtpKey,config.thaiBulkSmsOtpSecret,config.otpSecret,Buffer.from((config.thaiBulkSmsApiKey||'')+':'+(config.thaiBulkSmsApiSecret||'')).toString('base64')])if(secret)s=s.split(secret).join('[redacted]');return s.replace(/\b\d{6,15}\b/g,'[redacted]').slice(0,400)}
 const code=clean(result?.code||result?.error?.code||result?.error_code||'')
 const message=clean(result?.message||result?.error?.message||result?.error||'')
 const names={'108':'ERROR_USER_TRIAL','116':'ERROR_INSUFFICIENT_CREDIT','110':'ERROR_SENDER','111':'ERROR_SENDER_NOT_FOUND'}
 const combined=(names[code]||code)+' '+message
 const category=/ERROR_USER_TRIAL|trial member/i.test(combined)?'ERROR_USER_TRIAL':/INSUFFICIENT_CREDIT|insufficient credit/i.test(combined)?'ERROR_INSUFFICIENT_CREDIT':status===401||/AUTHENTICATION|UNAUTHORIZED/i.test(combined)?'AUTHENTICATION_ERROR':/SENDER|API_KEY_SUSPENDED|IP_NOT_ALLOWED|MSISDN/i.test(combined)?'SENDER_OR_CONFIG_ERROR':status>=500?'PROVIDER_SERVER_ERROR':'PROVIDER_REJECTED'
 return {httpStatus:status,errorCode:code||null,errorName:names[code]||null,errorMessage:message||null,category,responseFields:result&&typeof result==='object'?Object.fromEntries(Object.entries(result).map(([key,value])=>[key,typeof value])):{},hasProviderToken:typeof result?.token==='string'&&Boolean(result.token),providerStatus:typeof result?.status==='string'?clean(result.status):null}
}
export async function probeSmsCredit(config,fetchProvider=fetch){
 const environment={apiKeyLoaded:Boolean(config.thaiBulkSmsApiKey),apiSecretLoaded:Boolean(config.thaiBulkSmsApiSecret),senderLoaded:Boolean(config.thaiBulkSmsSender),otpAppKeyLoaded:Boolean(config.thaiBulkSmsOtpKey),otpAppSecretLoaded:Boolean(config.thaiBulkSmsOtpSecret),emailTemplateLoaded:Boolean(config.thaiBulkSmsEmailOtpTemplateId),emailMode:config.thaiBulkSmsEmailOtpTemplateId?'otp-api':'smtp',smsMode:config.thaiBulkSmsOtpKey||config.thaiBulkSmsOtpSecret?'otp-api':'sms-api',otpSecretLoaded:Boolean(config.otpSecret&&config.otpSecret.length>=32)}
 if(!environment.apiKeyLoaded||!environment.apiSecretLoaded)return {environment,category:'CONFIG_MISSING'}
 try{const r=await fetchProvider('https://api-v2.thaibulksms.com/credit',{headers:{Authorization:'Basic '+Buffer.from(config.thaiBulkSmsApiKey+':'+config.thaiBulkSmsApiSecret).toString('base64'),Accept:'application/json'},signal:AbortSignal.timeout(15000),redirect:'error'});const result=await r.json();return {environment,...smsDiagnostic(config,r.status,result),authenticated:r.ok,category:r.ok?'OK':smsDiagnostic(config,r.status,result).category,remainingCredit:r.ok?result.remaining_credit:null}}
 catch{return {environment,category:'NETWORK_OR_INVALID_RESPONSE'}}
}
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
    if(channel==='email'&&config.thaiBulkSmsEmailOtpTemplateId){
     const response=await providerEmailOtp(config,fetchSms,'send',{template_uuid:config.thaiBulkSmsEmailOtpTemplateId,recipient_email:destination,payload:{}});
     if(!response.ok||!['success','waiting'].includes(response.result.status)||typeof response.result.token!=='string'||!response.result.token||response.result.token.length>4096)throw Object.assign(Error('Email OTP provider rejected request'),{diagnostic:smsDiagnostic(config,response.status,response.result)});
     await db.prepare('UPDATE login_otps SET code_hash=? WHERE id=?').run(encryptToken(config,response.result.token),id);
    }else if(channel==='email')await transport.sendMail({from:config.smtpFrom,to:destination,subject:'VillaCheck: รหัสเข้าสู่ระบบ',text:`รหัส OTP ของคุณคือ ${code} ใช้ได้ 5 นาที ห้ามให้รหัสนี้กับผู้อื่น`})
    else if(config.thaiBulkSmsOtpKey&&config.thaiBulkSmsOtpSecret){
     const response=await providerOtp(config,fetchSms,'request',{msisdn:destination.slice(1)});
     if(!response.ok||response.result.status!=='success'||typeof response.result.token!=='string'||!response.result.token||response.result.token.length>4096)throw Object.assign(Error('OTP provider rejected request'),{diagnostic:smsDiagnostic(config,response.status,response.result)});
     await db.prepare('UPDATE login_otps SET code_hash=? WHERE id=?').run(encryptToken(config,response.result.token),id);
    }else{
     const params=new URLSearchParams({msisdn:destination.slice(1),message:`VillaCheck OTP: ${code}. Expires in 5 minutes. Do not share.`,sender:config.thaiBulkSmsSender})
     const r=await fetchSms('https://api-v2.thaibulksms.com/sms',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(config.thaiBulkSmsApiKey+':'+config.thaiBulkSmsApiSecret).toString('base64'),Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'},body:params.toString(),signal:AbortSignal.timeout(15000),redirect:'error'})
     const result=await r.json()
     if(!r.ok)throw Object.assign(Error('sms delivery failed'),{diagnostic:smsDiagnostic(config,r.status,result)})
     const accepted=result.phone_number_list?.some(p=>typeof p.number==='string'&&p.number.replace(/^\+/,'')===destination.slice(1)&&typeof p.message_id==='string'&&p.message_id.length>0)
     if(!accepted)throw Object.assign(Error('sms recipient not accepted'),{diagnostic:smsDiagnostic(config,r.status,{...result,message:result.bad_phone_number_list?.[0]?.message||result.message||'Recipient not accepted'})})
    }
   }catch(error){
    await db.prepare('UPDATE login_otps SET consumed=1 WHERE id=?').run(id)
    const reason=channel==='email'?({EAUTH:'SMTP_AUTH_FAILED',ETIMEDOUT:'SMTP_TIMEOUT',ECONNECTION:'SMTP_CONNECTION_FAILED',ESOCKET:'SMTP_CONNECTION_FAILED',EENVELOPE:'SMTP_RECIPIENT_OR_SENDER_REJECTED'}[error.code]||'EMAIL_DELIVERY_FAILED'):'SMS_DELIVERY_FAILED'
    await db.prepare('INSERT INTO system_settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('otp_delivery_'+channel,JSON.stringify({ok:false,reason,...(error.diagnostic?error.diagnostic:channel==='sms'||config.thaiBulkSmsEmailOtpTemplateId?{category:'NETWORK_OR_INVALID_RESPONSE'}:{}),at:new Date().toISOString()}))
    fail(503,channel==='email'?'ส่งอีเมล OTP ไม่สำเร็จ กรุณาใช้ช่องทางอื่นหรือลองใหม่ภายหลัง':'ส่ง SMS OTP ไม่สำเร็จ กรุณาใช้ช่องทางอื่นหรือลองใหม่ภายหลัง')
   }
   await db.prepare('INSERT INTO system_settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('otp_delivery_'+channel,JSON.stringify({ok:true,at:new Date().toISOString()}))
   return {challengeId:id,expiresAt:new Date(now+300000).toISOString(),resendAfter:60}
  },
  async verify(data){
   if(typeof data.challengeId!=='string'||!/^[-a-f0-9]{36}$/.test(data.challengeId)||typeof data.code!=='string'||!/^\d{6}$/.test(data.code))fail(401,'OTP ไม่ถูกต้องหรือหมดอายุ')
   if(!config.otpSecret||config.otpSecret.length<32)fail(503,'OTP ยังไม่พร้อมใช้งาน')
   let verificationDiagnostic;
   const result=await db.transaction(async()=>{
    const row=await db.prepare('SELECT * FROM login_otps WHERE id=?').get(data.challengeId)
    if(!row||row.consumed||Number(row.expires)<=Date.now()||row.attempts>=5)return {invalid:true}
    let valid;
    if(row.code_hash.startsWith('tbs:')){
     if(row.channel==='email'){
      if(!config.thaiBulkSmsApiKey||!config.thaiBulkSmsApiSecret)fail(503,'ยังไม่ได้ตั้งค่าการยืนยัน Email OTP');
      let response;try{response=await providerEmailOtp(config,fetchSms,'verify',{token:decryptToken(config,row.code_hash),otp_code:data.code})}catch{fail(503,'เชื่อมต่อบริการยืนยัน OTP ไม่สำเร็จ กรุณาลองใหม่ภายหลัง')}
      if(response.status>=500||[401,402,403,429].includes(response.status))fail(503,'บริการยืนยัน OTP ไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง');
      verificationDiagnostic=smsDiagnostic(config,response.status,response.result);
      valid=response.ok&&['success','verified'].includes(response.result.status);
     }else{
     if(!config.thaiBulkSmsOtpKey||!config.thaiBulkSmsOtpSecret)fail(503,'ยังไม่ได้ตั้งค่าการยืนยัน SMS OTP');
     let response;try{response=await providerOtp(config,fetchSms,'verify',{token:decryptToken(config,row.code_hash),pin:data.code})}catch{fail(503,'เชื่อมต่อบริการยืนยัน OTP ไม่สำเร็จ กรุณาลองใหม่ภายหลัง')}
     if(response.status>=500||response.status===429||response.status===401||response.status===403)fail(503,'บริการยืนยัน OTP ไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง');
     valid=response.ok&&response.result.status==='success';
     }
    }else valid=timingSafeEqual(Buffer.from(row.code_hash,'hex'),Buffer.from(hash(config,row.id,data.code),'hex'))
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
   if(verificationDiagnostic)await db.prepare('INSERT INTO system_settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('otp_verification_email',JSON.stringify({...verificationDiagnostic,category:result.invalid?verificationDiagnostic.category:'OK',accepted:!result.invalid,at:new Date().toISOString()}));
   if(result.invalid)fail(401,'OTP ไม่ถูกต้องหรือหมดอายุ')
   return result.user
  }
 }
}
