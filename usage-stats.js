/* VHS STATS analytics bridge — no server keys, media, file names or personal data.
 * Disabled until COLLECTOR_URL is set to the PUBLIC write-only collector /exec URL.
 * Admin dashboard is entirely separate and MUST require owner's Google sign-in.
 */
(function(root){
 'use strict';
 const COLLECTOR_URL = 'https://script.google.com/macros/s/AKfycbwzqZVuoD9KYylSDWshtNeIm75XjgGoYCjQqXwfyTsxMUVr9SfHvfLOoFkBDuCo9UI/exec'; // Public write-only Google Apps Script endpoint.
 const ANALYTICS_ENABLED = false; // Switch on after owner exclusion and private dashboard test.
 const APP=/\/video\/(?:index\.html)?$/.test(location.pathname)?'video':'photo';
 const EXCLUDE_KEY='vhs.analytics.exclude-owner.v1';
 const DEVICE_KEY='vhs.analytics.device.v1';
 const EVENTS=APP==='photo'?{
   liveCameraOpenTop:'camera_open',liveCameraOpenPanel:'camera_open',
   liveCameraShot:'shutter_click',liveCameraSave:'camera_save_click',
   saveOne:'export_click',exportBatch:'x50_export_click',
   saveDialog:'export_click'
 }:{
   videoLiveOpenTop:'camera_open',videoLiveOpenPanel:'camera_open',
   videoLiveRecord:'record_click',export:'export_click',
   frameSavePng:'frame_export_click'
 };
 // URL hash is a local opt-out tool, NOT an authentication or secret code.
 try{
  if(location.hash==='#stats-owner-off'){
    localStorage.setItem(EXCLUDE_KEY,'1');
    history.replaceState(history.state,'',location.pathname+location.search);
  }
  if(location.hash==='#stats-owner-on'){
    localStorage.removeItem(EXCLUDE_KEY);
    history.replaceState(history.state,'',location.pathname+location.search);
  }
 }catch(_){}
 let excluded=false;
 try{excluded=localStorage.getItem(EXCLUDE_KEY)==='1';}catch(_){}
 if(navigator.doNotTrack==='1'||navigator.globalPrivacyControl===true)excluded=true;
 // Hidden local control: tapping app version six times on each installed PWA
 // excludes the owner's device from counting; not used to unlock dashboard.
 function installOwnerExclusion(){
  const label=document.querySelector(APP==='video'?'.logo small':'.brand small');
  if(!label)return;
  let taps=0,last=0;
  label.addEventListener('click',()=>{
   const now=Date.now();
   if(now-last>2400)taps=0;
   last=now;
   if(++taps!==6)return;
   taps=0;
   try{
    localStorage.setItem(EXCLUDE_KEY,'1');
    excluded=true;
    alert('Устройство исключено из статистики VHS STATS для этого приложения.');
    location.reload();
   }catch(err){alert('Не удалось сохранить исключение статистики.');}
  });
 }
 function readyDom(){
  installOwnerExclusion();
  if(!active)return;
  const footer=document.querySelector(APP==='video'?'.videoFooter':'.footer');
  if(footer){
   const p=document.createElement('p');
   p.className='hint';
   p.style.cssText='font-size:10px;line-height:1.45;color:#aaa;margin-top:12px;';
   p.textContent='Используется обезличенная статистика открытий и действий. Фото, видео, имена файлов и содержимое работ не отправляются.';
   footer.appendChild(p);
  }
 }
 const active=ANALYTICS_ENABLED && /^https:\/\/script\.google\.com\/macros\/s\/[a-zA-Z0-9_-]+\/exec$/.test(COLLECTOR_URL)&&!excluded;
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',readyDom,{once:true});
 else readyDom();
 let visitor='';
 if(active){
   try{
    visitor=localStorage.getItem(DEVICE_KEY)||'';
    if(!/^[a-f0-9]{32}$/.test(visitor)){
     const bytes=new Uint8Array(16);
     crypto.getRandomValues(bytes);
     visitor=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
     localStorage.setItem(DEVICE_KEY,visitor);
    }
   }catch(err){
    visitor=''; // No stable ID → do not collect: avoid misleading unique counts.
   }
 }
 const enabled=active&&/^[a-f0-9]{32}$/.test(visitor);
 function send(action){
  if(!enabled||!/^(visit|camera_open|shutter_click|record_click|export_click|camera_save_click|x50_export_click|frame_export_click)$/.test(action))return;
  const body=JSON.stringify({app:APP,action:action,visitor:visitor});
  // Google Apps Script cross-origin redirect does not offer CORS response headers.
  // Simple POST (text/plain + no-cors) reaches doPost without exposing a response.
  // This is best-effort telemetry; never block camera, preview or saves.
  try{
   fetch(COLLECTOR_URL,{
    method:'POST',mode:'no-cors',credentials:'omit',keepalive:true,
    headers:{'Content-Type':'text/plain;charset=UTF-8'},
    body:body
   }).catch(()=>{});
  }catch(err){}
 }
 let lastVisit=0;
 function visit(){
  const now=Date.now();
  if(now-lastVisit<120000)return;
  lastVisit=now;
  send('visit');
 }
 if(enabled){
  visit();
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden)visit();
  },{passive:true});
  document.addEventListener('click',evt=>{
   const button=evt.target&&evt.target.closest&&evt.target.closest('button[id]');
   if(button&&!button.disabled&&EVENTS[button.id])send(EVENTS[button.id]);
  },{passive:true});
 }
 root.VHSUsageStats=Object.freeze({enabled:()=>enabled,excluded:()=>excluded});
})(window);
