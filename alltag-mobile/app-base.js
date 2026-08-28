'use strict';

const STORAGE_KEY='alltag:data:v1';
const emptyData={
  transactions:[],goals:[],savingsTransactions:[],car:null,fuelEntries:[],carExpenses:[],carReminders:[],moods:[],remembers:[],
  settings:{monthlyBudget:1200,currency:'EUR',name:''}
};
let data=loadData();
let ui={tab:'home',sheet:null,goalId:null,transactionType:'expense',rememberFilter:'Offen',rememberQuery:''};

const expenseCategories=['Essen','Auto','Shopping','Freizeit','Haushalt','Rechnungen','Abos','Gesundheit','Reisen','Familie','Sonstiges'];
const incomeCategories=['Gehalt','Nebenjob','Rückzahlung','Verkauf','Geschenk','Sonstiges'];
const rememberCategories=['Gedanke','Aufgabe','Kaufen','Film','Ort','Person','Idee','Später','Sonstiges'];
const moodEmoji={1:'😭',2:'😕',3:'😐',4:'🙂',5:'😍'};
const categoryEmoji={Essen:'🍜',Auto:'🚗',Shopping:'🛍️',Freizeit:'🎟️',Haushalt:'🏠',Rechnungen:'🧾',Abos:'🔁',Gesundheit:'💊',Reisen:'✈️',Familie:'👨‍👩‍👧',Sonstiges:'•'};
const rememberEmoji={Gedanke:'💭',Aufgabe:'✓',Kaufen:'🛒',Film:'🎬',Ort:'📍',Person:'👤',Idee:'💡',Später:'⏳',Sonstiges:'•'};

