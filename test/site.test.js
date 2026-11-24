import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import handler from '../api/index.js';
import {parseMetadata,numberPrice,publicIPv4} from '../lib/metadata.js';
import {reserve} from '../lib/store.js';

async function request(action, {body,cookie='',origin='https://noel.test'}={}) {
  const headers = {};
  let result;
  const req = {method:body?'POST':'GET',url:'/api/index?action='+action,body,headers:{host:'noel.test',origin,cookie}};
  const res = {setHeader(key,value){headers[key]=value;},end(value){result=JSON.parse(value);}};
  await handler(req,res);
  return {status:res.statusCode,body:result,cookie:headers['Set-Cookie']?.split(';')[0]};
}
test('Deux visiteurs, une réservation, annulation personnelle, atelier et suppression', async t=>{
  const folder=await mkdtemp(join(tmpdir(),'noel-test-'));
  process.env.NOEL_LOOPBACK='1';
  process.env.NOEL_DATA_DIR=folder;
  process.env.ADMIN_PASSWORD=randomBytes(18).toString('hex');
  t.after(async()=>{delete process.env.NOEL_LOOPBACK;delete process.env.NOEL_DATA_DIR;delete process.env.ADMIN_PASSWORD;await rm(folder,{recursive:true});});
  const visitorA=await request('state'),visitorB=await request('state');
  assert.equal(visitorA.body.gifts.length,8);
  const firstGift={id:visitorA.body.gifts[0].id};
  const [a,b]=await Promise.all([request('reserve',{body:firstGift,cookie:visitorA.cookie}),request('reserve',{body:firstGift,cookie:visitorB.cookie})]);
  assert.deepEqual([a.status,b.status].sort(),[200,409]);
  const winner=a.status===200?visitorA:visitorB, other=winner===visitorA?visitorB:visitorA;
  const gift=(await request('state',{cookie:other.cookie})).body.gifts[0];
  assert.equal(gift.reserved,true);assert.equal(gift.mine,false);assert.ok(!('reservation' in gift));
  assert.equal((await request('release',{body:firstGift,cookie:other.cookie})).status,403);
  assert.equal((await request('release',{body:firstGift,cookie:winner.cookie})).status,200);
  assert.equal((await request('delete',{body:firstGift,cookie:winner.cookie})).status,401);
  const admin=await request('login',{body:{password:process.env.ADMIN_PASSWORD}});
  assert.equal(admin.status,200);
  const item={name:'Test café',category:'Maison',price:'21.50',currency:'EUR',url:'https://example.com/item'};
  const saved=await request('save',{body:item,cookie:admin.cookie});assert.equal(saved.status,200);
  const created=saved.body.gifts.at(-1);assert.equal(created.price,21.5);
  const update=await request('save',{body:{...created,name:'Autre nom'},cookie:admin.cookie});assert.equal(update.body.gifts.at(-1).name,'Autre nom');
  assert.equal((await request('delete',{body:{id:created.id},cookie:admin.cookie})).body.gifts.length,8);
});
test('La réservation partagée gère un conflit de versions via la passerelle REST',async t=>{
  // Exercise the production handler with a deterministic Redis REST double.
  const original=globalThis.fetch;
  Object.assign(process.env,{UPSTASH_REDIS_REST_URL:'https://redis.test',UPSTASH_REDIS_REST_TOKEN:'test',ADMIN_PASSWORD:'test-only-password-2026'});
  let raw=await readFile(new URL('../public/seed.json',import.meta.url),'utf8');
  let conflicts=0;
  globalThis.fetch=async(url,{body})=>{
    const [op,script,_count,_key,previous,next]=JSON.parse(body);
    let result;
    if(op==='GET')result=raw;
    else if(op==='EVAL'&&script.includes('INCR'))result=1;
    else if(op==='EVAL'){result=raw===previous?1:0;if(result)raw=next;else conflicts++;}
    else throw Error('Commande inattendue');
    return Response.json({result});
  };
  t.after(()=>{globalThis.fetch=original;for(const key of ['UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','ADMIN_PASSWORD'])delete process.env[key];});
  const [first,second]=await Promise.all([request('state'),request('state')]);
  assert.equal(first.body.mode,'shared');
  const tickets=await Promise.all([first,second].map(user=>request('reserve',{body:{id:'constance'},cookie:user.cookie})));
  assert.deepEqual(tickets.map(r=>r.status).sort(),[200,409]);assert.equal(conflicts,1);
});
test('Import JSON-LD et repli Open Graph, indépendamment de l’ordre des attributs',()=>{
  const data=parseMetadata('<script type="application/ld+json">'+JSON.stringify({'@graph':[{'@type':'Product',name:'Maillot',brand:{name:'Marque'},image:{url:'/image.jpg'},offers:{price:'99,50',priceCurrency:'EUR'}}]})+'</script>','https://boutique.test/article');
  assert.equal(data.price,99.5);assert.equal(data.image,'https://boutique.test/image.jpg');assert.equal(data.name,'Maillot');
  const fallback=parseMetadata('<meta content="Café &amp; lait" property="og:title"><meta content="32.50" property="product:price:amount">','https://boutique.test/article');
  assert.equal(fallback.name,'Café & lait');assert.equal(fallback.price,32.5);
  assert.equal(numberPrice(''),null);assert.equal(publicIPv4('127.0.0.1'),false);assert.equal(publicIPv4('10.0.0.2'),false);
});
