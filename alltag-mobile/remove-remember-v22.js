'use strict';

(() => {
  const REMEMBER_ACTIONS = [
    'new-remember', 'toggle-remember', 'star-remember', 'delete-remember', 'edit-remember'
  ];

  function stripRememberFromHtml(html) {
    const template = document.createElement('template');
    template.innerHTML = String(html || '');

    template.content.querySelectorAll('[data-tab="remember"]').forEach(el => el.remove());

    const trigger = template.content.querySelector('[data-action="new-remember"]');
    const section = trigger?.closest('.section-title');
    if (section) {
      const content = section.nextElementSibling;
      if (content) content.remove();
      section.remove();
    }

    for (const action of REMEMBER_ACTIONS) {
      template.content.querySelectorAll(`[data-action="${action}"]`).forEach(el => el.remove());
    }
    return template.innerHTML;
  }

  if (typeof window.renderHome === 'function') {
    const originalRenderHome = window.renderHome;
    window.renderHome = function renderHomeWithoutRemember(...args) {
      return stripRememberFromHtml(originalRenderHome.apply(this, args));
    };
  }

  if (typeof window.renderRemember === 'function') {
    window.renderRemember = function removedRememberPage() {
      return typeof window.renderHome === 'function' ? window.renderHome() : '';
    };
  }

  function cleanDom(root = document) {
    root.querySelectorAll?.('[data-tab="remember"]').forEach(el => el.remove());

    for (const action of REMEMBER_ACTIONS) {
      root.querySelectorAll?.(`[data-action="${action}"]`).forEach(el => {
        const title = el.closest('.section-title');
        if (title && action === 'new-remember') {
          const content = title.nextElementSibling;
          if (content) content.remove();
          title.remove();
        } else {
          el.remove();
        }
      });
    }

    const title = root.querySelector?.('.page-header h1');
    if (title?.textContent?.trim() === 'Merken') {
      document.querySelector('[data-tab="home"]')?.click();
    }
  }

  function start() {
    cleanDom();
    const screen = document.getElementById('screen');
    const sheet = document.getElementById('sheet-root');
    const observer = new MutationObserver(records => {
      if (records.some(record => record.addedNodes.length)) cleanDom();
    });
    if (screen) observer.observe(screen, { childList: true, subtree: true });
    if (sheet) observer.observe(sheet, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
