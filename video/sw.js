/* VHS Video Lab offline assets; separate cache and service worker from photo app. */
const VERSION='vhs-video-lab-0.9.6';
const FILES=['./','./index.html','./app.js','./live-camera.js','./live-fx.js','./film-gallery.js','./film-core.js','./glitch-engine.js','./audio-engine.js','./audio-studio.js','./effects-reset.js','./clean-path.js','./camera-osd.js','./keyframes.js','./film-damage.js','./audio-extract.js','./special-modes.js','./player-ui.js','./help-content.js','./help-illustrations.js','./help-ui.js','./face-ai.js','./creative-engine.js','./creative-ui.js','./vendor/tracking-min.js','./vendor/tracking-face-min.js','./styles.css','./manifest.webmanifest','./icons/icon-180.png','./icons/icon-192.png','./icons/icon-512.png',
 '../ntsc-photo.js','../looks.json','../jszip.min.js'];
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(VERSION).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(x=>x.startsWith('vhs-video-lab-')&&x!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
// Prefer genuinely fresh HTML/JS on online launches; older app versions
// were served cache-first even after the user requested an update.
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET'||new URL(request.url).origin!==location.origin)return;
 event.respondWith((async()=>{
  const cache=await caches.open(VERSION);
  const url=new URL(request.url);
  const isNavigation=request.mode==='navigate';
  const liveAsset=/\.(?:js|css|json|webmanifest)$/.test(url.pathname);
  if(isNavigation||liveAsset){
   try{
    const response=await fetch(request,{cache:'no-store'});
    if(response.ok)event.waitUntil(cache.put(request,response.clone()));
    return response;
   }catch(err){
    const cached=await cache.match(request,{ignoreSearch:true})||
      (isNavigation?await cache.match('./index.html'):null);
    if(cached)return cached;
    return Response.error();
   }
  }
  const cached=await cache.match(request,{ignoreSearch:true});
  if(cached)return cached;
  try{
   const response=await fetch(request);
   if(response.ok)event.waitUntil(cache.put(request,response.clone()));
   return response;
  }catch{return Response.error();}
 })());
});
