import test from 'node:test'
import assert from 'node:assert/strict'
import {openTestDatabase} from './test-database.mjs'
import {createUser} from './database.mjs'
import {startServer} from './index.mjs'

test('existing Admin cold start and empty demo outbox remain responsive during another write transaction',{skip:!process.env.TEST_DATABASE_URL,timeout:10000},async()=>{
 const db=await openTestDatabase();await createUser(db,'startup-admin@test.com','StartupAdminPassword123','Admin','admin');await db.prepare("INSERT INTO system_settings(key,value) VALUES ('demo_mode','true')").run()
 let release,ready;const started=new Promise(r=>{ready=r});const hold=new Promise(r=>{release=r});const locked=db.transaction(async()=>{ready();await hold});await started
 let timer,runtime;const boot=startServer({NODE_ENV:'test',APP_URL:'http://localhost:8443',ADMIN_EMAIL:'startup-admin@test.com',ADMIN_PASSWORD:'StartupAdminPassword123'},{listen:false,databaseFactory:async()=>db})
 try{
  runtime=await Promise.race([boot,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Cold start waited for unrelated write')),1500)})]);clearTimeout(timer)
  await Promise.race([runtime.server.runMail(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Empty demo outbox waited for unrelated write')),1500)})]);clearTimeout(timer)
  assert.equal((await db.prepare("SELECT count(*) AS n FROM users WHERE role='admin'").get()).n,1)
 }finally{clearTimeout(timer);release();await locked;const result=await boot.catch(()=>null);result?.server.emit('close');await db.close()}
})
