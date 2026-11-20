const VERSION='vhs-mobile-v1.0.0';
const APP_FILES=['./','./index.html','./styles.css','./app.js','./looks.json','./jszip.min.js','./manifest.webmanifest','./icons/icon-180.png','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(APP_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('vhs-mobile-') && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req=e.request, url=new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || !url.pathname.startsWith(new URL('./',self.registration.scope).pathname)) return;
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res.ok && res.type === 'basic') {
      const clone=res.clone();
      caches.open(VERSION).then(c => c.put(req, clone)).catch(()=>{});
    }
    return res;
  })));
});
