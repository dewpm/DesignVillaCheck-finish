import { randomUUID } from 'node:crypto'
export async function saveVillaPhoto(db,owner,file){
 const fail=()=>{throw Object.assign(Error('รูปต้องเป็น JPG หรือ PNG ขนาดไม่เกิน 2 MB'),{status:400})}
 if(!file||!['image/jpeg','image/png'].includes(file.type)||typeof file.data!=='string')fail()
 const prefix=`data:${file.type};base64,`;if(!file.data.startsWith(prefix))fail()
 const bytes=Buffer.from(file.data.slice(prefix.length),'base64')
 if(!bytes.length||bytes.length>2*1024*1024)fail()
 if(file.type==='image/png'&&!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))fail()
 if(file.type==='image/jpeg'&&(bytes[0]!==255||bytes[1]!==216||bytes[2]!==255))fail()
 const id=randomUUID();await db.prepare('INSERT INTO documents(id,owner_id,name,mime,bytes) VALUES (?,?,?,?,?)').run(id,owner,'villa-photo',file.type,bytes)
 return `/api/public/villa-photo/${id}`
}
