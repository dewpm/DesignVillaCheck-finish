import 'dotenv/config';
import {randomBytes} from 'node:crypto';
import {PrismaDatabaseService} from '../.build/backend/prisma.service.js';
import {seedDemo} from '../server/demo-seed.mjs';
// User-authorized demo deployment. Disable with SEED_PUBLIC_DEMO_DATA=false.
if(process.env.VERCEL!=='1'||process.env.SEED_PUBLIC_DEMO_DATA==='false')process.exit(0);
const db=new PrismaDatabaseService();
try{
 const result=await seedDemo(db,{password:process.env.DEMO_PASSWORD || randomBytes(24).toString('base64url')});
 console.log('Public labelled sample data ready:',result.villas,'Villas. No demo Admin or payment emails created.');
}finally{await db.close();}
