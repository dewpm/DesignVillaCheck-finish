import { Injectable, OnModuleDestroy } from "@nestjs/common";
import type { IncomingMessage, ServerResponse, Server } from "node:http";
import { PrismaDatabaseService } from "./prisma.service.js";
import { startServer } from "../server/index.mjs";
import { seedCatalog } from "../server/catalog.mjs";
type DomainServer=Server & {runMail:()=>Promise<void>;authenticate:(req:IncomingMessage)=>Promise<{id:string;role:string}>};
@Injectable()
export class DomainService implements OnModuleDestroy {
 private runtime?:Promise<{server:DomainServer}>;
 constructor(private readonly database:PrismaDatabaseService){}
 private getRuntime(){
  this.runtime ||= (async()=>{
   await this.database.transaction(()=>seedCatalog(this.database));
   const result=await startServer({...process.env,SERVE_FRONTEND:"false",SEED_DEMO_ACCOUNTS:"false"},{listen:false,databaseFactory:async()=>this.database});
   return {server:result.server as DomainServer};
  })().catch(error=>{this.runtime=undefined;throw error;});
  return this.runtime;
 }
 async ready(){await this.getRuntime();}
 async authenticate(req:IncomingMessage){return (await this.getRuntime()).server.authenticate(req);}
 async handle(req:IncomingMessage,res:ServerResponse){const {server}=await this.getRuntime();await server.listeners("request")[0]!(req,res);}
 async runMail(){await (await this.getRuntime()).server.runMail();}
 async onModuleDestroy(){if(this.runtime)(await this.runtime).server.emit("close");}
}
