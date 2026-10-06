import test from "node:test"
import assert from "node:assert/strict"
import {openTestDatabase} from "./test-database.mjs"
test("NestJS HTTP API uses Prisma, preserves guards, cookies, payment and Villa QR",{skip:!process.env.TEST_DATABASE_URL},async t=>{
 const fixture=await openTestDatabase();const saved={...process.env};
 process.env.DATABASE_URL=fixture.testConnectionString;process.env.APP_URL="http://localhost:8443";process.env.NODE_ENV="test";process.env.ADMIN_EMAIL="admin@nest.test";process.env.ADMIN_PASSWORD="AdminPassword123";
 const {createBackend}=await import("../.build/backend/bootstrap.js");const {app}=await createBackend();await app.listen(0,"127.0.0.1");
 t.after(async()=>{await app.close();await fixture.close();for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved)});
 const base=await app.getUrl();
 const request=async(path,data,session,method)=>{const r=await fetch(base+path,{method:method||(data?"POST":"GET"),headers:{"Content-Type":"application/json",Origin:process.env.APP_URL,...session?{Cookie:session.cookie,"X-CSRF-Token":session.csrf}:{}},body:data?JSON.stringify(data):undefined});const value=await r.json();return{status:r.status,value,cookie:r.headers.get("set-cookie")?.split(";")[0]}};
 assert.equal((await request("/api/health")).status,200);
 assert.equal((await request("/api/packages")).value.packages.length,5);
 const registration=await request("/api/auth/register",{name:"Merchant",email:"merchant@nest.test",password:"MerchantPassword123"});assert.equal(registration.status,200);const merchant={cookie:registration.cookie,csrf:registration.value.csrf};
 assert.equal((await request("/api/admin/packages",undefined,merchant)).status,403);
 const login=await request("/api/auth/login",{email:"admin@nest.test",password:"AdminPassword123"});const admin={cookie:login.cookie,csrf:login.value.csrf};
 assert.equal((await request("/api/admin/packages",undefined,admin)).status,200);
 assert.equal((await request("/api/subscription",{packageId:"starter"},merchant)).status,200);
 const document={name:"ownership.pdf",type:"application/pdf",data:`data:application/pdf;base64,${Buffer.from("%PDF-test").toString("base64")}`};
 const created=await request("/api/villas",{name:"Nest Villa",province:"ชลบุรี",merchant:"Merchant",email:"merchant@nest.test",document},merchant);assert.equal(created.status,201);const id=created.value.createdId;
 assert.equal((await request(`/api/villas/${id}/review`,{status:"approved"},admin)).status,200);
 let state=(await request("/api/state",undefined,merchant)).value;const payment=state.villas[0].invoices[0];assert.equal(payment.paymentQr.status,"ACTIVE");
 assert.equal((await request(`/api/payments/${payment.id}/slip`,{document,reference:"NEST-BANK-1"},merchant)).status,200);
 assert.equal((await request(`/api/admin/payments/${payment.id}/approve`,{},admin,"PATCH")).status,200);
 state=(await request("/api/state",undefined,merchant)).value;assert.equal(state.subscription.active,true);assert.ok(state.villas[0].qr);
 const guest=await request(`/api/public/qr/${state.villas[0].qr}`);assert.equal(guest.value.locked,true);assert.equal(guest.value.qrStatus,"ACTIVE");
 assert.equal((await request("/api/auth/logout",{},merchant)).status,200);
})
