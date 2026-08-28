function openSheet(name){ui.sheet=name;renderSheet();setTimeout(()=>{const a=document.querySelector('.sheet [autofocus]');if(a)a.focus()},80)}
function closeSheet(){ui.sheet=null;renderSheet()}
function update(mutator,message=''){mutator();saveData();render();if(message)toast(message)}

function clickAction(el){
  const tab=el.closest('[data-tab]')?.dataset.tab;if(tab){ui.tab=tab;render();return}
  const btn=el.closest('[data-action]');if(!btn)return;const a=btn.dataset.action,id=btn.dataset.id;
  if(a==='close-sheet'){closeSheet();return}
  if(a==='open-quick'){openSheet('quick');return}
  if(a==='open-settings'){openSheet('settings');return}
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
  if(a==='export-data'){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`alltag-backup-${todayISO()}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);toast('Backup erstellt');return}
  if(a==='import-data'){document.getElementById('backup-input').click();return}
  if(a==='reset-data'&&confirm('Wirklich alle lokalen Daten löschen?')){localStorage.removeItem(STORAGE_KEY);data=clone(emptyData);ui.sheet=null;render();toast('Daten gelöscht')}
}

document.addEventListener('click',e=>clickAction(e.target));
document.addEventListener('input',e=>{
  if(e.target.id==='remember-search'){ui.rememberQuery=e.target.value;const pos=e.target.selectionStart;document.getElementById('screen').innerHTML=renderRemember();const input=document.getElementById('remember-search');input.focus();input.setSelectionRange(pos,pos);return}
  if(e.target.name==='energy'){const out=document.getElementById('energy-value');if(out)out.textContent=`${e.target.value}/10`}
  if(e.target.name==='stress'){const out=document.getElementById('stress-value');if(out)out.textContent=`${e.target.value}/10`}
});

document.addEventListener('submit',e=>{
  const form=e.target;if(!(form instanceof HTMLFormElement)||!form.dataset.form)return;e.preventDefault();const f=Object.fromEntries(new FormData(form));
  switch(form.dataset.form){
    case 'transaction':{const amount=num(f.amount);if(amount<=0)return toast('Betrag fehlt');update(()=>data.transactions.unshift({id:uid(),type:ui.transactionType,amount,category:f.category,note:String(f.note||'').trim()||undefined,date:f.date||todayISO(),createdAt:new Date().toISOString()}),'Gespeichert');closeSheet();break}
    case 'goal':{if(!String(f.name||'').trim()||num(f.target)<=0)return toast('Name und Zielbetrag fehlen');update(()=>data.goals.unshift({id:uid(),name:String(f.name).trim(),emoji:String(f.emoji||'🎯'),targetAmount:num(f.target),currentAmount:Math.max(0,num(f.current)),monthlyTarget:num(f.monthly)||undefined,createdAt:new Date().toISOString()}),'Sparziel erstellt');closeSheet();break}
    case 'saving':{const amount=num(f.amount),goalId=f.goalIdSelect||f.goalId;if(amount<=0)return toast('Betrag fehlt');update(()=>{const goal=data.goals.find(g=>g.id===goalId);if(!goal)return;const type=f.type==='withdrawal'?'withdrawal':'deposit';goal.currentAmount=Math.max(0,goal.currentAmount+(type==='deposit'?amount:-amount));data.savingsTransactions.unshift({id:uid(),goalId,type,amount,note:String(f.note||'').trim()||undefined,date:todayISO()})},'Sparziel aktualisiert');closeSheet();break}
    case 'car':{if(!String(f.make||'').trim()||!String(f.model||'').trim())return toast('Marke und Modell fehlen');update(()=>data.car={make:String(f.make).trim(),model:String(f.model).trim(),plate:String(f.plate||'').trim().toUpperCase()||undefined,odometer:num(f.odometer)},'Auto gespeichert');closeSheet();break}
    case 'fuel':{const odo=num(f.odometer),lit=num(f.liters),total=num(f.total);if(odo<=0||lit<=0||total<=0)return toast('Bitte Werte prüfen');update(()=>{data.fuelEntries.unshift({id:uid(),odometer:odo,liters:lit,totalPrice:total,pricePerLiter:total/lit,fullTank:!!f.full,station:String(f.station||'').trim()||undefined,date:todayISO()});if(data.car)data.car.odometer=Math.max(data.car.odometer,odo)},'Tankvorgang gespeichert');closeSheet();break}
    case 'car-expense':{const amount=num(f.amount);if(amount<=0)return toast('Betrag fehlt');update(()=>data.carExpenses.unshift({id:uid(),category:f.category,amount,note:String(f.note||'').trim()||undefined,date:todayISO()}),'Kosten gespeichert');closeSheet();break}
    case 'reminder':{if(!String(f.title||'').trim()||(!f.dueDate&&!num(f.dueOdometer)))return toast('Datum oder Kilometer fehlt');update(()=>data.carReminders.unshift({id:uid(),title:String(f.title).trim(),dueDate:f.dueDate||undefined,dueOdometer:num(f.dueOdometer)||undefined,done:false}),'Erinnerung gespeichert');closeSheet();break}
    case 'mood':{const existing=data.moods.find(m=>m.date===todayISO());const entry={id:existing?.id||uid(),date:todayISO(),mood:Number(f.mood),sleepHours:num(f.sleep)||undefined,energy:Number(f.energy)||undefined,stress:Number(f.stress)||undefined,note:String(f.note||'').trim()||undefined};update(()=>{data.moods=[entry,...data.moods.filter(m=>m.date!==todayISO())]},'Tag gespeichert');closeSheet();break}
    case 'remember':{if(!String(f.text||'').trim())return toast('Schreib kurz etwas rein');update(()=>data.remembers.unshift({id:uid(),text:String(f.text).trim(),category:f.category,favorite:false,completed:false,createdAt:new Date().toISOString()}),'Gemerkt');closeSheet();break}
    case 'settings':{update(()=>{data.settings.name=String(f.name||'').trim();data.settings.monthlyBudget=Math.max(0,num(f.budget))},'Einstellungen gespeichert');closeSheet();break}
  }
});

document.getElementById('backup-input').addEventListener('change',async e=>{
  const file=e.target.files?.[0];if(!file)return;try{const parsed=JSON.parse(await file.text());if(!parsed||typeof parsed!=='object'||!parsed.settings)throw new Error();data=Object.assign(clone(emptyData),parsed);saveData();ui.sheet=null;render();toast('Backup importiert')}catch{toast('Backup konnte nicht gelesen werden')}e.target.value='';
});

if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
render();