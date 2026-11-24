import {localEnabled} from '../lib/local.js';
import { randomBytes,randomUUID } from 'node:crypto';
import { configured,getList,mutateList,publicList,reserve,rateLimit,tokenHash,HttpError } from '../lib/store.js';
import { cookies,cookie,COOKIE,newSession,isAdmin,requireAdmin,safeEqual,checkOrigin } from '../lib/auth.js';
import { importProduct,productURL,imageURL } from '../lib/metadata.js';

export function validateGift(body) {
  const text=(key,max)=>typeof body[key]==='string'?body[key].trim().slice(0,max):'';
  const name=text('name',160);if(!name)throw new HttpError(400,'Donne un nom à ce cadeau.');
  const url=text('url',2048);if(url)productURL(url);
  const image=text('image',2048);if(image&&!imageURL(image))throw new HttpError(400,'L’image doit être un lien HTTPS.');
  const price=body.price===''||body.price===null||body.price===undefined?null:Number(body.price);
  if(price!==null&&(!Number.isFinite(price)||price<0||price>999999))throw new HttpError(400,'Le prix doit être un nombre positif.');
  const category=text('category',30);if(!['Vélo','Karting','Maison','Tech','Autres'].includes(category))throw new HttpError(400,'Catégorie invalide.');
  const currency=text('currency',3)||'EUR';try{new Intl.NumberFormat('fr',{style:'currency',currency}).format(0);}catch{throw new HttpError(400,'Devise invalide.');}
  return {name,url,image,price,category,currency,brand:text('brand',100),subtitle:text('subtitle',180),note:text('note',700),kind:['jersey','gilet','socks','rib','milk','trainer','ssd','camera','gift'].includes(body.kind)?body.kind:'gift',priceCheckedAt:price!==null?new Date().toISOString().slice(0,10):null};
}
async function bodyJSON(req) {
  if(req.body){if(typeof req.body==='object')return req.body;if(typeof req.body==='string'&&req.body.length<16000)return JSON.parse(req.body);throw new HttpError(400,'Requête invalide.');}
  let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>16000)throw new HttpError(413,'Fiche trop volumineuse.');}
  try{return JSON.parse(text||'{}');}catch{throw new HttpError(400,'Requête invalide.');}
}
export default async function handler(req,res) {
  res.setHeader('Cache-Control','private, no-store, max-age=0');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  const send=(status,data)=>{res.statusCode=status;res.end(JSON.stringify(data));};
  try {
    const action=new URL(req.url,'https://wishlist.local').searchParams.get('action')||'state';
    const shared=configured();
    if(req.method==='GET'&&action==='state'){
      if(!shared)return send(200,{mode:'demo',admin:false});
      let visitor=cookies(req).noel_visitor;
      if(!visitor||!/^[a-f0-9]{64}$/.test(visitor)){visitor=randomBytes(32).toString('hex');res.setHeader('Set-Cookie',cookie(req,'noel_visitor',visitor,31536000));}
      return send(200,{mode:localEnabled()?'local':'shared',admin:isAdmin(req),gifts:publicList((await getList()).gifts,visitor)});
    }
    if(req.method!=='POST')throw new HttpError(405,'Méthode non autorisée.');
    checkOrigin(req);
    const body=await bodyJSON(req);
    if(!shared)throw new HttpError(503,'Le site est en aperçu. Configure la base de données et le mot de passe pour partager les réservations.');
    const ip=String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim();
    if(action==='login'){
      await rateLimit(`login:${tokenHash(ip)}`,8,900);
      if(!safeEqual(String(body.password||''),process.env.ADMIN_PASSWORD))throw new HttpError(401,'Ce mot de passe ne semble pas être le bon.');
      res.setHeader('Set-Cookie',cookie(req,COOKIE,newSession(),86400));return send(200,{ok:true});
    }
    if(action==='logout'){res.setHeader('Set-Cookie',cookie(req,COOKIE,'',0));return send(200,{ok:true});}
    if(['reserve','release'].includes(action)){
      await rateLimit(`reserve:${tokenHash(ip)}`,60,600);
      const visitor=cookies(req).noel_visitor;if(!visitor||!/^[a-f0-9]{64}$/.test(visitor))throw new HttpError(401,'Actualise la page pour activer les réservations.');
      const list=await mutateList(gifts=>reserve(gifts,String(body.id),visitor,action==='release'));
      return send(200,{gifts:publicList(list,visitor)});
    }
    requireAdmin(req);
    if(action==='metadata'){
      await rateLimit('metadata',40,600);return send(200,await importProduct(String(body.url||'')));
    }
    if(action==='save'){
      const gift=validateGift(body);
      const id=body.id?String(body.id):randomUUID();
      const list=await mutateList(gifts=>{
        const index=gifts.findIndex(g=>g.id===id);
        if(body.id&&index<0)throw new HttpError(404,'Ce cadeau a été supprimé.');
        if(index>=0)gifts[index]={...gifts[index],...gift};else{if(gifts.length>=100)throw new HttpError(400,'La liste est limitée à 100 cadeaux.');gifts.push({...gift,id});}
        return gifts;
      });
      return send(200,{gifts:publicList(list,cookies(req).noel_visitor)});
    }
    if(action==='delete'||action==='reset'){
      const list=await mutateList(gifts=>{
        const gift=gifts.find(g=>g.id===body.id);if(!gift)throw new HttpError(404,'Cadeau introuvable.');
        if(action==='reset'){delete gift.reservation;return gifts;}
        return gifts.filter(g=>g.id!==body.id);
      });return send(200,{gifts:publicList(list,cookies(req).noel_visitor)});
    }
    throw new HttpError(404,'Action inconnue.');
  }catch(error){
    if(!error.status)console.error('Wishlist request failed:',error.name);
    send(error.status||503,{error:error.status?error.message:'Impossible de joindre le service. Réessaie dans un instant ; aucune modification n’a été confirmée.'});
  }
}
