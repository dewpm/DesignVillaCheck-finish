import test from 'node:test';import assert from 'node:assert/strict';
import {openTestDatabase} from './test-database.mjs';import{seedDemo}from'./demo-seed.mjs';import{trustDto}from'./catalog.mjs';
test('dummy seed is idempotent, private documents follow ownership and expired QR stays stable',async()=>{
 const db=await openTestDatabase();try{
  await seedDemo(db,{password:'DemoTestPassword123'});const first=await db.prepare('SELECT id,qr FROM villas ORDER BY id').all();
  await seedDemo(db,{password:'DemoTestPassword123'});assert.equal(first.length,14);assert.equal((await db.prepare("SELECT count(*) AS n FROM villas WHERE photo_url LIKE '/demo/villas/%'").get()).n,14);assert.deepEqual(await db.prepare('SELECT id,qr FROM villas ORDER BY id').all(),first);
  assert.equal((await db.prepare("SELECT count(*) AS n FROM villas WHERE status='approved'").get()).n,10);
  const owners=await db.prepare('SELECT owner_id,count(*) AS n FROM villas GROUP BY owner_id').all();assert.ok(owners.every(x=>x.n<=10));
  const expired=await db.prepare("SELECT * FROM villas WHERE name='Expired Demo Villa'").get();assert.equal((await trustDto(db,expired)).qrStatus,'EXPIRED');
  assert.equal((await db.prepare('SELECT owner_id FROM documents WHERE id=?').get(expired.document_id)).owner_id,expired.owner_id);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM mails').get()).n,0);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM invoices').get()).n,0);
 }finally{await db.close();}
});
