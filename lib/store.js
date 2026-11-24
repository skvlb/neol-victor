import {localEnabled,readLocal,changeLocal,limitLocal} from './local.js';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const KEY = 'noel:victor:v1:list';
export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function configured() {
  return localEnabled() || Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN && process.env.ADMIN_PASSWORD?.length >= 16);
}
export async function redis(...command) {
  const response = await fetch(process.env.UPSTASH_REDIS_REST_URL, {
    method:'POST', headers:{Authorization:`Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,'Content-Type':'application/json'},
    body:JSON.stringify(command), signal:AbortSignal.timeout(8000), cache:'no-store'
  });
  if (!response.ok) throw new Error('Database unavailable');
  const data = await response.json();
  if (data.error) throw new Error('Database command failed');
  return data.result;
}
export const tokenHash = token => createHash('sha256').update(token).digest('hex');
export async function getList() {
  if (localEnabled()) return readLocal();
  let value = await redis('GET', KEY);
  if (!value) {
    const seed = await readFile(new URL('../public/seed.json', import.meta.url),'utf8');
    await redis('SET',KEY,JSON.stringify(JSON.parse(seed)),'NX');
    value = await redis('GET',KEY);
  }
  return {raw:value,gifts:JSON.parse(value)};
}
// Compare-and-swap: une seule réservation gagne, même en cas de clic simultané.
export async function mutateList(transform) {
  if (localEnabled()) return changeLocal(transform);
  for (let i=0;i<6;i++) {
    const {raw,gifts}=await getList();
    const next=transform(gifts);
    const saved=await redis('EVAL',"if redis.call('GET',KEYS[1]) == ARGV[1] then redis.call('SET',KEYS[1],ARGV[2]); return 1 else return 0 end",1,KEY,raw,JSON.stringify(next));
    if (saved===1) return next;
  }
  throw new HttpError(409,'La liste vient de changer. Réessaie dans un instant.');
}
export function publicList(gifts,token) {
  const hash=token?tokenHash(token):null;
  return gifts.map(({reservation,...gift})=>({...gift,reserved:Boolean(reservation),mine:Boolean(reservation && hash===reservation.tokenHash)}));
}
export function reserve(gifts,id,token,release=false) {
  const gift=gifts.find(g=>g.id===id);
  if (!gift) throw new HttpError(404,'Ce cadeau ne figure plus dans la liste.');
  const hash=tokenHash(token);
  if (release) {
    if (gift.reservation?.tokenHash!==hash) throw new HttpError(403,'Seule la personne qui a réservé peut annuler depuis son navigateur.');
    delete gift.reservation;
  } else {
    if (gift.reservation && gift.reservation.tokenHash!==hash) throw new HttpError(409,'Quelqu’un vient de réserver ce cadeau. Choisis une autre idée !');
    gift.reservation={tokenHash:hash,at:new Date().toISOString()};
  }
  return gifts;
}
export async function rateLimit(key,limit,seconds) {
  if (localEnabled()) return limitLocal(key,limit,seconds);
  const count=await redis('EVAL',"local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n",1,`noel:rate:${key}`,seconds);
  if (count>limit) throw new HttpError(429,'Un peu de patience… Réessaie dans quelques minutes.');
}
