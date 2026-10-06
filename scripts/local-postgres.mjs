import EmbeddedPostgres from 'embedded-postgres';
import {mkdirSync,existsSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import pgDriver from 'pg';
const previousEnv=existsSync('.env')?readFileSync('.env','utf8'):'';
const previousUrl=previousEnv.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g,'');
if(previousUrl && !['localhost','127.0.0.1'].includes(new URL(previousUrl).hostname))throw Error('Existing online DATABASE_URL found; refusing to replace it with a local database');
mkdirSync('server/data',{recursive:true});
const settingsPath='server/data/local-postgres.json';
const settings=existsSync(settingsPath)?JSON.parse(readFileSync(settingsPath,'utf8')):{password:randomBytes(24).toString('base64url'),port:54329};
writeFileSync(settingsPath,JSON.stringify(settings),{mode:0o600});
const databaseDir=resolve('server/data/postgres');
const pg=new EmbeddedPostgres({databaseDir,user:'postgres',password:settings.password,port:settings.port,persistent:true,postgresFlags:['-h','127.0.0.1'],onLog:()=>{},onError:()=>{}});
if(!existsSync(databaseDir+'/PG_VERSION'))await pg.initialise();
await pg.start();
const base=`postgresql://postgres:${settings.password}@127.0.0.1:${settings.port}/`;
try{
 const admin=new pgDriver.Client({connectionString:base+'postgres'});await admin.connect();
 if(!(await admin.query("SELECT 1 FROM pg_database WHERE datname='villacheck_dummy'")).rowCount)await admin.query('CREATE DATABASE villacheck_dummy');
 await admin.end();
 let env=existsSync('.env')?readFileSync('.env','utf8'):'';
 if(/^DATABASE_URL=/m.test(env))env=env.replace(/^DATABASE_URL=.*$/m,`DATABASE_URL=${base}villacheck_dummy`);else env+=`\nDATABASE_URL=${base}villacheck_dummy\n`;
 writeFileSync('.env',env,{mode:0o600});
 for(const script of ['db:deploy','db:seed']){const result=spawnSync('npm',['run',script],{stdio:'inherit',env:{...process.env,DATABASE_URL:base+'villacheck_dummy'}});if(result.status!==0)throw Error('Local database setup failed');}
 console.log('Local PostgreSQL dummy database ready on 127.0.0.1:'+settings.port+'. Keep this terminal running; start the website with npm run dev.');
 await new Promise(resolve=>{process.once('SIGINT',resolve);process.once('SIGTERM',resolve)});
}finally{await pg.stop();}
