import test from "node:test"
import assert from "node:assert/strict"
import {randomUUID} from "node:crypto"
import {spawn} from "node:child_process"
import {readFileSync} from "node:fs"
import pg from "pg"
test("Prisma migrations baseline populated databases and preserve QR across repeat deploys",{skip:!process.env.TEST_DATABASE_URL,timeout:60000},async()=>{
 const pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});
 const schemas=[`fresh_${randomUUID().replaceAll('-','')}`,`legacy_${randomUUID().replaceAll('-','')}`];
 const deploy=(schema)=>new Promise((resolve,reject)=>{const url=new URL(process.env.TEST_DATABASE_URL);url.searchParams.set('schema',schema);url.searchParams.set('options',`-c search_path=${schema}`);const child=spawn(process.execPath,['scripts/deploy-db.mjs'],{env:{...process.env,DATABASE_URL:url.toString()},stdio:'pipe'});let output='';child.stdout.on('data',chunk=>{output+=chunk});child.stderr.on('data',chunk=>{output+=chunk});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Migration failed: '+output.replace(/postgres(?:ql)?:\/\/[^\s]+/g,'[database URL]'))));});
 try{
  for(const schema of schemas)await pool.query(`CREATE SCHEMA "${schema}"`);
  await deploy(schemas[0]);
  const client=await pool.connect();try{
   await client.query(`SET search_path="${schemas[1]}"`);
   await client.query(readFileSync('prisma/migrations/0001_legacy_baseline/migration.sql','utf8'));
   await client.query("INSERT INTO users(id,email,name,password_hash,role) VALUES ('merchant','merchant@test.com','Merchant','placeholder','merchant'); INSERT INTO documents VALUES ('doc','merchant','document.pdf','application/pdf',decode('25504446','hex')); INSERT INTO villas(id,owner_id,name,province,merchant,email,package_id,document_id,status,qr,expires,created) VALUES ('villa','merchant','Legacy Villa','ชลบุรี','Merchant','merchant@test.com','starter','doc','approved','VC-persistent','2099-01-01','now');");
  }finally{await client.query('RESET search_path');client.release();}
  await deploy(schemas[1]);await deploy(schemas[1]);
  assert.equal((await pool.query(`SELECT qr FROM "${schemas[1]}".villas WHERE id='villa'`)).rows[0].qr,'VC-persistent');
  assert.equal((await pool.query(`SELECT count(*) AS n FROM "${schemas[1]}"._prisma_migrations WHERE finished_at IS NOT NULL`)).rows[0].n,'4');
 }finally{for(const schema of schemas)await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await pool.end();}
})
