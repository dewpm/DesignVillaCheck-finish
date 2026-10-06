import {PackageService} from "./package.service.js";
import {Get,All,Controller,Module,Req,Res,Injectable,CanActivate,ExecutionContext,HttpException,UseGuards} from "@nestjs/common";
import type {Request,Response} from "express";
import {PrismaDatabaseService} from "./prisma.service.js";
import {DomainService} from "./domain.service.js";
@Injectable()
export class AdminAuthGuard implements CanActivate {
 constructor(private readonly domain:DomainService){}
 async canActivate(context:ExecutionContext){
  try{const user=await this.domain.authenticate(context.switchToHttp().getRequest());if(user.role!=="admin")throw new HttpException("เฉพาะ Admin",403);return true;}
  catch(error:any){throw error instanceof HttpException?error:new HttpException(error.status<500?error.message:"Backend ไม่พร้อม",error.status||503);}
 }
}
@Controller("api")
class PackageController {
 constructor(private readonly packages:PackageService){}
 @Get("packages") list(){return this.packages.listActive();}
}
@Controller("api/admin")
@UseGuards(AdminAuthGuard)
class AdminController {
 constructor(private readonly domain:DomainService){}
 @All("{*path}") handle(@Req()req:Request,@Res()res:Response){return this.domain.handle(req,res);}
}
@Controller("api")
class ApiController {
 constructor(private readonly domain:DomainService){}
 @All("{*path}") handle(@Req()req:Request,@Res()res:Response){return this.domain.handle(req,res);}
}
@Module({controllers:[PackageController,AdminController,ApiController],providers:[PrismaDatabaseService,DomainService,AdminAuthGuard,PackageService]})
export class AppModule {}
