const VERSION='vhs-mobile-v1.8.21';
const APP_FILES=['./','./index.html','./styles.css','./stats-owner.js','./usage-stats.js','./app.js','./camera-capture-controls.js','./photo-camera.js','./ntsc-photo.js','./photo-extras-core.js','./photo-extras-ui.js','./photo-polaroid.js','./photo-polaroid-ui.js','./photo-face-ai.js','./photo-face-detect.js',
'./assets/face/vision_bundle.mjs','./assets/face/wasm/vision_wasm_internal.js','./assets/face/wasm/vision_wasm_internal.wasm',
'./assets/face/blaze_face_short_range.tflite','./assets/face/blaze_face_full_range.tflite',
'./assets/fonts/Caveat.ttf','./assets/fonts/BadScript.ttf','./assets/fonts/MarckScript.ttf',
'./assets/fonts/Neucha.ttf','./assets/fonts/Pangolin.ttf','./assets/fonts/Pacifico.ttf','./video/vendor/tracking-min.js','./video/vendor/tracking-face-min.js','./video/glitch-engine.js','./video/film-damage.js','./video/camera-osd.js','./video/face-ai.js','./looks.json','./assets/emulsion-451.json','./jszip.min.js','./manifest.webmanifest','./icons/icon-192.png'];
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(VERSION);
    // Require the executable shell, but never block activation on optional
    // film catalogue, fonts or large ML models (they can be fetched later).
    const optional=APP_FILES.filter(p=>p.startsWith('./assets/'));
    const core=APP_FILES.filter(p=>!optional.includes(p));
    await cache.addAll(core.map(p=>new Request(new URL(p,self.registration.scope),{cache:'reload'})));
    await Promise.allSettled(optional.map(async p=>{
      const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),12000);try{const response=await fetch(new URL(p,self.registration.scope),{cache:'reload',signal:controller.signal});if(response.ok)await cache.put(p,response);}catch(e){/* Loaded on demand; old cached assets remain available. */}finally{clearTimeout(timeout);}
    }));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate',event=>{
  event.waitUntil(self.clients.claim()); // Keep previous photo cache as recovery fallback; never erase personal data.
});
self.addEventListener('fetch',event=>{
  const req=event.request,url=new URL(req.url);
  if(req.method!=='GET'||url.origin!==location.origin||!url.pathname.startsWith(new URL('./',self.registration.scope).pathname))return;
  const networkFirst=req.mode==='navigate'||/\.(?:js|css|json|webmanifest)$/.test(url.pathname);
  event.respondWith((async()=>{
    const cached=async()=>{
      const current=await caches.open(VERSION);
      const exact=await current.match(req)||await current.match(req,{ignoreSearch:true});
      if(exact)return exact;
      if(req.mode==='navigate'){
        const shell=await current.match('./index.html');
        if(shell)return shell;
      }
      const keys=(await caches.keys()).filter(k=>k.startsWith('vhs-mobile-')&&k!==VERSION).reverse();
      for(const key of keys){const old=await caches.open(key);const hit=await old.match(req,{ignoreSearch:true})||(req.mode==='navigate'?await old.match('./index.html'):null);if(hit)return hit;}
      return null;
    };
    if(networkFirst){
      try{
        // Read fresh online, falling back to the exact matching cached file when offline.
        const response=await fetch(req,{cache:'no-store'});
        if(response.ok&&response.type==='basic'){
          const key=req.mode==='navigate'?'./index.html':req;
          try{const cache=await caches.open(VERSION);await cache.put(key,response.clone());}catch(e){/* Cache failure must not hide a valid page. */}
        }
        return response.ok?response:(await cached()||response);
      }catch(err){
        return await cached()||Response.error();
      }
    }
    const hit=await cached();
    if(hit)return hit;
    try{
      const response=await fetch(req);
      if(response.ok&&response.type==='basic'){
        try{const cache=await caches.open(VERSION);await cache.put(req,response.clone());}catch(e){/* Cache failure must not hide a valid asset. */}
      }
      return response;
    }catch(err){return Response.error();}
  })());
});
