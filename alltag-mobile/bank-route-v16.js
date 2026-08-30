(() => {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    if (typeof input === 'string') {
      try {
        const url = new URL(input, window.location.origin);
        if (url.origin === window.location.origin && (url.pathname === '/api/revolut/transactions' || url.pathname === '/api/c24/transactions')) {
          url.pathname = url.pathname.replace('/transactions', '/balance');
          url.searchParams.set('transactions', '1');
          return nativeFetch(`${url.pathname}${url.search}`, init);
        }
      } catch {}
    }
    return nativeFetch(input, init);
  };
})();
