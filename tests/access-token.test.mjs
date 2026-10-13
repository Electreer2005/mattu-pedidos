import test from 'node:test';import assert from 'node:assert/strict';import ts from 'typescript';import {readFileSync} from 'node:fs';import {webcrypto} from 'node:crypto';
if(!globalThis.crypto)Object.defineProperty(globalThis,"crypto",{value:webcrypto});
const code=ts.transpileModule(readFileSync('lib/access-token.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {verifyAccessToken}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const key={...await crypto.subtle.exportKey('jwk',pair.publicKey),kid:'test'};
globalThis.fetch=async()=>Response.json({keys:[key]});
const claims={sub:'user',email:'empleado@example.test',iss:'https://mattu.cloudflareaccess.com',aud:['mattu-aud'],exp:Date.now()/1000+300};
async function token(c=claims){const a=Buffer.from(JSON.stringify({alg:'RS256',kid:'test'})).toString('base64url');const b=Buffer.from(JSON.stringify(c)).toString('base64url');const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(a+'.'+b));return a+'.'+b+'.'+Buffer.from(signature).toString('base64url')}
test('acepta token firmado para la aplicación',async()=>assert.equal((await verifyAccessToken(await token(),'mattu.cloudflareaccess.com','mattu-aud')).email,claims.email));
test('rechaza token vencido',async()=>assert.equal(await verifyAccessToken(await token({...claims,exp:1}),'mattu.cloudflareaccess.com','mattu-aud'),null));
test('rechaza audiencia diferente',async()=>assert.equal(await verifyAccessToken(await token(),'mattu.cloudflareaccess.com','otra-app'),null));
test('rechaza firma alterada',async()=>{const t=await token();const p=t.split('.');p[2]=(p[2][0]==='A'?'B':'A')+p[2].slice(1);assert.equal(await verifyAccessToken(p.join('.'),'mattu.cloudflareaccess.com','mattu-aud'),null)});
test('rechaza emisor diferente',async()=>assert.equal(await verifyAccessToken(await token({...claims,iss:'https://otro.cloudflareaccess.com'}),'mattu.cloudflareaccess.com','mattu-aud'),null));
test('rechaza configuración incompleta',async()=>assert.equal(await verifyAccessToken(await token(),'',''),null));
