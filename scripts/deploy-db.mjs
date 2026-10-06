import "dotenv/config";
import {runMigration} from "./migration-runner.mjs";
import {PrismaPg} from "@prisma/adapter-pg";
import {PrismaClient} from "../.build/backend/generated/prisma/client.js";
const runtimeUrl=process.env.DATABASE_URL || process.env.VillaCheck_DATABASE_URL;
// Migrations need a direct session: transaction poolers can retain session locks.
let url=process.env.DIRECT_URL || process.env.DATABASE_URL_UNPOOLED || process.env.VillaCheck_DATABASE_URL_UNPOOLED || process.env.VillaCheck_POSTGRES_URL_NON_POOLING || runtimeUrl;
if(url){const direct=new URL(url);if(direct.hostname.endsWith(".neon.tech") && direct.hostname.includes("-pooler.")){direct.hostname=direct.hostname.replace("-pooler.",".");url=direct.toString();}}
if(!url){if(process.argv.includes("--if-configured")){console.log("No database configured; migration skipped for local build.");process.exit(0);}throw Error("Set DATABASE_URL before db:deploy");}
const run=(args)=>runMigration(args,url);
const db=new PrismaClient({adapter:new PrismaPg({connectionString:url})});
try{
 const [state]=await db.$queryRawUnsafe("SELECT to_regclass('users')::text AS users,to_regclass('_prisma_migrations')::text AS migrations");
 if(state.users && !state.migrations){
  const expected=['users','subscriptions','sessions','documents','villas','invoices','mails','audits','oauth_identities','oauth_states','rate_limits'];
  const rows=await db.$queryRawUnsafe("SELECT tablename FROM pg_tables WHERE schemaname=current_schema()");
  if(expected.some(name=>!rows.some(row=>row.tablename===name)))throw Error("Existing database does not match VillaCheck baseline; refusing to mark migration applied");
  await run(['migrate','resolve','--applied','0001_legacy_baseline']);
 }
 await run(['migrate','deploy']);
}finally{await db.$disconnect();}
