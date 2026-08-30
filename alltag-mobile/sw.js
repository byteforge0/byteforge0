const CACHE='alltag-v2.1.0';
const SHELL=['/','/index.html','/manifest.webmanifest','/icon.svg','/app.css','/v11.css','/gold-goldde.css','/optimizer-v13.css','/v2.css','/bank-available-v21.css','/app-base.js','/app-pages.js','/app-sheets.js','/app-main.js','/gold-goldde.js','/bank-v2.js','/optimizer-v13.js','/ux-v2.js','/bank-available-v21.js'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>Promise.allSettled(SHELL.map(url=>cache.add(url)))).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.pathname.startsWith('/api/')){event.respondWith(fetch(request));return}
  if(request.mode==='navigate'){
    event.respondWith(fetch(request,{cache:'no-store'}).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(c=>c.put('/index.html',copy))}return response}).catch(async()=>await caches.match('/index.html')||await caches.match('/')));
    return;
  }
  event.respondWith(caches.match(request).then(cached=>{const network=fetch(request).then(response=>{if(response.ok||response.type==='opaque'){const copy=response.clone();caches.open(CACHE).then(c=>c.put(request,copy))}return response}).catch(()=>cached);return cached||network}));
});
