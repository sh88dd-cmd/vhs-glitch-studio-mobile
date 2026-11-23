/* Photo Studio 1.8.1 — real photo-engine previews and unchanged high-res
 * shutter capture. The live processor is adaptive and only runs one frame at
 * a time; the native video remains behind it for startup/error recovery.
 * The full-resolution still never uses the preview's smaller buffer.
 */
(function(root){
'use strict';
const $=id=>document.getElementById(id);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function mount({onCaptured,onSave,onEdit,onPreview,getSeed,getProfile,getVisualSettings,onConfigure}){
 const dialog=$('liveCameraDialog');
 const video=$('liveCameraVideo'),fx=$('liveCameraFx'),still=$('liveCameraStill');
 const stage=$('liveCameraStage'),badge=$('liveCameraBadge');
 const newFx=$('liveCameraNew');
 const shutter=$('liveCameraShot'),flip=$('liveCameraFlip');
 const status=$('liveCameraStatus'),res=$('liveCameraResolution');
 const timer=$('liveCameraTimer'),previewToggle=$('liveCameraPreviewEnabled');
 const captureMode=$('liveCameraCaptureMode');
 const aspect=$('liveCameraAspect'),formats=root.VHSCameraFormats;
 try{const savedRatio=localStorage.getItem('vhs.photo.captureRatio');
  if([...aspect.options].some(o=>o.value===savedRatio))aspect.value=savedRatio;}catch{}
 const previewSource=document.createElement('canvas');
 try{if(localStorage.getItem('vhs.camera.captureMode')==='native')captureMode.value='native';}catch(e){}
 const faces=$('liveCameraFaces'),again=$('liveCameraAgain');
 const doubleBtn=$('liveCameraDouble'),bestBtn=$('liveCameraBest');
 const doubleLayer=$('liveCameraDoubleLayer'),choiceBar=$('liveCameraBestChoices');
 let doubleEnabled=false,doubleFirst=null,bestEnabled=false;
 let booth=null,boothRunning=false,choiceOpen=false;
 let bestBuffer=[],bestTimer=null;
 const save=$('liveCameraSave'),edit=$('liveCameraEdit'),reviewButtons=$('liveCameraReviewActions');
 let stream=null,session=0,previewJob=null;
 let facing='environment',active=false,review=false,capturing=false,frozen=false;
 let lastPointerShotAt=0;
 let lastRendered=null,lastFilename='',liveSeed=0,filmSeed=0;
 let liveVisual=null,previewDraws=0,ready=false,fxReady=false,previewBusy=false;
 let viewLongSide=340,lastRenderMs=0,averageRenderMs=0,lastWidth=0,lastHeight=0;
 const getDims=()=>[Number(video.videoWidth)||0,Number(video.videoHeight)||0];
 const resetDouble=()=>{
  doubleFirst=null;doubleLayer.hidden=true;
  doubleEnabled=false;doubleBtn.textContent='◉ DOUBLE';
  doubleBtn.setAttribute('aria-pressed','false');
  doubleBtn.classList.remove('active');
 };
 const stopBestBuffer=()=>{
  if(bestTimer!==null){clearInterval(bestTimer);bestTimer=null;}
  bestBuffer=[];
 };
 function startBestBuffer(){
  stopBestBuffer();
  if(!bestEnabled||!active||!ready||review||capturing||booth)return;
  // The opt-in buffer stores video frames, never triggers a photo shutter.
  bestTimer=setInterval(()=>{
   if(!active||!ready||capturing||review||choiceOpen||!bestEnabled)return;
   try{
    bestBuffer.push(canvasFrom(video));
    if(bestBuffer.length>3)bestBuffer.shift();
   }catch(err){console.warn('BEST SHOT buffer skipped:',err);}
  },260);
 }
 function updateCreativeButtons(){
  doubleBtn.disabled=capturing||review||!!booth||choiceOpen;
  bestBtn.disabled=capturing||review||!!booth||choiceOpen;
  doubleBtn.setAttribute('aria-pressed',String(doubleEnabled));
  bestBtn.setAttribute('aria-pressed',String(bestEnabled));
  doubleBtn.classList.toggle('active',doubleEnabled);
  bestBtn.classList.toggle('active',bestEnabled);
  $('photoCreativeModes').hidden=!!booth||review;
 }
 // No persistent panels below the viewfinder. Messages are transient.
 // Preserve important errors, countdowns and PHOTO BOOTH progress as overlays.
 let statusTimer=null;
 const hideStatus=()=>{
  if(statusTimer!==null){clearTimeout(statusTimer);statusTimer=null;}
  status.classList.remove('cameraToastVisible','cameraToastError');
 };
 const setStatus=text=>{
  const message=String(text||'');
  status.textContent=message;
  hideStatus();
  // Normal readiness should never cover live camera pixels.
  if(!message||/^(Камера готова|Открываю камеру|Готово к следующему снимку|Камера работает)/i.test(message))
   return;
  const error=/(ошиб|не удалось|недоступ|нет разрешения|не дал доступ|не поддерж|Safari не разреш|не может)/i.test(message);
  status.classList.toggle('cameraToastError',error);
  status.classList.add('cameraToastVisible');
  const interval=/(Снимок через|через \d+…|снято \d+\/\d+)/i.test(message)?1150:
   error?6500:3200;
  statusTimer=setTimeout(()=>{
   status.classList.remove('cameraToastVisible','cameraToastError');
   statusTimer=null;
  },interval);
 };
 let controls;
 controls=root.VHSCameraControls.mount({
  prefix:'liveCamera',video,stage,onStatus:setStatus,
  canInteract:()=>active&&ready&&!review&&!capturing,
  onChange:()=>{
   const filter=controls?.cssFilter?.()||'none';
   video.style.filter=filter;
   fx.style.filter=filter;
  }
 });
 const stopTracks=()=>{
  controls.unbind();
  if(stream){for(const track of stream.getTracks()){try{track.stop();}catch{}}stream=null;}
  if(video.srcObject){video.pause();video.srcObject=null;}
 };
 const clearJobs=()=>{
  if(previewJob!==null){clearTimeout(previewJob);previewJob=null;}
  // The video compositor is never tied to our overlay timer.
 };
 const refreshButtons=()=>{
  shutter.disabled=!ready||capturing||review||choiceOpen;
  updateCreativeButtons();
  aspect.disabled=capturing||review;
  flip.disabled=capturing||review;
  again.disabled=capturing;
  save.disabled=capturing||!lastRendered;
  edit.disabled=capturing||!lastRendered;
  reviewButtons.hidden=!review;
  dialog.classList.toggle('is-review',review);
  fx.hidden=review||frozen||!previewToggle.checked||!fxReady;
  newFx.hidden=review||frozen;
  newFx.disabled=!ready||capturing||review;
  // The actual photo engine already supplies color and VHS; never double-filter.
  video.style.filter=controls.cssFilter();
  fx.style.filter=controls.cssFilter();
  still.hidden=!(review||frozen);
  badge.textContent=review?'● ГОТОВЫЙ КАДР':frozen?'● СНЯТО':'● LIVE';
 };
 const close=()=>{
  hideStatus();
  session++;active=false;ready=false;review=false;capturing=false;frozen=false;
  stopBestBuffer();resetDouble();bestEnabled=false;choiceOpen=false;booth=null;boothRunning=false;
  dialog.classList.remove('is-booth-review');
  choiceBar.hidden=true;choiceBar.replaceChildren();
  clearJobs();stopTracks();
  lastRendered=null;lastFilename='';
  if(dialog.open)dialog.close();
  document.documentElement.classList.remove('photoCameraLock');
  document.body.classList.remove('photoCameraLock');
  dialog.classList.remove('is-review');
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
 function fitStage(w,h,alreadyCropped=false){
  if(!(w>1&&h>1))return;
  if(!alreadyCropped){const size=formats.croppedSize(w,h,aspect.value);w=size.width;h=size.height;}
  const viewport=$('liveCameraViewport');
  // The remaining space excludes all controls and iPhone safe areas.
  // Never use the old fixed window height offset that hid the shutter.
  const maxWidth=Math.max(1,viewport.clientWidth||dialog.clientWidth-20);
  const maxHeight=Math.max(1,viewport.clientHeight);
  // A tall photo strip needs readable full-width, scrollable review rather
  // than a 200px-wide strip squeezed into a single phone viewport.
  const stripReview=review&&!!booth;
  const width=stripReview?maxWidth:Math.max(1,Math.min(maxWidth,maxHeight*w/h));
  const height=stripReview?Math.max(1,width*h/w):
   Math.max(1,Math.min(maxHeight,width*h/w));
  stage.style.width=width+'px';
  stage.style.height=height+'px';
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
  return analog?340:560;
 }
 const schedule=(token,ms=36)=>{
  if(previewJob!==null)clearTimeout(previewJob);
  if(!active||review||!ready||token!==session||!previewToggle.checked)return;
  previewJob=setTimeout(()=>{previewJob=null;void renderLive(token);},Math.max(16,ms));
 };
 function applyVisual(){
  liveVisual=getVisualSettings()||{};
  // The photo engine draws real Polaroid paper; no fake CSS paper overlay.
  stage.classList.remove('instant');
  video.style.filter=controls.cssFilter();
  viewLongSide=idealLongSide(liveVisual);
  fxReady=false;fx.hidden=true;fx.style.opacity='1';
  averageRenderMs=0;
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
   const renderingSeed=liveSeed;
   let source=video;
   if(aspect.value!=='original'){
    const size=formats.croppedSize(vw,vh,aspect.value);
    const scale=Math.min(1,Math.max(280,viewLongSide)/Math.max(size.width,size.height));
    previewSource.width=Math.max(2,Math.round(size.width*scale));
    previewSource.height=Math.max(2,Math.round(size.height*scale));
    formats.drawCropped(previewSource.getContext('2d'),video,vw,vh,aspect.value,
     previewSource.width,previewSource.height);
    source=previewSource;
   }
   const result=await onPreview(source,renderingSeed,filmSeed,viewLongSide);
   if(token!==session||renderingSeed!==liveSeed||!active||review||capturing||!previewToggle.checked)return;
   if(!result||result.width<2||result.height<2)
    throw Error('Не получен обработанный кадр');
   // Reuse the video overlay buffer rather than reallocating it each frame.
   if(fx.width!==result.width)fx.width=result.width;
   if(fx.height!==result.height)fx.height=result.height;
   fx.getContext('2d',{alpha:true}).drawImage(result,0,0);
   lastRenderMs=performance.now()-start;
   averageRenderMs=averageRenderMs?averageRenderMs*.72+lastRenderMs*.28:lastRenderMs;
   // The original video is always moving underneath the authentic photo effect.
   // If processing slows, never obscure current motion with an old frozen frame.
   // Saved photographs retain 100% effect strength and their export resolution.
   fx.style.opacity=String(Math.max(.38,Math.min(1,100/averageRenderMs)));
   fxReady=true;fx.hidden=false;
   if(previewDraws===0||fx.width!==lastWidth||fx.height!==lastHeight)
    fitStage(result.width,result.height,true);
   lastWidth=fx.width;lastHeight=fx.height;
   previewDraws++;
   const ideal=idealLongSide(liveVisual||{});
   const minimum=ideal===340?220:360;
   if(averageRenderMs>105)viewLongSide=Math.max(minimum,Math.round(viewLongSide*.84));
   else if(averageRenderMs<55)viewLongSide=Math.min(ideal,Math.round(viewLongSide*1.10));
  }catch(err){
   if(token!==session||!active)return;
   fxReady=false;fx.hidden=true;
   setStatus('Ошибка живых эффектов: '+(err?.message||err)+
    '. Обычная камера продолжает работать.');
  }finally{
   previewBusy=false;
   if(active&&ready&&!review&&!capturing&&previewToggle.checked){
    const delay=Math.max(20,Math.min(90,averageRenderMs*.25));
    schedule(session,delay);
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
  ready=false;capturing=false;review=false;frozen=false;lastRendered=null;
  fxReady=false;fx.hidden=true;viewLongSide=340;lastWidth=0;lastHeight=0;
  stage.classList.toggle('selfie',facing==='user');
  refreshButtons();
  $('liveCameraProfile').textContent=getProfile();
  if(!camerasEnabled()){
   setStatus('Этот браузер не дал доступ к камере. Используй Safari через HTTPS или системную камеру.');
   return;
  }
  setStatus('Открываю камеру…');
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
   res.textContent='Поток: '+w+' × '+h+
    (setting.facingMode?' · '+(setting.facingMode==='user'?'передняя':'задняя'):'');
   controls.bind(acquired.getVideoTracks()[0]);
   liveSeed=getSeed();filmSeed=liveSeed;previewDraws=0;
   applyVisual();
   fitStage(w,h);
   ready=true;refreshButtons();
   setStatus(captureMode.value==='instant'?
     'Камера готова · мгновенный спуск '+w+' × '+h+'.':
     'Камера готова · фото сенсора (возможна задержка).');
   schedule(token,50);
   startBestBuffer();
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
  document.documentElement.classList.add('photoCameraLock');
  document.body.classList.add('photoCameraLock');
  await start();
 }
 async function flipLens(){
  if(!active||capturing||choiceOpen)return;
  doubleFirst=null;doubleLayer.hidden=true;stopBestBuffer();
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
  const crop=formats.cropRect(w,h,aspect.value);
  const sw=Math.max(1,Math.round(crop.w*safeScale));
  const sh=Math.max(1,Math.round(crop.h*safeScale));
  const c=document.createElement('canvas');c.width=sw;c.height=sh;
  const ctx=c.getContext('2d');
  if(facing==='user'){
   // Selfie is mirrored in both the live view and the saved photograph.
   ctx.translate(sw,0);ctx.scale(-1,1);
  }
  const hasCanvasFilter=('filter' in ctx);
  ctx.save();
  if(hasCanvasFilter)ctx.filter=controls.cssFilter();
  formats.drawCropped(ctx,source,w,h,aspect.value,sw,sh);
  ctx.restore();
  if(!hasCanvasFilter)controls.bakeCanvas(c);
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
 async function processRaw(raw,token,fullSize=false){
  if(!active||token!==session)return;
  capturing=true;choiceOpen=false;clearJobs();stopBestBuffer();
  choiceBar.hidden=true;choiceBar.replaceChildren();
  frozen=true;
  drawResult(still,raw,1100);
  stage.classList.remove('selfie');
  refreshButtons();
  setStatus('Кадр зафиксирован · применяю выбранные эффекты…');
  try{
   await pause(28);
   if(!active||token!==session)return;
   const result=await onCaptured(raw,liveSeed,faces.value,setStatus,
    {filmSeed,fullSize});
   if(!active||token!==session)return;
   lastRendered=result.processed;
   lastFilename=result.filename;
   drawResult(still,result.processed,booth?2400:1440);
   stage.classList.remove('selfie','instant');
   frozen=false;review=true;
   dialog.classList.toggle('is-booth-review',!!booth);
   resetDouble();
   refreshButtons();
   fitStage(still.width,still.height,true);
   if(booth)$('liveCameraViewport').scrollTop=0;
   const final=result.processed;
   res.textContent='Готовый снимок: '+final.width+' × '+final.height+
    '. Исходник доступен в основном фоторедакторе.';
   setStatus(booth?
    'ФОТОБУДКА · снято '+booth.count+
     (booth.count===4?' кадра':' кадров')+
     '. Листай фотополоску вниз, сохраняй или редактируй.':
    'Снимок готов. Редактируй, сохраняй или снимай ещё.');
  }catch(error){
   if(token!==session||!active)return;
   frozen=false;stage.classList.toggle('selfie',facing==='user');
   const [w,h]=getDims();fitStage(w,h);
   setStatus('Ошибка снимка: '+(error?.message||error)+'. Повтори съёмку.');
  }finally{
   capturing=false;if(token===session&&active)refreshButtons();
  }
 }
 function doubleBlend(raw){
  if(!doubleFirst)return raw;
  const result=document.createElement('canvas');
  result.width=raw.width;result.height=raw.height;
  const ctx=result.getContext('2d');
  ctx.drawImage(raw,0,0);
  ctx.globalAlpha=.5;
  ctx.drawImage(doubleFirst,0,0,result.width,result.height);
  ctx.globalAlpha=1;
  doubleFirst=null;doubleLayer.hidden=true;
  doubleBtn.textContent='◉ DOUBLE';
  return result;
 }
 async function presentBestShot(now,token){
  // Prior frames are captured before the shutter, plus two frames immediately
  // afterwards. BEST SHOT never activates without tapping its own button.
  let candidates=[...bestBuffer,now];stopBestBuffer();
  capturing=true;refreshButtons();
  setStatus('BEST SHOT · собираю последние кадры…');
  for(let i=0;i<2;i++){
   await pause(190);
   if(!active||token!==session)return;
   try{candidates.push(canvasFrom(video));}catch{}
  }
  if(!active||token!==session)return;
  // Bound memory: discard old references after drawing the thumbnails.
  candidates=candidates.slice(-6);
  choiceOpen=true;capturing=false;refreshButtons();
  choiceBar.replaceChildren();
  candidates.forEach((frame,index)=>{
   const button=document.createElement('button');
   button.type='button';button.className='bestShotCandidate';
   const thumb=document.createElement('canvas');
   const scale=Math.min(1,110/Math.max(frame.width,frame.height));
   thumb.width=Math.max(1,Math.round(frame.width*scale));
   thumb.height=Math.max(1,Math.round(frame.height*scale));
   thumb.getContext('2d').drawImage(frame,0,0,thumb.width,thumb.height);
   const label=document.createElement('span');
   label.textContent=index===candidates.length-3?'НАЖАТИЕ':String(index+1);
   button.append(thumb,label);
   button.addEventListener('click',()=>{
    if(!choiceOpen||!active||token!==session)return;
    const selected=frame;candidates=[];
    choiceOpen=false;
    void processRaw(selected,token);
   },{once:true});
   choiceBar.append(button);
  });
  choiceBar.hidden=false;
  setStatus('BEST SHOT · выбери лучший момент на миниатюрах.');
 }
 function makePhotoStrip(frames,config){
  const paper=document.createElement('canvas'),pad=34,gap=20;
  const cellW=720,cellH=900,footer=116;
  paper.width=cellW+pad*2;
  paper.height=pad+frames.length*(cellH+gap)+footer;
  const ctx=paper.getContext('2d');
  const dark=config.paper==='black';
  ctx.fillStyle=dark?'#111111':'#faf7f1';
  ctx.fillRect(0,0,paper.width,paper.height);
  frames.forEach((frame,i)=>{
   const y=pad+i*(cellH+gap);
   // Translate the drawing origin into EACH photo cell before cropping.
   // Previously drawCropped always painted at (0,0), so only the top cell
   // received pixels and the remaining slots stayed blank.
   ctx.save();
   ctx.translate(pad,y);
   ctx.beginPath();ctx.rect(0,0,cellW,cellH);ctx.clip();
   formats.drawCropped(ctx,frame,frame.width,frame.height,'4:5',cellW,cellH);
   ctx.restore();
  });
  ctx.fillStyle=dark?'#faf7f1':'#222222';
  ctx.font='bold 32px sans-serif';ctx.textAlign='center';
  ctx.fillText(config.caption||'PHOTO BOOTH',paper.width/2,
   paper.height-65,paper.width-85);
  ctx.font='20px monospace';
  ctx.fillText(new Date().toLocaleDateString('ru-RU'),paper.width/2,
   paper.height-30,paper.width-85);
  return paper;
 }
 async function captureBooth(token){
  if(boothRunning||!booth)return;
  boothRunning=true;capturing=true;clearJobs();stopBestBuffer();
  refreshButtons();let frames=[];
  try{
   for(let i=0;i<booth.count;i++){
    const seconds=i===0?3:booth.interval;
    for(let n=seconds;n>0;n--){
     if(!active||token!==session)return;
     setStatus('ФОТОБУДКА · кадр '+(i+1)+'/'+booth.count+
      ' через '+n+'…');
     await pause(1000);
    }
    if(!active||token!==session)return;
    frames.push(canvasFrom(video));
    setStatus('ФОТОБУДКА · снято '+frames.length+'/'+booth.count);
   }
   if(!active||token!==session)return;
   const strip=makePhotoStrip(frames,booth);
   frames=[];capturing=false;boothRunning=false;
   await processRaw(strip,token,true);
  }catch(err){
   if(active&&token===session)
    setStatus('Ошибка фотобудки: '+(err?.message||err));
  }finally{
   boothRunning=false;capturing=false;frames=[];
   if(active&&token===session)refreshButtons();
  }
 }
 async function captureNow(){
  if(!active||!ready||capturing||review||choiceOpen)return;
  const token=session;
  if(booth){await captureBooth(token);return;}
  let raw;
  try{
   // Normal instant and opt-in creative modes capture the frame synchronously.
   // Native sensor capture is kept unchanged for ordinary photography.
   raw=(captureMode.value!=='native'||doubleEnabled||bestEnabled)?
    canvasFrom(video):await takeRawPhoto();
  }catch(err){
   setStatus('Не удалось зафиксировать кадр: '+(err?.message||err));return;
  }
  if(!active||token!==session)return;
  if(doubleEnabled){
   if(!doubleFirst){
    doubleFirst=raw;
    drawResult(doubleLayer,raw,1100);
    doubleLayer.hidden=false;
    doubleBtn.textContent='◉ 2-Й КАДР';
    setStatus('DOUBLE · первый кадр сохранён. Совмести изображение и сними второй.');
    refreshButtons();
    return;
   }
   raw=doubleBlend(raw);
  }else if(bestEnabled){
   await presentBestShot(raw,token);
   return;
  }
  await processRaw(raw,token);
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
 function editShot(){
  if(!active||capturing||!review||!lastRendered)return;
  // onCaptured already placed the raw photo into the main editor.
  close();onEdit?.();
 }
 function againShot(){
  if(!active||capturing)return;
  review=false;frozen=false;lastRendered=null;lastFilename='';
  dialog.classList.remove('is-booth-review');
  stage.classList.toggle('selfie',facing==='user');
  applyVisual();
  const [vw,vh]=getDims();fitStage(vw,vh);
  liveSeed=getSeed();filmSeed=liveSeed;previewDraws=0;refreshButtons();
  if(!stream||!stream.getVideoTracks().some(t=>t.readyState==='live')){
   start();return;
  }
  res.textContent='Камера работает · можно сделать следующий кадр';
  setStatus('Готово к следующему снимку с теми же настройками.');
  startBestBuffer();
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
 async function openBooth(){
  if(active)return;
  booth={count:Number($('boothCount').value)===6?6:4,
   interval:Math.max(2,Math.min(5,Number($('boothInterval').value)||3)),
   paper:$('boothPaper').value==='black'?'black':'white',
   caption:$('boothCaption').value.trim().slice(0,48)};
  bestEnabled=false;resetDouble();stopBestBuffer();
  await open();
  if(active&&ready)setStatus('ФОТОБУДКА · нажми затвор один раз для серии из '+booth.count+' кадров.');
 }
 doubleBtn.addEventListener('click',()=>{
  if(!active||!ready||capturing||review||booth)return;
  if(doubleEnabled){resetDouble();setStatus('Двойная экспозиция выключена.');}
  else{
   bestEnabled=false;stopBestBuffer();
   doubleEnabled=true;setStatus('DOUBLE · первый снимок, затем второй поверх него.');
  }
  updateCreativeButtons();
 });
 bestBtn.addEventListener('click',()=>{
  if(!active||!ready||capturing||review||booth)return;
  bestEnabled=!bestEnabled;resetDouble();
  if(bestEnabled){
   setStatus('BEST SHOT · после затвора можно выбрать один кадр из серии.');
   startBestBuffer();
  }else{
   stopBestBuffer();setStatus('BEST SHOT выключен · обычный мгновенный спуск.');
  }
  updateCreativeButtons();
 });
 $('boothOpen').addEventListener('click',()=>void openBooth());
 function configure(){close();onConfigure();}
 $('liveCameraOpenTop').addEventListener('click',open);
 $('liveCameraOpenPanel').addEventListener('click',open);
 $('liveCameraClose').addEventListener('click',close);
 $('liveCameraFlip').addEventListener('click',flipLens);
 // Touch-first shutter: do not wait for finger release / synthesized click.
 shutter.addEventListener('pointerdown',event=>{
  if(!active||!ready||capturing||review||(Number(timer.value)||0)>0)return;
  if(event.pointerType==='mouse'&&event.button!==0)return;
  lastPointerShotAt=performance.now();
  event.preventDefault();
  void captureNow();
 });
 // Keyboard accessibility and browsers without Pointer Events.
 shutter.addEventListener('click',()=>{
  if(performance.now()-lastPointerShotAt<900)return;
  void shoot();
 });
 aspect.addEventListener('change',()=>{
  if(capturing||review)return;
  try{localStorage.setItem('vhs.photo.captureRatio',aspect.value);}catch{}
  fxReady=false;fx.hidden=true;previewDraws=0;
  const [w,h]=getDims();fitStage(w,h);
  if(active&&ready&&previewToggle.checked)schedule(session,35);
 });
 captureMode.addEventListener('change',()=>{
  try{localStorage.setItem('vhs.camera.captureMode',captureMode.value);}catch(e){}
  if(active&&ready&&!review)setStatus(captureMode.value==='instant'?
   'Мгновенно: кадр фиксируется в момент нажатия.':
   'Фото сенсора: выше разрешение, но возможна задержка.');
 });
 newFx.addEventListener('click',newInterference);
 $('liveCameraSave').addEventListener('click',saveShot);
 edit.addEventListener('click',editShot);
 $('liveCameraAgain').addEventListener('click',againShot);
 $('liveCameraConfigure').addEventListener('click',configure);
 previewToggle.addEventListener('change',()=>{
  if(!previewToggle.checked){fxReady=false;fx.hidden=true;clearJobs();}
  else if(active&&!review&&ready)schedule(session,40);
  refreshButtons();
 });
 function fitCurrentStage(){
  if(!active)return;
  if(review&&still.width>2&&still.height>2)fitStage(still.width,still.height,true);
  else if(fxReady)fitStage(fx.width,fx.height,true);
  else{const [w,h]=getDims();fitStage(w,h);}
 }
 window.addEventListener('resize',fitCurrentStage);
 if(window.ResizeObserver){
  const observer=new ResizeObserver(fitCurrentStage);
  observer.observe($('liveCameraViewport'));
 }
 dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
 document.addEventListener('visibilitychange',()=>{
  // A background page must never keep the iPhone camera running.
  if(document.hidden&&active)close();
 });
 window.addEventListener('pagehide',()=>{if(active)close();});
 refreshButtons();
 return Object.freeze({open,close,isActive:()=>active,
  getState:()=>({active,ready,review,facing,hasStream:!!stream,
   hasRenderedShot:!!lastRendered,liveSeed,filmSeed,previewDraws,captureMode:captureMode.value,
   previewMode:'real-photo-pipeline-over-live-video',viewLongSide,lastRenderMs,averageRenderMs})});
}
root.VHSPhotoCamera=Object.freeze({mount});
})(window);
