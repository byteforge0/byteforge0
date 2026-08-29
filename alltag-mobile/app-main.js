let goldBusy=false;
let syncPushTimer=null;
let syncBusy=false;

function openSheet(name){ui.sheet=name;renderSheet();setTimeout(()=>{const a=document.querySelector('.sheet [autofocus]');if(a)a.focus()},80)}
function closeSheet(){ui.sheet=null;renderSheet()}
function update(mutator,message=''){mutator();saveData();render();if(message)toast(message)}

async function fetchGoldPrice(showToast=false){
  if(goldBusy)return;
  goldBusy=true;
  try{
    const [goldRes,fxRes]=await Promise.all([
      fetch('https://api.gold-api.com/price/XAU',{cache:'no-store'}),
      fetch('https://api.frankfurter.dev/v2/rate/USD/EUR',{cache:'no-store'})
    ]);
    if(!goldRes.ok||!fxRes.ok)throw new Error('price request failed');
    const gold=await goldRes.json(),fx=await fxRes.json();
    const usdPerOz=Number(gold.price),usdToEur=Number(fx.rate);
    if(!usdPerOz||!usdToEur)throw new Error('invalid price');
    market.gold={eurPerGram:usdPerOz*usdToEur/TROY_OUNCE_GRAMS,usdPerOz,usdToEur,updatedAt:gold.updatedAt||new Date().toISOString(),fxDate:fx.date||''};
    saveGoldCache(market.gold);updateGoldDom();if(showToast)toast('Goldpreis aktualisiert');
  }catch{if(showToast)toast(market.gold?'Letzten Goldpreis angezeigt':'Goldpreis gerade nicht erreichbar')}
  finally{goldBusy=false}
}
function updateGoldDom(){document.querySelectorAll('.gold-price').forEach(el=>el.textContent=market.gold?.eurPerGram?`${moneyGold(market.gold.eurPerGram)} / g`:'nicht verfügbar');document.querySelectorAll('.gold-live').forEach(el=>el.textContent=market.gold?.eurPerGram?'live':'↻')}

