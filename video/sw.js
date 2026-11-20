/* VHS Video Lab offline assets; separate cache and service worker from photo app. */
const VERSION='vhs-video-lab-0.3.0';
const FILES=['./','./index.html','./app.js','./film-core.js','./glitch-engine.js','./audio-engine.js','./player-ui.js','./styles.css','./manifest.webmanifest',
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
  const wantsFresh=request.mode==='navigate'||/\.(?:js|css|json|webmanifest)$/.test(new URL(request.url).pathname);
  if(wantsFresh){
   try{const response=await fetch(request,{cache:'no-store'});if(response.ok)await cache.put(request,response.clone());return response;}
   catch{const fallback=await cache.match(request,{ignoreSearch:true});return fallback||(request.mode==='navigate'?await cache.match('./index.html'):null)||Response.error();}
  }
  const old=await cache.match(request,{ignoreSearch:true});if(old)return old;
  try{const response=await fetch(request);if(response.ok)await cache.put(request,response.clone());return response;}
  catch{return Response.error();}
 })());
});