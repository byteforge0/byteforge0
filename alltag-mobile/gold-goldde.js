(() => {
  let busy = false;

  function ready(g) {
    return Number(g?.eurPerOz) > 0 && Number(g?.eurPerGram) > 0;
  }

  window.goldTicker = function goldTicker() {
    const g = market.gold;
    const ok = ready(g);
    return `<button class="gold-strip gold-strip-dual" data-action="refresh-gold" aria-label="Goldpreis von GOLD.DE aktualisieren">
      <span class="gold-brand">
        <span class="gold-mark" aria-hidden="true">Au</span>
        <span><strong>Gold 24K</strong><small>© GOLD.DE</small></span>
      </span>
      <span class="gold-values">
        <span><small>1 g</small><strong class="gold-gram">${ok ? moneyGold(g.eurPerGram) : '–'}</strong></span>
        <span><small>1 oz</small><strong class="gold-ounce">${ok ? moneyGold(g.eurPerOz) : '–'}</strong></span>
      </span>
      <span class="gold-live">${ok ? 'LIVE' : '↻'}</span>
    </button>`;
  };

  window.updateGoldDom = function updateGoldDom() {
    const g = market.gold;
    const ok = ready(g);
    document.querySelectorAll('.gold-gram').forEach(el => { el.textContent = ok ? moneyGold(g.eurPerGram) : '–'; });
    document.querySelectorAll('.gold-ounce').forEach(el => { el.textContent = ok ? moneyGold(g.eurPerOz) : '–'; });
    document.querySelectorAll('.gold-live').forEach(el => { el.textContent = ok ? 'LIVE' : '↻'; });
  };

  window.fetchGoldPrice = async function fetchGoldPrice(showToast = false) {
    if (busy) return;
    busy = true;
    try {
      const response = await fetch(`/api/gold?t=${Date.now()}`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) throw new Error(`gold endpoint ${response.status}`);
      const payload = await response.json();
      const eurPerOz = Number(payload.ounceEur);
      const eurPerGram = Number(payload.gramEur);
      if (!Number.isFinite(eurPerOz) || eurPerOz <= 0 || !Number.isFinite(eurPerGram) || eurPerGram <= 0) {
        throw new Error('invalid gold payload');
      }
      market.gold = {
        eurPerOz,
        eurPerGram,
        source: 'GOLD.DE',
        updatedAt: Number(payload.timestamp)
          ? new Date(Number(payload.timestamp) * 1000).toISOString()
          : new Date().toISOString()
      };
      saveGoldCache(market.gold);
      updateGoldDom();
      if (showToast) toast('Goldpreis aktualisiert');
    } catch (error) {
      updateGoldDom();
      if (showToast) toast(ready(market.gold) ? 'Letzten Goldpreis angezeigt' : 'Goldpreis gerade nicht erreichbar');
    } finally {
      busy = false;
    }
  };

  render();
  fetchGoldPrice(false);
  setInterval(() => fetchGoldPrice(false), 300000);
})();
