import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "./generated/prisma/client.js";
import { AsyncLocalStorage } from "node:async_hooks";
import { postgresSql } from "../server/postgres.mjs";
function normalize(value: unknown): any {
 if(typeof value === "bigint") {const n=Number(value);if(!Number.isSafeInteger(n))throw Error("Unsafe database integer");return n;}
 if(value instanceof Uint8Array)return Buffer.from(value);
 if(Array.isArray(value))return value.map(normalize);
 if(value && typeof value === "object")return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,normalize(v)]));
 return value;
}
@Injectable()
export class PrismaDatabaseService implements OnModuleDestroy {
 readonly client: PrismaClient;
 private readonly context = new AsyncLocalStorage<Prisma.TransactionClient>();
 readonly dialect="postgres";
 constructor() {
  const connectionString=process.env.DATABASE_URL || process.env.VillaCheck_DATABASE_URL;
  if(!connectionString)throw Error("DATABASE_URL is required for NestJS/Prisma");
  const url=new URL(connectionString);
  const optionsSchema=url.searchParams.get("options")?.match(/search_path=([a-zA-Z0-9_]+)/)?.[1];
  const schema=url.searchParams.get("schema") || optionsSchema || "public";
  this.client=new PrismaClient({adapter:new PrismaPg({connectionString,max:5,connectionTimeoutMillis:10000},{schema})});
 }
 private current() {return this.context.getStore() || this.client;}
 prepare(sql:string) {
  const query=async(args:unknown[])=> normalize(await this.current().$queryRawUnsafe(postgresSql(sql),...args));
  return {get:async(...args:unknown[])=>(await query(args))[0],all:async(...args:unknown[])=>query(args),run:async(...args:unknown[])=>{
   if(/\bRETURNING\b/i.test(sql))return {changes:(await query(args)).length};
   return {changes:await this.current().$executeRawUnsafe(postgresSql(sql),...args)};
  }};
 }
 async exec(sql:string) {return this.current().$executeRawUnsafe(sql);}
 async transaction<T>(work:()=>Promise<T>):Promise<T> {
  if(this.context.getStore())return work();
  return this.client.$transaction(async client=>{
   await client.$queryRawUnsafe("SELECT pg_advisory_xact_lock(74639201)::text");
   return this.context.run(client,work);
  },{maxWait:15000,timeout:30000});
 }
 async close(){await this.client.$disconnect();}
 async onModuleDestroy(){await this.close();}
}
