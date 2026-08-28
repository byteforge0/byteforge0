function renderCar(){
  if(!data.car)return `${pageHeader('Auto')}${emptyCard('🚗','Auto einrichten','Dann kannst du Kilometer, Tanken und Kosten verfolgen.','car-setup')}`;
  const fuels=[...data.fuelEntries].sort((a,b)=>b.odometer-a.odometer),latest=fuels[0],prev=fuels[1];
  const consumption=latest&&prev&&latest.fullTank?(latest.liters/Math.max(1,latest.odometer-prev.odometer))*100:null;
  const monthFuel=data.fuelEntries.filter(f=>sameMonth(f.date)).reduce((a,b)=>a+b.totalPrice,0),monthOther=data.carExpenses.filter(x=>sameMonth(x.date)).reduce((a,b)=>a+b.amount,0),rem=data.carReminders.filter(r=>!r.done);
  return `${pageHeader(`${data.car.make} ${data.car.model}`,data.car.plate||'Dein Fahrzeug',true).replace('data-action="open-settings"','data-action="car-setup"')}
  <section class="card odometer-card"><span>Kilometerstand</span><strong>${Number(data.car.odometer).toLocaleString('de-DE')} <small>km</small></strong></section>
  <div class="summary-grid"><div class="summary-card"><span>Diesen Monat</span><strong>${money(monthFuel+monthOther)}</strong></div><div class="summary-card"><span>Tanken</span><strong>${money(monthFuel)}</strong></div><div class="summary-card"><span>Verbrauch</span><strong>${consumption?`${consumption.toFixed(1)} l`:'–'}</strong></div><div class="summary-card"><span>Letzter Literpreis</span><strong>${latest?.pricePerLiter?`${Number(latest.pricePerLiter).toFixed(3)} €`:'–'}</strong></div></div>
  <div class="action-row"><button class="primary-action" data-action="new-fuel">⛽ Tanken</button><button class="secondary-action" data-action="new-car-expense">+ Kosten</button></div>
  ${sectionTitle('Service & TÜV','Erinnerung','new-reminder')}
  ${rem.length?`<div class="card list-card">${rem.map(r=>`<div class="reminder-row"><div class="round-icon">🔧</div><div class="grow"><strong>${esc(r.title)}</strong><span>${r.dueDate?dateLabel(r.dueDate,{day:'2-digit',month:'2-digit',year:'numeric'}):''}${r.dueDate&&r.dueOdometer?' · ':''}${r.dueOdometer?`${Number(r.dueOdometer).toLocaleString('de-DE')} km`:''}</span></div><button class="check-button" data-action="done-reminder" data-id="${r.id}">✓</button></div>`).join('')}</div>`:emptyCard('🔧','Alles erledigt','Füge TÜV, Ölwechsel oder Reifenwechsel hinzu.','new-reminder')}
  ${sectionTitle('Tankverlauf')}
  ${fuels.length?`<div class="card transaction-list">${fuels.slice(0,10).map(f=>`<div class="transaction-row"><span class="txn-icon">⛽</span><div class="grow"><strong>${Number(f.liters).toFixed(1)} l · ${Number(f.odometer).toLocaleString('de-DE')} km</strong><span>${esc(f.station||'Tanken')} · ${dateLabel(f.date)}</span></div><div class="txn-amount">${money(f.totalPrice)}</div></div>`).join('')}</div>`:emptyCard('⛽','Noch nicht getankt','Der Verbrauch wird nach mehreren Volltankungen berechnet.','new-fuel')}`;
}

function renderDay(){
  const today=data.moods.find(m=>m.date===todayISO()),month=data.moods.filter(m=>sameMonth(m.date)),avg=month.length?month.reduce((a,b)=>a+b.mood,0)/month.length:0,sleep=month.filter(m=>m.sleepHours!=null),avgSleep=sleep.length?sleep.reduce((a,b)=>a+Number(b.sleepHours||0),0)/sleep.length:0;
  return `${pageHeader('Dein Tag',monthLabel())}
  <section class="card mood-today"><span class="card-kicker">Wie war dein Tag?</span><div class="mood-picker-inline">${[1,2,3,4,5].map(v=>`<button class="${today?.mood===v?'selected':''}" data-action="new-mood">${moodEmoji[v]}</button>`).join('')}</div><button class="text-action" data-action="new-mood">${today?'Eintrag bearbeiten':'Details hinzufügen'}</button></section>
  <div class="summary-grid" style="margin-top:12px"><div class="summary-card"><span>Ø Stimmung</span><strong>${avg?`${moodEmoji[Math.round(avg)]} ${avg.toFixed(1)}`:'–'}</strong></div><div class="summary-card"><span>Ø Schlaf</span><strong>${avgSleep?`${avgSleep.toFixed(1)} h`:'–'}</strong></div><div class="summary-card"><span>Einträge</span><strong>${month.length}</strong></div><div class="summary-card"><span>Beste Tage</span><strong>${month.filter(m=>m.mood===5).length}</strong></div></div>
  ${sectionTitle('Letzte Tage','Heute','new-mood')}
  ${data.moods.length?`<div class="card mood-history">${data.moods.slice(0,14).map(m=>`<div class="mood-row"><span class="history-emoji">${moodEmoji[m.mood]}</span><div class="grow"><strong>${m.date===todayISO()?'Heute':dateLabel(m.date,{weekday:'long',day:'2-digit',month:'2-digit'})}</strong><span>${m.sleepHours!=null?`${m.sleepHours} h Schlaf`:'Kein Schlaf eingetragen'}${m.energy?` · Energie ${m.energy}/10`:''}</span></div></div>`).join('')}</div>`:emptyCard('🙂','Dein erster Eintrag','Ein paar Sekunden am Abend reichen.','new-mood')}`;
}

function renderRemember(){
  const q=ui.rememberQuery.trim().toLowerCase();
  const items=data.remembers.filter(r=>{if(ui.rememberFilter==='Offen'&&r.completed)return false;if(ui.rememberFilter==='Favoriten'&&!r.favorite)return false;if(ui.rememberFilter==='Erledigt'&&!r.completed)return false;return !q||r.text.toLowerCase().includes(q)||r.category.toLowerCase().includes(q)});
  return `${pageHeader('Merken')}
  <button class="quick-capture" data-action="new-remember">+ <span>Was möchtest du dir merken?</span></button>
  <input id="remember-search" class="search" value="${esc(ui.rememberQuery)}" placeholder="Suchen" autocomplete="off">
  <div class="segmented">${['Offen','Favoriten','Erledigt'].map(x=>`<button class="${ui.rememberFilter===x?'active':''}" data-action="remember-filter" data-value="${x}">${x}</button>`).join('')}</div>
  ${items.length?`<div class="remember-list">${items.map(r=>`<div class="remember-card ${r.completed?'done':''}"><button class="remember-check" data-action="toggle-remember" data-id="${r.id}">${r.completed?'✓':''}</button><div class="grow"><strong>${esc(r.text)}</strong><span>${rememberEmoji[r.category]||'•'} ${esc(r.category)} · ${new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'2-digit'}).format(new Date(r.createdAt))}</span></div><button class="star-button ${r.favorite?'active':''}" data-action="favorite-remember" data-id="${r.id}">☆</button><button class="row-delete" data-action="delete-remember" data-id="${r.id}">⌫</button></div>`).join('')}</div>`:emptyCard('🧠',q?'Nichts gefunden':'Alles aus dem Kopf',q?'Versuch einen anderen Suchbegriff.':'Speichere Gedanken, Käufe, Filme oder Orte.','new-remember')}`;
}