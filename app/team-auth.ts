import {headers} from 'next/headers';import {env} from 'cloudflare:workers';import {verifyAccessToken} from '../lib/access-token';
export async function getTeamUser(){
 const h=await headers();const settings=env as unknown as {ACCESS_TEAM_DOMAIN?:string;ACCESS_AUD?:string};
 const token=h.get('Cf-Access-Jwt-Assertion');if(!token)return null;
 const claim=await verifyAccessToken(token,settings.ACCESS_TEAM_DOMAIN||'',settings.ACCESS_AUD||'');
 return claim?{userId:claim.sub,email:claim.email,displayName:claim.email}:null;
}
