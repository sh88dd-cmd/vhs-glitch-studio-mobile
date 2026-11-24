/* VHS Video Lab offline assets; separate cache and service worker from photo app. */
const VERSION='vhs-video-lab-0.9.36';
const FILES=['./','./index.html','../stats-owner.js','../usage-stats.js','./app.js','./correction.js','./photo-video.js','./transitions.js','./preview-worker.js','./live-camera.js','./live-fx.js','./film-gallery.js','./film-core.js','./glitch-engine.js','./audio-engine.js','./audio-studio.js','./effects-reset.js','./clean-path.js','./camera-osd.js','./keyframes.js','./film-damage.js','./audio-extract.js','./special-modes.js','./player-ui.js','./help-content.js','./help-illustrations.js','./help-ui.js','./face-ai.js','./creative-engine.js','./creative-ui.js','./vendor/tracking-min.js','./vendor/tracking-face-min.js','./styles.css','./manifest.webmanifest','./icons/icon-192.png',
 '../camera-capture-controls.js','../ntsc-photo.js','../looks.json','../assets/emulsion-451.json','../jszip.min.js'];
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(VERSION).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(x=>x.startsWith('vhs-video-lab-')&&x!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
// Prefer genuinely fresh HTML/JS on online launches; older app versions
// were served cache-first even after the user requested an update.
// Offline-first for pre-cached JS/assets, but revalidate the HTML online so
// an installed iOS PWA never stays indefinitely on an obsolete export engine.
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET'||new URL(request.url).origin!==location.origin)return;
 event.respondWith((async()=>{
  const cache=await caches.open(VERSION);
  const url=new URL(request.url);
  if(request.mode==='navigate'){
   const timeout=new AbortController();
   const timer=setTimeout(()=>timeout.abort(),1800);
   try{
    const response=await fetch(request,{cache:'no-store',signal:timeout.signal});
    clearTimeout(timer);
    if(response.ok)event.waitUntil(cache.put(request,response.clone()));
    return response;
   }catch{
    clearTimeout(timer);
    const offline=await cache.match(request,{ignoreSearch:true})||
     await cache.match('./index.html');
    if(offline)return offline;
    return Response.error();
   }
  }
  // Versioned SW precaches all scripts on install. Use its newest assets
  // immediately, then fetch an update in the background when online.
  const script=/\.(?:js|css|json|webmanifest)$/.test(url.pathname);
  if(script){
   const cached=await cache.match(request)||(url.search?null:await cache.match(request,{ignoreSearch:true}));
   if(cached){
    event.waitUntil(fetch(request,{cache:'no-store'}).then(response=>{
     if(response.ok)return cache.put(request,response.clone());
    }).catch(()=>{}));
    return cached;
   }
  }
  const offline=await cache.match(request,{ignoreSearch:true});
  if(offline&&!script)return offline;
  try{
   const response=await fetch(request);
   if(response.ok)event.waitUntil(cache.put(request,response.clone()));
   return response.ok?response:offline||response;
  }catch{return offline||Response.error();}
 })());
});