function clone(v){return JSON.parse(JSON.stringify(v))}
function loadData(){try{const raw=localStorage.getItem(STORAGE_KEY);return raw?Object.assign(clone(emptyData),JSON.parse(raw)):clone(emptyData)}catch{return clone(emptyData)}}
function saveData(){localStorage.setItem(STORAGE_KEY,JSON.stringify(data))}
function uid(){return crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(16).slice(2)}`}
function todayISO(){const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)}
function money(n){return new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR',maximumFractionDigits:2}).format(Number(n)||0)}
function dateLabel(s,opts={day:'2-digit',month:'short'}){return new Intl.DateTimeFormat('de-DE',opts).format(new Date(`${s}T12:00:00`))}
function monthLabel(){return new Intl.DateTimeFormat('de-DE',{month:'long',year:'numeric'}).format(new Date())}
function sameMonth(s,base=new Date()){const d=new Date(`${s}T12:00:00`);return d.getMonth()===base.getMonth()&&d.getFullYear()===base.getFullYear()}
function sameWeek(s){const d=new Date(`${s}T12:00:00`),b=new Date(),day=(b.getDay()+6)%7,m=new Date(b);m.setHours(0,0,0,0);m.setDate(b.getDate()-day);const e=new Date(m);e.setDate(m.getDate()+7);return d>=m&&d<e}
function esc(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function num(v){return Number(String(v||'').replace(',','.'))||0}
function percent(current,target){return target?Math.min(100,Math.max(0,Math.round(current/target*100))):0}
function progress(v){return `<div class="progress"><span style="width:${Math.max(0,Math.min(100,v*100))}%"></span></div>`}
function pageHeader(title,eyebrow='',settings=false){return `<header class="page-header"><div>${eyebrow?`<div class="eyebrow">${esc(eyebrow)}</div>`:''}<h1>${esc(title)}</h1></div>${settings?'<button class="icon-button" data-action="open-settings" aria-label="Einstellungen">⚙</button>':''}</header>`}
function sectionTitle(title,action='',event=''){return `<div class="section-title"><h2>${esc(title)}</h2>${action?`<button data-action="${event}">${esc(action)}</button>`:''}</div>`}
function emptyCard(icon,title,text,action=''){return `<button class="card empty-card" ${action?`data-action="${action}"`:''}><span class="empty-icon">${icon}</span><div><strong>${esc(title)}</strong><span>${esc(text)}</span></div>${action?'<span>›</span>':''}</button>`}
function toast(message){const old=document.querySelector('.toast');if(old)old.remove();const el=document.createElement('div');el.className='toast';el.textContent=message;document.body.append(el);setTimeout(()=>el.remove(),1600)}

function render(){
  const screen=document.getElementById('screen');
  screen.innerHTML=ui.tab==='home'?renderHome():ui.tab==='money'?renderMoney():ui.tab==='car'?renderCar():ui.tab==='day'?renderDay():renderRemember();
  document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===ui.tab));
  renderSheet();
}

function renderHome(){
  const now=new Date(),h=now.getHours(),greeting=h<11?'Guten Morgen':h<18?'Guten Tag':'Guten Abend';
  const expenses=data.transactions.filter(t=>t.type==='expense');
  const todaySpend=expenses.filter(t=>t.date===todayISO()).reduce((a,b)=>a+b.amount,0);
  const monthSpend=expenses.filter(t=>sameMonth(t.date)).reduce((a,b)=>a+b.amount,0);
  const remaining=data.settings.monthlyBudget-monthSpend;
  const goal=data.goals[0];
  const mood=data.moods.find(m=>m.date===todayISO());
  const recent=data.remembers.filter(r=>!r.completed).slice(0,2);
  return `${pageHeader(data.settings.name?`${greeting}, ${data.settings.name}`:greeting,new Intl.DateTimeFormat('de-DE',{weekday:'long',day:'numeric',month:'long'}).format(now),true)}
  <button class="hero-balance card" data-tab="money">
    <div class="card-kicker">Noch verfügbar im ${new Intl.DateTimeFormat('de-DE',{month:'long'}).format(now)}</div>
    <div class="hero-number ${remaining<0?'negative':''}">${money(remaining)}</div>
    <div class="budget-row"><span>${money(monthSpend)} ausgegeben</span><span>von ${money(data.settings.monthlyBudget)}</span></div>
    ${progress(data.settings.monthlyBudget?monthSpend/data.settings.monthlyBudget:0)}
  </button>
  <div class="two-up">
    <button class="mini-card" data-action="new-expense"><span class="mini-label">Heute</span><strong>${money(todaySpend)}</strong><span class="mini-foot">ausgegeben</span></button>
    <button class="mini-card" data-action="new-mood"><span class="mini-label">Dein Tag</span><strong class="mood-large">${mood?moodEmoji[mood.mood]:'–'}</strong><span class="mini-foot">${mood?'eingetragen':'kurz eintragen'}</span></button>
  </div>
  ${sectionTitle('Sparziel',goal?'Einzahlen':'Erstellen',goal?'saving-first':'new-goal')}
  ${goal?`<button class="card goal-card" data-tab="money"><div class="goal-top"><span class="goal-emoji">${esc(goal.emoji||'🎯')}</span><div><strong>${esc(goal.name)}</strong><span>${money(goal.currentAmount)} von ${money(goal.targetAmount)}</span></div><span class="percent">${percent(goal.currentAmount,goal.targetAmount)}%</span></div>${progress(goal.currentAmount/goal.targetAmount)}<div class="goal-bottom"><span>Noch ${money(Math.max(0,goal.targetAmount-goal.currentAmount))}</span>${goal.monthlyTarget?`<span>${money(goal.monthlyTarget)}/Monat</span>`:''}</div></button>`:emptyCard('🎯','Wofür möchtest du sparen?','Lege dein erstes Sparziel an.','new-goal')}
  ${sectionTitle('Auto',data.car?'Öffnen':'Einrichten',data.car?'go-car':'car-setup')}
  ${data.car?`<button class="card compact-row" data-tab="car"><div class="round-icon">🚗</div><div class="grow"><strong>${esc(data.car.make)} ${esc(data.car.model)}</strong><span>${Number(data.car.odometer).toLocaleString('de-DE')} km</span></div><span>›</span></button>`:emptyCard('🚗','Noch kein Auto','Kilometer, Tanken und Kosten verfolgen.','car-setup')}
  ${sectionTitle('Merken','Neu','new-remember')}
  ${recent.length?`<div class="card list-card">${recent.map(r=>`<button class="remember-preview" data-tab="remember"><span>${rememberEmoji[r.category]||'•'}</span><span>${esc(r.text)}</span><span>›</span></button>`).join('')}</div>`:emptyCard('🧠','Nichts im Kopf behalten müssen','Gedanken, Käufe oder Orte in Sekunden speichern.','new-remember')}`;
}

function renderMoney(){
  const expenses=data.transactions.filter(t=>t.type==='expense'&&sameMonth(t.date));
  const income=data.transactions.filter(t=>t.type==='income'&&sameMonth(t.date));
  const spent=expenses.reduce((a,b)=>a+b.amount,0),earned=income.reduce((a,b)=>a+b.amount,0),week=data.transactions.filter(t=>t.type==='expense'&&sameWeek(t.date)).reduce((a,b)=>a+b.amount,0);
  return `${pageHeader('Geld',monthLabel())}
  <div class="summary-grid"><div class="summary-card"><span>Ausgegeben</span><strong>${money(spent)}</strong></div><div class="summary-card"><span>Einnahmen</span><strong>${money(earned)}</strong></div><div class="summary-card"><span>Diese Woche</span><strong>${money(week)}</strong></div><div class="summary-card"><span>Übrig</span><strong>${money(data.settings.monthlyBudget-spent)}</strong></div></div>
  <div class="action-row"><button class="primary-action" data-action="new-expense">− Ausgabe</button><button class="secondary-action" data-action="new-income">+ Einnahme</button></div>
  ${sectionTitle('Sparziele','Neues Ziel','new-goal')}
  ${data.goals.length?`<div class="stack">${data.goals.map(g=>`<div class="card savings-item"><div class="goal-top"><span class="goal-emoji">${esc(g.emoji||'🎯')}</span><div class="grow"><strong>${esc(g.name)}</strong><span>${money(g.currentAmount)} / ${money(g.targetAmount)}</span></div><span class="percent">${percent(g.currentAmount,g.targetAmount)}%</span></div>${progress(g.currentAmount/g.targetAmount)}<div class="inline-buttons"><button data-action="saving" data-id="${g.id}">Ein-/Auszahlen</button><button class="danger-text" data-action="delete-goal" data-id="${g.id}">Löschen</button></div></div>`).join('')}</div>`:emptyCard('🎯','Noch kein Sparziel','Zum Beispiel Urlaub, Auto oder Notgroschen.','new-goal')}
  ${sectionTitle('Letzte Buchungen')}
  ${data.transactions.length?`<div class="card transaction-list">${data.transactions.slice(0,15).map(t=>`<div class="transaction-row"><span class="txn-icon ${t.type}">${t.type==='expense'?(categoryEmoji[t.category]||'•'):'↗'}</span><div class="grow"><strong>${esc(t.note||t.category)}</strong><span>${esc(t.category)} · ${dateLabel(t.date)}</span></div><div class="txn-amount ${t.type}">${t.type==='expense'?'−':'+'}${money(t.amount)}</div><button class="row-delete" data-action="delete-transaction" data-id="${t.id}">⌫</button></div>`).join('')}</div>`:emptyCard('💶','Noch keine Buchungen','Deine Ausgaben und Einnahmen erscheinen hier.','new-expense')}`;
}