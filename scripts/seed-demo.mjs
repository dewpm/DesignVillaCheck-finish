import "dotenv/config";
import {randomBytes} from 'node:crypto';
import {mkdirSync,writeFileSync,existsSync,readFileSync} from 'node:fs';
import {PrismaDatabaseService} from '../.build/backend/prisma.service.js';
import {seedDemo} from '../server/demo-seed.mjs';
const url=process.env.DATABASE_URL || process.env.VillaCheck_DATABASE_URL;
if(!url)throw Error('Set DATABASE_URL before seeding');
const local=['localhost','127.0.0.1'].includes(new URL(url).hostname);
const saved=local && existsSync("server/data/demo-accounts.json")?JSON.parse(readFileSync("server/data/demo-accounts.json","utf8")):{};
const password=process.env.DEMO_PASSWORD || saved.password || (local?randomBytes(18).toString('base64url'):null);
const adminPassword=local?process.env.ADMIN_PASSWORD || saved.adminPassword || randomBytes(18).toString('base64url'):undefined;
const adminEmail=local?process.env.ADMIN_EMAIL || 'demo-admin@villacheck.example':undefined;
const db=new PrismaDatabaseService();
try{
 const result=await seedDemo(db,{password,adminEmail,adminPassword});
 if(local){mkdirSync('server/data',{recursive:true});writeFileSync('server/data/demo-accounts.json',JSON.stringify({...result,password,adminEmail,adminPassword},null,2),{mode:0o600});console.log('Local demo login details saved privately to server/data/demo-accounts.json');}
 console.log('Dummy seed complete:',result.villas,'Villa examples. No payment emails or real bank details created.');
}finally{await db.close();}
