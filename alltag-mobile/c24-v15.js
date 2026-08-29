(() => {
  const CACHE_KEY = 'alltag:c24:balance:v1';
  const START_KEY = 'alltag:c24:started:v1';
  let state = { connected: false, loading: true, data: null };

  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (cached) state = { connected: true, loading: false, data: cached };
  } catch {}

  const fmt = n => new Intl.NumberFormat('de-DE', {
    style: 'currency', currency: 'EUR', minimumFractionDigits: 2
  }).format(Number(n) || 0);

  const age = iso => {
    if (!iso) return '';
    const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (minutes < 1) return 'gerade eben';
    if (minutes < 60) return `vor ${minutes} Min.`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `vor ${hours} Std.`;
    return `vor ${Math.round(hours / 24)} T.`;
  };

  function handoffPending() {
    const startedAt = Number(localStorage.getItem(START_KEY) || 0);
    if (!startedAt) return false;
    if (Date.now() - startedAt > 30 * 60 * 1000) {
      localStorage.removeItem(START_KEY);
      return false;
    }
    return true;
  }

  function card() {
    if (state.connected && state.data) {
      const d = state.data;
      return `<section class="c24-card">
        <div class="c24-top">
          <div class="c24-brand"><span class="c24-logo">C24</span><div><strong>C24 Bank</strong><span>${d.accountCount > 1 ? `${d.accountCount} EUR-Konten` : 'EUR-Konto'} · ${age(d.fetchedAt)}</span></div></div>
          <button class="c24-refresh" data-c24-refresh aria-label="C24 aktualisieren">↻</button>
        </div>
        <div class="c24-balance">${fmt(d.available)}</div>
        <div class="c24-caption">Verfügbar${Number.isFinite(d.booked) && Math.abs(d.booked - d.available) > .009 ? ` · Gebucht ${fmt(d.booked)}` : ''}</div>
      </section>`;
    }

    if (handoffPending()) {
      return `<section class="c24-card c24-handoff">
        <div class="c24-brand"><span class="c24-logo">C24</span><div><strong>C24-Freigabe</strong><span>Nach der Bestätigung im Browser hier fortfahren</span></div></div>
        <button class="c24-takeover" data-c24-import>Verbindung übernehmen</button>
        <button class="c24-restart" data-c24-restart>Neu verbinden</button>
      </section>`;
    }

    if (state.loading && !state.data) {
      return `<section class="c24-card c24-loading"><div class="c24-brand"><span class="c24-logo">C24</span><div><strong>C24 Bank</strong><span>Verbindung wird geprüft …</span></div></div><span class="c24-spinner"></span></section>`;
    }

    return `<button class="c24-card c24-connect" data-c24-connect>
      <div class="c24-brand"><span class="c24-logo">C24</span><div><strong>C24 Bank verbinden</strong><span>Kontostand automatisch in Alltag anzeigen</span></div></div>
      <span class="c24-arrow">›</span>
    </button>`;
  }

  function mount() {
    const screen = document.getElementById('screen');
    if (!screen || document.getElementById('c24-slot')) return;
    if (typeof ui === 'undefined' || (ui.tab !== 'home' && ui.tab !== 'money')) return;
    const slot = document.createElement('div');
    slot.id = 'c24-slot';
    slot.innerHTML = card();

    const revolut = screen.querySelector('#revolut-slot');
    if (revolut) {
      revolut.insertAdjacentElement('afterend', slot);
      return;
    }

    const anchor = ui.tab === 'home' ? screen.querySelector('.gold-strip') : screen.querySelector('.available-card');
    if (anchor) anchor.insertAdjacentElement('afterend', slot);
    else screen.prepend(slot);
  }

  function redraw() {
    document.getElementById('c24-slot')?.remove();
    mount();
  }

  async function refresh(showToast = false) {
    try {
      const res = await fetch('/api/c24/balance', { cache: 'no-store', credentials: 'same-origin' });
      if (res.status === 401) {
        state = { connected: false, loading: false, data: null };
        localStorage.removeItem(CACHE_KEY);
      } else if (!res.ok) {
        throw new Error('balance_failed');
      } else {
        const data = await res.json();
        state = { connected: true, loading: false, data };
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
        localStorage.removeItem(START_KEY);
        if (showToast && typeof toast === 'function') toast('C24 aktualisiert');
      }
    } catch {
      state.loading = false;
      if (!state.data) state.connected = false;
      if (showToast && typeof toast === 'function') toast('C24 gerade nicht erreichbar');
    }
    redraw();
  }

  function startConnect() {
    localStorage.setItem(START_KEY, String(Date.now()));
    redraw();
    window.location.href = '/api/c24/connect';
  }

  async function getHandoffCode() {
    try {
      if (navigator.clipboard?.readText) {
        const value = (await navigator.clipboard.readText()).trim();
        if (value) return value;
      }
    } catch {}
    return (window.prompt('Den im Browser kopierten C24-Code hier einfügen:') || '').trim();
  }

  async function importConnection() {
    const token = await getHandoffCode();
    if (!token) return;
    if (!token.startsWith('AC1.')) {
      if (typeof toast === 'function') toast('Kein gültiger C24-Code kopiert');
      return;
    }

    const button = document.querySelector('[data-c24-import]');
    if (button) {
      button.disabled = true;
      button.textContent = 'Wird übernommen …';
    }

    try {
      const res = await fetch('/api/c24/import', {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      if (!res.ok) {
        const info = await res.json().catch(() => ({}));
        throw new Error(info.error || 'import_failed');
      }
      localStorage.removeItem(START_KEY);
      if (typeof toast === 'function') toast('C24 verbunden');
      await refresh(false);
    } catch (error) {
      if (typeof toast === 'function') toast(error?.message === 'expired_or_invalid' ? 'Code ist abgelaufen – bitte neu verbinden' : 'Code ungültig oder abgelaufen');
      redraw();
    }
  }

  const oldRender = window.render;
  if (typeof oldRender === 'function') {
    window.render = function(...args) {
      const result = oldRender.apply(this, args);
      queueMicrotask(mount);
      return result;
    };
  }

  document.addEventListener('click', async e => {
    if (e.target.closest('[data-c24-connect]')) { startConnect(); return; }
    if (e.target.closest('[data-c24-import]')) { await importConnection(); return; }
    if (e.target.closest('[data-c24-restart]')) { localStorage.removeItem(START_KEY); startConnect(); return; }
    if (e.target.closest('[data-c24-refresh]')) await refresh(true);
  });

  queueMicrotask(mount);
  refresh(false);
  window.addEventListener('online', () => refresh(false));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    redraw();
    if (!handoffPending()) {
      const last = Date.parse(state.data?.fetchedAt || 0) || 0;
      if (Date.now() - last > 5 * 60 * 1000) refresh(false);
    }
  });
  setInterval(() => {
    if (document.visibilityState === 'visible' && state.connected) refresh(false);
  }, 15 * 60 * 1000);
})();
