import type { NextApiRequest,NextApiResponse } from "next";
import { waitUntil } from "@vercel/functions";
// Compiled with Nest's decorator metadata by build:backend before next build.
import { createBackend } from "../../.build/backend/bootstrap.js";
let backend:ReturnType<typeof createBackend>|undefined;
export const config={api:{bodyParser:false,externalResolver:true},maxDuration:60};
export default async function handler(req:NextApiRequest,res:NextApiResponse){
 res.setHeader("Cache-Control","no-store");
 try{
  backend ||= createBackend().catch((error:unknown)=>{backend=undefined;throw error;});
  const runtime=await backend;
  await new Promise<void>((resolve,reject)=>{res.once("finish",resolve);res.once("close",resolve);runtime.handler(req,res,(error:unknown)=>error?reject(error):resolve());});
  waitUntil(runtime.domain.runMail().catch(()=>console.error("Mail delivery failed")));
 }catch{if(!res.headersSent)res.status(503).json({error:"Backend ไม่พร้อม กรุณาตรวจ PostgreSQL และ Admin config"});}
}
