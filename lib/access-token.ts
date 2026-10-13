type Claims={sub:string;email:string;iss:string;aud:string[]|string;exp:number;nbf?:number};
let cached:{issuer:string;until:number;keys:(JsonWebKey & {kid?:string})[]}|undefined;
function decode(s:string){return Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))}
export async function verifyAccessToken(token:string,domain:string,audience:string):Promise<Claims|null>{
 try{
  if(!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(domain)||!audience||token.length>16000)return null;
  const parts=token.split('.');if(parts.length!==3)return null;
  const head=JSON.parse(new TextDecoder().decode(decode(parts[0])));
  const claim=JSON.parse(new TextDecoder().decode(decode(parts[1]))) as Claims;
  const issuer='https://'+domain,now=Date.now()/1000;
  if(head.alg!=='RS256'||typeof head.kid!=='string'||claim.iss!==issuer||typeof claim.exp!=='number'||claim.exp<=now||(claim.nbf!==undefined&&(typeof claim.nbf!=='number'||claim.nbf>now))||!claim.sub||typeof claim.email!=='string'||!(Array.isArray(claim.aud)?claim.aud:[claim.aud]).includes(audience))return null;
  if(!cached||cached.issuer!==issuer||cached.until<Date.now()||!cached.keys.some(k=>k.kid===head.kid)){
   const r=await fetch(issuer+'/cdn-cgi/access/certs',{signal:AbortSignal.timeout(5000)});if(!r.ok)return null;
   const data=await r.json() as {keys:(JsonWebKey & {kid?:string})[]};if(!Array.isArray(data.keys))return null;
   cached={issuer,keys:data.keys,until:Date.now()+300000};
  }
  const jwk=cached.keys.find(k=>k.kid===head.kid&&k.kty==='RSA');if(!jwk)return null;
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  return await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1]))?claim:null;
 }catch{return null}
}
