(() => {
  const PROVIDERS = {
    revolut: {
      label: 'Revolut',
      endpoint: '/api/revolut/transactions',
      connect: '/api/revolut/connect',
      balanceCache: 'alltag:revolut:balance:v1',
      startKey: 'alltag:revolut:started:v1'
    },
    c24: {
      label: 'C24',
      endpoint: '/api/c24/transactions',
      connect: '/api/c24/connect',
      balanceCache: 'alltag:c24:balance:v1',
      startKey: 'alltag:c24:started:v1'
    }
  };

  let busy = false;
  let consentRequired = new Set();
  let lastResult = { imported: 0, skipped: 0, lastAt: '' };

  function settings() {
    data.settings.bankImportedRefs = Array.isArray(data.settings.bankImportedRefs) ? data.settings.bankImportedRefs : [];
    data.settings.bankSync = data.settings.bankSync && typeof data.settings.bankSync === 'object' ? data.settings.bankSync : {};
    return data.settings;
  }

  function importedRefs() {
    return new Set(settings().bankImportedRefs);
  }

  function rememberRef(ref) {
    if (!ref) return;
    const s = settings();
    if (!s.bankImportedRefs.includes(ref)) s.bankImportedRefs.push(ref);
    if (s.bankImportedRefs.length > 4000) s.bankImportedRefs = s.bankImportedRefs.slice(-4000);
  }

  function hasBank(provider) {
    try { return !!JSON.parse(localStorage.getItem(PROVIDERS[provider].balanceCache) || 'null'); }
    catch { return false; }
  }

  function currentMonthStart() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  }

  function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function normalized(value) {
    return clean(value)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase();
  }

  function titleCase(value) {
    const s = clean(value);
    if (!s) return 'Bankbuchung';
    if (s !== s.toUpperCase()) return s.slice(0, 56);
    return s.toLowerCase().replace(/(^|[\s\-\/])([a-zäöü])/g, (_, a, b) => a + b.toUpperCase()).slice(0, 56);
  }

  const merchantRules = [
    [/MCDONALD/, "McDonald's", 'Essen'],
    [/BURGER\s*KING/, 'Burger King', 'Essen'],
    [/\bKFC\b|KENTUCKY/, 'KFC', 'Essen'],
    [/SUBWAY/, 'Subway', 'Essen'],
    [/LIEFERANDO/, 'Lieferando', 'Essen'],
    [/UBER\s*EATS/, 'Uber Eats', 'Essen'],
    [/\bWOLT\b/, 'Wolt', 'Essen'],
    [/\bREWE\b/, 'REWE', 'Essen'],
    [/\bEDEKA\b/, 'EDEKA', 'Essen'],
    [/\bLIDL\b/, 'Lidl', 'Essen'],
    [/\bALDI\b/, 'ALDI', 'Essen'],
    [/KAUFLAND/, 'Kaufland', 'Essen'],
    [/\bPENNY\b/, 'Penny', 'Essen'],
    [/\bNETTO\b/, 'Netto', 'Essen'],
    [/\bNORMA\b/, 'Norma', 'Essen'],
    [/ARAL/, 'Aral', 'Auto'],
    [/\bSHELL\b/, 'Shell', 'Auto'],
    [/\bESSO\b/, 'Esso', 'Auto'],
    [/TOTALENERGIES|TOTAL ENERG/, 'TotalEnergies', 'Auto'],
    [/\bJET\b.*TANK|JET TANK/, 'JET', 'Auto'],
    [/\bOMV\b/, 'OMV', 'Auto'],
    [/\bHEM\b/, 'HEM', 'Auto'],
    [/\bAVIA\b/, 'AVIA', 'Auto'],
    [/AGIP|ENILIVE/, 'Enilive', 'Auto'],
    [/TANKSTELLE/, 'Tankstelle', 'Auto'],
    [/PARKHAUS|PARKING|PARKPLATZ/, 'Parken', 'Auto'],
    [/AMAZON|AMZN/, 'Amazon', 'Shopping'],
    [/ZALANDO/, 'Zalando', 'Shopping'],
    [/\bTEMU\b/, 'Temu', 'Shopping'],
    [/\bSHEIN\b/, 'SHEIN', 'Shopping'],
    [/MEDIA\s*MARKT|MEDIAMARKT/, 'MediaMarkt', 'Shopping'],
    [/SATURN/, 'Saturn', 'Shopping'],
    [/\bIKEA\b/, 'IKEA', 'Shopping'],
    [/\bDM\b.*DROGER|DM DROGER|DM-DE/, 'dm', 'Shopping'],
    [/ROSSMANN/, 'Rossmann', 'Shopping'],
    [/SPOTIFY/, 'Spotify', 'Abos'],
    [/NETFLIX/, 'Netflix', 'Abos'],
    [/DISNEY/, 'Disney+', 'Abos'],
    [/YOUTUBE.*PREMIUM|GOOGLE.*YOUTUBE/, 'YouTube Premium', 'Abos'],
    [/OPENAI|CHATGPT/, 'ChatGPT', 'Abos'],
    [/ICLOUD|APPLE\.COM\/BILL|APPLE COM BILL/, 'Apple', 'Abos'],
    [/TELEKOM/, 'Telekom', 'Rechnungen'],
    [/VODAFONE/, 'Vodafone', 'Rechnungen'],
    [/TELEFONICA|\bO2\b/, 'O2', 'Rechnungen'],
    [/VATTENFALL/, 'Vattenfall', 'Rechnungen'],
    [/VERSICHERUNG|ALLIANZ|HUK24|HUK-COBURG/, 'Versicherung', 'Rechnungen'],
    [/APOTHEKE/, 'Apotheke', 'Gesundheit'],
    [/DOCMORRIS/, 'DocMorris', 'Gesundheit'],
    [/DEUTSCHE\s*BAHN|DB\s*VERTRIEB|DB FERNVERKEHR/, 'Deutsche Bahn', 'Reisen'],
    [/FLIXBUS|FLIXTRAIN/, 'Flix', 'Reisen'],
    [/BOOKING\.COM|BOOKING COM/, 'Booking.com', 'Reisen'],
    [/AIRBNB/, 'Airbnb', 'Reisen'],
    [/LUFTHANSA/, 'Lufthansa', 'Reisen'],
    [/RYANAIR/, 'Ryanair', 'Reisen'],
    [/\bUBER\b/, 'Uber', 'Reisen'],
    [/\bBOLT\b/, 'Bolt', 'Reisen'],
    [/CINEMA|KINO|CINEPLEX|CINEMAXX|CINESTAR/, 'Kino', 'Freizeit']
  ];

  function categoryFromMcc(rawMcc) {
    const mcc = Number(rawMcc);
    if (!Number.isFinite(mcc)) return '';
    if ([5411, 5422, 5441, 5451, 5462, 5499, 5811, 5812, 5813, 5814].includes(mcc)) return 'Essen';
    if ([5511, 5521, 5531, 5532, 5533, 5541, 5542, 5551, 7512, 7523, 7531, 7534, 7535, 7538].includes(mcc)) return 'Auto';
    if ([5912, 8011, 8021, 8041, 8042, 8049, 8050, 8062, 8099].includes(mcc)) return 'Gesundheit';
    if ([4111, 4112, 4121, 4131, 4411, 4511, 4722, 7011, 7513, 7519].includes(mcc)) return 'Reisen';
    if ([7832, 7841, 7911, 7922, 7929, 7932, 7933, 7991, 7996, 7997, 7999].includes(mcc)) return 'Freizeit';
    if ([4812, 4814, 4816, 4899, 4900].includes(mcc)) return 'Rechnungen';
    if ((mcc >= 5200 && mcc <= 5399) || (mcc >= 5600 && mcc <= 5735) || [5941, 5942, 5943, 5944, 5945, 5947, 5977, 5999].includes(mcc)) return 'Shopping';
    return '';
  }

  function classify(tx) {
    const hay = clean(`${tx.merchant || ''} ${tx.description || ''} ${tx.bankCode || ''}`).toUpperCase();
    if (tx.type === 'income') {
      if (/ERSTATT|REFUND|RÜCKZAHL|RUECKZAHL|REVERSAL|STORNO/.test(hay)) {
        return { category: 'Rückzahlung', name: titleCase(tx.merchant || 'Rückzahlung') };
      }
      return { category: 'Sonstiges', name: titleCase(tx.merchant || tx.description || 'Eingang') };
    }
    for (const [pattern, name, category] of merchantRules) {
      if (pattern.test(hay)) return { category, name };
    }
    return {
      category: categoryFromMcc(tx.mcc) || 'Sonstiges',
      name: titleCase(tx.merchant || tx.description || 'Bankbuchung')
    };
  }

  function isSalary(tx) {
    if (tx.type !== 'income') return false;
    const hay = clean(`${tx.merchant || ''} ${tx.description || ''}`).toUpperCase();
    if (/SCHMETTERLING/.test(hay)) return true;
    return /\bGEHALT\b|\bLOHN\b|SALARY|PAYROLL|LOHNZAHLUNG|ENTGELT/.test(hay);
  }

  function isOwnBankTransfer(tx) {
    const hay = clean(`${tx.merchant || ''} ${tx.description || ''}`).toUpperCase();
    if (tx.provider === 'c24' && /\bREVOLUT\b/.test(hay)) return true;
    if (tx.provider === 'revolut' && /\bC24\b|CHECK24 BANK/.test(hay)) return true;
    return false;
  }

  function moneyClose(a, b) {
    return Math.abs(Number(a || 0) - Number(b || 0)) < 0.011;
  }

  function alreadyLoggedManually(tx, classification) {
    const bankName = normalized(classification.name);
    return data.transactions.some(row => {
      if (row.bankRef === tx.ref) return true;
      if (row.source === 'bank') return false;
      if (row.type !== tx.type || row.date !== tx.date || !moneyClose(row.amount, tx.amount)) return false;
      const manualName = normalized(row.note || '');
      if (manualName && bankName && (manualName.includes(bankName) || bankName.includes(manualName))) return true;
      return row.category === classification.category;
    });
  }

  function alreadyLoggedAsCarCost(tx, classification) {
    if (tx.type !== 'expense' || classification.category !== 'Auto') return false;
    if (data.fuelEntries.some(row => row.date === tx.date && moneyClose(row.totalPrice, tx.amount))) return true;
    return data.carExpenses.some(row => row.date === tx.date && moneyClose(row.amount, tx.amount));
  }

  function refreshArchive(monthKey) {
    const archive = data.monthArchives.find(a => a.monthKey === monthKey);
    if (!archive || typeof monthSummary !== 'function') return;
    const summary = monthSummary(monthKey);
    archive.transactions = clone(data.transactions.filter(t => sameMonthKey(t.date, monthKey)));
    archive.summary = { ...summary, cfg: clone(summary.cfg) };
  }

  function importRows(rows) {
    const seen = importedRefs();
    let imported = 0;
    let skipped = 0;
    let changed = false;
    const affectedMonths = new Set();

    for (const tx of rows) {
      if (!tx?.ref || seen.has(tx.ref)) continue;
      const classification = classify(tx);
      const skip = isSalary(tx) || isOwnBankTransfer(tx) || alreadyLoggedManually(tx, classification) || alreadyLoggedAsCarCost(tx, classification);
      rememberRef(tx.ref);
      seen.add(tx.ref);
      changed = true;

      if (skip) {
        skipped += 1;
        continue;
      }

      data.transactions.push({
        id: uid(),
        type: tx.type === 'income' ? 'income' : 'expense',
        amount: Number(tx.amount),
        category: classification.category,
        note: classification.name,
        date: tx.date,
        createdAt: new Date().toISOString(),
        source: 'bank',
        bankProvider: tx.provider,
        bankRef: tx.ref,
        bankMerchant: tx.merchant || '',
        bankMcc: tx.mcc || ''
      });
      affectedMonths.add(String(tx.date).slice(0, 7));
      imported += 1;
    }

    if (changed) {
      data.transactions.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      for (const month of affectedMonths) refreshArchive(month);
    }
    return { imported, skipped, changed };
  }

  function syncMeta() {
    return settings().bankSync;
  }

  async function fetchProvider(provider) {
    const cfg = PROVIDERS[provider];
    const qs = new URLSearchParams({ date_from: currentMonthStart() });
    const res = await fetch(`${cfg.endpoint}?${qs.toString()}`, { cache: 'no-store', credentials: 'same-origin' });
    if (res.status === 401) return { provider, connected: false, rows: [] };
    const payload = await res.json().catch(() => ({}));
    if (res.status === 409 && payload.transactionsConsentRequired) {
      return { provider, connected: true, consentRequired: true, rows: [] };
    }
    if (!res.ok) return { provider, connected: hasBank(provider), error: true, rows: [] };
    return {
      provider,
      connected: true,
      consentRequired: !!payload.transactionsConsentRequired,
      rows: Array.isArray(payload.transactions) ? payload.transactions : []
    };
  }

  async function syncAll(showToast = false) {
    if (busy || typeof data === 'undefined') return;
    busy = true;
    redraw();
    try {
      const results = await Promise.all(Object.keys(PROVIDERS).map(fetchProvider));
      consentRequired = new Set(results.filter(r => r.consentRequired).map(r => r.provider));
      const rows = results.flatMap(r => r.rows || []);
      const result = importRows(rows);
      const meta = syncMeta();
      meta.lastAt = new Date().toISOString();
      meta.lastImported = result.imported;
      meta.totalImported = Number(meta.totalImported || 0) + result.imported;
      meta.providers = Object.fromEntries(results.map(r => [r.provider, { connected: !!r.connected, consentRequired: !!r.consentRequired, ok: !r.error }]));
      lastResult = { imported: result.imported, skipped: result.skipped, lastAt: meta.lastAt };
      saveData();
      render();
      if (showToast) {
        if (consentRequired.size) toast('Bankzugriff für Buchungen einmal freigeben');
        else if (result.imported) toast(`${result.imported} neue ${result.imported === 1 ? 'Buchung' : 'Buchungen'} übernommen`);
        else toast('Bankbuchungen sind aktuell');
      }
    } catch (error) {
      if (showToast) toast('Bankbuchungen gerade nicht erreichbar');
    } finally {
      busy = false;
      redraw();
    }
  }

  function age(iso) {
    if (!iso) return 'noch nicht synchronisiert';
    const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
    if (minutes < 1) return 'gerade eben';
    if (minutes < 60) return `vor ${minutes} Min.`;
    const hours = Math.round(minutes / 60);
    return hours < 24 ? `vor ${hours} Std.` : `vor ${Math.round(hours / 24)} T.`;
  }

  function providerButton(provider) {
    const cfg = PROVIDERS[provider];
    return `<button class="bank-sync-consent" data-bank-consent="${provider}">${cfg.label} freigeben</button>`;
  }

  function card() {
    const connected = Object.keys(PROVIDERS).filter(hasBank);
    if (!connected.length && !consentRequired.size) return '';
    const meta = syncMeta();
    const consent = [...consentRequired];
    if (consent.length) {
      return `<section class="bank-sync-card bank-sync-attention">
        <div class="bank-sync-head"><div><strong>Bankbuchungen</strong><span>Einmalige Freigabe nötig</span></div><span class="bank-sync-dot">!</span></div>
        <p>Kontostände funktionieren bereits. Für automatische Ausgaben müssen die Buchungen noch separat freigegeben werden.</p>
        <div class="bank-sync-actions">${consent.map(providerButton).join('')}</div>
      </section>`;
    }
    return `<section class="bank-sync-card">
      <div class="bank-sync-head"><div><strong>Bankbuchungen</strong><span>Revolut + C24 · ${age(meta.lastAt || lastResult.lastAt)}</span></div><span class="bank-sync-status">${busy ? '…' : '✓'}</span></div>
      <div class="bank-sync-summary"><span>Automatisch kategorisiert</span><strong>${Number(meta.lastImported || 0)} neu</strong></div>
      <button class="bank-sync-now" data-bank-sync-now ${busy ? 'disabled' : ''}>${busy ? 'Synchronisiert …' : 'Jetzt synchronisieren'}</button>
    </section>`;
  }

  function mount() {
    const screen = document.getElementById('screen');
    if (!screen || typeof ui === 'undefined' || ui.tab !== 'money') return;
    document.getElementById('bank-sync-slot')?.remove();
    const html = card();
    if (!html) return;
    const slot = document.createElement('div');
    slot.id = 'bank-sync-slot';
    slot.innerHTML = html;
    const c24 = screen.querySelector('#c24-slot');
    const revolut = screen.querySelector('#revolut-slot');
    const anchor = c24 || revolut || screen.querySelector('.available-card');
    if (anchor) anchor.insertAdjacentElement('afterend', slot);
    else screen.prepend(slot);
  }

  function redraw() {
    document.getElementById('bank-sync-slot')?.remove();
    mount();
  }

  function reconnect(provider) {
    const cfg = PROVIDERS[provider];
    if (!cfg) return;
    localStorage.setItem(cfg.startKey, String(Date.now()));
    window.location.href = cfg.connect;
  }

  const previousRender = window.render;
  if (typeof previousRender === 'function') {
    window.render = function(...args) {
      const result = previousRender.apply(this, args);
      queueMicrotask(mount);
      return result;
    };
  }

  document.addEventListener('click', async event => {
    const consent = event.target.closest('[data-bank-consent]');
    if (consent) {
      reconnect(consent.dataset.bankConsent);
      return;
    }
    if (event.target.closest('[data-bank-sync-now]')) await syncAll(true);
  });

  queueMicrotask(mount);
  setTimeout(() => syncAll(false), 2600);
  window.addEventListener('online', () => syncAll(false));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const last = Date.parse(syncMeta().lastAt || 0) || 0;
    if (Date.now() - last > 10 * 60 * 1000) syncAll(false);
    else redraw();
  });
  setInterval(() => {
    if (document.visibilityState === 'visible') syncAll(false);
  }, 15 * 60 * 1000);
})();
