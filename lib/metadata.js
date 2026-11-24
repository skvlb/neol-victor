import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';
import { createGunzip,createBrotliDecompress,createInflate } from 'node:zlib';
import { HttpError } from './store.js';

export function publicIPv4(ip) {
  if (net.isIP(ip)!==4) return false;
  const [a,b,c]=ip.split('.').map(Number);
  return !(a===0||a===10||a===127||a>=224||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===168||b===0||b===2))||(a===100&&b>=64&&b<=127)||(a===198&&(b===18||b===19||b===51&&c===100))||(a===203&&b===0&&c===113));
}
export function productURL(value) {
  let url;try {url=new URL(value);} catch {throw new HttpError(400,'Colle un lien HTTPS valide.');}
  if (url.protocol!=='https:'||url.username||url.password||(url.port && url.port!=='443')||net.isIP(url.hostname)||url.hostname.includes(':')||!url.hostname.includes('.')||url.hostname.endsWith('.local')||url.hostname.endsWith('.internal')) throw new HttpError(400,'Seuls les liens HTTPS de boutiques publiques sont acceptés.');
  return url;
}
export function imageURL(value,base) {
  if (!value) return '';
  try {const url=new URL(value,base);return url.protocol==='https:'&&!url.username&&!url.password?url.href:'';} catch {return '';}
}
// DNS validated inside the actual connection lookup: avoids DNS rebinding and private networks.
export async function fetchHTML(value,redirects=0,signal=AbortSignal.timeout(18000)) {
  const url=productURL(value);
  if (redirects>3) throw new HttpError(422,'La boutique redirige trop souvent. Complète la fiche manuellement.');
  return new Promise((resolve,reject)=>{
    const req=https.get(url,{
      signal,headers:{'User-Agent':'Mozilla/5.0 (compatible; ChristmasWishlist/1.0)','Accept':'text/html,application/xhtml+xml','Accept-Language':'fr-FR,fr;q=0.9,en;q=0.7','Accept-Encoding':'identity'},
      lookup:(hostname,options,callback)=>{
        dns.lookup(hostname,{all:true,family:4},(error,addresses)=>{
          if (error) return callback(error);
          if (!addresses.length||addresses.some(a=>!publicIPv4(a.address))) return callback(new Error('Non-public address'));
          if (options.all) callback(null,addresses);else callback(null,addresses[0].address,4);
        });
      }
    },async response=>{
      try {
        if ([301,302,303,307,308].includes(response.statusCode)) {
          response.resume();
          if (!response.headers.location) throw new Error('No redirect location');
          return resolve(await fetchHTML(new URL(response.headers.location,url).href,redirects+1,signal));
        }
        if (response.statusCode!==200) {response.resume();throw new HttpError(422,'Cette boutique bloque l’import automatique. Tu peux compléter les informations ci-dessous.');}
        if (!String(response.headers['content-type']).includes('text/html')) {response.resume();throw new HttpError(422,'Ce lien ne mène pas à une page produit HTML.');}
        const encoding=response.headers['content-encoding'];
        const stream=encoding==='gzip'?response.pipe(createGunzip()):encoding==='br'?response.pipe(createBrotliDecompress()):encoding==='deflate'?response.pipe(createInflate()):response;
        const parts=[];let total=0;
        for await (const chunk of stream) {total+=chunk.length;if(total>3*1024*1024){stream.destroy();response.destroy();throw new Error('Page too large');}parts.push(chunk);}
        resolve({html:Buffer.concat(parts).toString('utf8'),url:url.href});
      }catch(error){reject(error);}
    });
    req.on('error',reject);
  });
}
const entities=value=>String(value||'').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&#(\d+);/g,(_,n)=>Number(n)<=0x10ffff?String.fromCodePoint(Number(n)):'');
function attributes(tag) {
  const attrs={};for(const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) attrs[match[1].toLowerCase()]=entities(match[2]??match[3]??match[4]);
  return attrs;
}
export function numberPrice(raw) {
  if (typeof raw==='number') return Number.isFinite(raw)&&raw>=0?raw:null;
  const value=String(raw??'').trim().replace(/[^\d.,]/g,'');
  if (!value) return null;
  const lastComma=value.lastIndexOf(',');const lastDot=value.lastIndexOf('.');
  let clean=value;
  if(lastComma>=0&&lastDot>=0) clean=lastComma>lastDot?value.replace(/\./g,'').replace(',','.'):value.replace(/,/g,'');
  else if(lastComma>=0) clean=value.replace(',','.');
  const price=Number(clean);return Number.isFinite(price)&&price>=0&&price<1000000?price:null;
}
export function parseMetadata(html,url) {
  const meta={};for(const tag of html.match(/<meta\b[^>]*>/gi)||[]){const a=attributes(tag);meta[a.property||a.name||a.itemprop]=a.content;}
  const nodes=[];
  function walk(obj,depth=0){if(!obj||depth>12)return;if(Array.isArray(obj)){obj.slice(0,200).forEach(v=>walk(v,depth+1));return;}if(typeof obj==='object'){nodes.push(obj);if(obj['@graph'])walk(obj['@graph'],depth+1);if(obj.mainEntity)walk(obj.mainEntity,depth+1);}}
  for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){if(attributes(match[1]).type?.toLowerCase()==='application/ld+json'){try{walk(JSON.parse(match[2]));}catch{/* Malformed merchant data: fall back to Open Graph. */}}}
  const product=nodes.find(n=>[n['@type']].flat().some(t=>t==='Product'||String(t).endsWith('/Product')))||{};
  const offers=Array.isArray(product.offers)?product.offers[0]:product.offers||{};
  const offer=offers.offers?(Array.isArray(offers.offers)?offers.offers[0]:offers.offers):offers;
  let image=Array.isArray(product.image)?product.image[0]:product.image;
  if(typeof image==='object')image=image?.url||image?.contentUrl;
  let name=product.name||meta['og:title']||meta['twitter:title']||html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'';
  if(/captcha|robot check|access denied|just a moment|robot ou humain/i.test(name)) throw new HttpError(422,'La boutique demande une vérification. Ajoute le nom, le prix et l’image manuellement.');
  const price=numberPrice(offer.price??offers.lowPrice??offer.priceSpecification?.price??meta['product:price:amount']??meta['og:price:amount']??meta.price);
  const brand=typeof product.brand==='object'?product.brand?.name:product.brand;
  return {name:entities(name).replace(/<[^>]+>/g,'').trim().slice(0,160),brand:String(brand||meta['og:site_name']||new URL(url).hostname.replace(/^www\./,'')).slice(0,100),image:imageURL(image||meta['og:image']||meta['twitter:image'],url),price,currency:String(offer.priceCurrency||offers.priceCurrency||meta['product:price:currency']||'EUR').toUpperCase().slice(0,3),url,priceCheckedAt:price!==null?new Date().toISOString().slice(0,10):null};
}
export async function importProduct(url) {
  const page=await fetchHTML(url);const data=parseMetadata(page.html,page.url);
  if(!data.name&&!data.image) throw new HttpError(422,'Aucune fiche produit détectée. Tu peux ajouter les informations manuellement.');
  return data;
}
