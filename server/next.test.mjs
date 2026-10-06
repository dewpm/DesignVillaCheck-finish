import test from "node:test"
import assert from "node:assert/strict"
import {spawn} from "node:child_process"
import {createServer} from "node:http"
import {existsSync} from "node:fs"
import {openTestDatabase} from "./test-database.mjs"
test("Next production serves React and routes API through NestJS/Prisma",{skip:!process.env.TEST_DATABASE_URL || !existsSync('.next/BUILD_ID'),timeout:45000},async t=>{
 const db=await openTestDatabase();const reservation=createServer();await new Promise(r=>reservation.listen(0,"127.0.0.1",r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));
 const child=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--port",String(port),"--hostname","127.0.0.1"],{env:{...process.env,NODE_ENV:"production",DATABASE_URL:db.testConnectionString,APP_URL:"https://villacheck.test",ADMIN_EMAIL:"admin@next.test",ADMIN_PASSWORD:"AdminPassword123",NEXT_TELEMETRY_DISABLED:"1"},stdio:"ignore"});
 t.after(async()=>{if(child.exitCode===null){child.kill("SIGTERM");await new Promise(r=>child.once("exit",r));}await db.close()});
 const base=`http://127.0.0.1:${port}`;let ready=false;
 for(let n=0;n<60;n++){try{if((await fetch(base)).status===200){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}
 assert.ok(ready,"Next production started");assert.match(await (await fetch(base)).text(),/VillaCheck/);
 const image=await fetch(base+'/demo/villas/villa-1.jpg');assert.equal(image.status,200);assert.match(image.headers.get('content-type'),/image\/jpeg/);
 const health=await fetch(base+"/api/health");assert.equal(health.status,200);assert.deepEqual(await health.json(),{ok:true});
 const packages=await fetch(base+"/api/packages");assert.equal(packages.status,200);assert.equal((await packages.json()).packages.length,5);
 const r=await fetch(base+"/api/auth/register-user",{method:"POST",headers:{"Content-Type":"application/json",Origin:"https://villacheck.test"},body:JSON.stringify({name:"Customer",email:"customer@next.test",password:"CustomerPassword123"})});assert.equal(r.status,200);const session=await r.json();assert.equal(session.user.role,"user");const cookie=r.headers.get('set-cookie').split(';')[0];assert.match(r.headers.get('set-cookie'),/Secure/);
 const blocked=await fetch(base+"/api/admin/users",{headers:{Cookie:cookie}});assert.equal(blocked.status,403);
})