function getSyncMeta(){try{return JSON.parse(localStorage.getItem(SYNC_META_KEY)||'null')}catch{return null}}
function setSyncMeta(meta){localStorage.setItem(SYNC_META_KEY,JSON.stringify(meta))}
function makeSyncCode(meta){return `ALG1.${meta.blobId}.${meta.key}`}
function parseSyncCode(code){const p=String(code||'').trim().split('.');if(p.length!==3||p[0]!=='ALG1'||!p[1]||!p[2])throw new Error('invalid code');return {blobId:p[1],key:p[2]}}
function bytesToB64url(input){const arr=input instanceof Uint8Array?input:new Uint8Array(input);let binary='';for(let i=0;i<arr.length;i+=8192)binary+=String.fromCharCode(...arr.subarray(i,i+8192));return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function b64urlToBytes(s){let x=String(s).replace(/-/g,'+').replace(/_/g,'/');while(x.length%4)x+='=';const bin=atob(x),out=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out}
async function syncCryptoKey(keyText,usage){return crypto.subtle.importKey('raw',b64urlToBytes(keyText),{name:'AES-GCM'},false,[usage])}
async function encryptSyncPayload(obj,keyText){const iv=crypto.getRandomValues(new Uint8Array(12)),key=await syncCryptoKey(keyText,'encrypt'),plain=new TextEncoder().encode(JSON.stringify(obj)),cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,plain);return {v:1,iv:bytesToB64url(iv),data:bytesToB64url(cipher)}}
async function decryptSyncPayload(payload,keyText){if(!payload||payload.v!==1||!payload.iv||!payload.data)throw new Error('invalid payload');const key=await syncCryptoKey(keyText,'decrypt'),plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64urlToBytes(payload.iv)},key,b64urlToBytes(payload.data));return JSON.parse(new TextDecoder().decode(plain))}
function scheduleCloudPush(){if(!getSyncMeta())return;clearTimeout(syncPushTimer);syncPushTimer=setTimeout(()=>cloudPush(false),900)}
async function cloudPush(showToast=true){
  const meta=getSyncMeta();if(!meta||syncBusy)return false;syncBusy=true;
  try{
    const payload=await encryptSyncPayload(data,meta.key),res=await fetch(`https://jsonblob.com/api/jsonBlob/${encodeURIComponent(meta.blobId)}`,{method:'PUT',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(payload),cache:'no-store'});
    if(!res.ok)throw new Error('push failed');meta.lastSyncAt=new Date().toISOString();setSyncMeta(meta);if(showToast)toast('Synchronisiert');if(ui.sheet==='sync')renderSheet();return true;
  }catch{if(showToast)toast('Cloud-Sync gerade nicht erreichbar');return false}
  finally{syncBusy=false}
}
async function cloudPull(force=false,showToast=false){
  const meta=getSyncMeta();if(!meta||syncBusy)return false;syncBusy=true;
  try{
    const res=await fetch(`https://jsonblob.com/api/jsonBlob/${encodeURIComponent(meta.blobId)}`,{headers:{'Accept':'application/json'},cache:'no-store'});if(!res.ok)throw new Error('pull failed');
    const remote=normalizeData(await decryptSyncPayload(await res.json(),meta.key));
    const remoteTime=Date.parse(remote.meta.updatedAt||0)||0,localTime=Date.parse(data.meta.updatedAt||0)||0;
    if(force||remoteTime>localTime){data=remote;saveData({touch:false,sync:false});render();if(showToast)toast('Stand vom Cloud-Sync geladen')}
    else if(localTime>remoteTime){syncBusy=false;await cloudPush(false);syncBusy=true}
    meta.lastSyncAt=new Date().toISOString();setSyncMeta(meta);if(ui.sheet==='sync')renderSheet();return true;
  }catch{if(showToast)toast('Cloud-Stand konnte nicht geladen werden');return false}
  finally{syncBusy=false}
}
async function createCloudSync(){
  if(syncBusy)return;syncBusy=true;
  try{
    data.meta.updatedAt=new Date().toISOString();localStorage.setItem(STORAGE_KEY,JSON.stringify(data));
    const raw=crypto.getRandomValues(new Uint8Array(32)),key=bytesToB64url(raw),payload=await encryptSyncPayload(data,key);
    const res=await fetch('https://jsonblob.com/api/jsonBlob',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(payload),cache:'no-store'});if(!res.ok)throw new Error('create failed');
    const location=res.headers.get('Location')||res.headers.get('location'),blobId=(location?.split('/').filter(Boolean).pop()||res.headers.get('X-jsonblob')||res.headers.get('x-jsonblob'));
    if(!blobId)throw new Error('no blob id');const meta={blobId,key,lastSyncAt:new Date().toISOString()};setSyncMeta(meta);renderSheet();
    try{await navigator.clipboard.writeText(makeSyncCode(meta));toast('Sync aktiv · Code kopiert')}catch{toast('Cloud-Sync eingerichtet')}
  }catch{toast('Cloud-Sync konnte nicht eingerichtet werden')}
  finally{syncBusy=false}
}
async function connectCloudSync(code){
  const parsed=parseSyncCode(code),res=await fetch(`https://jsonblob.com/api/jsonBlob/${encodeURIComponent(parsed.blobId)}`,{headers:{'Accept':'application/json'},cache:'no-store'});if(!res.ok)throw new Error('not found');
  const remote=normalizeData(await decryptSyncPayload(await res.json(),parsed.key));data=remote;setSyncMeta({...parsed,lastSyncAt:new Date().toISOString()});saveData({touch:false,sync:false});ui.sheet=null;render();toast('Cloud-Stand verbunden')
}

