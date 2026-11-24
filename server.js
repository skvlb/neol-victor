import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve,extname,sep } from 'node:path';
import handler from './api/index.js';
if (!process.env.VERCEL && !process.env.UPSTASH_REDIS_REST_URL && !process.env.UPSTASH_REDIS_REST_TOKEN) {
  process.env.NOEL_LOOPBACK = '1';
  if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 16) {
    process.env.ADMIN_PASSWORD = randomBytes(12).toString('base64url');
    console.log('Mot de passe temporaire de l’atelier local :', process.env.ADMIN_PASSWORD);
  }
}
const root=resolve('public');
const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png','.jpg':'image/jpeg'};
createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/api/index'||url.pathname==='/api')return handler(req,res);
  try{
    const path=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
    if(!path.startsWith(root+sep))throw new Error('Forbidden');
    const content=await readFile(path);res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','X-Content-Type-Options':'nosniff'});res.end(content);
  }catch{res.writeHead(404);res.end('Page introuvable');}
}).listen(Number(process.env.PORT)||3000,'127.0.0.1',()=>console.log(`Noël de Victor : http://localhost:${process.env.PORT||3000}`));
