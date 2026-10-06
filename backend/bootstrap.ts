import "reflect-metadata";
import {NestFactory} from "@nestjs/core";
import {AppModule} from "./app.module.js";
import {DomainService} from "./domain.service.js";
export async function createBackend(){
 const app=await NestFactory.create(AppModule,{bodyParser:false,abortOnError:false,logger:["error","warn"]});
 await app.init();
 return {app,handler:app.getHttpAdapter().getInstance(),domain:app.get(DomainService)};
}
