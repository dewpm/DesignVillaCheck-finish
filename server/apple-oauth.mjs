import {createPublicKey,sign,verify} from 'node:crypto'
export function appleClientSecret(config,now=Math.floor(Date.now()/1000)){
 const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url')
 const input=`${encode({alg:'ES256',kid:config.appleKeyId})}.${encode({iss:config.appleTeamId,iat:now,exp:now+300,aud:'https://appleid.apple.com',sub:config.appleClientId})}`
 const key=config.applePrivateKey.replace(/\\n/g,'\n')
 return `${input}.${sign('sha256',Buffer.from(input),{key,dsaEncoding:'ieee-p1363'}).toString('base64url')}`
}
export function verifyAppleToken(token,jwks,clientId,nonce,now=Math.floor(Date.now()/1000)){
 if(typeof token!=='string'||token.length>16000)throw Error('provider_failed')
 const parts=token.split('.');if(parts.length!==3)throw Error('provider_failed')
 const header=JSON.parse(Buffer.from(parts[0],'base64url')),claims=JSON.parse(Buffer.from(parts[1],'base64url'))
 const key=jwks.keys?.find(k=>k.kid===header.kid&&k.kty==='RSA'&&(!k.alg||k.alg==='RS256')&&(!k.use||k.use==='sig'))
 if(header.alg!=='RS256'||!key||!verify('RSA-SHA256',Buffer.from(parts.slice(0,2).join('.')),createPublicKey({key,format:'jwk'}),Buffer.from(parts[2],'base64url')))throw Error('provider_failed')
 if(claims.iss!=='https://appleid.apple.com'||claims.aud!==clientId||claims.nonce!==nonce||!Number.isFinite(claims.exp)||claims.exp<=now||!Number.isFinite(claims.iat)||claims.iat>now+60)throw Error('provider_failed')
 return claims
}
export async function appleCallbackParams(req){
 let text='';if(req.body!==undefined)text=typeof req.body==='string'?req.body:new URLSearchParams(req.body).toString()
 else{for await(const chunk of req){text+=chunk.toString();if(Buffer.byteLength(text)>32768)throw Error('provider_failed')}}
 if(Buffer.byteLength(text)>32768)throw Error('provider_failed')
 return new URLSearchParams(text)
}
