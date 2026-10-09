import {readFileSync} from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { openTestDatabase } from './test-database.mjs'
import { createApp } from './app.mjs'
import { createUser, hashPassword } from './database.mjs'
import { seedDemo } from './demo-seed.mjs'
import { getPlan } from './catalog.mjs'

test('persistent reports/checks, scoped analytics, QR controls and dummy payment review use real workflows',async t=>{
 const db=await openTestDatabase();await seedDemo(db,{password:'DummyPassword1234'});await createUser(db,'operations-admin@test.com','AdminPassword123','Admin','admin');await createUser(db,'other-user@test.com','UserPassword123','Other','user');await createUser(db,'other-merchant@test.com','MerchantPassword123','Other Merchant','merchant')
 const config={appUrl:'http://localhost:8443',allowedOrigins:['http://localhost:8443'],fakeHash:hashPassword('placeholder-password'),serverless:true};let sends=0
 const app=createApp(db,config,{sendMail:async()=>{sends++}});await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(async()=>{await app.runMail();await new Promise(r=>app.close(r));await db.close()});const base=`http://127.0.0.1:${app.address().port}`
 const request=async(path,data,session)=>{const r=await fetch(base+'/api'+path,{method:data?'POST':'GET',headers:{Origin:config.appUrl,'Content-Type':'application/json',...(session?{Cookie:session.cookie,'X-CSRF-Token':session.csrf}:{})},body:data?JSON.stringify(data):undefined});return {status:r.status,value:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]}}
 const login=async(email,password='DummyPassword1234')=>{const r=await request('/auth/login',{email,password});assert.equal(r.status,200);return{cookie:r.cookie,csrf:r.value.csrf}}
 const a=await login('operations-admin@test.com','AdminPassword123'),u=await login('demo-user@villacheck.example'),m=await login('demo-merchant@villacheck.example'),other=await login('other-user@test.com','UserPassword123'),outsider=await login('other-merchant@test.com','MerchantPassword123'),payer=await login('demo-payment@villacheck.example'),trial=await login('demo-trial@villacheck.example')
 const villa=await db.prepare("SELECT * FROM villas WHERE name='Sea Sky Demo Villa'").get()
 await t.test('reports persist, ownership scopes and internal notes remain private',async()=>{
  const r=await request('/public/reports',{villa:villa.name,qr:villa.qr,type:'QR issue',detail:'Real persisted test\nDetails.',reporter:'Private name',contact:'private@test.com'},u);assert.equal(r.status,200);assert.equal(r.value.linkedToUser,true)
  const list=await request('/reports',undefined,u);assert.ok(list.value.reports.some(x=>x.id===r.value.id));assert.equal((await request('/reports',undefined,other)).value.reports.length,0);assert.equal((await request('/merchant/reports',undefined,outsider)).value.reports.length,0)
  assert.equal((await request(`/admin/reports/${r.value.id}`,{status:'RESOLVED',adminNote:'Internal secret',publicNote:'Resolved safely'},u)).status,403)
  assert.equal((await request(`/admin/reports/${r.value.id}`,{status:'RESOLVED',adminNote:'Internal secret',publicNote:'Resolved safely'},a)).status,200)
  const resolved=(await request('/reports',undefined,u)).value.reports.find(x=>x.id===r.value.id);assert.equal(resolved.status,'RESOLVED');assert.equal(resolved.public_note,'Resolved safely');assert.equal(resolved.admin_note,undefined);assert.equal(resolved.contact,undefined);const tracking=await request('/public/reports/'+r.value.reference);assert.equal(tracking.value.status,'RESOLVED');assert.equal(tracking.value.contact,undefined);assert.equal(tracking.value.admin_note,undefined)
  const guest=await request('/public/reports',{villa:'Unknown Villa',type:'Report',detail:'Guest complaint'});assert.equal(guest.status,200);assert.equal(guest.value.linkedToUser,false)
 })
 await t.test('checks compare actual data, deduplicate retries, and survive new sessions',async()=>{
  const input={villa:villa.name,account:'0000000000',contact:'0800000000',requestKey:'same-request'}
  const first=await request('/user/checks',input,u);assert.equal(first.status,200);assert.equal(first.value.status,'MATCHED');assert.equal((await request('/user/checks',input,u)).value.id,first.value.id)
  const bad=await request('/user/checks',{...input,account:'9999999999',requestKey:'bad-account'},u);assert.equal(bad.value.status,'REVIEW_REQUIRED');assert.equal((await request('/user/checks',input,m)).status,403)
  assert.equal((await request('/user/checks',undefined,other)).value.checks.length,0);const newSession=await login('demo-user@villacheck.example');assert.ok((await request('/user/checks',undefined,newSession)).value.checks.some(x=>x.id===first.value.id));u.cookie=newSession.cookie;u.csrf=newSession.csrf
 })
 await t.test('analytics scope and QR suspension preserve identity and eligibility',async()=>{
  assert.equal((await request('/public/events',{qr:villa.qr,kind:'PROFILE_VIEW'})).status,200)
  assert.ok((await request('/merchant/analytics',undefined,m)).value.totals.some(x=>x.kind==='PROFILE_VIEW'&&x.total>0));assert.equal((await request('/merchant/analytics',undefined,outsider)).value.totals.length,0)
  assert.equal((await request(`/admin/qr/${villa.id}`,{status:'SUSPENDED'},m)).status,403)
  assert.equal((await request(`/admin/qr/${villa.id}`,{status:'SUSPENDED'},a)).status,200);const suspended=(await request('/public/qr/'+villa.qr)).value;assert.equal(suspended.qrStatus,'SUSPENDED');assert.equal(suspended.valid,false);assert.equal(suspended.premiumBanner,false)
  await request(`/admin/qr/${villa.id}`,{status:'DEFAULT'},a);assert.equal((await request('/public/qr/'+villa.qr)).value.qrStatus,'ACTIVE');assert.equal((await db.prepare('SELECT qr FROM villas WHERE id=?').get(villa.id)).qr,villa.qr)
 })
 await t.test('paid demo creates expiring QR, synthetic slip needs Admin and mail never sends',async()=>{
  const v=await db.prepare("SELECT * FROM villas WHERE name='Payment Workflow Demo Villa'").get();assert.equal((await request(`/villas/${v.id}/review`,{status:'approved',verificationLevel:'VERIFIED'},a)).status,200)
  let state=(await request('/state',undefined,payer)).value;const invoice=state.villas[0].invoices[0];assert.ok(invoice.paymentQr);assert.equal(invoice.paymentQr.kind,'DEMO_PAYMENT');assert.equal(state.villas[0].qr,'')
  const slip=await request(`/payments/${invoice.id}/demo-slip`,{},payer);assert.equal(slip.status,200);assert.match(slip.value.reference,/^DEMO-/);assert.match(Buffer.from(slip.value.document.data.split(',')[1],'base64').toString(),/NO REAL MONEY/)
  assert.equal((await request(`/payments/${invoice.id}/demo-slip`,{},m)).status,404)
  assert.equal((await request(`/invoices/${invoice.id}/proof`,slip.value,payer)).status,200);state=(await request('/state',undefined,payer)).value;assert.equal(state.villas[0].invoices[0].paymentStatus,'PENDING_REVIEW');assert.equal(state.villas[0].qr,'')
  assert.equal((await request(`/invoices/${invoice.id}/confirm`,{externalTransactionId:slip.value.reference},payer)).status,403)
  assert.equal((await request(`/invoices/${invoice.id}/confirm`,{externalTransactionId:slip.value.reference},a)).status,200);state=(await request('/state',undefined,payer)).value;assert.equal(state.subscription.status,'ACTIVE');assert.equal(state.villas[0].qrStatus,'ACTIVE')
  await app.runMail();assert.equal(sends,0);assert.equal((await db.prepare('SELECT status FROM mails WHERE invoice_id=?').get(invoice.id)).status,'demo')
  await request('/admin/settings',{paymentVerificationMode:'MANUAL',demoMode:false},a);assert.equal((await request(`/payments/${invoice.id}/demo-slip`,{},payer)).status,403);await request('/admin/settings',{paymentVerificationMode:'MANUAL',demoMode:true},a)
 })
 await t.test('browsing telemetry does not consume the sign-in rate limit',async()=>{
  for(let i=0;i<35;i++)assert.equal((await request('/public/events',{qr:villa.qr,kind:'PROFILE_VIEW'})).status,200)
  assert.equal((await request('/auth/login',{email:'other-user@test.com',password:'UserPassword123'})).status,200)
 })
 await t.test('Merchant photo uploads persist, remain separate from private documents, and validate ownership/type',async()=>{
  const image={name:'villa.jpg',type:'image/jpeg',data:'data:image/jpeg;base64,'+readFileSync('public/demo/villas/villa-1.jpg').toString('base64')};
  const input={name:villa.name,province:villa.province,merchant:villa.merchant,phone:villa.phone,bankName:villa.bank_name,accountName:villa.account_name,accountNumber:villa.account_number,photo:image};
  assert.equal((await request(`/merchant/villas/${villa.id}`,input,outsider)).status,404);
  assert.equal((await request(`/merchant/villas/${villa.id}`,{...input,photo:{...image,data:'data:image/jpeg;base64,aGVsbG8='}},m)).status,400);
  assert.equal((await request(`/merchant/villas/${villa.id}`,input,m)).status,200);
  const saved=await db.prepare('SELECT photo_url,qr FROM villas WHERE id=?').get(villa.id);assert.equal(saved.qr,villa.qr);
  const response=await fetch(base+saved.photo_url);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/jpeg');assert.deepEqual(Buffer.from(await response.arrayBuffer()),readFileSync('public/demo/villas/villa-1.jpg'));
  assert.equal((await fetch(base+'/api/public/villa-photo/'+villa.document_id)).status,404);
 })
 await t.test('Merchant edits require fresh document review but preserve QR identity',async()=>{
  assert.equal((await request(`/merchant/villas/${villa.id}`,{name:'Bad'},outsider)).status,404)
  assert.equal((await request(`/merchant/villas/${villa.id}`,{name:villa.name,province:villa.province,merchant:villa.merchant,phone:villa.phone,bankName:villa.bank_name,accountName:villa.account_name,accountNumber:villa.account_number,photoUrl:villa.photo_url},m)).status,200)
  const result=(await request('/public/qr/'+villa.qr)).value;assert.equal(result.valid,false);assert.equal(result.qrStatus,'PENDING');assert.equal(result.premiumBanner,false);assert.equal((await db.prepare('SELECT qr FROM villas WHERE id=?').get(villa.id)).qr,villa.qr);assert.equal((await request(`/villas/${villa.id}/review`,{status:'changes',reason:'Line one\nLine two'},a)).status,200)
 })
 await t.test('free trial bypasses invoice and quarterly catalog changes actually affect payment period',async()=>{
  const v=await db.prepare("SELECT * FROM villas WHERE name='Free Trial Demo Villa'").get();await request(`/villas/${v.id}/review`,{status:'approved',verificationLevel:'VERIFIED'},a);const state=(await request('/state',undefined,trial)).value;assert.equal(state.subscription.status,'ACTIVE');assert.equal(state.villas[0].invoices.length,0)
  const plan=await getPlan(db,'starter');assert.equal((await request('/admin/packages/starter',{...plan,billingCycle:'QUARTERLY'},a)).status,200);assert.equal((await request('/packages')).value.packages.find(p=>p.id==='starter').billingCycle,'QUARTERLY')
  const p=(await request('/state',undefined,payer)).value.villas[0];await request(`/villas/${p.id}/renew`,{},payer);const invoice=(await request('/state',undefined,payer)).value.villas[0].invoices.find(i=>i.status!=='paid');assert.equal(invoice.months,3)
 })
 await t.test('full capacity requires a paid upgrade and highest tier rejects further upgrade',async()=>{
  await request('/subscription',{packageId:'starter'},outsider);
  const input={name:'Upgrade Dummy Villa',province:'ชลบุรี',merchant:'Dummy Upgrade',email:'other-merchant@test.com',document:{name:'ownership.pdf',type:'application/pdf',data:'data:application/pdf;base64,'+Buffer.from('%PDF-1.4 dummy').toString('base64')}};
  assert.equal((await request('/villas',input,outsider)).status,201);
  assert.equal((await request('/villas',{...input,name:'Over capacity'},outsider)).status,409);
  let state=(await request('/state',undefined,outsider)).value;const v=state.villas[0];await request(`/villas/${v.id}/review`,{status:'approved'},a);
  const pay=async()=>{const invoice=(await request('/state',undefined,outsider)).value.villas[0].invoices.find(i=>i.status!=='paid');const slip=(await request(`/payments/${invoice.id}/demo-slip`,{},outsider)).value;assert.equal((await request(`/invoices/${invoice.id}/proof`,slip,outsider)).status,200);assert.equal((await request(`/invoices/${invoice.id}/confirm`,{},a)).status,200)};
  await pay();const qr=(await request('/state',undefined,outsider)).value.villas[0].qr;
  assert.equal((await request('/subscription/upgrade',{packageId:'pro'},outsider)).status,409);
  assert.equal((await request('/subscription/upgrade',{packageId:'plus'},outsider)).status,200);
  assert.equal((await request('/state',undefined,outsider)).value.subscription.capacity,1);
  assert.equal((await request('/villas',{...input,name:'Before upgrade payment'},outsider)).status,409);
  assert.equal((await request('/subscription/upgrade',{packageId:'premium'},outsider)).status,409);
  await pay();state=(await request('/state',undefined,outsider)).value;assert.equal(state.subscription.capacity,2);assert.equal(state.villas[0].qr,qr);
  assert.equal((await request('/villas',{...input,name:'After upgrade payment'},outsider)).status,201);
  assert.equal((await request('/subscription/upgrade',{packageId:'premium'},m)).status,409);
 })

})
