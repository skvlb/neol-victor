// The loopback development server enables this adapter. Vercel always uses Redis.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { HttpError } from './store.js';

const attempts = new Map();
export function localEnabled() {
  return process.env.NOEL_LOOPBACK === '1' && !process.env.VERCEL;
}
function filename() { return resolve(process.env.NOEL_DATA_DIR || '.local', 'gifts.json'); }
function save(gifts) {
  const file = filename();
  mkdirSync(resolve(file, '..'), {recursive:true});
  writeFileSync(file + '.tmp', JSON.stringify(gifts), {mode:0o600});
  renameSync(file + '.tmp', file);
}
export function readLocal() {
  if (!existsSync(filename())) save(JSON.parse(readFileSync(new URL('../public/seed.json',import.meta.url),'utf8')));
  const raw = readFileSync(filename(),'utf8');
  return {raw,gifts:JSON.parse(raw)};
}
export function changeLocal(transform) {
  // No await between reading, checking and committing in this single local process.
  const next = transform(readLocal().gifts);
  save(next);
  return next;
}
export function limitLocal(key, limit, seconds) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.until < now) {
    attempts.set(key,{count:1,until:now+seconds*1000});
  } else if (++entry.count > limit) {
    throw new HttpError(429,'Réessaie dans quelques minutes.');
  }
}
