(() => {
  const CACHE_KEY = 'alltag:revolut:balance:v1';
  let state = { connected: false, loading: true, data: null };
  try { const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); if (cached) state = { connected: true, loading: false, data: cached }; } catch {}

  const fmt = n => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(Number(n) || 0);
  const age = iso => {
    if (!iso) return '';
    const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (m < 1) return 'gerade eben';
    if (m < 60) return `vor ${m} Min.`;
    const h = Math.round(m / 60); return `vor ${h} Std.`;
  };

  function card() {
    if (state.loading && !state.data) return `<section class="revolut-card revolut-loading"><div class="revolut-brand"><span class="revolut-logo">R</span><div><strong>Revolut</strong><span>Kontostand wird geladen …</span></div></div><span class="revolut-spinner"></span></section>`;
    if (!state.connected) return `<button class="revolut-card revolut-connect" data-revolut-connect><div class="revolut-brand"><span class="revolut-logo">R</span><div><strong>Revolut verbinden</strong><span>Kontostand automatisch in Alltag anzeigen</span></div></div><span class="revolut-arrow">›</span></button>`;
    const d = state.data || {};
    return `<section class="revolut-card"><div class="revolut-top"><div class="revolut-brand"><span class="revolut-logo">R</span><div><strong>Revolut</strong><span>${d.accountCount > 1 ? `${d.accountCount} EUR-Konten` : 'EUR-Konto'} · ${age(d.fetchedAt)}</span></div></div><button class="revolut-refresh" data-revolut-refresh aria-label="Revolut aktualisieren">↻</button></div><div class="revolut-balance">${fmt(d.available)}</div><div class="revolut-caption">Verfügbar${Number.isFinite(d.booked) && Math.abs(d.booked-d.available) > .009 ? ` · Gebucht ${fmt(d.booked)}` : ''}</div></section>`;
  }

  function mount() {
    const screen = document.getElementById('screen');
    if (!screen || document.getElementById('revolut-slot')) return;
    if (typeof ui === 'undefined' || (ui.tab !== 'home' && ui.tab !== 'money')) return;
    const slot = document.createElement('div'); slot.id = 'revolut-slot'; slot.innerHTML = card();
    const anchor = ui.tab === 'home' ? screen.querySelector('.gold-strip') : screen.querySelector('.available-card');
    if (anchor) anchor.insertAdjacentElement('afterend', slot); else screen.prepend(slot);
  }

  async function refresh(showToast = false) {
    state.loading = true; mount();
    try {
      const res = await fetch('/api/revolut/balance', { cache: 'no-store', credentials: 'same-origin' });
      if (res.status === 401) {
        state = { connected: false, loading: false, data: null };
        localStorage.removeItem(CACHE_KEY);
      } else if (!res.ok) {
        throw new Error('balance_failed');
      } else {
        const data = await res.json();
        state = { connected: true, loading: false, data };
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
        if (showToast && typeof toast === 'function') toast('Revolut aktualisiert');
      }
    } catch {
      state.loading = false;
      if (!state.data) state.connected = false;
      if (showToast && typeof toast === 'function') toast('Revolut gerade nicht erreichbar');
    }
    document.getElementById('revolut-slot')?.remove(); mount();
  }

  const oldRender = window.render;
  if (typeof oldRender === 'function') {
    window.render = function(...args) { const result = oldRender.apply(this, args); queueMicrotask(mount); return result; };
  }

  document.addEventListener('click', async e => {
    if (e.target.closest('[data-revolut-connect]')) { window.location.href = '/api/revolut/connect'; return; }
    if (e.target.closest('[data-revolut-refresh]')) { await refresh(true); return; }
  });

  const params = new URLSearchParams(location.search);
  if (params.get('revolut') === 'connected') {
    history.replaceState({}, '', location.pathname);
    setTimeout(() => typeof toast === 'function' && toast('Revolut verbunden'), 300);
  } else if (params.get('revolut') === 'error') {
    const msg = params.get('message') || 'Revolut-Verbindung abgebrochen';
    history.replaceState({}, '', location.pathname);
    setTimeout(() => typeof toast === 'function' && toast(msg), 300);
  }

  queueMicrotask(mount);
  refresh(false);
  window.addEventListener('online', () => refresh(false));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      const t = Date.parse(state.data?.fetchedAt || 0) || 0;
      if (Date.now() - t > 5 * 60 * 1000) refresh(false);
    }
  });
  setInterval(() => { if (document.visibilityState === 'visible') refresh(false); }, 15 * 60 * 1000);
})();
