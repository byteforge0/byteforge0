'use strict';

(() => {
  const PROVIDERS = {
    revolut: {
      label: 'Revolut', short: 'R', tone: 'revolut',
      balance: '/api/revolut/balance', connect: '/api/revolut/connect', import: '/api/revolut/import',
      tokenPrefix: 'AR1.', cache: 'alltag:revolut:balance:v1', start: 'alltag:revolut:started:v1'
    },
    c24: {
      label: 'C24 Bank', short: 'C24', tone: 'c24',
      balance: '/api/c24/balance', connect: '/api/c24/connect', import: '/api/c24/import',
      tokenPrefix: 'AC1.', cache: 'alltag:c24:balance:v1', start: 'alltag:c24:started:v1'
    }
  };

  const bankState = {};
  let syncBusy = false;
  let searchQuery = '';
  let consentRequired = new Set();

  const builtinRules = [
    [/MCDONALD/, "McDonald's", 'Essen'], [/BURGER\s*KING/, 'Burger King', 'Essen'], [/\bKFC\b|KENTUCKY/, 'KFC', 'Essen'],
    [/SUBWAY/, 'Subway', 'Essen'], [/LIEFERANDO/, 'Lieferando', 'Essen'], [/UBER\s*EATS/, 'Uber Eats', 'Essen'], [/\bWOLT\b/, 'Wolt', 'Essen'],
    [/\bREWE\b/, 'REWE', 'Essen'], [/\bEDEKA\b/, 'EDEKA', 'Essen'], [/\bLIDL\b/, 'Lidl', 'Essen'], [/\bALDI\b/, 'ALDI', 'Essen'],
    [/KAUFLAND/, 'Kaufland', 'Essen'], [/\bPENNY\b/, 'Penny', 'Essen'], [/\bNETTO\b/, 'Netto', 'Essen'], [/\bNORMA\b/, 'Norma', 'Essen'],
    [/ARAL/, 'Aral', 'Auto'], [/\bSHELL\b/, 'Shell', 'Auto'], [/\bESSO\b/, 'Esso', 'Auto'], [/TOTALENERGIES|TOTAL ENERG/, 'TotalEnergies', 'Auto'],
    [/\bJET\b.*TANK|JET TANK/, 'JET', 'Auto'], [/\bOMV\b/, 'OMV', 'Auto'], [/\bHEM\b/, 'HEM', 'Auto'], [/\bAVIA\b/, 'AVIA', 'Auto'],
    [/AGIP|ENILIVE/, 'Enilive', 'Auto'], [/TANKSTELLE/, 'Tankstelle', 'Auto'], [/PARKHAUS|PARKING|PARKPLATZ/, 'Parken', 'Auto'],
    [/AMAZON|AMZN/, 'Amazon', 'Shopping'], [/ZALANDO/, 'Zalando', 'Shopping'], [/\bTEMU\b/, 'Temu', 'Shopping'], [/\bSHEIN\b/, 'SHEIN', 'Shopping'],
    [/MEDIA\s*MARKT|MEDIAMARKT/, 'MediaMarkt', 'Shopping'], [/SATURN/, 'Saturn', 'Shopping'], [/\bIKEA\b/, 'IKEA', 'Shopping'],
    [/\bDM\b.*DROGER|DM DROGER|DM-DE/, 'dm', 'Shopping'], [/ROSSMANN/, 'Rossmann', 'Shopping'],
    [/SPOTIFY/, 'Spotify', 'Abos'], [/NETFLIX/, 'Netflix', 'Abos'], [/DISNEY/, 'Disney+', 'Abos'], [/YOUTUBE.*PREMIUM|GOOGLE.*YOUTUBE/, 'YouTube Premium', 'Abos'],
    [/OPENAI|CHATGPT/, 'ChatGPT', 'Abos'], [/ICLOUD|APPLE\.COM\/BILL|APPLE COM BILL/, 'Apple', 'Abos'],
    [/TELEKOM/, 'Telekom', 'Rechnungen'], [/VODAFONE/, 'Vodafone', 'Rechnungen'], [/TELEFONICA|\bO2\b/, 'O2', 'Rechnungen'],
    [/VATTENFALL/, 'Vattenfall', 'Rechnungen'], [/VERSICHERUNG|ALLIANZ|HUK24|HUK-COBURG/, 'Versicherung', 'Rechnungen'],
    [/APOTHEKE/, 'Apotheke', 'Gesundheit'], [/DOCMORRIS/, 'DocMorris', 'Gesundheit'],
    [/DEUTSCHE\s*BAHN|DB\s*VERTRIEB|DB FERNVERKEHR/, 'Deutsche Bahn', 'Reisen'], [/FLIXBUS|FLIXTRAIN/, 'Flix', 'Reisen'],
    [/BOOKING\.COM|BOOKING COM/, 'Booking.com', 'Reisen'], [/AIRBNB/, 'Airbnb', 'Reisen'], [/LUFTHANSA/, 'Lufthansa', 'Reisen'],
    [/RYANAIR/, 'Ryanair', 'Reisen'], [/\bUBER\b/, 'Uber', 'Reisen'], [/\bBOLT\b/, 'Bolt', 'Reisen'],
    [/CINEMA|KINO|CINEPLEX|CINEMAXX|CINESTAR/, 'Kino', 'Freizeit']
  ];

  function ensureSettings() {
    data.settings.bankImportedRefs = Array.isArray(data.settings.bankImportedRefs) ? data.settings.bankImportedRefs : [];
    data.settings.bankSync = data.settings.bankSync && typeof data.settings.bankSync === 'object' ? data.settings.bankSync : {};
    data.settings.bankMerchantRules = data.settings.bankMerchantRules && typeof data.settings.bankMerchantRules === 'object' ? data.settings.bankMerchantRules : {};
    return data.settings;
  }

  function clean(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
  function normalize(value) {
    return clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  }
  function titleCase(value) {
    const s = clean(value);
    if (!s) return 'Bankbuchung';
    if (s !== s.toUpperCase()) return s.slice(0, 56);
    return s.toLowerCase().replace(/(^|[\s\-\/])([a-zäöü])/g, (_, a, b) => a + b.toUpperCase()).slice(0, 56);
  }
  function merchantKey(value) {
    let s = normalize(value)
      .replace(/\b(VISA|MASTERCARD|DEBIT|CREDIT|CARD|KARTE|POS|PAYMENT|ZAHLUNG|SEPA|ONLINE)\b/g, ' ')
      .replace(/\b[A-Z]{2}\d{6,}\b/g, ' ')
      .replace(/\b\d{2,}\b/g, ' ')
      .replace(/\s+/g, ' ').trim();
    return s.split(' ').filter(Boolean).slice(0, 5).join(' ');
  }
  function txText(tx) { return clean(`${tx.merchant || ''} ${tx.description || ''} ${tx.bankCode || ''}`); }
  function fmt(n) { return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(n) || 0); }
  function age(iso) {
    if (!iso) return 'noch nicht synchronisiert';
    const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
    if (m < 1) return 'gerade eben';
    if (m < 60) return `vor ${m} Min.`;
    const h = Math.round(m / 60);
    return h < 24 ? `vor ${h} Std.` : `vor ${Math.round(h / 24)} T.`;
  }
  function dateDiffDays(a, b) { return Math.abs(Date.parse(`${a}T12:00:00`) - Date.parse(`${b}T12:00:00`)) / 86400000; }
  function moneyClose(a, b) { return Math.abs(Number(a || 0) - Number(b || 0)) < 0.011; }
  function currentMonthStart() { return `${currentMonthKey()}-01`; }

  function categoryFromMcc(rawMcc) {
    const mcc = Number(rawMcc);
    if (!Number.isFinite(mcc)) return '';
    if ([5411,5422,5441,5451,5462,5499,5811,5812,5813,5814].includes(mcc)) return 'Essen';
    if ([5511,5521,5531,5532,5533,5541,5542,5551,7512,7523,7531,7534,7535,7538].includes(mcc)) return 'Auto';
    if ([5912,8011,8021,8041,8042,8049,8050,8062,8099].includes(mcc)) return 'Gesundheit';
    if ([4111,4112,4121,4131,4411,4511,4722,7011,7513,7519].includes(mcc)) return 'Reisen';
    if ([7832,7841,7911,7922,7929,7932,7933,7991,7996,7997,7999].includes(mcc)) return 'Freizeit';
    if ([4812,4814,4816,4899,4900].includes(mcc)) return 'Rechnungen';
    if ((mcc >= 5200 && mcc <= 5399) || (mcc >= 5600 && mcc <= 5735) || [5941,5942,5943,5944,5945,5947,5977,5999].includes(mcc)) return 'Shopping';
    return '';
  }

  function learnedRule(tx) {
    const rules = ensureSettings().bankMerchantRules;
    const key = merchantKey(tx.merchant || tx.description);
    if (key && rules[key]) return rules[key];
    return null;
  }

  function classify(tx) {
    const learned = learnedRule(tx);
    if (learned) return { category: learned.category || 'Sonstiges', name: learned.name || titleCase(tx.merchant || tx.description), learned: true };
    const hay = txText(tx).toUpperCase();
    if (tx.type === 'income') {
      return { category: /ERSTATT|REFUND|RUECKZAHL|RÜCKZAHL|REVERSAL|STORNO/.test(hay) ? 'Rückzahlung' : 'Sonstiges', name: titleCase(tx.merchant || tx.description || 'Eingang') };
    }
    for (const [pattern, name, category] of builtinRules) if (pattern.test(hay)) return { category, name };
    return { category: categoryFromMcc(tx.mcc) || 'Sonstiges', name: titleCase(tx.merchant || tx.description || 'Bankbuchung') };
  }

  function isSalary(tx) {
    if (tx.type !== 'income') return false;
    return /SCHMETTERLING|\bGEHALT\b|\bLOHN\b|SALARY|PAYROLL|LOHNZAHLUNG|ENTGELT/.test(txText(tx).toUpperCase());
  }
  function isRefund(tx) { return tx.type === 'income' && /ERSTATT|REFUND|RUECKZAHL|RÜCKZAHL|REVERSAL|STORNO/.test(txText(tx).toUpperCase()); }
  function transferLike(tx) { return /REVOLUT|\bC24\b|CHECK24 BANK|UEBERWEIS|ÜBERWEIS|TRANSFER|EIGENUEBERTRAG|EIGENÜBERTRAG/.test(txText(tx).toUpperCase()); }
  function explicitOwnBankTransfer(tx) {
    const hay = txText(tx).toUpperCase();
    return (tx.provider === 'c24' && /REVOLUT/.test(hay)) || (tx.provider === 'revolut' && /\bC24\b|CHECK24 BANK/.test(hay));
  }

  function crossBankTransferRefs(rows) {
    const refs = new Set();
    for (let i = 0; i < rows.length; i++) {
      const a = rows[i];
      if (!a?.ref || explicitOwnBankTransfer(a)) refs.add(a?.ref);
      for (let j = i + 1; j < rows.length; j++) {
        const b = rows[j];
        if (!a?.ref || !b?.ref || a.provider === b.provider || a.type === b.type || !moneyClose(a.amount, b.amount) || dateDiffDays(a.date, b.date) > 2) continue;
        if (transferLike(a) || transferLike(b)) { refs.add(a.ref); refs.add(b.ref); }
      }
    }
    return refs;
  }

  function manualDuplicate(tx, classification) {
    const key = merchantKey(classification.name);
    return data.transactions.some(row => {
      if (row.bankRef === tx.ref) return true;
      if (row.source === 'bank' || row.type !== tx.type || !moneyClose(row.amount, tx.amount) || dateDiffDays(row.date, tx.date) > 1) return false;
      const manual = merchantKey(row.note || row.category);
      return (manual && key && (manual.includes(key) || key.includes(manual))) || row.category === classification.category;
    });
  }

  function carDuplicate(tx, classification) {
    if (tx.type !== 'expense' || classification.category !== 'Auto') return false;
    if (data.fuelEntries.some(row => dateDiffDays(row.date, tx.date) <= 1 && moneyClose(row.totalPrice, tx.amount))) return true;
    return data.carExpenses.some(row => dateDiffDays(row.date, tx.date) <= 1 && moneyClose(row.amount, tx.amount));
  }

  function findRefundSource(tx) {
    if (!isRefund(tx)) return null;
    const key = merchantKey(tx.merchant || tx.description);
    return [...data.transactions].reverse().find(row => {
      if (row.type !== 'expense' || !moneyClose(row.amount, tx.amount)) return false;
      const days = (Date.parse(`${tx.date}T12:00:00`) - Date.parse(`${row.date}T12:00:00`)) / 86400000;
      if (days < 0 || days > 120) return false;
      const other = merchantKey(row.bankMerchant || row.note || row.category);
      return !key || !other || key.includes(other) || other.includes(key);
    }) || null;
  }

  function rememberRef(ref) {
    if (!ref) return;
    const s = ensureSettings();
    if (!s.bankImportedRefs.includes(ref)) s.bankImportedRefs.push(ref);
    if (s.bankImportedRefs.length > 5000) s.bankImportedRefs = s.bankImportedRefs.slice(-5000);
  }

  function refreshArchive(monthKey) {
    const archive = data.monthArchives.find(a => a.monthKey === monthKey);
    if (!archive) return;
    const summary = monthSummary(monthKey);
    archive.transactions = clone(data.transactions.filter(t => sameMonthKey(t.date, monthKey)));
    archive.summary = { ...summary, cfg: clone(summary.cfg) };
  }

  function importRows(rows) {
    const seen = new Set(ensureSettings().bankImportedRefs);
    const transferRefs = crossBankTransferRefs(rows);
    const affected = new Set();
    let imported = 0, skipped = 0, changed = false;

    for (const tx of rows) {
      if (!tx?.ref || seen.has(tx.ref) || /PENDING|PDNG/i.test(tx.status || '')) continue;
      const classification = classify(tx);
      const refundSource = findRefundSource(tx);
      const skip = transferRefs.has(tx.ref) || isSalary(tx) || manualDuplicate(tx, classification) || carDuplicate(tx, classification);
      rememberRef(tx.ref); seen.add(tx.ref); changed = true;
      if (skip) { skipped++; continue; }

      const category = refundSource?.category || classification.category;
      const name = refundSource ? `Erstattung · ${refundSource.note || refundSource.category}` : classification.name;
      data.transactions.push({
        id: uid(), type: tx.type === 'income' ? 'income' : 'expense', amount: Number(tx.amount), category, note: name,
        date: tx.date, createdAt: new Date().toISOString(), source: 'bank', bankProvider: tx.provider, bankRef: tx.ref,
        bankMerchant: tx.merchant || '', bankDescription: tx.description || '', bankMcc: tx.mcc || '', refundOf: refundSource?.id || undefined
      });
      affected.add(String(tx.date).slice(0, 7)); imported++;
    }

    if (changed) {
      data.transactions.sort((a,b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      for (const month of affected) refreshArchive(month);
    }
    return { imported, skipped, changed };
  }

  function providerState(provider) {
    if (bankState[provider]) return bankState[provider];
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem(PROVIDERS[provider].cache) || 'null'); } catch {}
    return bankState[provider] = { connected: !!cached, loading: !cached, data: cached };
  }

  function handoffPending(provider) {
    const key = PROVIDERS[provider].start;
    const at = Number(localStorage.getItem(key) || 0);
    if (!at) return false;
    if (Date.now() - at > 30 * 60 * 1000) { localStorage.removeItem(key); return false; }
    return true;
  }

  function bankCard(provider) {
    const cfg = PROVIDERS[provider], state = providerState(provider), d = state.data;
    if (state.connected && d) return `<section class="bank-card ${cfg.tone}"><div class="bank-top"><div class="bank-brand"><span class="bank-logo">${cfg.short}</span><div><strong>${cfg.label}</strong><span>${d.accountCount > 1 ? `${d.accountCount} EUR-Konten` : 'EUR-Konto'} · ${age(d.fetchedAt)}</span></div></div><button class="bank-refresh" data-bank-refresh="${provider}" aria-label="${cfg.label} aktualisieren">↻</button></div><div class="bank-balance">${fmt(d.available)}</div><div class="bank-caption">Verfügbar${Number.isFinite(d.booked) && Math.abs(d.booked-d.available)>.009?` · Gebucht ${fmt(d.booked)}`:''}</div></section>`;
    if (handoffPending(provider)) return `<section class="bank-card ${cfg.tone} handoff"><div class="bank-brand"><span class="bank-logo">${cfg.short}</span><div><strong>${cfg.label}-Freigabe</strong><span>Nach der Bestätigung im Browser hier fortfahren</span></div></div><button class="bank-takeover" data-bank-import="${provider}">Verbindung übernehmen</button><button class="bank-restart" data-bank-restart="${provider}">Neu verbinden</button></section>`;
    if (state.loading) return `<section class="bank-card ${cfg.tone} bank-loading"><div class="bank-brand"><span class="bank-logo">${cfg.short}</span><div><strong>${cfg.label}</strong><span>Verbindung wird geprüft …</span></div></div><span class="bank-spinner"></span></section>`;
    return `<button class="bank-card ${cfg.tone} bank-connect" data-bank-connect="${provider}"><div class="bank-brand"><span class="bank-logo">${cfg.short}</span><div><strong>${cfg.label} verbinden</strong><span>Kontostand und Buchungen automatisch übernehmen</span></div></div><span class="bank-arrow">›</span></button>`;
  }

  async function refreshBalance(provider, showToast=false) {
    const cfg = PROVIDERS[provider], state = providerState(provider);
    try {
      const res = await fetch(cfg.balance, { cache:'no-store', credentials:'same-origin' });
      if (res.status === 401) {
        state.connected = false; state.loading = false; state.data = null; localStorage.removeItem(cfg.cache);
      } else if (!res.ok) throw new Error('balance_failed');
      else {
        const payload = await res.json(); state.connected = true; state.loading = false; state.data = payload;
        localStorage.setItem(cfg.cache, JSON.stringify(payload)); localStorage.removeItem(cfg.start);
        if (showToast) toast(`${cfg.label} aktualisiert`);
      }
    } catch {
      state.loading = false;
      if (!state.data) state.connected = false;
      if (showToast) toast(`${cfg.label} gerade nicht erreichbar`);
    }
    redraw();
  }

  function startConnect(provider) {
    const cfg = PROVIDERS[provider];
    localStorage.setItem(cfg.start, String(Date.now())); redraw(); window.location.href = cfg.connect;
  }

  async function handoffCode(provider) {
    try { const v = (await navigator.clipboard?.readText?.())?.trim(); if (v) return v; } catch {}
    return (prompt(`Den im Browser kopierten ${PROVIDERS[provider].label}-Code hier einfügen:`) || '').trim();
  }

  async function importConnection(provider) {
    const cfg = PROVIDERS[provider], token = await handoffCode(provider);
    if (!token) return;
    if (!token.startsWith(cfg.tokenPrefix)) return toast(`Kein gültiger ${cfg.label}-Code kopiert`);
    const button = document.querySelector(`[data-bank-import="${provider}"]`);
    if (button) { button.disabled = true; button.textContent = 'Wird übernommen …'; }
    try {
      const res = await fetch(cfg.import, { method:'POST', cache:'no-store', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:JSON.stringify({token}) });
      if (!res.ok) { const info = await res.json().catch(()=>({})); throw new Error(info.error || 'import_failed'); }
      localStorage.removeItem(cfg.start); toast(`${cfg.label} verbunden`); await refreshBalance(provider, false); await syncBanks(false);
    } catch (e) { toast(e?.message === 'expired_or_invalid' ? 'Code abgelaufen – bitte neu verbinden' : 'Code ungültig oder abgelaufen'); redraw(); }
  }

  async function fetchTransactions(provider) {
    const cfg = PROVIDERS[provider];
    const url = `${cfg.balance}?transactions=1&date_from=${encodeURIComponent(currentMonthStart())}`;
    const res = await fetch(url, { cache:'no-store', credentials:'same-origin' });
    if (res.status === 401) return { provider, connected:false, rows:[] };
    const payload = await res.json().catch(()=>({}));
    if (res.status === 409 && payload.transactionsConsentRequired) return { provider, connected:true, consentRequired:true, rows:[] };
    if (!res.ok) return { provider, connected:providerState(provider).connected, error:true, rows:[] };
    return { provider, connected:true, consentRequired:!!payload.transactionsConsentRequired, rows:Array.isArray(payload.transactions)?payload.transactions:[] };
  }

  async function syncBanks(showToast=false) {
    if (syncBusy) return;
    syncBusy = true; redraw();
    try {
      const results = await Promise.all(Object.keys(PROVIDERS).map(fetchTransactions));
      consentRequired = new Set(results.filter(x=>x.consentRequired).map(x=>x.provider));
      const result = importRows(results.flatMap(x=>x.rows || []));
      const meta = ensureSettings().bankSync;
      meta.lastAt = new Date().toISOString(); meta.lastImported = result.imported; meta.totalImported = Number(meta.totalImported || 0) + result.imported;
      meta.providers = Object.fromEntries(results.map(x=>[x.provider,{connected:!!x.connected,consentRequired:!!x.consentRequired,ok:!x.error}]));
      saveData(); render();
      if (showToast) {
        if (consentRequired.size) toast('Buchungszugriff einmal freigeben');
        else if (result.imported) toast(`${result.imported} neue ${result.imported===1?'Buchung':'Buchungen'} übernommen`);
        else toast('Bankbuchungen sind aktuell');
      }
    } catch { if (showToast) toast('Bankbuchungen gerade nicht erreichbar'); }
    finally { syncBusy = false; redraw(); }
  }

  function syncCard() {
    const connected = Object.keys(PROVIDERS).filter(p=>providerState(p).connected);
    if (!connected.length && !consentRequired.size) return '';
    if (consentRequired.size) return `<section class="bank-sync-card attention"><div class="bank-sync-head"><div><strong>Bankbuchungen</strong><span>Einmalige Freigabe nötig</span></div><b>!</b></div><p>Der Kontostand funktioniert. Für automatische Buchungen muss der Transaktionszugriff noch bestätigt werden.</p><div class="bank-sync-actions">${[...consentRequired].map(p=>`<button data-bank-consent="${p}">${PROVIDERS[p].label} freigeben</button>`).join('')}</div></section>`;
    const meta = ensureSettings().bankSync;
    return `<section class="bank-sync-card"><div class="bank-sync-head"><div><strong>Bankbuchungen</strong><span>${connected.map(p=>PROVIDERS[p].label.replace(' Bank','')).join(' + ')} · ${age(meta.lastAt)}</span></div><b>${syncBusy?'…':'✓'}</b></div><div class="bank-sync-summary"><span>Zuletzt automatisch übernommen</span><strong>${Number(meta.lastImported || 0)} neu</strong></div><button class="bank-sync-now" data-bank-sync-now ${syncBusy?'disabled':''}>${syncBusy?'Synchronisiert …':'Jetzt synchronisieren'}</button></section>`;
  }

  function recentBankCard() {
    const rows = data.transactions.filter(t=>t.source==='bank').sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b.createdAt||'').localeCompare(String(a.createdAt||''))).slice(0,3);
    if (!rows.length) return '';
    return `<section class="bank-recent"><div class="bank-recent-head"><strong>Letzte Bankbuchungen</strong><button data-bank-open-money>Alle</button></div><div class="bank-recent-list">${rows.map(t=>`<button data-bank-edit="${t.id}"><span>${t.type==='expense'?(categoryEmoji[t.category]||'•'):'↗'}</span><span><strong>${esc(t.note||t.category)}</strong><small>${esc(t.category)} · ${dateLabel(t.date)}</small></span><b class="${t.type}">${t.type==='expense'?'−':'+'}${money(t.amount)}</b></button>`).join('')}</div></section>`;
  }

  function mountSearch() {
    if (ui.tab !== 'money') return;
    const list = document.querySelector('#screen .transaction-list');
    if (!list || document.getElementById('bank-tx-search')) return;
    const wrap = document.createElement('div'); wrap.id = 'bank-tx-search'; wrap.className = 'bank-search';
    wrap.innerHTML = `<span>⌕</span><input type="search" placeholder="Buchungen durchsuchen" value="${esc(searchQuery)}" autocomplete="off"><button type="button" aria-label="Suche leeren">×</button>`;
    list.insertAdjacentElement('beforebegin', wrap); filterRenderedTransactions();
  }
  function filterRenderedTransactions() {
    const q = normalize(searchQuery);
    const list = document.querySelector('#screen .transaction-list');
    if (!list) return;
    let visible = 0;
    list.querySelectorAll('.transaction-row').forEach(row=>{ const show = !q || normalize(row.textContent).includes(q); row.hidden = !show; if (show) visible++; });
    let empty = document.getElementById('bank-search-empty');
    if (q && !visible) { if (!empty) { empty=document.createElement('div'); empty.id='bank-search-empty'; empty.className='bank-search-empty'; empty.textContent='Keine passende Buchung gefunden.'; list.insertAdjacentElement('afterend',empty); } }
    else empty?.remove();
  }

  function decorateBankRows() {
    document.querySelectorAll('#screen [data-action="edit-transaction"]').forEach(btn=>{
      const t = data.transactions.find(x=>x.id===btn.dataset.id);
      if (!t?.bankProvider || btn.querySelector('.bank-source-badge')) return;
      const span = btn.querySelector('span');
      if (span) span.insertAdjacentHTML('beforeend', ` <em class="bank-source-badge">${t.bankProvider==='c24'?'C24':'R'}</em>${t.refundOf?' <em class="refund-badge">Erstattung</em>':''}`);
    });
  }

  function mount() {
    const screen = document.getElementById('screen');
    if (!screen || (ui.tab !== 'home' && ui.tab !== 'money')) return;
    document.getElementById('bank-v2-slot')?.remove();
    const slot = document.createElement('div'); slot.id='bank-v2-slot'; slot.className='bank-v2-slot';
    slot.innerHTML = Object.keys(PROVIDERS).map(bankCard).join('') + (ui.tab==='money'?syncCard():recentBankCard());
    const anchor = ui.tab==='home' ? screen.querySelector('.gold-strip') : screen.querySelector('.available-card');
    if (anchor) anchor.insertAdjacentElement('afterend',slot); else screen.prepend(slot);
    mountSearch(); decorateBankRows();
  }
  function redraw() { document.getElementById('bank-v2-slot')?.remove(); document.getElementById('bank-tx-search')?.remove(); document.getElementById('bank-search-empty')?.remove(); mount(); }

  function learnFromEdit(form) {
    if (form?.dataset.form !== 'transaction-edit') return;
    const f = Object.fromEntries(new FormData(form));
    const t = data.transactions.find(x=>x.id===f.id);
    if (!t?.bankProvider) return;
    const key = merchantKey(t.bankMerchant || t.bankDescription || t.note);
    if (!key) return;
    const category = String(f.category || t.category || 'Sonstiges');
    const name = clean(f.note) || t.note || titleCase(t.bankMerchant);
    setTimeout(()=>{
      ensureSettings().bankMerchantRules[key] = { category, name, updatedAt:new Date().toISOString() };
      saveData();
      toast(`${name}: ${category} künftig gemerkt`);
    }, 80);
  }

  const originalRender = window.render;
  window.render = function(...args) { const out = originalRender.apply(this,args); queueMicrotask(mount); return out; };

  document.addEventListener('submit', e=>learnFromEdit(e.target), true);
  document.addEventListener('input', e=>{
    if (e.target.matches('#bank-tx-search input')) { searchQuery = e.target.value; filterRenderedTransactions(); }
  });
  document.addEventListener('click', async e=>{
    const el = e.target.closest('[data-bank-connect],[data-bank-refresh],[data-bank-import],[data-bank-restart],[data-bank-consent],[data-bank-sync-now],[data-bank-open-money],[data-bank-edit],#bank-tx-search button');
    if (!el) return;
    if (el.matches('#bank-tx-search button')) { searchQuery=''; const input=document.querySelector('#bank-tx-search input'); if(input){input.value='';input.focus();} filterRenderedTransactions(); return; }
    if (el.dataset.bankConnect) return startConnect(el.dataset.bankConnect);
    if (el.dataset.bankRefresh) return void refreshBalance(el.dataset.bankRefresh,true);
    if (el.dataset.bankImport) return void importConnection(el.dataset.bankImport);
    if (el.dataset.bankRestart) { localStorage.removeItem(PROVIDERS[el.dataset.bankRestart].start); return startConnect(el.dataset.bankRestart); }
    if (el.dataset.bankConsent) return startConnect(el.dataset.bankConsent);
    if (el.hasAttribute('data-bank-sync-now')) return void syncBanks(true);
    if (el.hasAttribute('data-bank-open-money')) { ui.tab='money'; render(); return; }
    if (el.dataset.bankEdit) { ui.editId=el.dataset.bankEdit; openSheet('transaction-edit'); }
  });

  Object.keys(PROVIDERS).forEach(p=>refreshBalance(p,false));
  setTimeout(()=>syncBanks(false),2800);
  window.addEventListener('online',()=>{Object.keys(PROVIDERS).forEach(p=>refreshBalance(p,false));syncBanks(false);});
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState!=='visible')return;
    const last=Date.parse(ensureSettings().bankSync.lastAt||0)||0;
    Object.keys(PROVIDERS).forEach(p=>{const s=providerState(p);if(!handoffPending(p)&&Date.now()-(Date.parse(s.data?.fetchedAt||0)||0)>5*60*1000)refreshBalance(p,false);});
    if(Date.now()-last>10*60*1000)syncBanks(false);else redraw();
  });
  setInterval(()=>{if(document.visibilityState==='visible')syncBanks(false)},15*60*1000);
  queueMicrotask(mount);
})();
