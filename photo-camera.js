/* Photo Studio 1.5 — same real editor pipeline for live camera and shutter.
 * Input: local MediaStream camera track. No network, server or cloud storage.
 * Live preview is deliberately small. A still is captured at the native
 * resolution offered by ImageCapture (where supported) or the video stream.
 */
(function(root){
'use strict';
const $=id=>document.getElementById(id);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function mount({renderFrame,onCaptured,onSave,getSeed,getProfile,onConfigure}){
 const dialog=$('liveCameraDialog');
 const video=$('liveCameraVideo'),fx=$('liveCameraFx'),still=$('liveCameraStill');
 const stage=$('liveCameraStage'),badge=$('liveCameraBadge');
 const shutter=$('liveCameraShot'),flip=$('liveCameraFlip');
 const status=$('liveCameraStatus'),res=$('liveCameraResolution');
 const timer=$('liveCameraTimer'),previewToggle=$('liveCameraPreviewEnabled');
 const faces=$('liveCameraFaces'),again=$('liveCameraAgain');
 const save=$('liveCameraSave'),reviewButtons=$('liveCameraReviewActions');
 let stream=null,session=0,previewJob=null,countdown=null;
 let facing='environment',active=false,review=false,capturing=false;
 let lastRendered=null,lastFilename='',liveSeed=0,previewSlow=0;
 let liveErrorCount=0,ready=false;
 const getDims=()=>[Number(video.videoWidth)||0,Number(video.videoHeight)||0];
 const setStatus=text=>{status.textContent=text;};
 const stopTracks=()=>{
  if(stream){for(const track of stream.getTracks()){try{track.stop();}catch{}}stream=null;}
  if(video.srcObject){video.pause();video.srcObject=null;}
 };
 const clearJobs=()=>{
  if(previewJob!==null){clearTimeout(previewJob);previewJob=null;}
  if(countdown!==null){clearTimeout(countdown);countdown=null;}
 };
 const refreshButtons=()=>{
  shutter.disabled=!ready||capturing||review;
  flip.disabled=capturing;
  again.disabled=capturing;
  save.disabled=capturing||!lastRendered;
  reviewButtons.hidden=!review;
  fx.hidden=review||!previewToggle.checked;
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
 const schedule=(token,ms=330)=>{
  if(previewJob!==null)clearTimeout(previewJob);
  if(!active||review||!ready||token!==session)return;
  previewJob=setTimeout(()=>{previewJob=null;renderLive(token);},ms);
 };
 const drawResult=(target,source,maxSize=1300)=>{
  const scale=Math.min(1,maxSize/Math.max(source.width,source.height));
  target.width=Math.max(1,Math.round(source.width*scale));
  target.height=Math.max(1,Math.round(source.height*scale));
  target.getContext('2d').drawImage(source,0,0,target.width,target.height);
 };
 async function renderLive(token){
  if(token!==session||!active||!ready||review||capturing)return;
  if(!previewToggle.checked){
   fx.hidden=true;
   schedule(token,700);return;
  }
  const began=performance.now();
  try{
   const processed=await renderFrame(video,liveSeed,{cameraCapture:true,cameraLive:true},480);
   if(token!==session||!active||review||capturing)return;
   drawResult(fx,processed,720);
   fx.hidden=false;
   liveErrorCount=0;
   previewSlow=performance.now()-began;
   if(previewSlow>1100)setStatus('Живые эффекты работают медленно · снимок будет обработан в полном качестве');
   schedule(token,previewSlow>800?550:220);
  }catch(err){
   if(token!==session||!active)return;
   liveErrorCount++;
   fx.hidden=true;
   setStatus('Превью: '+(err?.message||err)+'. Камера продолжает работу.');
   if(liveErrorCount>=3){
    previewToggle.checked=false;
    setStatus('Живое превью отключено из-за нагрузки; снимок сохранит все эффекты.');
   }
   schedule(token,900);
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
   width:{ideal:3840},height:{ideal:2160},frameRate:{ideal:30,max:30}
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
   liveSeed=getSeed();
   ready=true;refreshButtons();
   setStatus('Камера готова. Настройки VHS / FILM / GLITCH применяются при съёмке.');
   schedule(token,60);
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
  const w=source.width||source.naturalWidth,h=source.height||source.naturalHeight;
  if(!w||!h)throw Error('Снимок не содержит изображения');
  const safeScale=Math.min(1,4300/Math.max(w,h),
   Math.sqrt(18500000/(w*h)));
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
  return canvasFrom({width:w,height:h,
   // drawImage must receive the HTMLVideoElement (not an arbitrary object).
   get _source(){return video;}
  }._source);
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
   const result=await onCaptured(raw,liveSeed,faces.value,setStatus);
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
  liveSeed=getSeed();refreshButtons();
  if(!stream?.active){start();return;}
  res.textContent='Камера работает · можно сделать следующий кадр';
  setStatus('Готово к следующему снимку с теми же настройками.');
  schedule(session,70);
 }
 function configure(){close();onConfigure();}
 $('liveCameraOpenTop').addEventListener('click',open);
 $('liveCameraOpenPanel').addEventListener('click',open);
 $('liveCameraClose').addEventListener('click',close);
 $('liveCameraFlip').addEventListener('click',flipLens);
 $('liveCameraShot').addEventListener('click',shoot);
 $('liveCameraSave').addEventListener('click',saveShot);
 $('liveCameraAgain').addEventListener('click',againShot);
 $('liveCameraConfigure').addEventListener('click',configure);
 previewToggle.addEventListener('change',()=>{
  refreshButtons();
  if(active&&!review&&ready)schedule(session,40);
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
   hasRenderedShot:!!lastRendered})});
}
root.VHSPhotoCamera=Object.freeze({mount});
})(window);
