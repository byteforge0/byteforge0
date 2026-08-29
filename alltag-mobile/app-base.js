'use strict';

const STORAGE_KEY='alltag:data:v1';
const SYNC_META_KEY='alltag:sync:v1';
const GOLD_CACHE_KEY='alltag:gold:v1';
const FIXED_SALARY=789.55;
const TROY_OUNCE_GRAMS=31.1034768;

function currentMonthKey(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`}
function defaultMonthConfig(){return {balanceAdjustment:0,minijobIncome:0,otherSalary:0,closed:false}}
const emptyData={
  transactions:[],goals:[],savingsTransactions:[],car:null,fuelEntries:[],carExpenses:[],carReminders:[],moods:[],remembers:[],monthArchives:[],
  settings:{monthlyBudget:1200,currency:'EUR',name:'',activeMonth:'',leasingMonthly:0,monthConfigs:{}},
  meta:{updatedAt:''}
};

function clone(v){return JSON.parse(JSON.stringify(v))}
function normalizeData(raw){
  const source=raw&&typeof raw==='object'?raw:{};
  const out=clone(emptyData);
  for(const k of ['transactions','goals','savingsTransactions','fuelEntries','carExpenses','carReminders','moods','remembers','monthArchives']){
    out[k]=Array.isArray(source[k])?source[k]:[];
  }
  out.car=source.car&&typeof source.car==='object'?source.car:null;
  out.settings={...out.settings,...(source.settings||{})};
  out.settings.monthConfigs=source.settings?.monthConfigs&&typeof source.settings.monthConfigs==='object'?source.settings.monthConfigs:{};
  out.meta={...out.meta,...(source.meta||{})};
  if(!out.settings.activeMonth)out.settings.activeMonth=currentMonthKey();
  if(!out.settings.monthConfigs[out.settings.activeMonth]){
    const cfg=defaultMonthConfig();
    if(!source.settings?.monthConfigs){
      const oldBudget=Number(source.settings?.monthlyBudget);
      if(Number.isFinite(oldBudget)&&oldBudget>0)cfg.balanceAdjustment=oldBudget-FIXED_SALARY;
    }
    out.settings.monthConfigs[out.settings.activeMonth]=cfg;
  }
  for(const [key,cfg] of Object.entries(out.settings.monthConfigs))out.settings.monthConfigs[key]={...defaultMonthConfig(),...(cfg||{})};
  out.settings.leasingMonthly=Math.max(0,Number(out.settings.leasingMonthly)||0);
  out.meta.updatedAt=out.meta.updatedAt||new Date().toISOString();
  return out;
}
function loadData(){try{const raw=localStorage.getItem(STORAGE_KEY);return normalizeData(raw?JSON.parse(raw):null)}catch{return normalizeData(null)}}
let data=loadData();
let ui={tab:'home',sheet:null,goalId:null,archiveId:null,transactionType:'expense',rememberFilter:'Offen',rememberQuery:''};
let market={gold:loadGoldCache()};

const expenseCategories=['Essen','Auto','Shopping','Freizeit','Haushalt','Rechnungen','Abos','Gesundheit','Reisen','Familie','Sonstiges'];
const incomeCategories=['Gehalt','Nebenjob','Rückzahlung','Verkauf','Geschenk','Sonstiges'];
const rememberCategories=['Gedanke','Aufgabe','Kaufen','Film','Ort','Person','Idee','Später','Sonstiges'];
const moodEmoji={1:'😭',2:'😕',3:'😐',4:'🙂',5:'😍'};
const categoryEmoji={Essen:'🍜',Auto:'🚗',Shopping:'🛍️',Freizeit:'🎟️',Haushalt:'🏠',Rechnungen:'🧾',Abos:'🔁',Gesundheit:'💊',Reisen:'✈️',Familie:'👨‍👩‍👧',Sonstiges:'•'};
const rememberEmoji={Gedanke:'💭',Aufgabe:'✓',Kaufen:'🛒',Film:'🎬',Ort:'📍',Person:'👤',Idee:'💡',Später:'⏳',Sonstiges:'•'};

function saveData({touch=true,sync=true}={}){
  if(touch)data.meta.updatedAt=new Date().toISOString();
  localStorage.setItem(STORAGE_KEY,JSON.stringify(data));
  if(sync&&typeof scheduleCloudPush==='function')scheduleCloudPush();
}
function uid(){return crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(16).slice(2)}`}
function todayISO(){const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)}
function money(n){return new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR',maximumFractionDigits:2}).format(Number(n)||0)}
function moneyGold(n){return new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(n)||0)}
function dateLabel(s,opts={day:'2-digit',month:'short'}){return new Intl.DateTimeFormat('de-DE',opts).format(new Date(`${s}T12:00:00`))}
function monthName(key=activeMonthKey()){return new Intl.DateTimeFormat('de-DE',{month:'long',year:'numeric'}).format(new Date(`${key}-01T12:00:00`))}
function monthShortName(key=activeMonthKey()){return new Intl.DateTimeFormat('de-DE',{month:'long'}).format(new Date(`${key}-01T12:00:00`))}
function monthLabel(key=activeMonthKey()){return monthName(key)}
function monthKeyOf(s){return String(s||'').slice(0,7)}
function sameMonth(s,base=new Date()){const d=new Date(`${s}T12:00:00`);return d.getMonth()===base.getMonth()&&d.getFullYear()===base.getFullYear()}
function sameMonthKey(s,key=activeMonthKey()){return monthKeyOf(s)===key}
function sameWeek(s){const d=new Date(`${s}T12:00:00`),b=new Date(),day=(b.getDay()+6)%7,m=new Date(b);m.setHours(0,0,0,0);m.setDate(b.getDate()-day);const e=new Date(m);e.setDate(m.getDate()+7);return d>=m&&d<e}
function activeMonthKey(){return data.settings.activeMonth||currentMonthKey()}
function ensureMonthConfig(key=activeMonthKey()){if(!data.settings.monthConfigs[key])data.settings.monthConfigs[key]=defaultMonthConfig();return data.settings.monthConfigs[key]}
function peekMonthConfig(key=activeMonthKey()){return {...defaultMonthConfig(),...(data.settings.monthConfigs[key]||{})}}
function shiftMonthKey(key,delta){const d=new Date(`${key}-01T12:00:00`);d.setMonth(d.getMonth()+delta);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`}
function defaultFinanceDate(){const key=activeMonthKey();return key===currentMonthKey()?todayISO():`${key}-01`}
function esc(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function num(v){let s=String(v??'').trim().replace(/[€\s]/g,'');if(!s)return 0;if(s.includes('.')&&s.includes(','))s=s.replace(/\./g,'').replace(',','.');else if(s.includes(','))s=s.replace(',','.');else if(/^\d{1,3}(?:\.\d{3})+$/.test(s))s=s.replace(/\./g,'');const n=Number(s);return Number.isFinite(n)?n:0}
function percent(current,target){return target?Math.min(100,Math.max(0,Math.round(current/target*100))):0}
function progress(v){return `<div class="progress"><span style="width:${Math.max(0,Math.min(100,v*100))}%"></span></div>`}
function sum(items,field='amount'){return items.reduce((a,b)=>a+(Number(b[field])||0),0)}

function monthSummary(key=activeMonthKey(),ignoreAdjustment=false){
  const cfg=peekMonthConfig(key);
  const tx=data.transactions.filter(t=>sameMonthKey(t.date,key));
  const generalExpenses=sum(tx.filter(t=>t.type==='expense'));
  const txIncome=sum(tx.filter(t=>t.type==='income'));
  const fuel=sum(data.fuelEntries.filter(f=>sameMonthKey(f.date,key)),'totalPrice');
  const carOther=sum(data.carExpenses.filter(x=>sameMonthKey(x.date,key)));
  const leasing=Number(data.settings.leasingMonthly)||0;
  const savingRows=data.savingsTransactions.filter(s=>sameMonthKey(s.date,key));
  const savingDeposits=sum(savingRows.filter(s=>s.type==='deposit'));
  const savingWithdrawals=sum(savingRows.filter(s=>s.type==='withdrawal'));
  const savingsNet=savingDeposits-savingWithdrawals;
  const fixedSalary=FIXED_SALARY;
  const minijob=Number(cfg.minijobIncome)||0;
  const otherSalary=Number(cfg.otherSalary)||0;
  const totalIncome=fixedSalary+minijob+otherSalary+txIncome;
  const totalCar=fuel+carOther+leasing;
  const totalExpenses=generalExpenses+totalCar;
  const adjustment=ignoreAdjustment?0:(Number(cfg.balanceAdjustment)||0);
  const available=adjustment+totalIncome-totalExpenses-savingsNet;
  return {key,cfg,fixedSalary,minijob,otherSalary,txIncome,totalIncome,generalExpenses,fuel,carOther,leasing,totalCar,totalExpenses,savingDeposits,savingWithdrawals,savingsNet,adjustment,available};
}
function setMonthAvailable(amount,key=activeMonthKey()){
  const without=monthSummary(key,true);
  ensureMonthConfig(key).balanceAdjustment=Number(amount)-without.available;
}
function closeActiveMonth(carry=false){
  const key=activeMonthKey(),summary=monthSummary(key);
  const existing=data.monthArchives.find(a=>a.monthKey===key);
  const archive={id:existing?.id||uid(),monthKey:key,closedAt:new Date().toISOString(),summary:{...summary,cfg:clone(summary.cfg)},transactions:clone(data.transactions.filter(t=>sameMonthKey(t.date,key))),fuelEntries:clone(data.fuelEntries.filter(f=>sameMonthKey(f.date,key))),carExpenses:clone(data.carExpenses.filter(x=>sameMonthKey(x.date,key))),savingsTransactions:clone(data.savingsTransactions.filter(s=>sameMonthKey(s.date,key)))};
  data.monthArchives=[archive,...data.monthArchives.filter(a=>a.monthKey!==key)].sort((a,b)=>b.monthKey.localeCompare(a.monthKey));
  ensureMonthConfig(key).closed=true;
  const next=shiftMonthKey(key,1);
  data.settings.activeMonth=next;
  const nextCfg=ensureMonthConfig(next);
  if(carry)nextCfg.balanceAdjustment=summary.available;
  return {archive,next};
}

function loadGoldCache(){try{return JSON.parse(localStorage.getItem(GOLD_CACHE_KEY)||'null')}catch{return null}}
function saveGoldCache(v){try{localStorage.setItem(GOLD_CACHE_KEY,JSON.stringify(v))}catch{}}
function goldTicker(){const g=market.gold;return `<button class="gold-strip" data-action="refresh-gold" aria-label="Goldpreis aktualisieren"><span class="gold-dot">●</span><span>Gold 24K</span><strong class="gold-price">${g?.eurPerGram?`${moneyGold(g.eurPerGram)} / g`:'wird geladen …'}</strong><span class="gold-live">${g?.eurPerGram?'live':'↻'}</span></button>`}
function pageHeader(title,eyebrow='',settings=false){return `<header class="page-header"><div>${eyebrow?`<div class="eyebrow">${esc(eyebrow)}</div>`:''}<h1>${esc(title)}</h1></div>${settings?'<button class="icon-button" data-action="open-settings" aria-label="Einstellungen">⚙</button>':''}</header>${goldTicker()}`}
function sectionTitle(title,action='',event=''){return `<div class="section-title"><h2>${esc(title)}</h2>${action?`<button data-action="${event}">${esc(action)}</button>`:''}</div>`}
function emptyCard(icon,title,text,action=''){return `<button class="card empty-card" ${action?`data-action="${action}"`:''}><span class="empty-icon">${icon}</span><div><strong>${esc(title)}</strong><span>${esc(text)}</span></div>${action?'<span>›</span>':''}</button>`}
function toast(message){const old=document.querySelector('.toast');if(old)old.remove();const el=document.createElement('div');el.className='toast';el.textContent=message;document.body.append(el);setTimeout(()=>el.remove(),1900)}

function render(){
  const screen=document.getElementById('screen');
  screen.innerHTML=ui.tab==='home'?renderHome():ui.tab==='money'?renderMoney():ui.tab==='car'?renderCar():ui.tab==='day'?renderDay():renderRemember();
  document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===ui.tab));
  renderSheet();
}

function renderHome(){
  const now=new Date(),h=now.getHours(),greeting=h<11?'Guten Morgen':h<18?'Guten Tag':'Guten Abend';
  const key=activeMonthKey(),summary=monthSummary(key);
  const todaySpend=data.transactions.filter(t=>t.type==='expense'&&t.date===todayISO()).reduce((a,b)=>a+b.amount,0)+data.fuelEntries.filter(f=>f.date===todayISO()).reduce((a,b)=>a+b.totalPrice,0)+data.carExpenses.filter(x=>x.date===todayISO()).reduce((a,b)=>a+b.amount,0);
  const goal=data.goals[0];
  const mood=data.moods.find(m=>m.date===todayISO());
  const recent=data.remembers.filter(r=>!r.completed).slice(0,2);
  const needsClose=currentMonthKey()!==key&&!peekMonthConfig(key).closed;
  return `${pageHeader(data.settings.name?`${greeting}, ${data.settings.name}`:greeting,new Intl.DateTimeFormat('de-DE',{weekday:'long',day:'numeric',month:'long'}).format(now),true)}
  ${needsClose?`<button class="month-alert" data-action="close-month"><span>Monat offen</span><strong>${esc(monthName(key))} abschließen</strong><span>›</span></button>`:''}
  <section class="hero-balance card">
    <div class="hero-topline"><div class="card-kicker">Noch verfügbar im ${esc(monthShortName(key))}</div><button class="tiny-action" data-action="set-balance">Bearbeiten</button></div>
    <div class="hero-number ${summary.available<0?'negative':''}">${money(summary.available)}</div>
    <div class="budget-row"><span>${money(summary.totalIncome)} Einnahmen</span><span>${money(summary.totalExpenses+Math.max(0,summary.savingsNet))} verplant</span></div>
    <div class="balance-breakdown"><span>Schmetterling ${money(FIXED_SALARY)}</span>${summary.minijob?`<span>Minijob ${money(summary.minijob)}</span>`:''}</div>
  </section>
  <div class="two-up">
    <button class="mini-card" data-action="new-expense"><span class="mini-label">Heute</span><strong>${money(todaySpend)}</strong><span class="mini-foot">ausgegeben</span></button>
    <button class="mini-card" data-action="new-mood"><span class="mini-label">Dein Tag</span><strong class="mood-large">${mood?moodEmoji[mood.mood]:'–'}</strong><span class="mini-foot">${mood?'eingetragen':'kurz eintragen'}</span></button>
  </div>
  ${sectionTitle('Sparziel',goal?'Einzahlen':'Erstellen',goal?'saving-first':'new-goal')}
  ${goal?`<button class="card goal-card" data-tab="money"><div class="goal-top"><span class="goal-emoji">${esc(goal.emoji||'🎯')}</span><div><strong>${esc(goal.name)}</strong><span>${money(goal.currentAmount)} von ${money(goal.targetAmount)}</span></div><span class="percent">${percent(goal.currentAmount,goal.targetAmount)}%</span></div>${progress(goal.currentAmount/goal.targetAmount)}<div class="goal-bottom"><span>Noch ${money(Math.max(0,goal.targetAmount-goal.currentAmount))}</span>${goal.monthlyTarget?`<span>${money(goal.monthlyTarget)}/Monat</span>`:''}</div></button>`:emptyCard('🎯','Wofür möchtest du sparen?','Lege dein erstes Sparziel an.','new-goal')}
  ${sectionTitle('Auto',data.car?'Öffnen':'Einrichten',data.car?'go-car':'car-setup')}
  ${data.car?`<button class="card compact-row" data-tab="car"><div class="round-icon">🚗</div><div class="grow"><strong>${esc(data.car.make)} ${esc(data.car.model)}</strong><span>${Number(data.car.odometer).toLocaleString('de-DE')} km · ${money(summary.totalCar)} im ${esc(monthShortName(key))}</span></div><span>›</span></button>`:emptyCard('🚗','Noch kein Auto','Kilometer, Tanken und Kosten verfolgen.','car-setup')}
  ${sectionTitle('Merken','Neu','new-remember')}
  ${recent.length?`<div class="card list-card">${recent.map(r=>`<button class="remember-preview" data-tab="remember"><span>${rememberEmoji[r.category]||'•'}</span><span>${esc(r.text)}</span><span>›</span></button>`).join('')}</div>`:emptyCard('🧠','Nichts im Kopf behalten müssen','Gedanken, Käufe oder Orte in Sekunden speichern.','new-remember')}`;
}

function renderMoney(){
  const key=activeMonthKey(),summary=monthSummary(key),cfg=peekMonthConfig(key);
  const tx=data.transactions.filter(t=>sameMonthKey(t.date,key));
  const archives=data.monthArchives.slice(0,12);
  return `${pageHeader('Geld',monthLabel(key))}
  <section class="card available-card"><div><span>Noch verfügbar</span><strong class="${summary.available<0?'negative':''}">${money(summary.available)}</strong></div><button data-action="set-balance">Betrag setzen</button></section>
  <div class="summary-grid"><div class="summary-card"><span>Einnahmen</span><strong>${money(summary.totalIncome)}</strong></div><div class="summary-card"><span>Ausgaben</span><strong>${money(summary.totalExpenses)}</strong></div><div class="summary-card"><span>Auto</span><strong>${money(summary.totalCar)}</strong></div><div class="summary-card"><span>Gespart</span><strong>${money(summary.savingsNet)}</strong></div></div>
  ${sectionTitle('Gehalt','Bearbeiten','edit-income')}
  <button class="card income-card" data-action="edit-income"><div class="income-line"><span>Schmetterling International</span><strong>+ ${money(FIXED_SALARY)}</strong></div><div class="income-line"><span>Minijob</span><strong>${cfg.minijobIncome?`+ ${money(cfg.minijobIncome)}`:'Eintragen'}</strong></div><div class="income-line"><span>Weiteres Gehalt</span><strong>${cfg.otherSalary?`+ ${money(cfg.otherSalary)}`:'–'}</strong></div><div class="income-hint">Die 789,55 € werden jeden Monat automatisch gerechnet.</div></button>
  <div class="action-row"><button class="primary-action" data-action="new-expense">− Ausgabe</button><button class="secondary-action" data-action="new-income">+ Einnahme</button></div>
  ${sectionTitle('Sparziele','Neues Ziel','new-goal')}
  ${data.goals.length?`<div class="stack">${data.goals.map(g=>`<div class="card savings-item"><div class="goal-top"><span class="goal-emoji">${esc(g.emoji||'🎯')}</span><div class="grow"><strong>${esc(g.name)}</strong><span>${money(g.currentAmount)} / ${money(g.targetAmount)}</span></div><span class="percent">${percent(g.currentAmount,g.targetAmount)}%</span></div>${progress(g.currentAmount/g.targetAmount)}<div class="inline-buttons"><button data-action="saving" data-id="${g.id}">Ein-/Auszahlen</button><button class="danger-text" data-action="delete-goal" data-id="${g.id}">Löschen</button></div></div>`).join('')}</div>`:emptyCard('🎯','Noch kein Sparziel','Zum Beispiel Urlaub, Auto oder Notgroschen.','new-goal')}
  ${sectionTitle('Monatsabschluss')}
  <button class="card close-month-card" data-action="close-month"><div><strong>${esc(monthName(key))}</strong><span>Speichern und nächsten Monat starten</span></div><span>›</span></button>
  ${archives.length?`<div class="archive-list">${archives.map(a=>`<button class="archive-row" data-action="view-archive" data-id="${a.id}"><div><strong>${esc(monthName(a.monthKey))}</strong><span>${money(a.summary?.totalExpenses||0)} Ausgaben · ${money(a.summary?.totalIncome||0)} Einnahmen</span></div><strong class="${Number(a.summary?.available)<0?'negative':''}">${money(a.summary?.available||0)}</strong></button>`).join('')}</div>`:''}
  ${sectionTitle('Buchungen')}
  ${tx.length?`<div class="card transaction-list">${tx.slice(0,25).map(t=>`<div class="transaction-row"><span class="txn-icon ${t.type}">${t.type==='expense'?(categoryEmoji[t.category]||'•'):'↗'}</span><div class="grow"><strong>${esc(t.note||t.category)}</strong><span>${esc(t.category)} · ${dateLabel(t.date)}</span></div><div class="txn-amount ${t.type}">${t.type==='expense'?'−':'+'}${money(t.amount)}</div><button class="row-delete" data-action="delete-transaction" data-id="${t.id}">⌫</button></div>`).join('')}</div>`:emptyCard('💶','Noch keine Buchungen','Deine Ausgaben und Einnahmen erscheinen hier.','new-expense')}`;
}
