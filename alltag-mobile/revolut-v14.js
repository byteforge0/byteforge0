(() => {
  const CACHE_KEY = 'alltag:revolut:balance:v1';
  const LINK_KEY = 'alltag:revolut:link:v2';
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
  const pendingLink = () => {
    try {
      const item = JSON.parse(localStorage.getItem(LINK_KEY) || 'null');
      if (!item?.linkId || !item?.claimToken) return null;
      if (Date.now() - Number(item.createdAt || 0) > 45 * 60 * 1000) { localStorage.removeItem(LINK_KEY); return null; }
      return item;
    } catch { return null; }
  };

  function card() {
    const pending = pendingLink();
    if (state.loading && !state.data && !pending) return `<section class="revolut-card revolut-loading"><div class="revolut-brand"><span class="revolut-logo">R</span><div><strong>Revolut</strong><span>Kontostand wird geladen …</span></div></div><span class="revolut-spinner"></span></section>`;
    if (!state.connected && pending) return `<section class="revolut-card revolut-loading"><div class="revolut-brand"><span class="revolut-logo">R</span><div><strong>Revolut wird verbunden</strong><span>Nach der Bestätigung im Browser einfach zu Alltag zurückkehren</span></div></div><span class="revolut-spinner"></span></section>`;
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

  function redraw() { document.getElementById('revolut-slot')?.remove(); mount(); }

  async function claimPending(showToast = false) {
    const link = pendingLink();
    if (!link) return false;
    try {
      const res = await fetch('/api/revolut/claim', {
        method: 'POST', cache: 'no-store', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkId: link.linkId, claimToken: link.claimToken })
      });
      if (res.status === 202) { redraw(); return false; }
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.status === 'connected') {
        localStorage.removeItem(LINK_KEY);
        if (showToast && typeof toast === 'function') toast('Revolut verbunden');
        return true;
      }
      if (data.status === 'error' || res.status === 400 || res.status === 410) {
        localStorage.removeItem(LINK_KEY);
        if (typeof toast === 'function') toast(data.message || 'Revolut-Verbindung fehlgeschlagen');
        redraw();
      }
    } catch {}
    return false;
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
    redraw();
  }

  async function startConnect() {
    try {
      const res = await fetch('/api/revolut/connect?format=json', { cache: 'no-store', credentials: 'same-origin' });
      if (!res.ok) throw new Error('connect_failed');
      const data = await res.json();
      if (!data?.url || !data?.linkId || !data?.claimToken) throw new Error('invalid_connect_response');
      localStorage.setItem(LINK_KEY, JSON.stringify({ linkId: data.linkId, claimToken: data.claimToken, createdAt: Date.now() }));
      redraw();
      window.location.href = data.url;
    } catch {
      localStorage.removeItem(LINK_KEY);
      if (typeof toast === 'function') toast('Revolut-Verbindung konnte nicht gestartet werden');
      redraw();
    }
  }

  const oldRender = window.render;
  if (typeof oldRender === 'function') window.render = function(...args) { const result = oldRender.apply(this, args); queueMicrotask(mount); return result; };

  document.addEventListener('click', async e => {
    if (e.target.closest('[data-revolut-connect]')) { await startConnect(); return; }
    if (e.target.closest('[data-revolut-refresh]')) { await refresh(true); return; }
  });

  async function resume() {
    const claimed = await claimPending(true);
    await refresh(false);
    if (claimed && typeof toast === 'function') toast('Revolut-Kontostand synchronisiert');
  }

  queueMicrotask(mount);
  resume();
  window.addEventListener('online', resume);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (pendingLink()) { resume(); return; }
      const t = Date.parse(state.data?.fetchedAt || 0) || 0;
      if (Date.now() - t > 5 * 60 * 1000) refresh(false);
    }
  });
  setInterval(() => { if (document.visibilityState === 'visible') { if (pendingLink()) claimPending(false).then(ok => ok && refresh(false)); else refresh(false); } }, 60 * 1000);
})();
