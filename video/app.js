/* VHS Video Lab 0.1 — standalone experiment. No uploads; separate from photo app.
 * 23 built-in films + exact Lightroom XMP approximation from VHS Glitch Studio.
 * Video signal: VHSPhotoEngine (original JS stage). Rust/WASM ntsc-rs integration pending.
 */
'use strict';
(() => {
 const $=id=>document.getElementById(id);
 const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
 const defaults={vhsEnabled:true,filmEnabled:false,preset:'classic',master:65,
  speed:'SP',filmId:'builtin:Нейтральный / без плёнки',filmStrength:85,
  signal:{chromaBleed:52,composite:35,edgeWave:38,tracking:54,noise:38,chromaLoss:15,ringing:19},
  camera:{rec:false,play:false,battery:false,date:false,text:'PM 10:28 | JUN 16 1995'},
  size:'480',fps:15,keepAudio:true,seed:91823710};
 let saved=null;
 try{saved=JSON.parse(localStorage.getItem('vhs.video.settings')||'null')}catch{}
 const state={...defaults,...(saved||{}),signal:{...defaults.signal,...(saved?.signal||{})},camera:{...defaults.camera,...(saved?.camera||{})}};
 let sourceUrl='',file=null,builtin={},sharedXMP=[],importedXMP=[],profiles=[],favoriteIds=[];
 let importedDB=null,recording=null,recordStream=null,exportBlob=null,exportMime='';
 let downloadUrl='',exportStopRequested=false,audioContext=null,audioSource=null,audioMonitor=null;
 let lastDraw=0,framePending=false,loopId=0,renderBusy=false;
 const source=$('source'),preview=$('preview'),recordCanvas=$('recordCanvas'),stage=preview.getContext('2d',{willReadFrequently:true});
 const FILM_LIMIT=1200;
 const matches=(v,q)=>v.toLocaleLowerCase('ru').includes(q.toLocaleLowerCase('ru'));
 function persist(){try{localStorage.setItem('vhs.video.settings',JSON.stringify(state));}catch(e){console.warn('Unable to persist video settings',e);}}
 function textStatus(s){$('status').textContent=s;}
 function exportStatus(s){$('exportStatus').textContent=s;}
 function randomSeed(){return crypto.getRandomValues(new Uint32Array(1))[0];}
 function timeString(sec){if(!Number.isFinite(sec))return'00:00';let n=Math.floor(sec);return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');}
 function videoDimensions(cap){const w=source.videoWidth||640,h=source.videoHeight||360,scale=Math.min(1,cap/Math.max(w,h));return[Math.max(2,Math.round(w*scale/2)*2),Math.max(2,Math.round(h*scale/2)*2)];}
 function control(parent,label,value,onInput){const wrap=document.createElement('div');wrap.className='control';
  const head=document.createElement('div');head.className='controlHead';
  const name=document.createElement('strong');name.textContent=label;
  const count=document.createElement('em');count.textContent=value+'%';head.append(name,count);
  const input=document.createElement('input');input.type='range';input.min='0';input.max='100';input.step='1';input.value=value;
  input.addEventListener('input',()=>{count.textContent=input.value+'%';onInput(Number(input.value));persist();renderCurrentFrame();});
  wrap.append(head,input);parent.append(wrap);}
 function mountControls(){
  control($('vhsControls'),'Общая сила VHS',state.master,v=>state.master=v);
  const tape=document.createElement('label');tape.textContent='Режим видеокассеты';
  const sp=document.createElement('select');for(const p of ['SP','LP','EP'])sp.add(new Option(p,p));sp.value=state.speed;
  sp.addEventListener('change',()=>{state.speed=sp.value;persist();renderCurrentFrame();});tape.append(sp);$('vhsControls').append(tape);
  for(const [id,label] of [['chromaBleed','Растекание цвета'],['composite','Артефакты композитного сигнала'],['edgeWave','Нестабильность видеострок'],['tracking','Помехи видеоголовки (1–4 полосы)'],['noise','Шум и снег'],['chromaLoss','Выпадения цвета'],['ringing','Контурное эхо']]){
   control($('vhsControls'),label,state.signal[id],v=>state.signal[id]=v);
  }
  control($('filmControls'),'Сила плёнки',state.filmStrength,v=>state.filmStrength=v);
  $('vhsEnabled').checked=state.vhsEnabled;$('filmEnabled').checked=state.filmEnabled;
  $('vhsPreset').value=state.preset;
  $('outputSize').value=state.size;$('fps').value=String(state.fps);
  $('keepAudio').checked=state.keepAudio;
  for(const k of ['rec','play','battery','date'])$(k+'On').checked=!!state.camera[k];
  $('dateText').value=state.camera.text;
  $('vhsEnabled').onchange=()=>{state.vhsEnabled=$('vhsEnabled').checked;persist();renderCurrentFrame();};
  $('filmEnabled').onchange=()=>{state.filmEnabled=$('filmEnabled').checked;persist();renderCurrentFrame();};
  $('vhsPreset').onchange=()=>{state.preset=$('vhsPreset').value;persist();renderCurrentFrame();};
  $('outputSize').onchange=()=>{state.size=$('outputSize').value;persist();};
  $('fps').onchange=()=>{state.fps=Number($('fps').value);persist();};
  $('keepAudio').onchange=()=>{state.keepAudio=$('keepAudio').checked;persist();};
  for(const k of ['rec','play','battery','date'])$(k+'On').onchange=()=>{state.camera[k]=$(k+'On').checked;persist();renderCurrentFrame();};
  $('dateText').oninput=()=>{state.camera.text=$('dateText').value;persist();renderCurrentFrame();};
 }
 function selectedFilm(){return profiles.find(p=>p.id===state.filmId)||null;}
 function rebuildFilmList(){
  profiles=[
   ...Object.keys(builtin).map(name=>({id:'builtin:'+name,name,type:'builtin'})),
   ...[...new Map([...sharedXMP,...importedXMP].map(p=>[p.id,p])).values()].map(p=>({...p,type:'xmp'}))
  ];
  profiles.sort((a,b)=>Number(favoriteIds.includes(b.id))-Number(favoriteIds.includes(a.id))||a.name.localeCompare(b.name,'ru'));
  const count=profiles.filter(p=>p.type==='xmp').length;
  $('filmCount').textContent=profiles.length+' плёнок · '+Object.keys(builtin).length+' встроенных · '+count+' XMP';
  renderFilmSelect();
 }
 function renderFilmSelect(){
  const search=$('filmSearch').value.trim(),select=$('filmSelect'),matching=profiles.filter(p=>!search||matches(p.name,search)).slice(0,150);
  select.replaceChildren();
  for(const p of matching){const option=document.createElement('option');option.value=p.id;option.textContent=(favoriteIds.includes(p.id)?'★ ':'')+p.name;select.append(option);}
  if(!matching.length){select.add(new Option('Не найдено',''));select.disabled=true;return;}
  select.disabled=false;
  if(matching.some(x=>x.id===state.filmId))select.value=state.filmId;
  else if(search)select.selectedIndex=0;
  else{state.filmId=matching[0].id;select.value=state.filmId;}
 }
 function addImported(items){
  const existing=new Map(importedXMP.map(x=>[x.id,x]));
  for(const p of items){if(p?.id&&p?.fields&&p?.name)existing.set(p.id,p);}
  importedXMP=[...existing.values()].slice(0,FILM_LIMIT);
  rebuildFilmList();
 }
 function openVideoDB(){return new Promise(resolve=>{
  try{
   const req=indexedDB.open('vhs-video-lab',1);
   req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('xmp'))req.result.createObjectStore('xmp',{keyPath:'id'});};
   req.onsuccess=()=>resolve(req.result);req.onerror=()=>resolve(null);
  }catch{resolve(null);}
 });}
 function readAll(db,store){return new Promise(resolve=>{
  if(!db||!db.objectStoreNames.contains(store))return resolve([]);
  try{const tx=db.transaction(store,'readonly');const req=tx.objectStore(store).getAll();
   req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>resolve([]);
  }catch{resolve([]);}
 });}
 function readSharedPhotoProfiles(){return new Promise(resolve=>{
  // Open only existing photo database. Do not create a new empty photo database.
  try{
   const req=indexedDB.open('vhs-studio-mobile',1);
   req.onupgradeneeded=()=>req.transaction.abort();
   req.onsuccess=async()=>{const db=req.result;const records=await readAll(db,'xmp');db.close();resolve(records);};
   req.onerror=()=>resolve([]);
   req.onblocked=()=>resolve([]);
  }catch{resolve([]);}
 });}
 async function saveImported(items){
  if(!importedDB||!items.length)return;
  await new Promise((resolve,reject)=>{
   const tx=importedDB.transaction('xmp','readwrite'),store=tx.objectStore('xmp');
   for(const p of items)store.put(p);
   tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
  });
 }
 async function importPresets(file){
  if(!file)return;
  if(file.size>40*1024*1024)throw Error('Файл больше 40 МБ — раздели библиотеку на части.');
  let added=[],favorites=[];
  const lower=file.name.toLowerCase();
  if(lower.endsWith('.json')){
   const backup=JSON.parse(await file.text());
   if(backup.kind!=='VHS_STUDIO_MOBILE_BACKUP'||!Array.isArray(backup.xmpProfiles))throw Error('Нужна резервная копия из фото-версии VHS Studio.');
   added=backup.xmpProfiles.filter(p=>p?.fields&&p?.id&&p?.name).slice(0,FILM_LIMIT);
   favorites=Array.isArray(backup.settings?.favoriteFilms)?backup.settings.favoriteFilms:[];
  }else if(lower.endsWith('.xmp')){
   const rec=window.VideoFilmCore.parseXMP(await file.text(),file.name);if(rec)added.push(rec);
  }else if(lower.endsWith('.zip')){
   if(typeof JSZip==='undefined')throw Error('Модуль ZIP ещё не загрузился.');
   const zip=await JSZip.loadAsync(file);
   let scanned=0;
   for(const [name,entry] of Object.entries(zip.files)){
    if(entry.dir||!name.toLowerCase().endsWith('.xmp'))continue;
    if(++scanned>FILM_LIMIT)throw Error('В архиве больше 1200 профилей.');
    const s=await entry.async('string');
    if(s.length>512000)continue;
    const rec=window.VideoFilmCore.parseXMP(s,name.split('/').pop());
    if(rec)added.push(rec);
   }
  }else throw Error('Поддерживаются .xmp, .zip или резервная копия .json.');
  if(!added.length)throw Error('В файле нет распознанных плёночных профилей.');
  await saveImported(added);
  if(favorites.length)favoriteIds=[...new Set([...favoriteIds,...favorites])];
  addImported(added);
  $('filmImportStatus').textContent='Импортировано '+added.length+' профилей; всего доступно '+profiles.length+'.';
  if(!state.filmEnabled){state.filmEnabled=true;$('filmEnabled').checked=true;}
  persist();renderCurrentFrame();
 }
 function drawOsd(ctx,w,h){
  const p=state.camera,size=Math.max(13,Math.min(w,h)*.034);
  ctx.save();
  ctx.textBaseline='top';ctx.font='700 '+size+'px monospace';
  ctx.shadowColor='#000';ctx.shadowBlur=Math.max(1,size*.08);ctx.shadowOffsetX=Math.max(1,size*.08);
  const pad=Math.max(12,w*.035);
  if(p.rec){ctx.fillStyle='#fa5356';ctx.beginPath();ctx.arc(pad+size*.22,pad+size*.45,size*.16,0,Math.PI*2);ctx.fill();ctx.fillText('REC',pad+size*.55,pad);}
  if(p.play){ctx.fillStyle='#edf3ec';ctx.fillText('PLAY',pad,pad+size*1.6);}
  if(p.date){ctx.fillStyle='#f4f4e7';ctx.textAlign='right';ctx.fillText(p.text.replace(/\|/g,' '),w-pad,h-pad-size);ctx.textAlign='start';}
  if(p.battery){const bw=size*1.8,bh=size*.69,x=w-pad-bw-size*.2,y=pad;ctx.strokeStyle='#f8f7e8';ctx.lineWidth=Math.max(1,size*.08);ctx.strokeRect(x,y,bw,bh);ctx.fillStyle='#f5f3ec';ctx.fillRect(x+bw,y+bh*.28,size*.14,bh*.44);ctx.fillRect(x+size*.12,y+size*.10,bw*.58,bh-size*.2);}
  ctx.restore();
 }
 function drawFrame(canvas){
  if(!file||source.readyState<2||!source.videoWidth)return;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(source,0,0,canvas.width,canvas.height);
  const image=ctx.getImageData(0,0,canvas.width,canvas.height);
  if(state.filmEnabled){
   const f=selectedFilm(),strength=state.filmStrength/100;
   if(f?.type==='builtin')window.VideoFilmCore.filmBuiltin(image.data,builtin[f.name],strength);
   else if(f?.fields)window.VideoFilmCore.filmXMP(image.data,f,strength);
  }
  ctx.putImageData(image,0,0);
  drawOsd(ctx,canvas.width,canvas.height);
  if(state.vhsEnabled&&state.master>0){
   const signal=ctx.getImageData(0,0,canvas.width,canvas.height);
   const extra=state.preset==='damaged'?1.25:state.preset==='camcorder'?.75:1;
   const frameIndex=Math.floor(source.currentTime*(Number(state.fps)||15));
   const seed=(state.seed^Math.imul(frameIndex+1,0x9e3779b9))>>>0;
   window.VHSPhotoEngine.apply(signal.data,canvas.width,canvas.height,{master:clamp(state.master/100*extra,0,1.4),seed,signal:{...state.signal,tapeSpeed:state.speed}});
   ctx.putImageData(signal,0,0);
  }
 }
 function renderCurrentFrame(){
  if(!file||source.readyState<2||recording||renderBusy)return;
  renderBusy=true;
  try{drawFrame(preview);}catch(e){textStatus('Ошибка обработки: '+e.message);console.error(e);}
  finally{renderBusy=false;}
 }
 function tick(now){
  loopId=requestAnimationFrame(tick);
  if(!file||source.paused||source.ended)return;
  const fps=recording?Number(state.fps):12;
  if(now-lastDraw<1000/fps)return;
  lastDraw=now;
  try{
   if(recording){
    drawFrame(recordCanvas);
    stage.drawImage(recordCanvas,0,0,preview.width,preview.height);
    const max=Math.min(30,source.duration||30);
    $('progress').value=clamp(source.currentTime/max*100,0,100);
    exportStatus('Запись: '+timeString(source.currentTime)+' / '+timeString(max)+' · приложение должно оставаться открытым');
    if(source.currentTime>=max-.04||source.ended)stopExport();
   }else{drawFrame(preview);}
  }catch(e){
   console.error(e);if(recording){exportStatus('Ошибка обработки видео: '+e.message);stopExport();}
   else textStatus('Не удалось обработать кадр: '+e.message);
  }
 }
 function updateTime(){
  $('timeCurrent').textContent=timeString(source.currentTime);
  $('timeTotal').textContent=timeString(source.duration);
  if(!Number.isFinite(source.duration)||!source.duration)return;
  if(!$('seek').matches(':active'))$('seek').value=Math.round(clamp(source.currentTime/source.duration,0,1)*1000);
 }
 async function loadVideo(input){
  if(!input)return;
  if(recording)throw Error('Нельзя сменить ролик во время экспорта.');
  source.pause();
  if(sourceUrl)URL.revokeObjectURL(sourceUrl);
  file=input;sourceUrl=URL.createObjectURL(input);
  source.src=sourceUrl;source.load();
  $('videoName').textContent=input.name;
  $('videoMeta').textContent=(input.size/1048576).toFixed(1)+' МБ';
  $('empty').hidden=true;$('play').disabled=true;$('export').disabled=true;$('seek').disabled=true;
  $('exportResult').hidden=true;
  textStatus('Читаю видео и проверяю декодирование…');
 }
 function onLoaded(){
  if(!source.videoWidth||!source.videoHeight)return;
  const [w,h]=videoDimensions(520);
  preview.width=w;preview.height=h;
  $('videoMeta').textContent=source.videoWidth+' × '+source.videoHeight+' · '+timeString(source.duration);
  $('play').disabled=false;$('export').disabled=false;$('regenerate').disabled=false;$('seek').disabled=false;
  $('timeTotal').textContent=timeString(source.duration);
  textStatus('Видео готово. Нажми ▶ или перемести ползунок. Оригинал не изменяется.');
  renderCurrentFrame();
 }
 async function togglePlay(){
  if(!file||recording)return;
  try{
   if(source.paused){await source.play();$('play').textContent='Ⅱ Пауза';}
   else{source.pause();$('play').textContent='▶ Просмотр';}
  }catch(e){textStatus('Не удалось воспроизвести: '+e.message);}
 }
 function redrawAfterSeek(){updateTime();renderCurrentFrame();}
 function chooseMime(){
  if(typeof MediaRecorder==='undefined')return null;
  const supported=['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4;codecs=avc1.42E01E','video/mp4','video/webm;codecs=vp8,opus','video/webm'];
  return supported.find(t=>MediaRecorder.isTypeSupported(t))||null;
 }
 async function ensureAudioGraph(){
  if(audioContext)return audioMonitor;
  const Ctx=window.AudioContext||window.webkitAudioContext;
  if(!Ctx)throw Error('Этот браузер не поддерживает захват звука.');
  audioContext=new Ctx();
  audioSource=audioContext.createMediaElementSource(source);
  audioMonitor=audioContext.createMediaStreamDestination();
  audioSource.connect(audioMonitor);
  audioSource.connect(audioContext.destination);
  return audioMonitor;
 }
 function finishExport(chunks,mime){
  const blob=new Blob(chunks,{type:mime});
  if(!blob.size){exportStatus('Не получены данные видео. Попробуй короткий MP4 или другой формат.');return;}
  exportBlob=blob;exportMime=mime;
  if(downloadUrl)URL.revokeObjectURL(downloadUrl);
  downloadUrl=URL.createObjectURL(blob);
  const ext=mime.includes('mp4')?'mp4':'webm';
  const link=$('download');link.href=downloadUrl;
  link.download=(file?.name||'clip').replace(/\.[^.]+$/,'').slice(0,80)+'_VHS_VIDEO.'+ext;
  $('exportResult').hidden=false;
  exportStatus('Готово: '+(blob.size/1048576).toFixed(1)+' МБ · '+ext.toUpperCase()+'. Выбери «Скачать» или «Поделиться».');
 }
 function stopExport(){
  if(!recording||recording.state==='inactive')return;
  exportStopRequested=true;
  source.pause();
  try{recording.stop();}catch(e){console.error(e);}
 }
 async function seekToStart(){
  if(Math.abs(source.currentTime)<.04)return;
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{cleanup();resolve();},3500);
   function cleanup(){clearTimeout(timer);source.removeEventListener('seeked',done);source.removeEventListener('error',fail);}
   function done(){cleanup();resolve();}
   function fail(){cleanup();reject(Error('Не удалось перейти к началу видео.'));}
   source.addEventListener('seeked',done,{once:true});source.addEventListener('error',fail,{once:true});
   try{source.currentTime=0;}catch(e){cleanup();reject(e);}
  });
 }
 async function beginExport(){
  if(!file||recording)return;
  if(!preview.captureStream){exportStatus('Захват Canvas недоступен в этом браузере. Нужен экспорт через WebCodecs.');return;}
  const mime=chooseMime();
  if(!mime){exportStatus('Этот браузер не поддерживает доступный видеокодек. Требуется альтернативный WebCodecs-экспорт.');return;}
  if(!Number.isFinite(source.duration)||source.duration<=0){exportStatus('Неизвестная длительность видео.');return;}
  const [w,h]=videoDimensions(Number(state.size));
  recordCanvas.width=w;recordCanvas.height=h;
  try{
   source.pause();await seekToStart();
   let stream=recordCanvas.captureStream(Number(state.fps));
   recordStream=stream;
   if(state.keepAudio){
    try{
     const monitor=await ensureAudioGraph();
     await audioContext.resume();
     const tracks=monitor.stream.getAudioTracks();
     for(const track of tracks)stream.addTrack(track);
    }catch(e){exportStatus('Звук недоступен: '+e.message+'. Продолжаю без звука.');}
   }
   // A playable processed frame is present before encoding starts.
   drawFrame(recordCanvas);
   const blobs=[];
   const rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:3_000_000});
   recording=rec;exportStopRequested=false;
   $('exportResult').hidden=true;$('export').disabled=true;$('cancel').hidden=false;$('progress').hidden=false;$('progress').value=0;
   $('play').disabled=true;$('seek').disabled=true;$('regenerate').disabled=true;
   rec.ondataavailable=e=>{if(e.data?.size)blobs.push(e.data)};
   rec.onerror=e=>{exportStatus('Ошибка записи: '+(e.error?.message||'неизвестная ошибка'));};
   rec.onstop=()=>{
    const contentType=rec.mimeType||mime;
    recording=null;
    for(const tr of recordStream?.getVideoTracks()||[])tr.stop();
    recordStream=null;
    $('cancel').hidden=true;$('progress').hidden=true;$('export').disabled=false;
    $('play').disabled=false;$('seek').disabled=false;$('regenerate').disabled=false;
    finishExport(blobs,contentType);
    renderCurrentFrame();
   };
   rec.start(1000);
   try{await source.play();}catch(err){stopExport();throw err;}
   exportStatus('Запись началась. Не блокируй экран до завершения.');
  }catch(e){
   exportStatus('Экспорт не запустился: '+e.message);
   if(recording&&recording.state!=='inactive')try{recording.stop();}catch{}
   if(!recording){$('export').disabled=false;$('cancel').hidden=true;$('progress').hidden=true;$('play').disabled=false;$('seek').disabled=false;$('regenerate').disabled=false;}
  }
 }
 async function shareExport(){
  if(!exportBlob)return;
  if(!navigator.share||typeof File==='undefined'){exportStatus('Используй «Скачать результат» и затем «Файлы» на iPhone.');return;}
  const ext=exportMime.includes('mp4')?'mp4':'webm',name=(file?.name||'video').replace(/\.[^.]+$/,'')+'_VHS_VIDEO.'+ext;
  const f=new File([exportBlob],name,{type:exportMime});
  try{
   if(navigator.canShare?.({files:[f]}))await navigator.share({files:[f],title:'VHS Video Lab'});
   else exportStatus('Системная отправка недоступна для этого файла. Используй «Скачать».');
  }catch(e){if(e.name!=='AbortError')exportStatus('Не удалось поделиться: '+e.message);}
 }
 function initEvents(){
  document.querySelectorAll('.tabs button').forEach(button=>button.addEventListener('click',()=>{
   document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('active',b===button));
   document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active',p.id==='panel-'+button.dataset.tab));
  }));
  $('videoInput').onchange=e=>{loadVideo(e.target.files?.[0]).catch(err=>textStatus(err.message));e.target.value='';};
  source.addEventListener('loadedmetadata',onLoaded);source.addEventListener('loadeddata',onLoaded);
  source.addEventListener('seeked',redrawAfterSeek);source.addEventListener('timeupdate',updateTime);
  source.addEventListener('ended',()=>{if(recording)stopExport();$('play').textContent='▶ Просмотр';renderCurrentFrame();});
  source.addEventListener('pause',()=>{$('play').textContent='▶ Просмотр';});
  source.addEventListener('error',()=>{textStatus('Safari не открыл этот видеоформат. Попробуй MP4 H.264 или экспортируй из «Фото» в совместимом формате.');$('export').disabled=true;});
  $('seek').oninput=()=>{if(recording||!source.duration)return;source.currentTime=Number($('seek').value)/1000*source.duration;};
  $('play').onclick=togglePlay;
  $('regenerate').onclick=()=>{state.seed=randomSeed();persist();renderCurrentFrame();};
  $('filmSearch').oninput=renderFilmSelect;
  $('filmSelect').onchange=()=>{if(!$('filmSelect').value)return;state.filmId=$('filmSelect').value;state.filmEnabled=true;$('filmEnabled').checked=true;persist();renderCurrentFrame();};
  $('filmImport').onchange=async e=>{
   for(const f of [...(e.target.files||[])])try{await importPresets(f)}catch(err){$('filmImportStatus').textContent='Ошибка: '+err.message;}
   e.target.value='';
  };
  $('export').onclick=()=>beginExport().catch(e=>exportStatus('Ошибка экспорта: '+e.message));
  $('cancel').onclick=stopExport;
  $('share').onclick=shareExport;
 }
 async function init(){
  mountControls();initEvents();
  if(typeof window.VideoFilmCore==='undefined'||typeof window.VHSPhotoEngine==='undefined')throw Error('Не загрузились эффекты. Обнови страницу с интернетом.');
  try{builtin=await (await fetch('../looks.json')).json();}catch{throw Error('Не удалось загрузить 23 встроенных плёнки.');}
  importedDB=await openVideoDB();
  const [savedXMP,fromPhoto]=await Promise.all([readAll(importedDB,'xmp'),readSharedPhotoProfiles()]);
  importedXMP=savedXMP.slice(0,FILM_LIMIT);
  sharedXMP=fromPhoto.slice(0,FILM_LIMIT);
  try{const prev=JSON.parse(localStorage.getItem('vhs.mobile.settings')||'null');favoriteIds=Array.isArray(prev?.favoriteFilms)?prev.favoriteFilms:[];}catch{}
  rebuildFilmList();
  $('filmImportStatus').textContent=fromPhoto.length?
   'Автоматически обнаружены '+fromPhoto.length+' XMP-профилей из фото-версии в этом браузере.':
   'Локальная XMP-библиотека фото-версии пока недоступна. Можно импортировать ZIP либо резервную копию.';
  loopId=requestAnimationFrame(tick);
  if('serviceWorker'in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(console.warn);
 }
 init().catch(e=>{textStatus('Ошибка запуска: '+e.message);console.error(e);});
})();