/* Photo Studio 1.6 — low-latency filtered camera.
 * The VIDEO stays live on the compositor. Only small transparent tracking /
 * interference overlays are re-randomized on a timer; NO per-video-frame
 * ImageData processing or complete still-image pipeline runs while moving.
 * The shutter still uses the unchanged high-quality photo processor.
 * All camera frames stay on device; there are no network endpoints.
 */
(function(root){
'use strict';
const $=id=>document.getElementById(id);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function mount({onCaptured,onSave,getSeed,getProfile,getVisualSettings,onConfigure}){
 const dialog=$('liveCameraDialog');
 const video=$('liveCameraVideo'),fx=$('liveCameraFx'),still=$('liveCameraStill');
 const stage=$('liveCameraStage'),badge=$('liveCameraBadge');
 const newFx=$('liveCameraNew');
 const shutter=$('liveCameraShot'),flip=$('liveCameraFlip');
 const status=$('liveCameraStatus'),res=$('liveCameraResolution');
 const timer=$('liveCameraTimer'),previewToggle=$('liveCameraPreviewEnabled');
 const faces=$('liveCameraFaces'),again=$('liveCameraAgain');
 const save=$('liveCameraSave'),reviewButtons=$('liveCameraReviewActions');
 let stream=null,session=0,previewJob=null;
 let facing='environment',active=false,review=false,capturing=false;
 let lastRendered=null,lastFilename='',liveSeed=0,filmSeed=0;
 let liveVisual=null,previewDraws=0,ready=false;
 const getDims=()=>[Number(video.videoWidth)||0,Number(video.videoHeight)||0];
 const setStatus=text=>{status.textContent=text;};
 const stopTracks=()=>{
  if(stream){for(const track of stream.getTracks()){try{track.stop();}catch{}}stream=null;}
  if(video.srcObject){video.pause();video.srcObject=null;}
 };
 const clearJobs=()=>{
  if(previewJob!==null){clearTimeout(previewJob);previewJob=null;}
  // The video compositor is never tied to our overlay timer.
 };
 const refreshButtons=()=>{
  shutter.disabled=!ready||capturing||review;
  flip.disabled=capturing||review;
  again.disabled=capturing;
  save.disabled=capturing||!lastRendered;
  reviewButtons.hidden=!review;
  fx.hidden=review||!previewToggle.checked;
  newFx.hidden=review;
  newFx.disabled=!ready||capturing||review;
  video.style.filter=review||!previewToggle.checked?'none':liveFilter(liveVisual);
  still.hidden=!review;
  badge.textContent=review?'● ГОТОВЫЙ КАДР':'● LIVE';
 };
 const close=()=>{
  session++;active=false;ready=false;review=false;capturing=false;
  clearJobs();stopTracks();
  lastRendered=null;lastFilename='';
  if(dialog.open)dialog.close();
  refreshButtons();
 };
 const camerasEnabled=()=>!!(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia);
 const waitReady=async(token)=>{
  if(video.videoWidth&&video.videoHeight)return;
  await Promise.race([
   new Promise(resolve=>video.addEventListener('loadedmetadata',resolve,{once:true})),
   pause(6000).then(()=>{throw Error('Нет видеопотока от камеры');})
  ]);
  if(token!==session)throw Error('Камера уже закрыта');
 };
 // CSS video filters are composed by the browser GPU, so moving the iPhone
 // does NOT wait for a slow frame processed in JavaScript.
 const limit=(v,min,max)=>Math.max(min,Math.min(max,Number(v)||0));
 function liveFilter(cfg){
  if(!cfg)return'none';
  const correction=cfg.correction||{},film=cfg.film||{},pol=cfg.polaroid||{};
  const activeFilm=cfg.filmEnabled,activePol=pol.enabled;
  const name=String(film.name||'').toLowerCase();
  const filmStrength=activeFilm?limit(film.strength,0,100)/100:0;
  const mono=(activeFilm&&/ilford|tri.x|t.max|monochrom|black.and.white|чёрно.бел|черно.бел|b\\/w/.test(name))||
    (activePol&&pol.look==='mono');
  const brightness=limit(Math.pow(2,limit(correction.exposure,-3,3)*.31)+
    limit(correction.brightness,-100,100)/430,.55,1.65);
  const contrast=limit(1+limit(correction.contrast,-100,100)/190+
    (activeFilm?filmStrength*.055:0),.65,1.6);
  const saturation=limit((1+limit(correction.saturation,-100,100)/125)*
   (activeFilm?.90:1)*(activePol?.94:1),0,2);
  const sepia=limit(
   (activeFilm&&/kodak|gold|portra|fuji|vintage|ретро/i.test(name)?
    .13*filmStrength:0)+
   (activePol&&['warm','expired','fade'].includes(pol.look)?.15:0),0,.45);
  const hue=limit(correction.hue,-180,180);
  return 'brightness('+brightness.toFixed(3)+') contrast('+contrast.toFixed(3)+
   ') saturate('+saturation.toFixed(3)+') sepia('+sepia.toFixed(3)+
   ') grayscale('+(mono?1:0)+') hue-rotate('+hue+'deg)';
 }
 function randomizer(seed){
  let x=(seed>>>0)||0x91e10da5;
  return()=>{
   x=(x+0x6D2B79F5)>>>0;
   let t=x;
   t=Math.imul(t^(t>>>15),t|1);
   t^=t+Math.imul(t^(t>>>7),t|61);
   return ((t^(t>>>14))>>>0)/4294967296;
  };
 }
 const schedule=(token,ms=160)=>{
  if(previewJob!==null)clearTimeout(previewJob);
  if(!active||review||!ready||token!==session)return;
  previewJob=setTimeout(()=>{previewJob=null;renderLive(token);},ms);
 };
 function applyVisual(){
  liveVisual=getVisualSettings()||{};
  stage.classList.toggle('instant',!!liveVisual.polaroid?.enabled);
  video.style.filter=previewToggle.checked?liveFilter(liveVisual):'none';
 }
 function renderLive(token){
  if(token!==session||!active||!ready||review||capturing)return;
  if(!previewToggle.checked){
   fx.hidden=true;video.style.filter='none';return;
  }
  try{
   const [vw,vh]=getDims();
   if(vw<2||vh<2){schedule(token,200);return;}
   const ratio=Math.min(1,320/Math.max(vw,vh));
   const w=Math.max(32,Math.round(vw*ratio));
   const h=Math.max(32,Math.round(vh*ratio));
   if(fx.width!==w||fx.height!==h){fx.width=w;fx.height=h;}
   const ctx=fx.getContext('2d',{alpha:true});
   ctx.clearRect(0,0,w,h);
   const v=liveVisual||{},signal=v.signal||{},film=v.film||{};
   const analog=!!v.vhsEnabled&&Number(v.master)>0;
   const master=limit(v.master,0,100)/100;
   const glitch=!!v.glitch?.enabled;
   const damage=!!v.damage?.enabled;
   const strength=analog?master*.85:0;
   const rand=randomizer((liveSeed^Math.imul(previewDraws+1,0x9e3779b9))>>>0);
   // Quick scanline/tape overlay: ~hundreds of 2D drawing calls on a
   // transparent 320px surface, NEVER reading back video frame pixels.
   if(analog||glitch){
    const waves=Math.round((4+(signal.tracking||20)/8)*strength+
       (glitch?5:0));
    for(let i=0;i<waves;i++){
     const y=Math.floor(rand()*h),height=1+Math.floor(rand()*Math.max(2,h*.035));
     const x=Math.floor(rand()*w*.26),opacity=.045+rand()*.13*master;
     ctx.fillStyle='rgba(243,247,250,'+Math.min(.22,opacity+(glitch?.05:0))+')';
     ctx.fillRect(x,y,w-x,height);
     if(rand()>.65){
      ctx.fillStyle=rand()>.5?'rgba(236,68,74,.14)':'rgba(41,178,250,.17)';
      ctx.fillRect(Math.max(0,x-2),y+1,Math.floor(w*(.18+rand()*.55)),1);
     }
    }
    const lines=Math.round((6+(signal.noise||30)*.11)*strength+(glitch?7:0));
    for(let i=0;i<lines;i++){
     ctx.fillStyle='rgba(255,255,253,'+(.018+rand()*.065)+')';
     const y=Math.floor(rand()*h);
     ctx.fillRect(0,y,w,1);
    }
   }
   if(analog||v.filmEnabled||damage){
    const count=Math.min(210,Math.round((v.filmEnabled?30:0)+
      strength*(25+limit(signal.noise,0,100)*.45)+(damage?35:0)));
    for(let i=0;i<count;i++){
     const y=Math.floor(rand()*h),x=Math.floor(rand()*w);
     ctx.fillStyle=rand()>.3?'rgba(240,230,212,.13)':'rgba(13,17,23,.17)';
     ctx.fillRect(x,y,rand()>.85?2:1,1);
    }
   }
   previewDraws++;
   fx.hidden=false;
   schedule(token,160);
  }catch(err){
   fx.hidden=true;
   setStatus('Облегчённый предпросмотр: '+(err?.message||err));
   schedule(token,500);
  }
 }
 async function start(){
  const token=++session;
  clearJobs();stopTracks();
  ready=false;capturing=false;review=false;lastRendered=null;
  stage.classList.toggle('selfie',facing==='user');
  refreshButtons();
  $('liveCameraProfile').textContent=getProfile();
  if(!camerasEnabled()){
   setStatus('Этот браузер не дал доступ к камере. Используй Safari через HTTPS или системную камеру.');
   return;
  }
  setStatus('Запрашиваю разрешение iPhone на камеру…');
  const opts={audio:false,video:{
   facingMode:{ideal:facing},
   width:{ideal:1920},height:{ideal:1080},frameRate:{ideal:30,max:30}
  }};
  let acquired;
  try{
   try{acquired=await navigator.mediaDevices.getUserMedia(opts);}
   catch(err){
    if(err?.name==='NotAllowedError'||err?.name==='PermissionDeniedError')throw err;
    // Some iPhone lenses reject 4K/30fps; request a simple stream instead.
    acquired=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:facing}}});
   }
   if(token!==session||!active){
    acquired.getTracks().forEach(t=>t.stop());return;
   }
   stream=acquired;video.srcObject=acquired;
   video.muted=true;video.playsInline=true;
   await video.play();
   await waitReady(token);
   if(token!==session||!active)return;
   const [w,h]=getDims();
   if(w<2||h<2)throw Error('Камера не передаёт кадры');
   const setting=acquired.getVideoTracks()[0]?.getSettings?.()||{};
   res.textContent='Поток камеры: '+w+' × '+h+
    (setting.facingMode?' · '+(setting.facingMode==='user'?'передняя':'задняя'):'')+
    '. Для снимка используется максимальное разрешение, доступное браузеру.';
   liveSeed=getSeed();filmSeed=liveSeed;previewDraws=0;
   applyVisual();
   ready=true;refreshButtons();
   setStatus('Плавный предпросмотр: живое видео без задержки обработки. На снимке — полные эффекты.');
   schedule(token,50);
  }catch(err){
   if(token!==session)return;
   stopTracks();ready=false;refreshButtons();
   const name=err?.name||'';
   const message=name==='NotAllowedError'||name==='PermissionDeniedError'?
    'Нет разрешения на камеру. Разреши доступ для сайта в настройках Safari.':
    name==='NotFoundError'?'Камера недоступна на этом устройстве.':
    'Не удалось запустить камеру: '+(err?.message||err);
   setStatus(message);
  }
 }
 async function open(){
  if(active)return;
  active=true;review=false;capturing=false;
  if(!dialog.open)dialog.showModal();
  await start();
 }
 async function flipLens(){
  if(!active||capturing)return;
  facing=facing==='user'?'environment':'user';
  await start();
 }
 function canvasFrom(source){
  const w=source.naturalWidth||source.videoWidth||source.width,
   h=source.naturalHeight||source.videoHeight||source.height;
  if(!w||!h)throw Error('Снимок не содержит изображения');
  // Bound source buffers on iPhones: the native still can be 48MP,
  // while this canvas pipeline should stay within mobile Safari memory.
  const safeScale=Math.min(1,3800/Math.max(w,h),
   Math.sqrt(12500000/(w*h)));
  const sw=Math.max(1,Math.round(w*safeScale));
  const sh=Math.max(1,Math.round(h*safeScale));
  const c=document.createElement('canvas');c.width=sw;c.height=sh;
  const ctx=c.getContext('2d');
  if(facing==='user'){
   // Selfie is mirrored in both the live view and the saved photograph.
   ctx.translate(sw,0);ctx.scale(-1,1);
  }
  ctx.drawImage(source,0,0,sw,sh);
  return c;
 }
 async function takeRawPhoto(){
  const track=stream?.getVideoTracks()[0];
  if(!track||track.readyState!=='live')throw Error('Поток камеры прерван');
  // Use native still capture where supported. Safari versions without
  // ImageCapture automatically use current video frame without failure.
  if(typeof root.ImageCapture==='function'){
   try{
    const capture=new root.ImageCapture(track);
    const blob=await Promise.race([
     capture.takePhoto(),pause(5000).then(()=>{throw Error('Native photo timeout');})
    ]);
    let image=null,objectURL=null;
    try{
     if(typeof createImageBitmap==='function')image=await createImageBitmap(blob);
     else{
      objectURL=URL.createObjectURL(blob);
      image=new Image();
      await new Promise((res,rej)=>{
       image.onload=res;image.onerror=()=>rej(Error('Не открыть снимок'));
       image.src=objectURL;
      });
     }
     const canvas=canvasFrom(image);
     image.close?.();return canvas;
    }finally{if(objectURL)URL.revokeObjectURL(objectURL);}
   }catch(err){
    // Prefer a valid stream frame to a failed still-mode API.
    console.warn('Using video-frame photo fallback:',err);
   }
  }
  const [w,h]=getDims();
  if(w<2||h<2)throw Error('Кадр камеры ещё не готов');
  return canvasFrom(video);
 }
 async function captureNow(){
  if(!active||!ready||capturing||review)return;
  const token=session;
  capturing=true;clearJobs();refreshButtons();
  setStatus('Фиксирую кадр…');
  try{
   const raw=await takeRawPhoto();
   if(!active||token!==session)return;
   setStatus('Применяю выбранные эффекты к снимку '+raw.width+' × '+raw.height+'…');
   const result=await onCaptured(raw,liveSeed,faces.value,setStatus,{filmSeed});
   if(!active||token!==session)return;
   lastRendered=result.processed;
   lastFilename=result.filename;
   drawResult(still,result.processed,1440);
   stage.classList.remove('selfie');review=true;
   refreshButtons();
   const final=result.processed;
   res.textContent='Готовый снимок: '+final.width+' × '+final.height+
    '. Исходник доступен в основном фоторедакторе.';
   setStatus('Снимок обработан. Сохрани в «Фото» или сделай ещё один.');
  }catch(error){
   if(token!==session||!active)return;
   setStatus('Ошибка снимка: '+(error?.message||error)+'. Повтори съёмку.');
  }finally{
   capturing=false;if(token===session&&active)refreshButtons();
  }
 }
 async function shoot(){
  if(!active||!ready||capturing||review)return;
  const t=Number(timer.value)||0,token=session;
  if(t===0){await captureNow();return;}
  capturing=true;refreshButtons();
  for(let n=t;n>0;n--){
   if(token!==session||!active){capturing=false;return;}
   setStatus('Снимок через '+n+'…');
   await pause(1000);
  }
  capturing=false;
  if(token===session&&active)await captureNow();
 }
 async function saveShot(){
  if(!lastRendered||capturing)return;
  const cv=lastRendered,name=lastFilename;
  save.disabled=true;
  setStatus('Сохраняю снимок с эффектами…');
  try{
   await onSave(cv,name);
   if(active)setStatus('Открылось сохранение / отправка. Выбери «Сохранить изображение» в меню iPhone.');
  }catch(err){if(active)setStatus('Ошибка сохранения: '+(err?.message||err));}
  finally{if(active)refreshButtons();}
 }
 function againShot(){
  if(!active||capturing)return;
  review=false;lastRendered=null;lastFilename='';
  stage.classList.toggle('selfie',facing==='user');
  liveSeed=getSeed();filmSeed=liveSeed;previewDraws=0;refreshButtons();
  if(!stream||!stream.getVideoTracks().some(t=>t.readyState==='live')){
   start();return;
  }
  res.textContent='Камера работает · можно сделать следующий кадр';
  setStatus('Готово к следующему снимку с теми же настройками.');
  schedule(session,70);
 }
 function newInterference(){
  if(!active||!ready||review||capturing)return;
  const oldSeed=liveSeed>>>0;
  liveSeed=getSeed()>>>0;
  if(liveSeed===oldSeed)liveSeed=(oldSeed+1)>>>0;
  // Keep selected VHS/FILM/paper settings and the FILM grain seed intact.
  // Only the current camera VHS/random glitch seed changes.
  previewDraws=0;
  fx.hidden=false;
  newFx.classList.remove('is-new');
  void newFx.offsetWidth;
  newFx.classList.add('is-new');
  setStatus('NEW · новые помехи созданы. Следующий снимок сохранит именно этот вариант.');
  if(active&&ready&&previewToggle.checked){
   renderLive(session);
  }
 }
 function configure(){close();onConfigure();}
 $('liveCameraOpenTop').addEventListener('click',open);
 $('liveCameraOpenPanel').addEventListener('click',open);
 $('liveCameraClose').addEventListener('click',close);
 $('liveCameraFlip').addEventListener('click',flipLens);
 $('liveCameraShot').addEventListener('click',shoot);
 newFx.addEventListener('click',newInterference);
 $('liveCameraSave').addEventListener('click',saveShot);
 $('liveCameraAgain').addEventListener('click',againShot);
 $('liveCameraConfigure').addEventListener('click',configure);
 previewToggle.addEventListener('change',()=>{
  applyVisual();
  refreshButtons();
  if(active&&!review&&ready&&previewToggle.checked)schedule(session,40);
  else if(previewJob!==null){clearTimeout(previewJob);previewJob=null;}
 });
 dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
 document.addEventListener('visibilitychange',()=>{
  // A background page must never keep the iPhone camera running.
  if(document.hidden&&active)close();
 });
 window.addEventListener('pagehide',()=>{if(active)close();});
 refreshButtons();
 return Object.freeze({open,close,isActive:()=>active,
  getState:()=>({active,ready,review,facing,hasStream:!!stream,
   hasRenderedShot:!!lastRendered,liveSeed,filmSeed,previewDraws,
   previewMode:'compositor-overlay'})});
}
root.VHSPhotoCamera=Object.freeze({mount});
})(window);
