(() => {
  const GOLD_DE_API = 'https://api.edelmetalle.de/public.json';
  const OUNCE_GRAMS = 31.1034768;

  window.goldTicker = function goldTicker() {
    const g = market.gold;
    const ready = Number(g?.eurPerOz) > 0;
    const gram = ready ? moneyGold(g.eurPerGram) : '–';
    const ounce = ready ? moneyGold(g.eurPerOz) : '–';
    return `<button class="gold-strip gold-strip-dual" data-action="refresh-gold" aria-label="Goldpreis von GOLD.DE aktualisieren">
      <span class="gold-brand"><span class="gold-dot">●</span><span><strong>Gold 24K</strong><small>© GOLD.DE</small></span></span>
      <span class="gold-values">
        <span><small>1 g</small><strong class="gold-gram">${gram}</strong></span>
        <span><small>1 oz</small><strong class="gold-ounce">${ounce}</strong></span>
      </span>
      <span class="gold-live">${ready ? 'LIVE' : '↻'}</span>
    </button>`;
  };

  window.fetchGoldPrice = async function fetchGoldPrice(showToast = false) {
    if (goldBusy) return;
    goldBusy = true;
    try {
      const res = await fetch(GOLD_DE_API, { cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error('GOLD.DE request failed');
      const payload = await res.json();
      const eurPerOz = Number(payload.gold_eur);
      if (!Number.isFinite(eurPerOz) || eurPerOz <= 0) throw new Error('Invalid GOLD.DE price');
      market.gold = {
        eurPerOz,
        eurPerGram: eurPerOz / OUNCE_GRAMS,
        source: 'GOLD.DE',
        updatedAt: Number(payload.timestamp) ? new Date(Number(payload.timestamp) * 1000).toISOString() : new Date().toISOString()
      };
      saveGoldCache(market.gold);
      updateGoldDom();
      if (showToast) toast('Goldpreis von GOLD.DE aktualisiert');
    } catch (error) {
      if (showToast) toast(market.gold ? 'Letzten GOLD.DE Goldpreis angezeigt' : 'Goldpreis gerade nicht erreichbar');
    } finally {
      goldBusy = false;
    }
  };

  window.updateGoldDom = function updateGoldDom() {
    const g = market.gold;
    const ready = Number(g?.eurPerOz) > 0;
    document.querySelectorAll('.gold-gram').forEach(el => el.textContent = ready ? moneyGold(g.eurPerGram) : '–');
    document.querySelectorAll('.gold-ounce').forEach(el => el.textContent = ready ? moneyGold(g.eurPerOz) : '–');
    document.querySelectorAll('.gold-live').forEach(el => el.textContent = ready ? 'LIVE' : '↻');
  };

  render();
  fetchGoldPrice(false);
  setInterval(() => fetchGoldPrice(false), 300000);
})();
