/* VHS Video Lab 0.9 — mobile camera and real-time analog recording.
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
function mount({getSettings,getFilmProfile,onImport}){
 const dialog=$('videoLiveCameraDialog'),stage=$('videoLiveStage');
 const video=$('videoLiveVideo'),fx=$('videoLiveOverlay'),processed=$('videoLiveCaptureCanvas');
 const review=$('videoLiveReview'),reviewPanel=$('videoLiveReviewActions');
 const status=$('videoLiveStatus'),meta=$('videoLiveMeta'),badge=$('videoLiveBadge');
 const recordBtn=$('videoLiveRecord'),holdBtn=$('videoLiveHold');
 const newBtn=$('videoLiveNew'),flipBtn=$('videoLiveFlip');
 const micToggle=$('videoLiveMicrophone'),quality=$('videoLiveQuality');
 const frames=$('videoLiveFPS'),sound=$('videoLiveAudioState');
 const download=$('videoLiveDownload'),share=$('videoLiveShare');
 const importBtn=$('videoLiveImport'),again=$('videoLiveAgain');
 const openTop=$('videoLiveOpenTop'),openPanel=$('videoLiveOpenPanel');
 const engine=root.VHSVideoLiveFX?.create?.();
 if(!engine)throw Error('Реальный видеодвижок камеры не загружен');
 let active=false,ready=false,recording=false,stopping=false,holding=false;
 let cameraStream=null,recordStream=null,recorder=null,audioGraph=null;
 let session=0,overlayTimer=null,animation=0,cameraStartedAt=0;
 let filmProfile=null,lastFxReport=null;
 let facing='environment',state={},seed=randSeed(),filmSeed=randSeed();
 let frameIndex=0,lastFrameTime=0,durationStart=0,secondsTimer=null;
 let chunks=[],recordMime='',resultBlob=null,resultURL='',resultFilename='';
 let recordFrameCount=0,lastCompositorMs=0,recordFPS=20;
 function message(value){status.textContent=String(value);}
 function stopTimers(){
  if(overlayTimer!==null){clearTimeout(overlayTimer);overlayTimer=null;}
  if(animation){cancelAnimationFrame(animation);animation=0;}
  if(secondsTimer!==null){clearInterval(secondsTimer);secondsTimer=null;}
 }
 function clearResult(){
  review.pause();review.removeAttribute('src');review.load();
  if(resultURL){URL.revokeObjectURL(resultURL);resultURL='';}
  resultBlob=null;resultFilename='';download.removeAttribute('href');
 }
 function stopTracks(){
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
   for(const track of recordStream.getVideoTracks()){try{track.stop();}catch{}}
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
  flipBtn.disabled=!ready||recording||stopping;
  micToggle.disabled=recording||stopping;
  quality.disabled=recording||stopping;
  frames.disabled=recording||stopping;
  badge.textContent=recording?'● REC':resultBlob?'● ГОТОВО':'● LIVE';
  badge.classList.toggle('recording',recording);
  reviewPanel.hidden=!resultBlob;
  stage.classList.toggle('review',!!resultBlob);
  fx.hidden=!!resultBlob||!ready;
  video.hidden=!!resultBlob;
  review.hidden=!resultBlob;
 }
 function release(){
  active=false;ready=false;holding=false;session++;
  stopTimers();stopTracks();releaseRecordStream();
  sync();
 }
 function close(){
  if(recording||stopping){
   message('Останови запись кнопкой ■ СТОП, затем закрой камеру.');
   return;
  }
  release();clearResult();engine.reset();
  if(dialog.open)dialog.close();
 }
 function fitStage(){
  const w=video.videoWidth||720,h=video.videoHeight||1280;
  const maxW=Math.max(180,Math.min(dialog.clientWidth-20,window.innerWidth-24));
  const heightBudget=Math.max(340,window.innerHeight-280);
  const size=Math.min(maxW,heightBudget*w/h);
  stage.style.width=Math.round(size)+'px';
  stage.style.height=Math.round(size*h/w)+'px';
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
   fx.width=w;fx.height=h;
   engine.reset();
  }
  return[w,h];
 }
 function overlay(token){
  if(!active||!ready||resultBlob||token!==session)return;
  const started=performance.now();
  try{
   ensureOutput();
   const time=Math.max(0,(started-cameraStartedAt)/1000);
   lastFxReport=engine.render(video,processed,state,{
    time,elapsed:time,seed,filmSeed,holding,
    mirrored:facing==='user',filmProfile,agingDuration:60
   });
   const ctx=fx.getContext('2d',{alpha:false});
   ctx.drawImage(processed,0,0,fx.width,fx.height);
   fx.hidden=false;
   if(recording)recordFrameCount++;
   lastCompositorMs=lastFxReport.duration;
   // Camera stream is never shown in a different color treatment from
   // the recorded canvas: both surfaces get the same exact frame buffer.
   if(recording)meta.textContent='REC · реальный VHS/FILM · '+recordFrameCount+
    ' кадров · обработка '+Math.round(lastCompositorMs)+' мс';
  }catch(err){
   console.warn('Live camera FX render:',err);
   fx.hidden=true;
   message('Ошибка обработки выбранных эффектов: '+err.message);
  }
  if(active&&ready&&!resultBlob&&token===session){
   const elapsed=performance.now()-started;
   const rate=recording?Number(frames.value)||20:15;
   // Never accumulate delayed frames; drop when CPU is busy. On iPhone
   // native video stays behind the processed layer for immediate recovery.
   const delay=Math.max(12,Math.min(300,1000/rate-elapsed));
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
  resultFilename='VHS_LIVE_'+stamp+'.'+ext;
  resultURL=URL.createObjectURL(resultBlob);
  review.src=resultURL;review.load();
  download.href=resultURL;download.download=resultFilename;
  stopping=false;sync();
  message('Готовое видео с записанными эффектами · '+(resultBlob.size/1048576).toFixed(2)+' МБ. Можно сохранить или открыть в редакторе.');
 }
 function supported(){
  if(typeof MediaRecorder!=='function')throw Error('Этот Safari не поддерживает MediaRecorder.');
  if(!processed.captureStream)throw Error('Этот Safari не поддерживает запись Canvas. Включи обновлённый Safari.');
  const mime=mimeChoice();
  if(!mime)throw Error('Не найден подходящий формат видеозаписи Safari (MP4/WebM).');
  return mime;
 }
 function startRecording(){
  if(!active||!ready||recording||stopping)return;
  let stream;
  try{
   const mime=supported();
   clearResult();
   const[w,h]=captureSize();
   recordFPS=Number(frames.value)||20;
   // Current exact selected-FX frame is already present on processed.
   // No raw frame or simplified CSS-only filter enters the encoder.
   stream=processed.captureStream(recordFPS);
   attachMicrophoneAudio(stream);
   const rec=new MediaRecorder(stream,{mimeType:mime,
    videoBitsPerSecond:quality.value==='720'?3000000:1650000});
   recorder=rec;recordStream=stream;chunks=[];recordMime=mime;
   rec.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data);};
   rec.onerror=e=>message('Ошибка записи: '+(e.error?.message||'неизвестно'));
   rec.onstop=()=>{releaseRecordStream();showResult();};
   durationStart=performance.now();lastFrameTime=0;recordFrameCount=0;
   recording=true;stopping=false;sync();
   rec.start(500);
   if(overlayTimer!==null){clearTimeout(overlayTimer);overlayTimer=null;}
   overlay(session);
   secondsTimer=setInterval(()=>{
    if(!recording)return;
    const seconds=Math.floor((performance.now()-durationStart)/1000);
    badge.textContent='● REC '+String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
   },1000);
   message('REC · настоящие выбранные эффекты применяются к каждому кадру предпросмотра и видео. ЗАЖМИ — усиление.');
  }catch(err){
   if(stream)for(const track of stream.getVideoTracks())try{track.stop();}catch{}
   releaseAudioGraph();
   recording=false;stopping=false;recorder=null;recordStream=null;
   sync();message('Запись недоступна: '+(err?.message||err));
  }
 }
 function onRecord(){if(recording)finishRecording();else startRecording();}
 async function startCamera(){
  const token=++session;
  if(overlayTimer!==null){clearTimeout(overlayTimer);overlayTimer=null;}
  stopTracks();ready=false;recording=false;holding=false;clearResult();sync();
  state=getSettings()||{};
  filmProfile=getFilmProfile?.()||null;
  seed=randSeed();filmSeed=seed;frameIndex=0;engine.reset();
  cameraStartedAt=performance.now();
  fx.hidden=true;
  $('videoLiveProfile').textContent=[
   state.vhsEnabled?'VHS':null,state.filmEnabled?'FILM':null,
   state.glitchEnabled?'ГЛИТЧ':null,state.selectedCassetteId?'КАССЕТА':null
  ].filter(Boolean).join(' · ')||'Оригинальное видео';
  if(!navigator.mediaDevices?.getUserMedia){
   message('Камера недоступна. Открой через HTTPS в Safari.');return;
  }
  message('Запрашиваю разрешение на камеру и микрофон…');
  let media;
  const device={audio:!!micToggle.checked,video:{facingMode:{ideal:facing},
   width:{ideal:1280},height:{ideal:720},frameRate:{ideal:30,max:30}}};
  try{
   try{media=await navigator.mediaDevices.getUserMedia(device);}
   catch(error){
    // If ONLY the microphone permission was denied, still let the user
    // record video. A camera denial fails the second request as well.
    if(!micToggle.checked)throw error;
    media=await navigator.mediaDevices.getUserMedia({
     video:device.video,audio:false
    });
    message('Микрофон недоступен · камера работает без звука.');
   }
   if(token!==session||!active){
    for(const tr of media.getTracks())tr.stop();return;
   }
   cameraStream=media;
   video.srcObject=media;
   video.muted=true;video.playsInline=true;
   await video.play();
   if(token!==session||!active)return;
   if(!video.videoWidth||!video.videoHeight)
    await Promise.race([
     new Promise(resolve=>video.addEventListener('loadedmetadata',resolve,{once:true})),
     wait(5500).then(()=>{throw Error('Видео от камеры не поступает');})
    ]);
   if(token!==session||!active)return;
   video.style.filter='none';
   stage.classList.toggle('selfie',facing==='user');
   fitStage();
   ensureOutput();
   meta.textContent=video.videoWidth+' × '+video.videoHeight+
    (media.getAudioTracks().length?' · микрофон':' · без звука');
   sound.textContent=media.getAudioTracks().length?'Микрофон включён':'Без звука';
   ready=true;sync();overlay(token);
   message('Камера готова · настоящие эффекты VHS, FILM, GLITCH и индикаторы на живом изображении и записи.');
  }catch(err){
   if(token!==session)return;
   stopTracks();ready=false;sync();
   message(err?.name==='NotAllowedError'?
    'Разреши доступ к камере и микрофону в Safari.':
    'Камера не запустилась: '+(err?.message||err));
  }
 }
 async function open(){
  if(active)return;
  active=true;
  if(!dialog.open)dialog.showModal();
  await startCamera();
 }
 function swapCamera(){
  if(!active||recording||stopping)return;
  facing=facing==='user'?'environment':'user';startCamera();
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
  try{await onImport(recorded);}
  finally{importBtn.disabled=false;}
 }
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
  if(active&&!recording&&!stopping)startCamera();
 });
 quality.addEventListener('change',()=>{
  if(active&&ready&&!recording&&!stopping){
   ensureOutput();
   if(overlayTimer!==null){clearTimeout(overlayTimer);overlayTimer=null;}
   overlay(session);
  }
 });
 window.addEventListener('resize',()=>{
  if(active&&ready&&!resultBlob)fitStage();
 });
 download.addEventListener('click',()=>{
  // Keep the blob until the user explicitly starts another recording.
 });
 share.addEventListener('click',saveShare);
 importBtn.addEventListener('click',importIntoEditor);
 again.addEventListener('click',()=>{
  if(!active||recording||stopping)return;
  clearResult();sync();overlay(session);
 });
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 document.addEventListener('visibilitychange',()=>{
  if(document.hidden&&active){
   if(recording)finishRecording();
   stopTracks();ready=false;holding=false;sync();
   message('Камера остановлена при сворачивании приложения.');
  }
 });
 window.addEventListener('pagehide',()=>{
  if(recording)finishRecording();
  stopTracks();
 });
 sync();
 return Object.freeze({open,close,getState:()=>({
  active,ready,recording,holding,seed,filmSeed,recordFrameCount,
  hasResult:!!resultBlob,recordMime,lastCompositorMs,
  fxReport:lastFxReport,streamRatio:video.videoWidth/video.videoHeight,
  stageRatio:stage.clientWidth/stage.clientHeight,
  width:processed.width,height:processed.height
 })});
}
root.VHSVideoLiveCamera=Object.freeze({mount,colorFilter,mimeChoice});
})(window);
