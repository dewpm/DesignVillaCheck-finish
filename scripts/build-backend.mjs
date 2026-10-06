import {spawnSync} from "node:child_process";
import {mkdirSync,copyFileSync,readdirSync} from "node:fs";
const result=spawnSync(process.execPath,["node_modules/typescript/bin/tsc","-p","tsconfig.backend.json"],{stdio:"inherit"});
if(result.status!==0)process.exit(result.status||1);
mkdirSync(".build/server",{recursive:true});
for(const name of readdirSync("server"))if(name.endsWith(".sql"))copyFileSync(`server/${name}`,`.build/server/${name}`);
