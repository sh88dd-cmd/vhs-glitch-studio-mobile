/* Photo Studio 1.7 — real photo-engine previews and unchanged high-res
 * shutter capture. The live processor is adaptive and only runs one frame at
 * a time; the native video remains behind it for startup/error recovery.
 * The full-resolution still never uses the preview's smaller buffer.
 */
(function(root){
'use strict';
const $=id=>document.getElementById(id);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function mount({onCaptured,onSave,onPreview,getSeed,getProfile,getVisualSettings,onConfigure}){
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
 let liveVisual=null,previewDraws=0,ready=false,fxReady=false,previewBusy=false;
 let viewLongSide=720,lastRenderMs=0;
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
  fx.hidden=review||!previewToggle.checked||!fxReady;
  newFx.hidden=review;
  newFx.disabled=!ready||capturing||review;
  // The actual photo engine already supplies color and VHS; never double-filter.
  video.style.filter='none';
  still.hidden=!review;
  badge.textContent=review?'● ГОТОВЫЙ КАДР':'● LIVE';
 };
 const close=()=>{
  session++;active=false;ready=false;review=false;capturing=false;
  clearJobs();stopTracks();
  lastRendered=null;lastFilename='';
  if(dialog.open)dialog.close();
  stage.style.width='';stage.style.height='';stage.style.aspectRatio='';stage.style.flex='';
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
 // Match the video's camera viewfinder geometry. Neither a portrait sensor
 // nor an instant-print frame may be stretched to fill a landscape box.
 function fitStage(w,h){
  if(!(w>1&&h>1))return;
  const maxWidth=Math.max(180,Math.min(window.innerWidth-24,dialog.clientWidth-20));
  const maxHeight=Math.max(190,window.innerHeight-350);
  const width=Math.min(maxWidth,maxHeight*w/h);
  stage.style.width=Math.round(width)+'px';
  stage.style.height=Math.round(width*h/w)+'px';
  stage.style.aspectRatio=w+' / '+h;
  stage.style.flex='0 0 auto';
 }
 function hasSelectedEffects(v){
  return !!((v.vhsEnabled&&Number(v.master)>0)||v.filmEnabled||
   v.glitch?.enabled||v.damage?.enabled||v.edgeBurn?.enabled||
   v.polaroid?.enabled||(v.colorCopy?.enabled&&v.colorCopy?.target)||
   v.film?.whiteBorder||v.film?.blackBorder||v.film?.caption||
   Object.values(v.camera||{}).some(x=>x?.on)||
   ['counter','modeInfo','focus','frame'].some(k=>v.extraCamera?.[k])||
   root.VHSPhotoExtras?.activeAdjustment?.(v.correction));
 }
 function idealLongSide(v){
  const analog=(v.vhsEnabled&&Number(v.master)>0)||v.glitch?.enabled;
  return analog?420:800;
 }
 const schedule=(token,ms=180)=>{
  if(previewJob!==null)clearTimeout(previewJob);
  if(!active||review||!ready||token!==session||!previewToggle.checked)return;
  previewJob=setTimeout(()=>{previewJob=null;void renderLive(token);},ms);
 };
 function applyVisual(){
  liveVisual=getVisualSettings()||{};
  // The photo engine draws real Polaroid paper; no fake CSS paper overlay.
  stage.classList.remove('instant');
  video.style.filter='none';
  viewLongSide=idealLongSide(liveVisual);
  fxReady=false;fx.hidden=true;
 }
 async function renderLive(token){
  if(token!==session||!active||!ready||review||capturing||
     !previewToggle.checked||previewBusy)return;
  if(!hasSelectedEffects(liveVisual||{})){
   fxReady=false;fx.hidden=true;
   return; // Pure camera view: keep native sensor detail, no downsampling.
  }
  const [vw,vh]=getDims();
  if(vw<2||vh<2){schedule(token,150);return;}
  previewBusy=true;
  const start=performance.now();
  try{
   // One exact processed frame at a time. No decorative stripe overlay,
   // no fake CSS FILM lookup, and no backlog of stale camera frames.
   const result=await onPreview(video,liveSeed,filmSeed,viewLongSide);
   if(token!==session||!active||review||capturing||!previewToggle.checked)return;
   if(!result||result.width<2||result.height<2)
    throw Error('Не получен обработанный кадр');
   fx.width=result.width;fx.height=result.height;
   fx.getContext('2d',{alpha:true}).drawImage(result,0,0);
   fxReady=true;fx.hidden=false;
   fitStage(result.width,result.height);
   previewDraws++;
   lastRenderMs=performance.now()-start;
   const ideal=idealLongSide(liveVisual||{});
   const minimum=ideal===420?320:560;
   if(lastRenderMs>165)viewLongSide=Math.max(minimum,Math.round(viewLongSide*.85));
   else if(lastRenderMs<85)viewLongSide=Math.min(ideal,Math.round(viewLongSide*1.12));
  }catch(err){
   if(token!==session||!active)return;
   fxReady=false;fx.hidden=true;
   setStatus('Ошибка живых эффектов: '+(err?.message||err)+
    '. Обычная камера продолжает работать.');
  }finally{
   previewBusy=false;
   if(token===session&&active&&ready&&!review&&!capturing&&previewToggle.checked){
    const delay=Math.max(100,Math.min(600,(performance.now()-start)*.85));
    schedule(token,delay);
   }
  }
 }
 // Still-photo review uses the same lossless source dimensions as before.
 // Only this single completed capture is downscaled for the display.
 const drawResult=(target,source,maxSize=1300)=>{
  const scale=Math.min(1,maxSize/Math.max(source.width,source.height));
  target.width=Math.max(1,Math.round(source.width*scale));
  target.height=Math.max(1,Math.round(source.height*scale));
  target.getContext('2d').drawImage(source,0,0,target.width,target.height);
 };
 async function start(){
  const token=++session;
  clearJobs();stopTracks();
  ready=false;capturing=false;review=false;lastRendered=null;
  fxReady=false;fx.hidden=true;viewLongSide=720;
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
    // Some iPhone lenses reject a requested 1080p/30fps constraint; fall back.
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
   fitStage(w,h);
   ready=true;refreshButtons();
   setStatus('Камера готова · реальные выбранные эффекты в видоискателе. Снимок сохраняется отдельно в высоком разрешении.');
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
   fitStage(still.width,still.height);
   stage.classList.remove('selfie','instant');review=true;
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
  applyVisual();
  const [vw,vh]=getDims();fitStage(vw,vh);
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
  fxReady=false;fx.hidden=true;
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
  if(!previewToggle.checked){fxReady=false;fx.hidden=true;clearJobs();}
  else if(active&&!review&&ready)schedule(session,40);
  refreshButtons();
 });
 window.addEventListener('resize',()=>{
  if(!active)return;
  if(review&&still.width>2&&still.height>2)fitStage(still.width,still.height);
  else if(fxReady)fitStage(fx.width,fx.height);
  else{const [w,h]=getDims();fitStage(w,h);}
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
   previewMode:'exact-photo-pipeline',viewLongSide,lastRenderMs})});
}
root.VHSPhotoCamera=Object.freeze({mount});
})(window);
