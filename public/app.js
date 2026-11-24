const $ = selector => document.querySelector(selector);
const dialog = $('#dialog');
const panel = $('#content');
const list = $('#list');
const categories = ['Vélo', 'Karting', 'Maison', 'Tech', 'Autres'];
const state = { gifts: [], category: 'Tout', admin: false, mode: 'loading', busy: false };
const drawings = {
  jersey: '<path d="m12 8 5-3q3 3 6 0l5 3 7 13-5 3-4-7v17H14V17l-4 7-5-3z"/><path d="M20 8v24m-6-3h12"/>',
  gilet: '<path d="m14 6 4-2q2 4 4 0l4 2q-2 8 3 12v15H11V18q5-4 3-12Z"/><path d="M20 7v25m-8-6 4-2m8 0 4 2"/>',
  socks: '<path d="m14 4 11 2-3 17 6 5q3 4-1 7-3 2-7-1l-9-7q-2-2-1-5z"/><path d="m14 10 10 2m-11 2 10 2m-12 7 6 2 3 8"/>',
  rib: '<path d="m12 7 5-2 3 5 3-5 5 2-1 7 6 5-2 12-8 3-3-4-3 4-8-3-2-12 6-5z"/><path d="M20 11v17m-9-9 6 3m-6 2 6 3m6-5 6-3m-6 8 6-3"/>',
  milk: '<path d="M10 11h20l-2 20q-7 5-16 0zM29 14h3q7 7-4 11M8 34h23"/><path d="M14 9c4-2-1-4 3-6m5 6c4-2-1-4 3-6"/>',
  trainer: '<circle cx="16" cy="19" r="9"/><circle cx="16" cy="19" r="3"/><path d="m22 14 6-7 4 3-7 12-8 2m5 1 6 8m-13-5-6 6m18-2 6 2"/>',
  ssd: '<rect x="6" y="9" width="28" height="21" rx="3"/><rect x="11" y="13" width="18" height="10" rx="1"/><path d="M12 27h8m3 0h4"/>',
  camera: '<rect x="5" y="17" width="30" height="15" rx="4"/><rect x="18" y="5" width="12" height="22" rx="6"/><circle cx="24" cy="11" r="3"/><path d="M9 22h5"/>',
  gift: '<path d="M6 17h28v6H6zM9 23v11h22V23M20 17v17"/><path d="M20 17c-13 1-14-11-7-9 4 1 7 9 7 9Zm0 0c13 1 14-11 7-9-4 1-7 9-7 9Z"/>'
};
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function button(label, className, onclick) {
  const node = el('button', className, label);
  node.type = 'button';
  node.addEventListener('click', onclick);
  return node;
}
function httpsURL(value) {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; }
  catch { return ''; }
}
function money(gift) {
  if (gift.price == null) return gift.url ? 'Voir le prix' : 'Budget libre';
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: gift.currency || 'EUR', maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(gift.price);
}
function art(gift) {
  const frame = el('div', 'visual');
  const tile = el('div', 'tile tone-' + gift.category);
  tile.innerHTML = '<svg aria-hidden="true" viewBox="0 0 40 40">' + (drawings[gift.kind] || drawings.gift) + '</svg>';
  frame.append(tile);
  if (httpsURL(gift.image)) {
    const img = new Image();
    img.alt = gift.name;
    img.loading = 'lazy';
    img.addEventListener('error', () => img.remove(), {once:true});
    img.src = gift.image;
    frame.append(img);
  }
  return frame;
}
function shop(gift, label, className) {
  const anchor = el('a', className, label);
  anchor.href = httpsURL(gift.url);
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  return anchor;
}
let toastTimer;
function toast(message) {
  const node = $('#toast');
  node.textContent = message; node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { node.hidden = true; }, 4000);
}
async function api(action, body) {
  const options = {cache:'no-store'};
  if (body) Object.assign(options, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
  const response = await fetch('/api/index?action=' + encodeURIComponent(action), options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Impossible de joindre la liste.');
  return data;
}
function notice(message) {
  $('#notice').textContent = message;
  $('#notice').hidden = !message;
}
function openDialog(title) {
  panel.replaceChildren();
  const heading = el('h3', '', title);
  heading.id = 'dialog-title';
  panel.append(heading);
  if (!dialog.open) dialog.showModal();
}
$('#close').onclick = () => dialog.close();
dialog.addEventListener('click', event => { if (event.target === dialog && !panel.contains(event.target)) { const b = dialog.getBoundingClientRect(); if (event.clientX < b.left || event.clientX > b.right || event.clientY < b.top || event.clientY > b.bottom) dialog.close(); }});
function confirmAction(title, message, label, perform, danger=false) {
  openDialog(title);
  const feedback = el('p', 'status error');
  feedback.setAttribute('role','alert');
  const actions = el('div', 'actions');
  const confirm = button(label, danger ? 'danger' : 'dark', async () => {
    if (confirm.disabled) return;
    confirm.disabled = true;
    try { await perform(); dialog.close(); }
    catch (error) { feedback.textContent = error.message; await refreshQuietly(); }
    finally { confirm.disabled = false; }
  });
  actions.append(confirm,button('Retour','quiet',()=>dialog.close()));
  panel.append(el('p','',message),feedback,actions);
}
function changeGift(gift, action) {
  const releases = action === 'release' || action === 'reset';
  const title = releases ? 'Libérer ce cadeau ?' : 'Je m’en occupe !';
  confirmAction(title, releases ? gift.name + ' redeviendra disponible pour les autres.' : 'En réservant « ' + gift.name + ' », tu indiques aux autres que tu souhaites l’offrir. Tu pourras annuler depuis ce navigateur.', releases ? 'Libérer le cadeau' : 'Confirmer la réservation', async () => {
    const result = await api(action,{id:gift.id});
    state.gifts = result.gifts; paint(); toast(releases ? 'Le cadeau est de nouveau disponible.' : 'Ce cadeau est réservé pour toi.');
  });
}
function details(gift) {
  openDialog(gift.name);
  panel.append(art(gift),el('p','fine-brand',[gift.brand,gift.category].filter(Boolean).join(' · ')),el('p','',gift.subtitle || ''),el('p','detail',gift.note || ''));
  const actions=el('div','actions');
  if (gift.url) actions.append(shop(gift, gift.price == null ? 'Voir le prix en boutique' : money(gift) + ' · Voir en boutique','dark'));
  if (gift.reserved && state.admin) actions.append(button('Libérer la réservation','quiet',()=>changeGift(gift,'reset')));
  panel.append(actions);
}
function row(gift) {
  const article=el('article','row');
  const thumb=button('','thumb',()=>details(gift));
  thumb.setAttribute('aria-label','Aperçu de ' + gift.name);
  const visual=art(gift);
  thumb.append(...Array.from(visual.children));
  const text=el('div','text');
  const name=gift.url ? shop(gift,gift.name,'product-name') : button(gift.name,'product-name',()=>details(gift));
  text.append(el('div','fine-brand',gift.brand || gift.category),name,el('div','detail',gift.subtitle));
  const peek=el('div','peek'); peek.setAttribute('aria-hidden','true'); peek.append(art(gift));
  const price=gift.url && gift.price == null ? shop(gift,money(gift),'price unknown') : el('span',gift.price == null?'price unknown':'price',money(gift));
  const controls=el('div','row-actions');
  const reserveButton=button(gift.mine?'Annuler':gift.reserved?'Réservé':'Je l’offre',gift.mine?'reserve mine':'reserve',()=>changeGift(gift,gift.mine?'release':'reserve'));
  reserveButton.disabled=Boolean((gift.reserved&&!gift.mine)||state.mode==='demo'||state.mode==='offline');
  reserveButton.setAttribute('aria-label',reserveButton.textContent+' · '+gift.name);
  controls.append(reserveButton);
  if (state.admin) controls.append(button('Modifier','quiet',()=>edit(gift)));
  article.append(thumb,text,price,controls,peek);
  return article;
}
function paint() {
  const total=state.gifts.length;
  const available=state.gifts.filter(g=>!g.reserved).length;
  $('#summary').textContent=total+' envie'+(total===1?'':'s')+' dans la liste · '+available+' disponible'+(available===1?'':'s');
  $('#ownerbar').hidden=!state.admin;
  $('#owner').textContent=state.admin?'Mon atelier':'Espace Victor';
  const activeCategories=['Tout',...categories.filter(c=>state.gifts.some(g=>g.category===c))];
  if(!activeCategories.includes(state.category)) state.category='Tout';
  const filters=activeCategories.map(c=>{
    const b=button(c==='Tout'?'Tout voir':c,'chip',()=>{ state.category=c; paint(); [...$('#filters').children].find(n=>n.getAttribute('aria-pressed')==='true')?.focus(); });
    b.setAttribute('aria-pressed',String(c===state.category));return b;
  });
  $('#filters').replaceChildren(...filters);
  const visible=state.gifts.filter(g=>state.category==='Tout'||g.category===state.category);
  list.replaceChildren(...visible.map(row));
  if (!visible.length) list.append(el('p','empty','Aucune envie pour le moment.'));
}
async function refresh() {
  const data=await api('state');
  if (data.mode==='demo') {
    const response=await fetch('/seed.json');
    if(!response.ok)throw new Error('La liste est indisponible.');
    state.gifts=await response.json();
    notice('Aperçu de la liste. Les réservations ouvriront une fois la base de données connectée.');
  } else {
    state.gifts=data.gifts;
    notice(data.mode==='local'?'Aperçu sur ton ordinateur. Les réservations de cet aperçu restent locales.':'');
  }
  state.admin=data.admin;state.mode=data.mode;paint();
}
async function refreshQuietly() {
  try {await refresh();}
  catch {notice('Connexion interrompue. Vérifie la disponibilité avant de réserver.');}
}
function field(form,name,label,type='text',value='') {
  const wrapper=el('label','',label);
  const control=el(type==='textarea'?'textarea':'input');
  if(control.tagName==='INPUT')control.type=type;
  control.name=name;control.value=value??'';
  wrapper.append(control);form.append(wrapper);return control;
}
function login() {
  if(state.admin){$('#ownerbar').scrollIntoView({block:'center'});$('#add').focus();return;}
  if(state.mode==='demo'||state.mode==='offline'){openDialog('Espace Victor');panel.append(el('p','','L’atelier s’ouvre avec le serveur du projet. Les instructions figurent dans le fichier README.'));return;}
  openDialog('Espace Victor');
  const form=el('form','stack');
  const password=field(form,'password','Ton mot de passe','password');
  password.autocomplete='current-password';password.required=true;
  if(state.mode==='local') form.append(el('p','status','Le mot de passe local est affiché dans le terminal au démarrage.'));
  const feedback=el('p','status error');
  const submit=el('button','dark','Ouvrir mon atelier');
  form.append(feedback,submit);panel.append(form);password.focus();
  form.onsubmit=async event=>{
    event.preventDefault();submit.disabled=true;
    try{await api('login',{password:password.value});await refresh();dialog.close();$('#ownerbar').scrollIntoView({block:'center'});}
    catch(error){feedback.textContent=error.message;}finally{submit.disabled=false;}
  };
}
function edit(gift={}) {
  openDialog(gift.id?'Modifier mon envie':'Ajouter une envie');
  const form=el('form','stack');
  const url=field(form,'url','Lien vers la boutique','url',gift.url);
  url.placeholder='https://…';
  const message=el('p','status');
  message.setAttribute('role','status');
  const submit=el('button','dark','Enregistrer');
  const importer=button('Importer depuis le lien','quiet',importLink);
  form.append(importer,message);
  const name=field(form,'name','Nom du cadeau','text',gift.name);name.required=true;name.maxLength=160;
  const pair=el('div','pair');form.append(pair);
  const price=field(pair,'price','Prix','number',gift.price);price.min='0';price.step='.01';price.max='999999';
  const currency=field(pair,'currency','Devise','text',gift.currency||'EUR');currency.pattern='[A-Za-z]{3}';currency.maxLength=3;currency.required=true;
  const image=field(form,'image','Lien de la photo','url',gift.image);
  const brand=field(form,'brand','Marque ou boutique','text',gift.brand);
  const catLabel=el('label','','Catégorie');const category=el('select');category.name='category';
  for(const c of categories){const opt=el('option','',c);opt.value=c;category.append(opt);}
  category.value=gift.category||'Autres';catLabel.append(category);form.append(catLabel);
  field(form,'subtitle','Modèle, couleur ou taille','text',gift.subtitle);
  field(form,'note','Précisions','textarea',gift.note);
  const actions=el('div','actions');actions.append(submit);
  const errors=el('p','status error');errors.setAttribute('role','alert');
  if(gift.id) actions.append(button('Supprimer','danger',()=>confirmAction('Supprimer cette envie ?',gift.name+(gift.reserved?' est déjà réservé. Sa réservation sera supprimée.':' sera retiré de ta liste.'),'Supprimer',async()=>{const result=await api('delete',{id:gift.id});state.gifts=result.gifts;paint();toast('Envie supprimée.');},true)));
  form.append(errors,actions);panel.append(form);
  let importJob=0;
  async function importLink(){
    const link=url.value.trim();if(!httpsURL(link)){message.textContent='Colle un lien HTTPS pour importer la fiche.';return;}
    const job=++importJob;importer.disabled=true;submit.disabled=true;message.textContent='Lecture de la fiche boutique…';
    try{
      const data=await api('metadata',{url:link});
      if(job!==importJob||url.value.trim()!==link)return;
      if(data.name)name.value=data.name;if(data.image)image.value=data.image;if(data.brand)brand.value=data.brand;
      if(data.price!=null){price.value=data.price;currency.value=data.currency||'EUR';}
      else if(link!==gift.url){price.value='';}
      message.textContent='Fiche importée. Vérifie le modèle, la photo et le prix avant d’enregistrer.';
    }catch{if(job===importJob)message.textContent='La boutique n’a pas fourni de fiche utilisable. Le lien est conservé, tu peux compléter les champs.';}
    finally{if(job===importJob){importer.disabled=false;submit.disabled=false;}}
  }
  url.addEventListener('paste',()=>setTimeout(()=>{if(url.validity.valid&&url.value)importLink();},0));
  url.addEventListener('input',()=>{importJob++;importer.disabled=false;submit.disabled=false;message.textContent='';});
  form.onsubmit=async event=>{
    event.preventDefault();if(submit.disabled)return;submit.disabled=true;
    const values=Object.fromEntries(new FormData(form));values.currency=values.currency.toUpperCase();
    try{const result=await api('save',{...values,id:gift.id,kind:gift.kind||'gift'});state.gifts=result.gifts;state.category='Tout';paint();dialog.close();toast('Ta liste est à jour.');}
    catch(error){errors.textContent=error.message;}finally{submit.disabled=false;}
  };
}
$('#owner').onclick=login;
$('#add').onclick=()=>edit();
$('#logout').onclick=async()=>{try{await api('logout',{});await refresh();toast('Atelier fermé.');}catch(error){toast(error.message);}};
$('#share').onclick=async()=>{
  if(state.mode!=='shared'){toast('Le lien à partager sera celui de ton site sur Vercel.');return;}
  const link=location.origin+'/';
  try{await navigator.clipboard.writeText(link);toast('Lien de la liste copié.');}
  catch{openDialog('Partager ma liste');const input=field(panel,'share','Lien à copier','text',link);input.readOnly=true;input.select();}
};
if(window.NOEL_PREVIEW){
  state.mode='offline';state.gifts=window.NOEL_PREVIEW;notice('Aperçu hors ligne. Lance le projet pour tester les réservations et modifier la liste.');paint();
}else{
  refresh().catch(()=>{notice('La liste ne se charge pas.');list.append(button('Réessayer','quiet',refreshQuietly));$('#summary').textContent='Connexion en attente';});
  setInterval(()=>{if(!document.hidden&&!dialog.open&&state.mode==='shared')refreshQuietly();},30000);
  window.addEventListener('focus',()=>{if(!dialog.open&&state.mode==='shared')refreshQuietly();});
}
