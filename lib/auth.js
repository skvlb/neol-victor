import { createHmac,randomBytes,timingSafeEqual } from 'node:crypto';
import { HttpError } from './store.js';
export const COOKIE='noel_admin';
export function cookies(req) {
  return Object.fromEntries((req.headers.cookie||'').split(';').map(s=>s.trim().split('=')).filter(a=>a.length===2));
}
export function safeEqual(a,b) {
  const x=Buffer.from(a||'');const y=Buffer.from(b||'');
  return x.length===y.length && timingSafeEqual(x,y);
}
const sign=value=>createHmac('sha256',process.env.ADMIN_PASSWORD||randomBytes(32)).update(value).digest('base64url');
export function newSession() {
  const value=`${Math.floor(Date.now()/1000)+86400}.${randomBytes(16).toString('hex')}`;
  return `${value}.${sign(value)}`;
}
export function isAdmin(req) {
  if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length<16) return false;
  const [expires,nonce,signature]=(cookies(req)[COOKIE]||'').split('.');
  return Number(expires)>Date.now()/1000 && Boolean(nonce) && safeEqual(signature,sign(`${expires}.${nonce}`));
}
export function cookie(req,name,value,maxAge) {
  const secure=process.env.VERCEL || req.headers['x-forwarded-proto']==='https';
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure?'; Secure':''}`;
}
export function requireAdmin(req) { if (!isAdmin(req)) throw new HttpError(401,'Connecte-toi pour modifier la liste.'); }
export function checkOrigin(req) {
  let origin;try {origin=new URL(req.headers.origin);} catch {throw new HttpError(403,'Origine invalide.');}
  if (origin.host!==req.headers.host) throw new HttpError(403,'Origine non autorisée.');
}
