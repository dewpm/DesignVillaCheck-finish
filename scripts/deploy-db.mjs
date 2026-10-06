import "dotenv/config";
import {spawnSync} from "node:child_process";
import {PrismaPg} from "@prisma/adapter-pg";
import {PrismaClient} from "../.build/backend/generated/prisma/client.js";
const url=process.env.DATABASE_URL || process.env.VillaCheck_DATABASE_URL;
if(!url){if(process.argv.includes("--if-configured")){console.log("No database configured; migration skipped for local build.");process.exit(0);}throw Error("Set DATABASE_URL before db:deploy");}
const run=(args)=>{const r=spawnSync(process.execPath,["node_modules/prisma/build/index.js",...args],{stdio:"inherit",env:{...process.env,DATABASE_URL:url}});if(r.status!==0)throw Error("Prisma migration command failed");};
const db=new PrismaClient({adapter:new PrismaPg({connectionString:url})});
try{
 const [state]=await db.$queryRawUnsafe("SELECT to_regclass('users')::text AS users,to_regclass('_prisma_migrations')::text AS migrations");
 if(state.users && !state.migrations){
  const expected=['users','subscriptions','sessions','documents','villas','invoices','mails','audits','oauth_identities','oauth_states','rate_limits'];
  const rows=await db.$queryRawUnsafe("SELECT tablename FROM pg_tables WHERE schemaname=current_schema()");
  if(expected.some(name=>!rows.some(row=>row.tablename===name)))throw Error("Existing database does not match VillaCheck baseline; refusing to mark migration applied");
  run(['migrate','resolve','--applied','0001_legacy_baseline']);
 }
 run(['migrate','deploy']);
}finally{await db.$disconnect();}
