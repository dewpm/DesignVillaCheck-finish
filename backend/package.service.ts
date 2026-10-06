import {Injectable} from "@nestjs/common";
import {PrismaDatabaseService} from "./prisma.service.js";
import {DomainService} from "./domain.service.js";
@Injectable()
export class PackageService {
 constructor(private readonly database:PrismaDatabaseService,private readonly domain:DomainService){}
 async listActive(){
  await this.domain.ready();
  const rows=await this.database.client.package_catalog.findMany({where:{active:1},orderBy:[{sort_order:"asc"},{id:"asc"}]});
  return {packages:rows.map(row=>({...row,features:JSON.parse(row.features) as string[],trialMonths:row.trial_months,maximumVerificationLevel:row.max_level,showPremiumBanner:Boolean(row.banner),isActive:Boolean(row.active),billingCycle:row.billing_cycle}))};
 }
}
