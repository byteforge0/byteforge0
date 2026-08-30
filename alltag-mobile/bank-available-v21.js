'use strict';

(() => {
  const SOURCES = {
    revolut: { label: 'Revolut', key: 'alltag:revolut:balance:v1' },
    c24: { label: 'C24', key: 'alltag:c24:balance:v1' }
  };

  function readJson(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); }
    catch { return null; }
  }

  function balanceOf(payload) {
    if (!payload || typeof payload !== 'object') return null;
    const available = Number(payload.available);
    if (Number.isFinite(available)) return available;
    const booked = Number(payload.booked);
    return Number.isFinite(booked) ? booked : null;
  }

  function snapshot() {
    const revolutData = readJson(SOURCES.revolut.key);
    const c24Data = readJson(SOURCES.c24.key);
    const revolut = balanceOf(revolutData);
    const c24 = balanceOf(c24Data);
    const complete = revolut !== null && c24 !== null;
    return {
      complete,
      revolut,
      c24,
      total: complete ? revolut + c24 : null,
      fetchedAt: [revolutData?.fetchedAt, c24Data?.fetchedAt].filter(Boolean).sort().at(-1) || null
    };
  }

  function fingerprint(bank) {
    return bank.complete ? `${bank.revolut}|${bank.c24}` : 'loading';
  }

  function format(value) {
    if (typeof money === 'function') return money(value);
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(value) || 0);
  }

  function patchHome(bank) {
    const card = document.querySelector('.hero-balance');
    if (!card) return;
    const fp = fingerprint(bank);
    if (card.dataset.bankBalanceFingerprint === fp) return;
    card.dataset.bankBalanceFingerprint = fp;
    card.classList.add('bank-derived-balance');

    const kicker = card.querySelector('.card-kicker');
    if (kicker) kicker.textContent = 'Noch verfügbar';
    card.querySelector('[data-action="set-balance"]')?.remove();

    const number = card.querySelector('.hero-number');
    if (number) {
      number.textContent = bank.complete ? format(bank.total) : '–';
      number.classList.toggle('negative', bank.complete && bank.total < 0);
    }

    const row = card.querySelector('.budget-row');
    if (row) row.innerHTML = bank.complete
      ? `<span>Revolut <strong>${format(bank.revolut)}</strong></span><span>C24 <strong>${format(bank.c24)}</strong></span>`
      : '<span>Revolut + C24 werden geladen …</span>';

    const breakdown = card.querySelector('.balance-breakdown');
    if (breakdown) breakdown.innerHTML = bank.complete
      ? '<span>Summe deiner beiden Bankkonten</span>'
      : '<span>„Noch verfügbar“ wird nur aus den Bankständen berechnet</span>';
  }

  function patchMoney(bank) {
    const card = document.querySelector('.available-card');
    if (!card) return;
    const fp = fingerprint(bank);
    if (card.dataset.bankBalanceFingerprint === fp) return;
    card.dataset.bankBalanceFingerprint = fp;
    card.classList.add('bank-derived-balance');

    const wrap = card.querySelector(':scope > div');
    if (!wrap) return;
    const label = wrap.querySelector(':scope > span');
    const value = wrap.querySelector(':scope > strong');
    let detail = wrap.querySelector('.bank-total-detail');

    if (label) label.textContent = 'Noch verfügbar';
    if (value) {
      value.textContent = bank.complete ? format(bank.total) : '–';
      value.classList.toggle('negative', bank.complete && bank.total < 0);
    }

    wrap.querySelector(':scope > small:not(.bank-total-detail)')?.remove();
    if (!detail) {
      detail = document.createElement('small');
      detail.className = 'bank-total-detail';
      wrap.append(detail);
    }
    detail.textContent = bank.complete
      ? `Revolut ${format(bank.revolut)} + C24 ${format(bank.c24)}`
      : 'Revolut + C24 werden geladen …';

    card.querySelector('[data-action="set-balance"]')?.remove();
  }

  function patch() {
    const bank = snapshot();
    window.alltagBankBalance = bank;
    patchHome(bank);
    patchMoney(bank);
  }

  const observer = new MutationObserver(() => queueMicrotask(patch));
  function start() {
    const screen = document.getElementById('screen');
    if (screen) observer.observe(screen, { childList: true, subtree: true });
    patch();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();

  window.addEventListener('online', () => setTimeout(patch, 800));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') setTimeout(patch, 600);
  });
  setInterval(() => {
    if (document.visibilityState === 'visible') patch();
  }, 2500);
})();
