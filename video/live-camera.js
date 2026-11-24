/* VHS Video Lab 0.9.4 — editable video originals and real-time analog recording.
 * All processing stays in the browser. The display video is composited
 * natively for minimum motion latency. Its lightweight interference layer
 * is copied into a CanvasCaptureStream only WHILE RECORDING, and the encoded
 * video includes both the color grade and the moving noise. Full CPU-bound
 * editor filters remain available after importing the recorded clip.
 */
(function(root){
'use strict';
const $=id=>document.getElementById(id);
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function timedMedia(constraints,ms=12000){
 let expired=false,timer;const pending=navigator.mediaDevices.getUserMedia(constraints).then(stream=>{if(expired){stream.getTracks().forEach(t=>t.stop());throw Error('Запрос камеры завершился слишком поздно');}return stream;});
 try{return await Promise.race([pending,new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(Error('Камера не ответила. Проверь разрешения и активный звонок.'));},ms);})]);}finally{clearTimeout(timer);}
}
function frameReady(video,track){return !!track&&track.readyState==='live'&&!track.muted&&video.readyState>=2&&video.videoWidth>0&&video.videoHeight>0&&!video.paused;}
const clamp=(x,a,b)=>Math.max(a,Math.min(b,Number(x)||0));
const randSeed=()=>crypto.getRandomValues(new Uint32Array(1))[0];
const mimeTypes=[
 'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
 'video/mp4;codecs=avc1.42E01E','video/mp4',
 'video/webm;codecs=vp8,opus','video/webm;codecs=vp8','video/webm'
];
function mimeChoice(){
 if(typeof MediaRecorder!=='function')return null;
 return mimeTypes.find(type=>MediaRecorder.isTypeSupported?.(type))||null;
}
function random(seed){
 let x=(seed>>>0)||0x9e3779b9;
 return()=>{
  x=(x+0x6D2B79F5)>>>0;
  let t=x;t=Math.imul(t^(t>>>15),t|1);
  t^=t+Math.imul(t^(t>>>7),t|61);
  return((t^(t>>>14))>>>0)/4294967296;
 };
}
function fitGeometry(sourceW,sourceH,availableW,viewportH){
 const w=Math.max(1,Number(sourceW)||1),h=Math.max(1,Number(sourceH)||1);
 const maxW=Math.max(180,Number(availableW)||390);
 const budget=Math.max(340,(Number(viewportH)||800)-280);
 const width=Math.min(maxW,budget*w/h);
 return{width:Math.round(width),height:Math.round(width*h/w),
  ratio:w/h,portrait:h>w};
}
function colorFilter(state={}){
 if(state.masterBypass)return'none';
 const film=!!state.filmEnabled&&Number(state.filmStrength)>0;
 const vhs=!!state.vhsEnabled&&Number(state.master)>0;
 const name=String(state.filmId||'').toLowerCase();
 const strength=clamp(state.filmStrength,0,100)/100;
 const mode=String(state.mode||'vhs'),amount=clamp(state.modeStrength,0,100)/100;
 const night=mode==='night'&&amount>0,crt=mode==='crt'&&amount>0;
 const dv=mode==='minidv'&&amount>0;
 const monochrome=film&&/ilford|tri.x|t.max|monochrom|черно.бел|чёрно.бел/.test(name);
 const saturated=clamp(1-(vhs?.09:0)-(film?.06*strength:0)+
  (dv?.16*amount:0),.45,1.4);
 const contrast=clamp(1+(vhs?.065:0)+(film?.05*strength:0)+
  (crt?.20*amount:0)+(night?.22*amount:0),.85,1.55);
 const tint=film&&/kodak|gold|portra|vintage|old/i.test(name)?.15*strength:0;
 // All browser-native CSS filters also exist in the recorded Canvas filter.
 // Night Vision is deliberately green rather than merely monochrome.
 return 'contrast('+contrast.toFixed(3)+') saturate('+saturated.toFixed(3)+
  ') sepia('+(night?1:tint).toFixed(3)+') grayscale('+(monochrome?1:0)+
  ')'+(night?' hue-rotate(63deg) saturate(3.2) brightness(.78)':'');
}
function mount({getSettings,getFilmProfile,onImport,onOpen}){
 const dialog=$('videoLiveCameraDialog'),stage=$('videoLiveStage');
 const connecting=$('videoLiveConnecting'),connectionText=$('videoLiveConnectionText'),retryBtn=$('videoLiveRetry'),silentBtn=$('videoLiveRetrySilent');
 const video=$('videoLiveVideo'),fx=$('videoLiveOverlay'),processed=$('videoLiveCaptureCanvas');
 const review=$('videoLiveReview'),reviewPanel=$('videoLiveReviewActions');
 const status=$('videoLiveStatus'),meta=$('videoLiveMeta'),badge=$('videoLiveBadge');
 const recordBtn=$('videoLiveRecord'),holdBtn=$('videoLiveHold');
 const newBtn=$('videoLiveNew'),flipBtn=$('videoLiveFlip');
 const micToggle=$('videoLiveMicrophone'),quality=$('videoLiveQuality');
 const frames=$('videoLiveFPS'),sound=$('videoLiveAudioState');
 const captureMode=$('videoLiveCaptureMode'),aspect=$('videoLiveAspect');
 const formats=root.VHSCameraFormats;
 try{const savedRatio=localStorage.getItem('vhs.video.captureRatio');
  if([...aspect.options].some(o=>o.value===savedRatio))aspect.value=savedRatio;}catch{}
 try{captureMode.value=localStorage.getItem('vhs.video.captureMode')==='baked'?'baked':'editable';}
 catch{captureMode.value='editable';}
 const download=$('videoLiveDownload'),share=$('videoLiveShare');
 const importBtn=$('videoLiveImport'),again=$('videoLiveAgain');
 const openTop=$('videoLiveOpenTop'),openPanel=$('videoLiveOpenPanel');
 const engine=root.VHSVideoLiveFX?.create?.();
 if(!engine)throw Error('Реальный видеодвижок камеры не загружен');
 let active=false,ready=false,recording=false,stopping=false,holding=false,cameraError=false;
 let cameraStream=null,recordStream=null,recorder=null,audioGraph=null;
 let session=0,overlayTimer=null,animation=0,cameraStartedAt=0;
 let starting=false,recoverOnVisible=false,watchdog=null,lastMediaTime=-1,lastMediaAdvance=0,autoRetried=false,previousAudioSession=null;
 function connectionMessage(text,error=false){cameraError=error;connectionText.textContent=text;connecting.classList.toggle('cameraConnectionError',error);retryBtn.hidden=!error;silentBtn.hidden=!error;sync();}
 function cameraSession(mic){try{if(root.navigator?.audioSession){if(previousAudioSession===null)previousAudioSession=root.navigator.audioSession.type||'auto';root.navigator.audioSession.type=mic?'play-and-record':'auto';}}catch(_){}}
 function restoreSession(){try{if(previousAudioSession!==null&&root.navigator?.audioSession)root.navigator.audioSession.type=previousAudioSession;}catch(_){}previousAudioSession=null;}
 function stopWatchdog(){if(watchdog!==null){clearInterval(watchdog);watchdog=null;}}
 async function waitForFrames(track,token){
  const end=performance.now()+6500,initial=video.currentTime||0;let observed=false,callback=0;
  if(typeof video.requestVideoFrameCallback==='function')try{callback=video.requestVideoFrameCallback(()=>{observed=true;});}catch(_){}
  try{while(active&&token===session&&!document.hidden&&performance.now()<end){if(frameReady(video,track)&&(observed||Math.abs((video.currentTime||0)-initial)>.015))return;await wait(80);}throw Error('Камера подключена, но видеокадры не поступают.');}
  finally{if(callback&&video.cancelVideoFrameCallback)try{video.cancelVideoFrameCallback(callback);}catch(_){}}
 }
 function watchFrames(token){stopWatchdog();lastMediaTime=video.currentTime;lastMediaAdvance=performance.now();watchdog=setInterval(()=>{
  if(!active||token!==session||!ready||resultBlob||document.hidden)return;
  const track=cameraStream?.getVideoTracks()[0],now=performance.now();if(frameReady(video,track)&&Math.abs(video.currentTime-lastMediaTime)>.005){lastMediaTime=video.currentTime;lastMediaAdvance=now;return;}
  if(now-lastMediaAdvance<4000)return;
  fx.hidden=true;if(recording){finishRecording();message('Камера прервана. Запись остановлена.');return;}
  if(stopping)return;ready=false;stopWatchdog();if(!autoRetried){autoRetried=true;void startCamera(true);return;}
  stopTracks();connectionMessage('Изображение не поступает. Заверши звонок, если он активен, или попробуй без микрофона.',true);
 },900);}
 let filmProfile=null,lastFxReport=null;
 let facing='environment',state={},seed=randSeed(),filmSeed=randSeed();
 let frameIndex=0,lastFrameTime=0,durationStart=0,secondsTimer=null;
 let chunks=[],recordMime='',resultBlob=null,resultURL='',resultFilename='';
 let recordFrameCount=0,lastCompositorMs=0,recordFPS=20;
 let resultCaptureMode='editable',activeCaptureMode='editable';
 // Color originals retain the selected exposure yet never bake FILM/VHS.
 const editableCanvas=document.createElement('canvas');
 let editableLoop=0,editableLastFrame=0;
 let controls;
 controls=root.VHSCameraControls.mount({
  prefix:'videoLive',video,stage,onStatus:message,
  canInteract:()=>active&&ready&&!stopping&&!resultBlob,
  onChange:()=>{
   video.style.filter=controls?.cssFilter?.()||'none';
   // The effects overlay and baked recording have exposure in their pixels.
   fx.style.filter='none';
  }
 });
 function drawEditable(){
  const ctx=editableCanvas.getContext('2d',{alpha:false});
  const hasFilter='filter' in ctx;
  ctx.save();
  if(hasFilter)ctx.filter=controls.cssFilter();
  formats.drawCropped(ctx,video,video.videoWidth,video.videoHeight,
   aspect.value,editableCanvas.width,editableCanvas.height);
  ctx.restore();
  if(!hasFilter)controls.bakeCanvas(editableCanvas);
 }
 function paintEditableFrame(now){
  if(!recording||activeCaptureMode!=='editable')return;
  if(now-editableLastFrame>=1000/(Number(frames.value)||20)-2&&video.readyState>=2){
   editableLastFrame=now;
   drawEditable();
  }
  editableLoop=requestAnimationFrame(paintEditableFrame);
 }
 let statusToastTimer=null;
 function message(value){
  const text=String(value||'');
  status.textContent=text; // Preserve accessible live message for screen readers.
  if(statusToastTimer!==null){clearTimeout(statusToastTimer);statusToastTimer=null;}
  status.classList.remove('cameraToastVisible','cameraToastError');
  // Successful readiness/recording labels must NOT occupy permanent screen space.
  const isError=/(ошиб|не удалось|недоступ|запрещ|отказ|нет доступа|не поддерж)/i.test(text);
  const shouldShow=isError || /(сохран|запись останов|готово.*файл|записано|видео снято|невозможно|нельзя)/i.test(text);
  if(!text||!shouldShow)return;
  if(isError)status.classList.add('cameraToastError');
  status.classList.add('cameraToastVisible');
  statusToastTimer=setTimeout(()=>{
   status.classList.remove('cameraToastVisible','cameraToastError');
   statusToastTimer=null;
  },isError?6500:2500);
 }
 function stopTimers(){
  stopWatchdog();
  if(overlayTimer!==null){clearTimeout(overlayTimer);overlayTimer=null;}
  if(animation){cancelAnimationFrame(animation);animation=0;}
  if(editableLoop){cancelAnimationFrame(editableLoop);editableLoop=0;}
  if(secondsTimer!==null){clearInterval(secondsTimer);secondsTimer=null;}
 }
 function clearResult(){
  review.pause();review.removeAttribute('src');review.load();
  if(resultURL){URL.revokeObjectURL(resultURL);resultURL='';}
  resultBlob=null;resultFilename='';resultCaptureMode='editable';download.removeAttribute('href');
 }
 function stopTracks(){
  stopWatchdog();controls.unbind();
  if(cameraStream){
   for(const track of cameraStream.getTracks()){try{track.stop();}catch{}}
   cameraStream=null;
  }
  if(video.srcObject){video.pause();video.srcObject=null;}
 }
 function releaseAudioGraph(){
  const graph=audioGraph;audioGraph=null;
  if(!graph)return;
  try{graph.oscillator?.stop();}catch{}
  try{graph.out?.stream?.getAudioTracks()?.forEach(t=>t.stop());}catch{}
  try{graph.ctx?.close();}catch{}
 }
 function setHoldAudio(active){
  const graph=audioGraph;if(!graph)return;
  const t=graph.ctx.currentTime;
  // While held: bandwidth-limited microphone, flutter and low analog hum.
  // This is recorded but never sent to the speaker (no mic feedback).
  graph.lowpass.frequency.setTargetAtTime(active?850:19000,t,.025);
  graph.volume.gain.setTargetAtTime(active?.52:1,t,.02);
  graph.hum.gain.setTargetAtTime(active?.035:0,t,.02);
 }
 function attachMicrophoneAudio(stream){
  const microphones=cameraStream?.getAudioTracks()||[];
  if(!microphones.length)return;
  const Ctx=root.AudioContext||root.webkitAudioContext;
  if(!Ctx){for(const tr of microphones)stream.addTrack(tr);return;}
  try{
   const ctx=new Ctx();
   const input=ctx.createMediaStreamSource(cameraStream);
   const lowpass=ctx.createBiquadFilter();
   lowpass.type='lowpass';lowpass.frequency.value=19000;
   const volume=ctx.createGain();volume.gain.value=1;
   const out=ctx.createMediaStreamDestination();
   input.connect(lowpass);lowpass.connect(volume);volume.connect(out);
   const oscillator=ctx.createOscillator();
   oscillator.type='sawtooth';oscillator.frequency.value=53;
   const hum=ctx.createGain();hum.gain.value=0;
   oscillator.connect(hum);hum.connect(out);oscillator.start();
   audioGraph={ctx,lowpass,volume,oscillator,hum,out};
   for(const tr of out.stream.getAudioTracks())stream.addTrack(tr);
   void ctx.resume().catch(err=>console.warn('Live tape audio:',err));
   setHoldAudio(holding);
  }catch(err){
   console.warn('Microphone effect fallback:',err);
   releaseAudioGraph();
   for(const tr of microphones)stream.addTrack(tr);
  }
 }
 function releaseRecordStream(){
  if(recordStream){
   // Editable mode owns cloned sensor/video and microphone tracks.
   const tracks=activeCaptureMode==='editable'?recordStream.getTracks():recordStream.getVideoTracks();
   for(const track of tracks){try{track.stop();}catch{}}
   recordStream=null;
  }
  releaseAudioGraph();
 }
 function sync(){
  recordBtn.disabled=!ready||stopping;
  recordBtn.classList.toggle('recording',recording);
  recordBtn.textContent=recording?'■ СТОП':'● REC';
  holdBtn.disabled=!ready||stopping;
  holdBtn.classList.toggle('held',holding);
  holdBtn.setAttribute('aria-pressed',String(holding));
  newBtn.disabled=!ready||stopping;
  newBtn.hidden=!!resultBlob;
  flipBtn.disabled=!active||starting||recording||stopping;
  micToggle.disabled=recording||stopping;
  quality.disabled=recording||stopping;
  frames.disabled=recording||stopping;
  captureMode.disabled=recording||stopping;
  aspect.disabled=recording||stopping||!!resultBlob;
  badge.textContent=recording?'● REC':resultBlob?'● ГОТОВО':'● LIVE';
  badge.classList.toggle('recording',recording);
  reviewPanel.hidden=!resultBlob;
  dialog.classList.toggle('has-result',!!resultBlob);
  stage.classList.toggle('review',!!resultBlob);
  fx.hidden=!!resultBlob||!ready;
  video.hidden=!!resultBlob;
  review.hidden=!resultBlob;
  connecting.hidden=!active||ready||!!resultBlob;
 }
 function release(){
  active=false;ready=false;holding=false;starting=false;recoverOnVisible=false;session++;
  stopTimers();stopTracks();releaseRecordStream();restoreSession();
  document.documentElement.classList.remove('videoCameraLock');
  document.body.classList.remove('videoCameraLock');
  sync();
 }
 function close(){
  if(recording||stopping){
   message('Останови запись кнопкой ■ СТОП, затем закрой камеру.');
   return;
  }
  release();clearResult();engine.reset();
  if(dialog.open)dialog.close();
  document.documentElement.classList.remove('videoCameraLock');
  document.body.classList.remove('videoCameraLock');
 }
 function fitStage(){
  const sourceW=video.videoWidth||720,sourceH=video.videoHeight||1280;
  const target=formats.croppedSize(sourceW,sourceH,aspect.value);
  const w=target.width,h=target.height;
  const viewport=$('videoLiveViewport');
  const availableW=Math.max(1,viewport.clientWidth);
  const availableH=Math.max(1,viewport.clientHeight);
  const width=Math.max(1,Math.min(availableW,availableH*w/h));
  const height=Math.max(1,Math.min(availableH,width*h/w));
  stage.style.width=width+'px';
  stage.style.height=height+'px';
  stage.style.aspectRatio=w+' / '+h;
  stage.dataset.frameRatio=(w/h).toFixed(5);
  return[w,h];
 }
 function ensureOutput(){
  const sourceW=video.videoWidth||720,sourceH=video.videoHeight||1280;
  const shortSide=Number(quality.value)||480;
  const scale=Math.min(1,shortSide/Math.min(sourceW,sourceH));
  let w=Math.max(2,Math.round(sourceW*scale/2)*2);
  let h=Math.max(2,Math.round(sourceH*scale/2)*2);
  const cap=1280/Math.max(w,h);
  if(cap<1){
   w=Math.max(2,Math.round(w*cap/2)*2);
   h=Math.max(2,Math.round(h*cap/2)*2);
  }
  if(processed.width!==w||processed.height!==h){
   processed.width=w;processed.height=h;
   engine.reset();
  }
  const cropped=formats.croppedSize(w,h,aspect.value);
  if(fx.width!==cropped.width)fx.width=cropped.width;
  if(fx.height!==cropped.height)fx.height=cropped.height;
  return[cropped.width,cropped.height];
 }
 function overlay(token){
  if(!active||!ready||resultBlob||token!==session)return;
  const started=performance.now();
  if(!frameReady(video,cameraStream?.getVideoTracks()[0])){fx.hidden=true;overlayTimer=setTimeout(()=>{overlayTimer=null;overlay(token);},150);return;}
  try{
   ensureOutput();
   const time=Math.max(0,(started-cameraStartedAt)/1000);
   const clean=!holding&&!root.VHSVideoCleanPath?.hasVisualEffects({...state,fxMode:'classic'},0);
   // No canvas redraw when native preview is sufficient. Baked recording
   // still requires actual frames in the capture canvas.
   if(clean&&(!recording||activeCaptureMode==='editable')){
    fx.hidden=true;lastCompositorMs=0;
   }else{
   lastFxReport=engine.render(video,processed,state,{
    time,elapsed:time,seed,filmSeed,holding,
    mirrored:facing==='user',filmProfile,agingDuration:60
   });
   // One exposure pass is shared by the visible frame and baked recording.
   controls.bakeCanvas(processed);
   const ctx=fx.getContext('2d',{alpha:false});
   formats.drawCropped(ctx,processed,processed.width,processed.height,
    aspect.value,fx.width,fx.height);
   fx.hidden=false;
   if(recording)recordFrameCount++;
   lastCompositorMs=lastFxReport.duration;
   // Camera stream is never shown in a different color treatment from
   // the recorded canvas: both surfaces get the same exact frame buffer.
   if(recording)meta.textContent='REC · реальный VHS/FILM · '+recordFrameCount+
    ' кадров · обработка '+Math.round(lastCompositorMs)+' мс';
   }
  }catch(err){
   console.warn('Live camera FX render:',err);
   fx.hidden=true;
   message('Ошибка обработки выбранных эффектов: '+err.message);
  }
  if(active&&ready&&!resultBlob&&token===session){
   const elapsed=performance.now()-started;
   const rate=recording?Number(frames.value)||24:30;
   // Never accumulate delayed frames; drop when CPU is busy. On iPhone
   // native video stays behind the processed layer for immediate recovery.
   const delay=Math.max(4,1000/rate-elapsed);
   overlayTimer=setTimeout(()=>{overlayTimer=null;overlay(token);},delay);
  }
 }
 function currentFilter(){return'none';}
 function captureSize(){return ensureOutput();}
 function composite(){
  // Recording is fed by exactly the same processed canvas as the preview.
  // This deliberately does not start a second expensive render loop.
 }
 function stopHold(){
  if(!holding)return;
  holding=false;holdBtn.classList.remove('held');
  holdBtn.setAttribute('aria-pressed','false');
  setHoldAudio(false);
  if(overlayTimer!==null){clearTimeout(overlayTimer);overlayTimer=null;}
  if(active&&ready&&!resultBlob)overlay(session);
 }
 function beginHold(event){
  if(!active||!ready||stopping||resultBlob)return;
  if(event?.button!=null&&event.button!==0)return;
  event?.preventDefault?.();
  if(event?.pointerId!=null)try{holdBtn.setPointerCapture(event.pointerId);}catch{}
  holding=true;holdBtn.classList.add('held');holdBtn.setAttribute('aria-pressed','true');
  setHoldAudio(true);
  if(overlayTimer!==null){clearTimeout(overlayTimer);overlayTimer=null;}
  overlay(session);
 }
 function updateNew(){
  if(!active||!ready||stopping||resultBlob)return;
  const previous=seed;seed=randSeed()>>>0;
  if(seed===previous)seed=(seed+1)>>>0;
  frameIndex=0;engine.reset();
  newBtn.classList.remove('flashed');void newBtn.offsetWidth;
  newBtn.classList.add('flashed');
  if(overlayTimer!==null){clearTimeout(overlayTimer);overlayTimer=null;}
  overlay(session);
  message('NEW · новый рисунок помех. Кассета и настройки сохранены.');
 }
 function finishRecording(){
  if(!recording||stopping)return;
  stopping=true;holding=false;
  const rec=recorder;
  recording=false;stopTimers();sync();
  if(rec?.state!=='inactive'){
   try{rec.requestData();}catch{}
   try{rec.stop();}catch(error){stopping=false;message('Ошибка остановки: '+error.message);}
  }else{stopping=false;sync();}
 }
 function showResult(){
  if(!chunks.length){
   message('Браузер не вернул видеофайл. Попробуй WebM/MP4 на другом браузере.');
   stopping=false;sync();return;
  }
  resultBlob=new Blob(chunks,{type:recorder?.mimeType||recordMime});
  chunks=[];
  recordMime=String(resultBlob.type||recordMime||'video/webm');
  const ext=recordMime.includes('mp4')?'mp4':'webm';
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  resultFilename=(resultCaptureMode==='editable'?'VHS_EDIT_RAW_':'VHS_LIVE_')+stamp+'.'+ext;
  resultURL=URL.createObjectURL(resultBlob);
  review.src=resultURL;review.load();
  download.href=resultURL;download.download=resultFilename;
  stopping=false;sync();
  message((resultCaptureMode==='editable'?
   'Записан цветной исходник. Плёнку можно заменить в редакторе.':
   'Записано видео с несменяемыми эффектами.')+
   ' · '+(resultBlob.size/1048576).toFixed(2)+' МБ.');
 }
 function supported(){
  if(typeof MediaRecorder!=='function')throw Error('Этот Safari не поддерживает MediaRecorder.');
  if(captureMode.value==='baked'&&!processed.captureStream)throw Error('Canvas-запись недоступна. Выбери режим цветного исходника.');
  const mime=mimeChoice();
  if(!mime)throw Error('Не найден подходящий формат видеозаписи Safari (MP4/WebM).');
  return mime;
 }
 function startRecording(){
  if(!active||!ready||recording||stopping)return;
  if(!frameReady(video,cameraStream?.getVideoTracks()[0])){message('Кадры камеры недоступны. Повтори подключение.');return;}
  let stream,useEditableCanvas=false;
  try{
   const mime=supported();
   clearResult();
   const[w,h]=captureSize();
   recordFPS=Number(frames.value)||20;
   // Both modes show real FILM/VHS/GLITCH live, but only the baked mode
   // permanently writes the effect into the encoded file.
   activeCaptureMode=captureMode.value==='baked'?'baked':'editable';
   resultCaptureMode=activeCaptureMode;
   if(activeCaptureMode==='editable'){
    const sensor=cameraStream?.getVideoTracks()?.[0];
    if(!sensor||sensor.readyState!=='live')throw Error('Исходный видеопоток недоступен');
    // Camera-native dimensions; no VHS, grayscale or downsampling. Unlike
    // CSS-only exposure, these pixels also reach the recorded video.
    if((aspect.value==='original'&&controls.cssFilter()==='none')||
       typeof editableCanvas.captureStream!=='function'){
     // Keep the native sensor recording whenever the hardware can adjust EV;
     // also preserve the existing Safari path if CanvasCaptureStream is absent.
     stream=new MediaStream([sensor.clone()]);
     if(aspect.value!=='original'||controls.cssFilter()!=='none')
      throw Error('Safari не поддерживает выбранный формат или программную экспозицию записи без CanvasCaptureStream.');
    }else{
     const size=formats.croppedSize(video.videoWidth||1280,video.videoHeight||720,aspect.value);
     editableCanvas.width=size.width;editableCanvas.height=size.height;
     drawEditable();
     stream=editableCanvas.captureStream(recordFPS);
     useEditableCanvas=true;
    }
    const mic=cameraStream.getAudioTracks()?.[0];
    if(mic)stream.addTrack(mic.clone());
   }else{
    // Visible FX is already cropped and never stretched.
    stream=fx.captureStream(recordFPS);
    attachMicrophoneAudio(stream);
   }
   const rec=new MediaRecorder(stream,{mimeType:mime,
    videoBitsPerSecond:activeCaptureMode==='editable'?8000000:
     quality.value==='720'?6000000:3500000});
   recorder=rec;recordStream=stream;chunks=[];recordMime=mime;
   rec.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data);};
   rec.onerror=e=>message('Ошибка записи: '+(e.error?.message||'неизвестно'));
   rec.onstop=()=>{releaseRecordStream();showResult();};
   durationStart=performance.now();lastFrameTime=0;recordFrameCount=0;
   recording=true;stopping=false;sync();
   rec.start(500);
   if(useEditableCanvas){
    editableLastFrame=0;
    editableLoop=requestAnimationFrame(paintEditableFrame);
   }
   if(overlayTimer!==null){clearTimeout(overlayTimer);overlayTimer=null;}
   overlay(session);
   secondsTimer=setInterval(()=>{
    if(!recording)return;
    const seconds=Math.floor((performance.now()-durationStart)/1000);
    badge.textContent='● REC '+String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
   },1000);
   message(activeCaptureMode==='editable'?
   'REC · эффекты видны LIVE, пишется цветной исходник для редактора.':
   'REC · VHS/FILM записываются в файл без возможности отмены.');
  }catch(err){
   if(stream)for(const track of stream.getTracks())try{track.stop();}catch{}
   releaseAudioGraph();
   recording=false;stopping=false;recorder=null;recordStream=null;
   sync();message('Запись недоступна: '+(err?.message||err));
  }
 }
 function onRecord(){if(recording)finishRecording();else startRecording();}
 async function startCamera(forceSilent=false){
  const token=++session;starting=true;recoverOnVisible=false;
  if(overlayTimer!==null){clearTimeout(overlayTimer);overlayTimer=null;}
  stopTracks();ready=false;recording=false;holding=false;clearResult();
  connectionMessage('Подключаю камеру…');state=getSettings()||{};filmProfile=getFilmProfile?.()||null;
  seed=randSeed();filmSeed=seed;frameIndex=0;engine.reset();cameraStartedAt=performance.now();fx.hidden=true;
  $('videoLiveProfile').textContent=[state.vhsEnabled?'VHS':null,state.filmEnabled?'FILM':null,state.glitchEnabled?'ГЛИТЧ':null,state.selectedCassetteId?'КАССЕТА':null].filter(Boolean).join(' · ')||'Оригинальное видео';
  const current=()=>token===session&&active&&!document.hidden;
  const requestedMic=!!micToggle.checked&&!forceSilent;
  let lastError=null;
  try{
   if(!navigator.mediaDevices?.getUserMedia)throw Error('Камера недоступна. Открой приложение через HTTPS в Safari.');
   const constraints={facingMode:{ideal:facing},width:{ideal:1280},height:{ideal:720},frameRate:{ideal:30,max:30}};
   // If audio capture is interrupted by a call, release it and try video alone.
   for(const mic of requestedMic?[true,false]:[false]){
    if(!current())return;
    let media=null;
    try{
     cameraSession(mic);connectionMessage(mic?'Подключаю камеру и микрофон…':'Подключаю камеру без микрофона…');
     media=await timedMedia({video:constraints,audio:mic});
     if(!current()){media.getTracks().forEach(tr=>tr.stop());return;}
     cameraStream=media;const track=media.getVideoTracks()[0];if(!track)throw Error('Нет видеопотока');
     video.muted=true;video.defaultMuted=true;video.playsInline=true;video.autoplay=true;
     video.srcObject=media;connectionMessage('Ожидаю первый видеокадр…');
     let timer;try{await Promise.race([video.play(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Safari не начал показ камеры')),6000);})]);}finally{clearTimeout(timer);}
     if(!current())return;
     await waitForFrames(track,token);
     if(!current())return;
     video.style.filter='none';stage.classList.toggle('selfie',facing==='user');fitStage();ensureOutput();
     const hasMic=media.getAudioTracks().some(t=>t.readyState==='live'&&!t.muted);
     meta.textContent=video.videoWidth+' × '+video.videoHeight+(hasMic?' · микрофон':' · без звука');
     sound.textContent=hasMic?'Микрофон включён':'Без звука';micToggle.checked=hasMic;
     controls.bind(track);starting=false;ready=true;cameraError=false;sync();overlay(token);watchFrames(token);
     if(requestedMic&&!hasMic)message('Микрофон недоступен · камера работает без звука.');else message('Камера готова.');
     return;
    }catch(err){
     lastError=err;if(!current()){if(media&&media!==cameraStream)media.getTracks().forEach(t=>t.stop());return;}
     stopTracks();if(mic)await wait(300);
    }
   }
   throw lastError||Error('Видеопоток недоступен');
  }catch(err){
   if(!current())return;stopTracks();ready=false;
   const msg=err?.name==='NotAllowedError'?'Нет доступа к камере. Проверь разрешение Safari или приложения.':err?.name==='NotReadableError'?'Камера занята системой или другим приложением. Заверши звонок и повтори.':'Камера не запустилась: '+(err?.message||err);
   connectionMessage(msg,true);message(msg);
  }finally{if(token===session){starting=false;sync();}}
 }
 async function open(){
  if(active)return;onOpen?.();active=true;autoRetried=false;
  if(!dialog.open)dialog.showModal();
  document.documentElement.classList.add('videoCameraLock');document.body.classList.add('videoCameraLock');
  fitStage();await startCamera();
 }
 function swapCamera(){
  if(!active||starting||recording||stopping)return;
  facing=facing==='user'?'environment':'user';autoRetried=false;void startCamera();
 }
 async function saveShare(){
  if(!resultBlob)return;
  if(navigator.canShare?.({files:[new File([resultBlob],resultFilename,{type:recordMime})]})){
   try{await navigator.share({files:[new File([resultBlob],resultFilename,{type:recordMime})],title:'VHS Video Lab · съёмка'});}
   catch(error){if(error?.name!=='AbortError')message('Поделиться не удалось: '+error.message);}
  }else message('Используй кнопку «↓ СКАЧАТЬ ВИДЕО».');
 }
 async function importIntoEditor(){
  if(!resultBlob||!onImport)return;
  importBtn.disabled=true;
  const recorded=new File([resultBlob],resultFilename,{type:recordMime});
  // Closing camera releases microphone, avoiding conflicts with editor.
  release();
  if(dialog.open)dialog.close();
  document.documentElement.classList.remove('videoCameraLock');
  document.body.classList.remove('videoCameraLock');
  try{await onImport(recorded);}
  finally{importBtn.disabled=false;}
 }
 retryBtn.addEventListener('click',()=>{if(!active||recording||stopping)return;autoRetried=false;void startCamera();});
 silentBtn.addEventListener('click',()=>{if(!active||recording||stopping)return;autoRetried=false;micToggle.checked=false;void startCamera(true);});
 openTop.addEventListener('click',open);
 openPanel.addEventListener('click',open);
 $('videoLiveClose').addEventListener('click',close);
 recordBtn.addEventListener('click',onRecord);
 flipBtn.addEventListener('click',swapCamera);
 newBtn.addEventListener('click',updateNew);
 holdBtn.addEventListener('pointerdown',beginHold);
 holdBtn.addEventListener('pointerup',stopHold);
 holdBtn.addEventListener('pointercancel',stopHold);
 holdBtn.addEventListener('lostpointercapture',stopHold);
 holdBtn.addEventListener('keydown',event=>{
  if((event.key===' '||event.key==='Enter')&&!event.repeat)beginHold(event);
 });
 holdBtn.addEventListener('keyup',event=>{
  if(event.key===' '||event.key==='Enter')stopHold();
 });
 holdBtn.addEventListener('contextmenu',event=>event.preventDefault());
 micToggle.addEventListener('change',()=>{
  if(active&&!recording&&!stopping){autoRetried=false;void startCamera();}
 });
 quality.addEventListener('change',()=>{
  if(active&&ready&&!recording&&!stopping){
   ensureOutput();
   if(overlayTimer!==null){clearTimeout(overlayTimer);overlayTimer=null;}
   overlay(session);
  }
 });
 // Refit the display after Safari viewport changes or review is shown.
 // This never alters processed video dimensions or recording bitrate.
 const fitOnChange=()=>{if(active&&dialog.open)fitStage();};
 window.addEventListener('resize',fitOnChange);
 if(window.ResizeObserver){
  const observer=new ResizeObserver(fitOnChange);
  observer.observe($('videoLiveViewport'));
 }
 download.addEventListener('click',()=>{
  // Keep the blob until the user explicitly starts another recording.
 });
 share.addEventListener('click',saveShare);
 aspect.addEventListener('change',()=>{
  if(recording||stopping||resultBlob)return;
  try{localStorage.setItem('vhs.video.captureRatio',aspect.value);}catch{}
  if(active&&ready){
   ensureOutput();fitStage();
   if(overlayTimer!==null){clearTimeout(overlayTimer);overlayTimer=null;}
   overlay(session);
  }
 });
 captureMode.addEventListener('change',()=>{
  if(recording||stopping)return;
  try{localStorage.setItem('vhs.video.captureMode',captureMode.value);}catch{}
  message(captureMode.value==='editable'?
   'Для монтажа: цветной исходник, эффекты LIVE и смена плёнок после съёмки.':
   'Готовый VHS: фильтры сохраняются в файл без возможности отмены.');
 });
 importBtn.addEventListener('click',importIntoEditor);
 again.addEventListener('click',()=>{
  if(!active||recording||stopping)return;
  clearResult();sync();overlay(session);
 });
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 function suspendCamera(){if(!active)return;recoverOnVisible=!recording&&!stopping&&!resultBlob;if(recording)finishRecording();session++;starting=false;stopTimers();stopTracks();ready=false;holding=false;connectionMessage('Камера приостановлена системой.');}
 function resumeCamera(){if(active&&recoverOnVisible&&!document.hidden&&!recording&&!stopping&&!resultBlob){recoverOnVisible=false;autoRetried=false;void startCamera();}}
 document.addEventListener('visibilitychange',()=>{if(document.hidden)suspendCamera();else resumeCamera();});
 window.addEventListener('pagehide',suspendCamera);window.addEventListener('pageshow',resumeCamera);
 sync();
 return Object.freeze({open,close,getState:()=>({
  active,ready,recording,holding,seed,filmSeed,recordFrameCount,
  hasResult:!!resultBlob,recordMime,lastCompositorMs,activeCaptureMode,resultCaptureMode,
  fxReport:lastFxReport,streamRatio:video.videoWidth/video.videoHeight,
  stageRatio:stage.clientWidth/stage.clientHeight,
  width:processed.width,height:processed.height
 })});
}
root.VHSVideoLiveCamera=Object.freeze({mount,colorFilter,mimeChoice,fitGeometry,frameReady});
})(window);
