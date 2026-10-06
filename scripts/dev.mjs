import {spawn,spawnSync} from "node:child_process";
for(const args of [["node_modules/prisma/build/index.js","generate"],["scripts/build-backend.mjs"]]){
 const result=spawnSync(process.execPath,args,{stdio:"inherit"});if(result.status!==0)process.exit(result.status||1);
}
const children=[
 spawn(process.execPath,["node_modules/typescript/bin/tsc","-p","tsconfig.backend.json","--watch","--preserveWatchOutput"],{stdio:"inherit"}),
 spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--port",process.env.PORT||"8443"],{stdio:"inherit",env:{...process.env,NEXT_TELEMETRY_DISABLED:"1"}}),
];
let stopping=false;
function stop(code=0){if(stopping)return;stopping=true;for(const child of children)child.kill("SIGTERM");process.exitCode=code;}
process.on("SIGINT",()=>stop());process.on("SIGTERM",()=>stop());
for(const child of children){child.on("error",()=>stop(1));child.on("exit",code=>{if(!stopping)stop(code||0);});}
