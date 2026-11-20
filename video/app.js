/* VHS Video Lab 0.1 — standalone experiment. No uploads; separate from photo app.
 * 23 built-in films + exact Lightroom XMP approximation from VHS Glitch Studio.
 * Video signal: VHSPhotoEngine (original JS stage). Rust/WASM ntsc-rs integration pending.
 */
'use strict';
(() => {
 const $=id=>document.getElementById(id);
 const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
 const glitchMeta=window.VHSVideoGlitchFX.EFFECTS;
 const glitchDefaults=Object.fromEntries(glitchMeta.map(d=>[d.id,d.default]));
 const defaults={vhsEnabled:true,filmEnabled:false,glitchEnabled:true,preset:'classic',master:65,
  mode:'vhs',modeStrength:75,tape:'used',signalWidth:'auto',eventDensity:48,glitchStrength:85,
  speed:'SP',filmId:'builtin:Нейтральный / без плёнки',filmStrength:85,
  signal:{chromaBleed:52,composite:35,edgeWave:38,tracking:54,noise:38,chromaLoss:15,ringing:19},
  glitches:glitchDefaults,
  audio:{enabled:false,mode:'linear',strength:65,hiss:48,wow:42,flutter:32,drop:32,saturation:28},
  camera:{rec:false,play:false,battery:false,date:false,text:'PM 10:28 | JUN 16 1995'},
  size:'480',fps:15,exportScope:'30',keepAudio:true,seed:91823710};
 let saved=null;
 try{saved=JSON.parse(localStorage.getItem('vhs.video.settings')||'null')}catch{}
 const state={...defaults,...(saved||{}),signal:{...defaults.signal,...(saved?.signal||{})},glitches:{...glitchDefaults,...(saved?.glitches||{})},audio:{...defaults.audio,...(saved?.audio||{})},camera:{...defaults.camera,...(saved?.camera||{})}};
 let sourceUrl='',file=null,clips=[],clipIndex=0,builtin={},sharedXMP=[],importedXMP=[],profiles=[],favoriteIds=[];
 let importedDB=null,recording=null,recordStream=null,exportBlob=null,exportMime='';
 let downloadUrl='',exportStopRequested=false,audioContext=null,audioSource=null,audioMonitor=null;
 let lastDraw=0,framePending=false,loopId=0,renderBusy=false,seedHistory=[],audioErrorShown=false;
 const source=$('source'),preview=$('preview'),recordCanvas=$('recordCanvas'),stage=preview.getContext('2d',{willReadFrequently:true});
 const previewProcessor=window.VHSVideoGlitchFX.createProcessor();
 const exportProcessor=window.VHSVideoGlitchFX.createProcessor();
 const audioEngine=window.VHSVideoTapeAudio.create(source);
 const signalCanvas=document.createElement('canvas');
 const signalContext=signalCanvas.getContext('2d',{willReadFrequently:true});
 let adaptivePreviewWidth=240,adaptiveExportWidth=240,slowFrames=0,fastFrames=0;
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
  wrap.append(head,input);parent.append(wrap);return input;}
 function CFinite(x,a,b){return Number.isFinite(x)?clamp(x,a,b):b;}
 function resetFrameHistory(){previewProcessor.reset();exportProcessor.reset();}
 function tuneAdaptiveResolution(cost,exporting){
  if(state.signalWidth!=='auto')return;
  if(cost>110){slowFrames++;fastFrames=0;}
  else if(cost<40){fastFrames++;slowFrames=0;}
  else{slowFrames=0;fastFrames=0;}
  const current=exporting?adaptiveExportWidth:adaptivePreviewWidth;
  if(slowFrames>=2&&current>192){
   if(exporting)adaptiveExportWidth=192;else adaptivePreviewWidth=192;
   slowFrames=0;resetFrameHistory();
  }else if(fastFrames>=25&&current<240){
   if(exporting)adaptiveExportWidth=240;else adaptivePreviewWidth=240;
   fastFrames=0;resetFrameHistory();
  }
 }
 function clipSeed(){return (state.seed^Math.imul(clipIndex+1,0x6c8e9cf5))>>>0;}
 function syncAudio(playing=!source.paused){audioEngine.update({...state.audio,seed:clipSeed()},source.currentTime||0,playing&&!!file);}
 function setSeed(value){state.seed=value>>>0;resetFrameHistory();$('undoGlitch').disabled=!seedHistory.length;persist();renderCurrentFrame();}
 function regenerateSeed(){if(!file||recording)return;seedHistory.push(state.seed>>>0);if(seedHistory.length>50)seedHistory.shift();let next=randomSeed();if(next===state.seed)next=(next+1)>>>0;setSeed(next);}
 function undoSeed(){if(!file||recording||!seedHistory.length)return;setSeed(seedHistory.pop());}
 function mountGlitchControls(){
  const groups={analogue:{label:'АНАЛОГОВЫЕ СБОИ',open:true},temporal:{label:'ВРЕМЕННЫЕ / МЕЖКАДРОВЫЕ',open:true},digital:{label:'ЦИФРОВЫЕ ПОВРЕЖДЕНИЯ',open:false}};
  const parent=$('glitchControls');parent.replaceChildren();
  for(const key of Object.keys(groups)){
   const d=document.createElement('details');d.open=groups[key].open;
   const sum=document.createElement('summary');sum.textContent=groups[key].label+' · '+glitchMeta.filter(x=>x.group===key).length;
   d.append(sum);parent.append(d);
   for(const def of glitchMeta.filter(x=>x.group===key))control(d,def.name,state.glitches[def.id],v=>{state.glitches[def.id]=v;resetFrameHistory();});
  }
 }
 function mountControls(){
  control($('vhsControls'),'Общая сила VHS',state.master,v=>{state.master=v;resetFrameHistory();});
  const tape=document.createElement('label');tape.textContent='Режим видеокассеты';
  const sp=document.createElement('select');for(const p of ['SP','LP','EP'])sp.add(new Option(p,p));sp.value=state.speed;
  sp.addEventListener('change',()=>{state.speed=sp.value;persist();renderCurrentFrame();});tape.append(sp);$('vhsControls').append(tape);
  for(const [id,label] of [['chromaBleed','Растекание цвета'],['composite','Артефакты композитного сигнала'],['edgeWave','Нестабильность видеострок'],['tracking','Помехи видеоголовки (1–4 полосы)'],['noise','Шум и снег'],['chromaLoss','Выпадения цвета'],['ringing','Контурное эхо']]){
   control($('vhsControls'),label,state.signal[id],v=>state.signal[id]=v);
  }
  control($('modeStrengthControl'),'Сила режима (MiniDV / CRT / Night Vision)',state.modeStrength,v=>{state.modeStrength=v;resetFrameHistory();});
  function mountEventControls(){
   const parent=$('eventControls');parent.replaceChildren();
   control(parent,'Частота случайных сбоев',state.eventDensity,v=>{state.eventDensity=v;resetFrameHistory();});
   control(parent,'Общая сила дополнительных помех',state.glitchStrength,v=>{state.glitchStrength=v;resetFrameHistory();});
  }
  mountEventControls();mountGlitchControls();
  const tapes=$('tapeKind');
  for(const def of window.VHSVideoGlitchFX.TAPES)tapes.add(new Option(def.name,def.id));
  tapes.value=state.tape;
  tapes.onchange=()=>{state.tape=tapes.value;persist();resetFrameHistory();renderCurrentFrame();};
  $('signalWidth').value=state.signalWidth;
  $('signalWidth').onchange=()=>{
   state.signalWidth=$('signalWidth').value;resetFrameHistory();persist();renderCurrentFrame();
  };
  $('modeSelect').value=state.mode;
  $('modeSelect').onchange=()=>{state.mode=$('modeSelect').value;persist();resetFrameHistory();renderCurrentFrame();};
  $('glitchEnabled').checked=state.glitchEnabled;
  $('glitchEnabled').onchange=()=>{state.glitchEnabled=$('glitchEnabled').checked;persist();resetFrameHistory();renderCurrentFrame();};
  for(const [name,fn] of [
    ['gentleGlitch',d=>d.group==='digital'?0:Math.min(d.default,22)],
    ['chaosGlitch',d=>Math.min(100,Math.round(d.default*1.75))],
    ['offGlitch',()=>0]
  ])$(name).onclick=()=>{
    for(const def of glitchMeta)state.glitches[def.id]=fn(def);
    if(name==='chaosGlitch')state.eventDensity=80;
    if(name==='gentleGlitch')state.eventDensity=35;
    if(name==='offGlitch')state.eventDensity=0;
    mountEventControls();mountGlitchControls();persist();resetFrameHistory();renderCurrentFrame();
  };
  const audio=$('audioControls');
  for(const [id,label] of [
    ['strength','Сила деградации аудио'],['hiss','Шипение ленты'],
    ['wow','Плавание звука / Wow'],['flutter','Дрожание звука / Flutter'],
    ['drop','Выпадения звука'],['saturation','Перегрузка и насыщение']
  ])control(audio,label,state.audio[id],v=>{state.audio[id]=v;syncAudio();});
  $('audioEnabled').checked=state.audio.enabled;
  $('audioEnabled').onchange=()=>{state.audio.enabled=$('audioEnabled').checked;syncAudio();persist();};
  $('audioMode').value=state.audio.mode;
  $('audioMode').onchange=()=>{state.audio.mode=$('audioMode').value;syncAudio();persist();};
  control($('filmControls'),'Сила плёнки',state.filmStrength,v=>state.filmStrength=v);
  $('vhsEnabled').checked=state.vhsEnabled;$('filmEnabled').checked=state.filmEnabled;
  $('vhsPreset').value=state.preset;
  $('outputSize').value=state.size;$('fps').value=String(state.fps);
  $('exportScope').value=state.exportScope;
  $('keepAudio').checked=state.keepAudio;
  for(const k of ['rec','play','battery','date'])$(k+'On').checked=!!state.camera[k];
  $('dateText').value=state.camera.text;
  $('vhsEnabled').onchange=()=>{state.vhsEnabled=$('vhsEnabled').checked;persist();renderCurrentFrame();};
  $('filmEnabled').onchange=()=>{state.filmEnabled=$('filmEnabled').checked;persist();renderCurrentFrame();};
  $('vhsPreset').onchange=()=>{state.preset=$('vhsPreset').value;persist();renderCurrentFrame();};
  $('outputSize').onchange=()=>{state.size=$('outputSize').value;persist();};
  $('fps').onchange=()=>{state.fps=Number($('fps').value);persist();};
  $('keepAudio').onchange=()=>{state.keepAudio=$('keepAudio').checked;persist();};
  $('exportScope').onchange=()=>{state.exportScope=$('exportScope').value;persist();};
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
 function drawFrame(canvas,forExport=false){
  if(!file||source.readyState<2||!source.videoWidth)return;
  const limit=state.signalWidth==='auto'?(forExport||recording?adaptiveExportWidth:adaptivePreviewWidth):Number(state.signalWidth);
  const ratio=CFinite(Math.min(1,limit/Math.max(canvas.width,canvas.height)),.1,1);
  const iw=Math.max(2,Math.round(canvas.width*ratio/2)*2),ih=Math.max(2,Math.round(canvas.height*ratio/2)*2);
  if(signalCanvas.width!==iw)signalCanvas.width=iw;
  if(signalCanvas.height!==ih)signalCanvas.height=ih;
  const ctx=signalContext;
  // Letterbox video; source aspect ratio is never stretched.
  const scale=Math.min(iw/source.videoWidth,ih/source.videoHeight);
  const tw=Math.max(1,source.videoWidth*scale),th=Math.max(1,source.videoHeight*scale);
  ctx.fillStyle='#050707';ctx.fillRect(0,0,iw,ih);
  ctx.drawImage(source,(iw-tw)/2,(ih-th)/2,tw,th);
  const image=ctx.getImageData(0,0,iw,ih);
  if(state.filmEnabled){
   const f=selectedFilm(),strength=state.filmStrength/100;
   if(f?.type==='builtin')window.VideoFilmCore.filmBuiltin(image.data,builtin[f.name],strength);
   else if(f?.fields)window.VideoFilmCore.filmXMP(image.data,f,strength);
  }
  ctx.putImageData(image,0,0);
  drawOsd(ctx,iw,ih);
  const time=source.currentTime||0,frameIndex=Math.floor(time*(Number(state.fps)||15));
  // A mechanical tape splice is strongest at real clip joins.
  const splicePulse=Math.max(
   clipIndex>0?clamp(1-time/.33,0,1):0,
   clipHasNext()&&Number.isFinite(source.duration)?clamp(1-(source.duration-time)/.30,0,1):0
  );
  const seed=(clipSeed()^Math.imul(frameIndex+1,0x9e3779b9))>>>0;
  if(state.vhsEnabled&&state.master>0){
   const signal=ctx.getImageData(0,0,iw,ih);
   const tape=window.VHSVideoGlitchFX.TAPES.find(t=>t.id===state.tape)||window.VHSVideoGlitchFX.TAPES[1];
   const preset=state.preset==='damaged'?1.25:state.preset==='camcorder'?.75:1;
   window.VHSPhotoEngine.apply(signal.data,iw,ih,{
    master:clamp(state.master/100*preset*tape.level,0,1.4),seed,
    signal:{...state.signal,noise:Math.min(100,state.signal.noise*tape.noise),tracking:Math.min(100,state.signal.tracking*tape.head),tapeSpeed:state.speed}
   });
   ctx.putImageData(signal,0,0);
  }
  if(state.glitchEnabled||state.mode!=='vhs'){
   const signal=ctx.getImageData(0,0,iw,ih);
   const engine=forExport||recording?exportProcessor:previewProcessor;
   engine.apply(signal.data,iw,ih,{
    time,seed:clipSeed(),mode:state.mode,modeStrength:state.modeStrength,splicePulse,
    tape:state.tape,density:state.eventDensity,
    strength:state.glitchEnabled?state.glitchStrength/100:0,effects:state.glitchEnabled?state.glitches:{}
   });
   ctx.putImageData(signal,0,0);
  }
  const output=canvas.getContext('2d');
  output.imageSmoothingEnabled=true;
  output.clearRect(0,0,canvas.width,canvas.height);
  output.drawImage(signalCanvas,0,0,canvas.width,canvas.height);
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
   const begin=performance.now();
   syncAudio(true);
   if(recording){
    drawFrame(recordCanvas,true);
    stage.drawImage(recordCanvas,0,0,preview.width,preview.height);
    const max=state.exportScope==='full'?(clipTotalTime()||source.duration||30):Math.min(30,clipTotalTime()||source.duration||30);
    const elapsed=globalVideoTime();
    $('progress').value=clamp(elapsed/max*100,0,100);
    exportStatus('Запись: '+timeString(elapsed)+' / '+timeString(max)+' · клип '+(clipIndex+1)+'/'+clips.length);
    if(elapsed>=max-.04||(!clipHasNext()&&source.ended))stopExport();
   }else{drawFrame(preview);}
   tuneAdaptiveResolution(performance.now()-begin,!!recording);
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
 function clipTotalTime(){return clips.reduce((sum,c)=>sum+(Number.isFinite(c.duration)?c.duration:0),0);}
 function globalVideoTime(){return clips.slice(0,clipIndex).reduce((sum,c)=>sum+(c.duration||0),0)+(source.currentTime||0);}
 function clipHasNext(){return clipIndex<clips.length-1;}
 function updateClipNav(){
  $('clipLabel').textContent=clips.length>1?(clipIndex+1)+' / '+clips.length+' · '+(file?.name||''):'Один видеоклип';
  $('prevClip').disabled=recording||clipIndex<=0;
  $('nextClip').disabled=recording||!clipHasNext();
 }
 async function waitVideoReady(){
  if(source.readyState>=2)return;
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{cleanup();reject(Error('Видео не удалось подготовить к воспроизведению.'));},12000);
   function cleanup(){clearTimeout(timer);source.removeEventListener('loadeddata',ok);source.removeEventListener('error',bad);}
   function ok(){cleanup();resolve();}
   function bad(){cleanup();reject(Error('Формат видеоклипа не поддерживается в Safari.'));}
   source.addEventListener('loadeddata',ok,{once:true});source.addEventListener('error',bad,{once:true});
  });
 }
 async function selectClip(index,autoplay=false){
  if(index<0||index>=clips.length)return;
  const clip=clips[index];
  const same=clipIndex===index&&source.src===clip.url&&source.readyState>=2;
  if(!same){
   source.pause();audioEngine.suspendNoise();
   clipIndex=index;file=clip.file;sourceUrl=clip.url;
   resetFrameHistory();
   source.src=sourceUrl;source.load();
   $('videoName').textContent=file.name;
   $('videoMeta').textContent=(file.size/1048576).toFixed(1)+' МБ';
   updateClipNav();
   await waitVideoReady();
  }
  if(autoplay){
   try{await source.play();$('play').textContent='Ⅱ Пауза';}
   catch(e){textStatus('Не удалось автоматически продолжить следующий клип: '+e.message);if(recording)stopExport();}
  }else renderCurrentFrame();
 }
 async function probeClipDuration(clip){
  return new Promise(resolve=>{
   const video=document.createElement('video');let timer,doneAlready=false;
   function done(value){
    if(doneAlready)return;doneAlready=true;
    clearTimeout(timer);video.removeAttribute('src');video.load();resolve(value);
   }
   video.preload='metadata';video.playsInline=true;
   video.onloadedmetadata=()=>done(Number.isFinite(video.duration)?video.duration:0);
   video.onerror=()=>done(0);
   timer=setTimeout(()=>done(0),6500);
   video.src=clip.url;video.load();
  });
 }
 async function loadVideo(input){
  const list=Array.from(input||[]).slice(0,10);
  if(!list.length)return;
  if(recording)throw Error('Нельзя сменить ролик во время экспорта.');
  source.pause();audioEngine.suspendNoise();resetFrameHistory();seedHistory=[];$('undoGlitch').disabled=true;
  for(const entry of clips)URL.revokeObjectURL(entry.url);
  clips=list.map(f=>({file:f,url:URL.createObjectURL(f),duration:0}));
  clipIndex=0;file=clips[0].file;sourceUrl=clips[0].url;
  source.src=sourceUrl;source.load();
  $('videoName').textContent=file.name;
  $('videoMeta').textContent=(file.size/1048576).toFixed(1)+' МБ';
  $('empty').hidden=true;$('play').disabled=true;$('export').disabled=true;$('seek').disabled=true;
  $('exportResult').hidden=true;updateClipNav();
  textStatus('Подготавливаю '+clips.length+' клип(ов)…');
  if(clips.length>1)for(let j=1;j<clips.length;j++){
   clips[j].duration=await probeClipDuration(clips[j]);
  }
  updateClipNav();
  textStatus('Готово к просмотру: '+clips.length+' клип(ов). Выбери VHS, FILM или ГЛИТЧ.');
 }
 function onLoaded(){
  if(!source.videoWidth||!source.videoHeight)return;
  const [w,h]=videoDimensions(520);
  preview.width=w;preview.height=h;
  if(clips[clipIndex])clips[clipIndex].duration=Number.isFinite(source.duration)?source.duration:0;
  $('videoMeta').textContent=source.videoWidth+' × '+source.videoHeight+' · '+timeString(source.duration);
  updateClipNav();
  $('play').disabled=!!recording;$('export').disabled=!!recording;$('regenerate').disabled=!!recording;$('seek').disabled=!!recording;
  $('timeTotal').textContent=timeString(source.duration);
  textStatus(clips.length>1?'Монтаж: '+clips.length+' клипов. VHS + FILM применяются ко всей серии.':'Видео готово. Нажми ▶ или перемести ползунок. Оригинал не изменяется.');
  renderCurrentFrame();
 }
 async function togglePlay(){
  if(!file||recording)return;
  try{
   if(source.paused){try{await audioEngine.start();syncAudio(true);}catch(err){if(!audioErrorShown){textStatus('Звук недоступен: '+err.message);audioErrorShown=true;}}await source.play();$('play').textContent='Ⅱ Пауза';}
   else{source.pause();$('play').textContent='▶ Просмотр';}
  }catch(e){textStatus('Не удалось воспроизвести: '+e.message);}
 }
 function redrawAfterSeek(){updateTime();resetFrameHistory();renderCurrentFrame();}
 function chooseMime(){
  if(typeof MediaRecorder==='undefined')return null;
  const supported=['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4;codecs=avc1.42E01E','video/mp4','video/webm;codecs=vp8,opus','video/webm'];
  return supported.find(t=>MediaRecorder.isTypeSupported(t))||null;
 }
 async function ensureAudioGraph(){
  await audioEngine.start();syncAudio(true);
  return {stream:{getAudioTracks:()=>audioEngine.getTracks()}};
 }
 function finishExport(chunks,mime){
  const blob=new Blob(chunks,{type:mime});
  if(!blob.size){exportStatus('Не получены данные видео. Попробуй короткий MP4 или другой формат.');return;}
  exportBlob=blob;exportMime=mime;
  if(downloadUrl)URL.revokeObjectURL(downloadUrl);
  downloadUrl=URL.createObjectURL(blob);
  const ext=mime.includes('mp4')?'mp4':'webm';
  const link=$('download');link.href=downloadUrl;
  link.download=(clips[0]?.file?.name||'clip').replace(/\.[^.]+$/,'').slice(0,80)+'_VHS_VIDEO.'+ext;
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
  if(clips.length>1&&clips.some(c=>!Number.isFinite(c.duration)||c.duration<=0)){
   exportStatus('Не удалось определить длительность всех клипов. Проверь форматы каждого видео или попробуй по одному.');return;
  }
  const [w,h]=videoDimensions(Number(state.size));
  recordCanvas.width=w;recordCanvas.height=h;exportProcessor.reset();adaptiveExportWidth=240;slowFrames=0;fastFrames=0;
  try{
   source.pause();
   if(clipIndex!==0)await selectClip(0,false);
   await seekToStart();
   let stream=recordCanvas.captureStream(Number(state.fps));
   recordStream=stream;
   if(state.keepAudio){
    try{
     const monitor=await ensureAudioGraph();
     await audioEngine.ctx.resume();
     const tracks=monitor.stream.getAudioTracks();
     for(const track of tracks)stream.addTrack(track);
    }catch(e){exportStatus('Звук недоступен: '+e.message+'. Продолжаю без звука.');}
   }
   // A playable processed frame is present before encoding starts.
   drawFrame(recordCanvas,true);
   const blobs=[];
   const rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:3_000_000});
   recording=rec;exportStopRequested=false;
   $('exportResult').hidden=true;$('export').disabled=true;$('cancel').hidden=false;$('progress').hidden=false;$('progress').value=0;
   $('play').disabled=true;$('seek').disabled=true;$('regenerate').disabled=true;$('undoGlitch').disabled=true;updateClipNav();
   rec.ondataavailable=e=>{if(e.data?.size)blobs.push(e.data)};
   rec.onerror=e=>{exportStatus('Ошибка записи: '+(e.error?.message||'неизвестная ошибка'));};
   rec.onstop=()=>{
    const contentType=rec.mimeType||mime;
    recording=null;
    for(const tr of recordStream?.getVideoTracks()||[])tr.stop();
    recordStream=null;
    $('cancel').hidden=true;$('progress').hidden=true;$('export').disabled=false;
    $('play').disabled=false;$('seek').disabled=false;$('regenerate').disabled=false;$('undoGlitch').disabled=!seedHistory.length;updateClipNav();
    finishExport(blobs,contentType);
    renderCurrentFrame();
   };
   rec.start(1000);
   try{await source.play();}catch(err){stopExport();throw err;}
   exportStatus('Запись началась. Не блокируй экран до завершения.');
  }catch(e){
   exportStatus('Экспорт не запустился: '+e.message);
   if(recording&&recording.state!=='inactive')try{recording.stop();}catch{}
   if(!recording){$('export').disabled=false;$('cancel').hidden=true;$('progress').hidden=true;$('play').disabled=false;$('seek').disabled=false;$('regenerate').disabled=false;$('undoGlitch').disabled=!seedHistory.length;updateClipNav();}
  }
 }
 async function shareExport(){
  if(!exportBlob)return;
  if(!navigator.share||typeof File==='undefined'){exportStatus('Используй «Скачать результат» и затем «Файлы» на iPhone.');return;}
  const ext=exportMime.includes('mp4')?'mp4':'webm',name=(clips[0]?.file?.name||'video').replace(/\.[^.]+$/,'')+'_VHS_VIDEO.'+ext;
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
  $('videoInput').onchange=e=>{loadVideo(e.target.files).catch(err=>textStatus(err.message));e.target.value='';};
  $('prevClip').onclick=()=>{if(recording)return;selectClip(clipIndex-1,false).catch(e=>textStatus(e.message));};
  $('nextClip').onclick=()=>{if(recording)return;selectClip(clipIndex+1,false).catch(e=>textStatus(e.message));};
  source.addEventListener('loadedmetadata',onLoaded);source.addEventListener('loadeddata',onLoaded);
  source.addEventListener('seeked',redrawAfterSeek);source.addEventListener('timeupdate',updateTime);
  source.addEventListener('ended',()=>{
   if(clipHasNext())selectClip(clipIndex+1,true).catch(e=>{textStatus(e.message);if(recording)stopExport();});
   else{if(recording)stopExport();$('play').textContent='▶ Просмотр';audioEngine.suspendNoise();renderCurrentFrame();}
  });
  source.addEventListener('pause',()=>{$('play').textContent='▶ Просмотр';audioEngine.suspendNoise();});
  source.addEventListener('error',()=>{textStatus('Safari не открыл этот видеоформат. Попробуй MP4 H.264 или экспортируй из «Фото» в совместимом формате.');$('export').disabled=true;});
  $('seek').oninput=()=>{if(recording||!source.duration)return;source.currentTime=Number($('seek').value)/1000*source.duration;};
  $('play').onclick=togglePlay;
  $('regenerate').onclick=regenerateSeed;
  $('undoGlitch').onclick=undoSeed;
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
  if(!window.VideoFilmCore||!window.VHSPhotoEngine||!window.VHSVideoGlitchFX||!window.VHSVideoTapeAudio)throw Error('Не загрузились эффекты. Обнови страницу с интернетом.');
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