async function clickAction(el){
  const tab=el.closest('[data-tab]')?.dataset.tab;if(tab){ui.tab=tab;render();return}
  const btn=el.closest('[data-action]');if(!btn)return;const a=btn.dataset.action,id=btn.dataset.id;
  if(a==='close-sheet'){closeSheet();return}
  if(a==='open-quick'){openSheet('quick');return}
  if(a==='open-settings'){openSheet('settings');return}
  if(a==='open-sync'){openSheet('sync');return}
  if(a==='set-balance'){openSheet('balance');return}
  if(a==='edit-income'){openSheet('month-income');return}
  if(a==='close-month'){openSheet('close-month');return}
  if(a==='view-archive'){ui.archiveId=id;openSheet('archive');return}
  if(a==='refresh-gold'){await fetchGoldPrice(true);return}
  if(a==='new-expense'){ui.transactionType='expense';openSheet('transaction');return}
  if(a==='new-income'){ui.transactionType='income';openSheet('transaction');return}
  if(a==='new-goal'){openSheet('goal');return}
  if(a==='saving'||a==='saving-first'){ui.goalId=id||data.goals[0]?.id||null;openSheet('saving');return}
  if(a==='car-setup'){openSheet('car-setup');return}
  if(a==='go-car'){ui.tab='car';render();return}
  if(a==='new-fuel'){openSheet('fuel');return}
  if(a==='new-car-expense'){openSheet('car-expense');return}
  if(a==='new-reminder'){openSheet('reminder');return}
  if(a==='new-mood'){openSheet('mood');return}
  if(a==='new-remember'){openSheet('remember');return}
  if(a==='delete-transaction'&&confirm('Eintrag löschen?'))update(()=>data.transactions=data.transactions.filter(x=>x.id!==id),'Gelöscht');
  if(a==='delete-goal'&&confirm('Sparziel samt Verlauf löschen?'))update(()=>{data.goals=data.goals.filter(g=>g.id!==id);data.savingsTransactions=data.savingsTransactions.filter(s=>s.goalId!==id)},'Sparziel gelöscht');
  if(a==='done-reminder')update(()=>{const r=data.carReminders.find(x=>x.id===id);if(r)r.done=true},'Erledigt');
  if(a==='toggle-remember')update(()=>{const r=data.remembers.find(x=>x.id===id);if(r)r.completed=!r.completed});
  if(a==='favorite-remember')update(()=>{const r=data.remembers.find(x=>x.id===id);if(r)r.favorite=!r.favorite});
  if(a==='delete-remember')update(()=>data.remembers=data.remembers.filter(x=>x.id!==id));
  if(a==='remember-filter'){ui.rememberFilter=btn.dataset.value;render();return}
  if(a==='saving-type'){const form=btn.closest('form');form.querySelector('[name="type"]').value=btn.dataset.value;form.querySelectorAll('.segmented button').forEach(x=>x.classList.toggle('active',x===btn));return}
  if(a==='pick-mood'){const form=btn.closest('form');form.querySelector('[name="mood"]').value=btn.dataset.value;form.querySelectorAll('.mood-picker button').forEach(x=>x.classList.toggle('selected',x===btn));return}
  if(a==='pick-category'){const form=btn.closest('form');form.querySelector('[name="category"]').value=btn.dataset.value;form.querySelectorAll('.chip-list button').forEach(x=>x.classList.toggle('active',x===btn));return}
  if(a==='install-help'){ui.sheet='install';renderSheet();return}
  if(a==='sync-create'){await createCloudSync();return}
  if(a==='sync-now'){await cloudPull(false,true);await cloudPush(false);return}
  if(a==='sync-copy'){const sm=getSyncMeta();if(!sm)return;try{await navigator.clipboard.writeText(makeSyncCode(sm));toast('Sync-Code kopiert')}catch{prompt('Sync-Code kopieren:',makeSyncCode(sm))}return}
  if(a==='sync-disconnect'&&confirm('Cloud-Sync auf diesem Gerät trennen? Die lokalen Daten bleiben erhalten.')){localStorage.removeItem(SYNC_META_KEY);renderSheet();toast('Cloud-Sync getrennt');return}
  if(a==='export-data'){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`alltag-backup-${todayISO()}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);toast('Backup erstellt');return}
  if(a==='import-data'){document.getElementById('backup-input').click();return}
  if(a==='reset-data'&&confirm('Wirklich alle lokalen Daten löschen? Cloud-Daten werden nicht gelöscht.')){localStorage.removeItem(STORAGE_KEY);localStorage.removeItem(SYNC_META_KEY);data=normalizeData(null);ui.sheet=null;render();toast('Lokale Daten gelöscht')}
}

document.addEventListener('click',e=>void clickAction(e.target));
document.addEventListener('input',e=>{
  if(e.target.id==='remember-search'){ui.rememberQuery=e.target.value;const pos=e.target.selectionStart;document.getElementById('screen').innerHTML=renderRemember();const input=document.getElementById('remember-search');input.focus();input.setSelectionRange(pos,pos);return}
  if(e.target.name==='energy'){const out=document.getElementById('energy-value');if(out)out.textContent=`${e.target.value}/10`}
  if(e.target.name==='stress'){const out=document.getElementById('stress-value');if(out)out.textContent=`${e.target.value}/10`}
});

document.addEventListener('submit',async e=>{
  const form=e.target;if(!(form instanceof HTMLFormElement)||!form.dataset.form)return;e.preventDefault();const f=Object.fromEntries(new FormData(form));
  switch(form.dataset.form){
    case 'transaction':{const amount=num(f.amount);if(amount<=0)return toast('Betrag fehlt');update(()=>data.transactions.unshift({id:uid(),type:ui.transactionType,amount,category:f.category,note:String(f.note||'').trim()||undefined,date:f.date||defaultFinanceDate(),createdAt:new Date().toISOString()}),'Gespeichert');closeSheet();break}
    case 'balance':{const amount=num(f.amount);update(()=>setMonthAvailable(amount),'Verfügbar aktualisiert');closeSheet();break}
    case 'month-income':{update(()=>{const cfg=ensureMonthConfig();cfg.minijobIncome=Math.max(0,num(f.minijob));cfg.otherSalary=Math.max(0,num(f.otherSalary))},'Gehalt gespeichert');closeSheet();break}
    case 'goal':{if(!String(f.name||'').trim()||num(f.target)<=0)return toast('Name und Zielbetrag fehlen');update(()=>data.goals.unshift({id:uid(),name:String(f.name).trim(),emoji:String(f.emoji||'🎯'),targetAmount:num(f.target),currentAmount:Math.max(0,num(f.current)),monthlyTarget:num(f.monthly)||undefined,createdAt:new Date().toISOString()}),'Sparziel erstellt');closeSheet();break}
    case 'saving':{const amount=num(f.amount),goalId=f.goalIdSelect||f.goalId;if(amount<=0)return toast('Betrag fehlt');update(()=>{const goal=data.goals.find(g=>g.id===goalId);if(!goal)return;const type=f.type==='withdrawal'?'withdrawal':'deposit';goal.currentAmount=Math.max(0,goal.currentAmount+(type==='deposit'?amount:-amount));data.savingsTransactions.unshift({id:uid(),goalId,type,amount,note:String(f.note||'').trim()||undefined,date:defaultFinanceDate()})},'Sparziel aktualisiert');closeSheet();break}
    case 'car':{if(!String(f.make||'').trim()||!String(f.model||'').trim())return toast('Marke und Modell fehlen');update(()=>{data.car={make:String(f.make).trim(),model:String(f.model).trim(),plate:String(f.plate||'').trim().toUpperCase()||undefined,odometer:num(f.odometer)};data.settings.leasingMonthly=Math.max(0,num(f.leasing))},'Auto gespeichert');closeSheet();break}
    case 'fuel':{const odo=num(f.odometer),lit=num(f.liters),total=num(f.total);if(odo<=0||lit<=0||total<=0)return toast('Bitte Werte prüfen');update(()=>{data.fuelEntries.unshift({id:uid(),odometer:odo,liters:lit,totalPrice:total,pricePerLiter:total/lit,fullTank:!!f.full,station:String(f.station||'').trim()||undefined,date:f.date||defaultFinanceDate()});if(data.car)data.car.odometer=Math.max(data.car.odometer,odo)},'Tankvorgang gespeichert');closeSheet();break}
    case 'car-expense':{const amount=num(f.amount);if(amount<=0)return toast('Betrag fehlt');update(()=>data.carExpenses.unshift({id:uid(),category:f.category,amount,note:String(f.note||'').trim()||undefined,date:f.date||defaultFinanceDate()}),'Kosten gespeichert');closeSheet();break}
    case 'reminder':{if(!String(f.title||'').trim()||(!f.dueDate&&!num(f.dueOdometer)))return toast('Datum oder Kilometer fehlt');update(()=>data.carReminders.unshift({id:uid(),title:String(f.title).trim(),dueDate:f.dueDate||undefined,dueOdometer:num(f.dueOdometer)||undefined,done:false}),'Erinnerung gespeichert');closeSheet();break}
    case 'mood':{const existing=data.moods.find(m=>m.date===todayISO());const entry={id:existing?.id||uid(),date:todayISO(),mood:Number(f.mood),sleepHours:num(f.sleep)||undefined,energy:Number(f.energy)||undefined,stress:Number(f.stress)||undefined,note:String(f.note||'').trim()||undefined};update(()=>{data.moods=[entry,...data.moods.filter(m=>m.date!==todayISO())]},'Tag gespeichert');closeSheet();break}
    case 'remember':{if(!String(f.text||'').trim())return toast('Schreib kurz etwas rein');update(()=>data.remembers.unshift({id:uid(),text:String(f.text).trim(),category:f.category,favorite:false,completed:false,createdAt:new Date().toISOString()}),'Gemerkt');closeSheet();break}
    case 'close-month':{const closingKey=activeMonthKey();update(()=>closeActiveMonth(!!f.carry),`${monthName(closingKey)} gespeichert`);ui.tab='money';closeSheet();break}
    case 'sync-connect':{if(!String(f.code||'').trim())return toast('Sync-Code fehlt');if(!confirm('Der Cloud-Stand ersetzt die lokalen Daten auf diesem Gerät. Fortfahren?'))return;try{await connectCloudSync(f.code)}catch{toast('Sync-Code ungültig oder Cloud-Stand nicht erreichbar')}break}
    case 'settings':{update(()=>{data.settings.name=String(f.name||'').trim();data.settings.leasingMonthly=Math.max(0,num(f.leasing))},'Einstellungen gespeichert');closeSheet();break}
  }
});

document.getElementById('backup-input').addEventListener('change',async e=>{
  const file=e.target.files?.[0];if(!file)return;try{const parsed=JSON.parse(await file.text());data=normalizeData(parsed);saveData();ui.sheet=null;render();toast('Backup importiert')}catch{toast('Backup konnte nicht gelesen werden')}e.target.value='';
});

if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
window.addEventListener('online',()=>{fetchGoldPrice(false);cloudPull(false,false)});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){fetchGoldPrice(false);cloudPull(false,false)}});
setInterval(()=>fetchGoldPrice(false),5*60*1000);
setInterval(()=>cloudPull(false,false),90*1000);

render();
fetchGoldPrice(false);
if(getSyncMeta())setTimeout(()=>cloudPull(false,false),500);
