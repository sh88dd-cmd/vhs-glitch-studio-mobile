const VERSION='vhs-mobile-v1.8.15';
const APP_FILES=['./','./index.html','./styles.css','./stats-owner.js','./usage-stats.js','./app.js','./camera-capture-controls.js','./photo-camera.js','./ntsc-photo.js','./photo-extras-core.js','./photo-extras-ui.js','./photo-polaroid.js','./photo-polaroid-ui.js','./photo-face-ai.js','./photo-face-detect.js',
'./assets/face/vision_bundle.mjs','./assets/face/wasm/vision_wasm_internal.js','./assets/face/wasm/vision_wasm_internal.wasm',
'./assets/face/blaze_face_short_range.tflite','./assets/face/blaze_face_full_range.tflite',
'./assets/fonts/Caveat.ttf','./assets/fonts/BadScript.ttf','./assets/fonts/MarckScript.ttf',
'./assets/fonts/Neucha.ttf','./assets/fonts/Pangolin.ttf','./assets/fonts/Pacifico.ttf','./video/vendor/tracking-min.js','./video/vendor/tracking-face-min.js','./video/glitch-engine.js','./video/film-damage.js','./video/camera-osd.js','./video/face-ai.js','./looks.json','./jszip.min.js','./manifest.webmanifest','./icons/icon-192.png'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(VERSION).then(cache=>cache.addAll(APP_FILES)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('vhs-mobile-')&&k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const req=event.request,url=new URL(req.url);
  if(req.method!=='GET'||url.origin!==location.origin||!url.pathname.startsWith(new URL('./',self.registration.scope).pathname))return;
  const networkFirst=req.mode==='navigate'||/\.(?:js|css|json|webmanifest)$/.test(url.pathname);
  event.respondWith((async()=>{
    if(networkFirst){
      try{
        // Read fresh online, falling back to the exact matching cached file when offline.
        const response=await fetch(req,{cache:'no-store'});
        if(response.ok&&response.type==='basic'){
          const cache=await caches.open(VERSION);
          const key=req.mode==='navigate'?'./index.html':req;
          await cache.put(key,response.clone());
        }
        return response;
      }catch(err){
        const stored=await caches.match(req,{ignoreSearch:true});
        if(stored)return stored;
        if(req.mode==='navigate')return await caches.match('./index.html')||Response.error();
        return Response.error();
      }
    }
    const hit=await caches.match(req,{ignoreSearch:true});
    if(hit)return hit;
    try{
      const response=await fetch(req);
      if(response.ok&&response.type==='basic'){
        const cache=await caches.open(VERSION);
        await cache.put(req,response.clone());
      }
      return response;
    }catch(err){return Response.error();}
  })());
});
