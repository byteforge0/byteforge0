const CACHE='alltag-v1.6.1';
const SHELL=['/','/index.html','/manifest.webmanifest','/icon.svg','/revolut-v14.css','/revolut-v14.js','/c24-v15.css','/c24-v15.js','/bank-sync-v16.css','/bank-route-v16.js','/bank-sync-v16.js'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>Promise.allSettled(SHELL.map(url=>cache.add(url)))).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
  const request=event.request;if(request.method!=='GET')return;const url=new URL(request.url);
  if(url.pathname.startsWith('/api/')){event.respondWith(fetch(request));return}
  if(request.mode==='navigate'){
    event.respondWith(fetch(request,{cache:'no-store'}).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(c=>c.put('/index.html',copy))}return response}).catch(async()=>await caches.match('/index.html')||await caches.match('/')));return;
  }
  event.respondWith(caches.match(request).then(cached=>{const network=fetch(request).then(response=>{if(response.ok||response.type==='opaque'){const copy=response.clone();caches.open(CACHE).then(c=>c.put(request,copy))}return response}).catch(()=>cached);return cached||network}));
});
