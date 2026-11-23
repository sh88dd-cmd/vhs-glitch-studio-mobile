/* VHS Video Lab offline assets; separate cache and service worker from photo app. */
const VERSION='vhs-video-lab-0.9.4';
const FILES=['./','./index.html','./app.js','./live-camera.js','./live-fx.js','./film-gallery.js','./film-core.js','./glitch-engine.js','./audio-engine.js','./audio-studio.js','./effects-reset.js','./clean-path.js','./camera-osd.js','./keyframes.js','./film-damage.js','./audio-extract.js','./special-modes.js','./player-ui.js','./help-content.js','./help-illustrations.js','./help-ui.js','./face-ai.js','./creative-engine.js','./creative-ui.js','./vendor/tracking-min.js','./vendor/tracking-face-min.js','./styles.css','./manifest.webmanifest','./icons/icon-180.png','./icons/icon-192.png','./icons/icon-512.png',
 '../ntsc-photo.js','../looks.json','../jszip.min.js'];
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(VERSION).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(x=>x.startsWith('vhs-video-lab-')&&x!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET'||new URL(request.url).origin!==location.origin)return;
 event.respondWith((async()=>{
  const cache=await caches.open(VERSION);
  // Cache-first navigation prevents Safari PWA cold black screens when the
  // connection to GitHub Pages is weak. Background check updates the cached
  // entry without delaying current page display.
  if(request.mode==='navigate'){
   const cached=await cache.match(request,{ignoreSearch:true})||
    await cache.match('./index.html');
   if(cached){
    event.waitUntil(fetch(request,{cache:'no-store'}).then(response=>{
     if(response.ok)return cache.put(request,response.clone());
    }).catch(()=>{}));
    return cached;
   }
   try{const response=await fetch(request);if(response.ok)await cache.put(request,response.clone());return response;}
   catch{return Response.error();}
  }
  const wantsFresh=/\.(?:js|css|json|webmanifest)$/.test(new URL(request.url).pathname);
  if(wantsFresh){
   // Eagerly precached scripts are available instantly even in airplane
   // mode and on a bad mobile connection. Versioned SW install ensures
   // matching HTML, styles and JavaScript are replaced as one build.
   const saved=await cache.match(request,{ignoreSearch:true});
   if(saved){
    const refresh=fetch(request,{cache:'no-store'}).then(response=>{
     if(response.ok)return cache.put(request,response.clone());
    }).catch(()=>{});
    event.waitUntil?.(refresh);
    return saved;
   }
   try{
    const response=await fetch(request);
    if(response.ok)await cache.put(request,response.clone());
    return response;
   }catch{return Response.error();}
  }
  const old=await cache.match(request,{ignoreSearch:true});if(old)return old;
  try{const response=await fetch(request);if(response.ok)await cache.put(request,response.clone());return response;}
  catch{return Response.error();}
 })());
});