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
  fxMode:'classic',music:{bassEffect:'vhold',highEffect:'dropouts',sensitivity:60,threshold:25,strength:85,release:35},timelineEvents:[],timelineStrength:85,
  mix:{videoVolume:100,musicVolume:75,musicStart:0,musicOffset:0,musicLoop:true},
  selectedTrack:null,
  speed:'SP',filmId:'builtin:Нейтральный / без плёнки',filmStrength:85,
  signal:{chromaBleed:52,composite:35,edgeWave:38,tracking:54,noise:38,chromaLoss:15,ringing:19},
  glitches:glitchDefaults,
  audio:{enabled:false,mode:'linear',strength:65,hiss:48,wow:42,flutter:32,drop:32,saturation:28},
  camera:{rec:false,play:false,battery:false,date:false,text:'PM 10:28 | JUN 16 1995',
   positions:{rec:'left-top',play:'left-top',battery:'right-top',date:'right-bottom'},
   sizes:{rec:125,play:125,battery:125,date:125},batteryLevel:'LOW'},
  size:'480',fps:15,exportScope:'30',keepAudio:true,seed:91823710};
 let saved=null;
 try{saved=JSON.parse(localStorage.getItem('vhs.video.settings')||'null')}catch{}
 const state={...defaults,...(saved||{}),signal:{...defaults.signal,...(saved?.signal||{})},glitches:{...glitchDefaults,...(saved?.glitches||{})},music:{...defaults.music,...(saved?.music||{})},mix:{...defaults.mix,...(saved?.mix||{})},selectedTrack:saved?.selectedTrack||null,timelineEvents:(Array.isArray(saved?.timelineEvents)?saved.timelineEvents.slice(0,150):[]).map(e=>window.VHSVideoSpecialModes.cleanEvent(e)).filter(Boolean),audio:{...defaults.audio,...(saved?.audio||{})},camera:{...defaults.camera,...(saved?.camera||{}),positions:{...defaults.camera.positions,...(saved?.camera?.positions||{})},sizes:{...defaults.camera.sizes,...(saved?.camera?.sizes||{})}}};
 let sourceUrl='',file=null,clips=[],clipIndex=0,builtin={},sharedXMP=[],importedXMP=[],profiles=[],favoriteIds=[];
 let importedDB=null,recording=null,recordStream=null,exportBlob=null,exportMime='';
 let downloadUrl='',exportStopRequested=false,audioContext=null,audioSource=null,audioMonitor=null;
 let lastDraw=0,framePending=false,loopId=0,renderBusy=false,seedHistory=[],audioErrorShown=false,videoUI=null;
 const source=$('source'),preview=$('preview'),recordCanvas=$('recordCanvas'),stage=preview.getContext('2d',{willReadFrequently:true});
 const previewProcessor=window.VHSVideoGlitchFX.createProcessor();
 const exportProcessor=window.VHSVideoGlitchFX.createProcessor();
 const audioEngine=window.VHSVideoTapeAudio.create(source);
 const signalCanvas=document.createElement('canvas');
 const signalContext=signalCanvas.getContext('2d',{willReadFrequently:true});
 let adaptivePreviewWidth=240,adaptiveExportWidth=240,slowFrames=0,fastFrames=0;
 let selectedTimelineId='',lastMusicState={bass:0,high:0},lastMusicTime=0;
 let musicSearchResults=[],musicTrackInfo=null,musicRequest=0,musicLoading=false,musicSearchTimer=null,musicSearchToken=0,musicAbort=null,musicPreviewBlobURL='';
 const bridge={url:'',key:''};
 try{bridge.url=localStorage.getItem('vhs.video.music.bridge.url')||'';}catch{}
 try{bridge.key=sessionStorage.getItem('vhs.video.music.bridge.key')||'';}catch{}
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
 function resetFrameHistory(){previewProcessor.reset();exportProcessor.reset();lastMusicState={bass:0,high:0};lastMusicTime=0;}
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
 function syncAudio(playing=!source.paused){
  const active=playing&&!!file&&!source.paused;
  audioEngine.setMix(state.mix);
  audioEngine.update({...state.audio,seed:clipSeed()},source.currentTime||0,active);
  audioEngine.syncMusic(globalVideoTime(),active);
}
 function setSeed(value){state.seed=value>>>0;resetFrameHistory();$('undoGlitch').disabled=!seedHistory.length;persist();renderCurrentFrame();videoUI?.sync();}
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
 function mountCameraControls(){
  const parent=$('cameraControls');parent.replaceChildren();
  const corners=[['left-top','Слева сверху'],['right-top','Справа сверху'],['left-bottom','Слева снизу'],['right-bottom','Справа снизу']];
  const descriptions={rec:'REC / Запись',play:'PLAY / Воспроизведение',date:'Дата и время',battery:'Батарея'};
  for(const key of ['rec','play','date','battery']){
   const card=document.createElement('section');card.className='cameraCard';
   const header=document.createElement('div');header.className='cameraCardTitle';
   const title=document.createElement('strong');title.textContent=descriptions[key];
   const toggleLabel=document.createElement('label');toggleLabel.className='cameraSwitch';
   const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.id=key+'On';checkbox.checked=!!state.camera[key];
   const toggleTxt=document.createElement('span');toggleTxt.textContent='Вкл.';
   toggleLabel.append(checkbox,toggleTxt);header.append(title,toggleLabel);card.append(header);
   checkbox.addEventListener('change',()=>{state.camera[key]=checkbox.checked;persist();renderCurrentFrame();});
   const options=document.createElement('div');options.className='cameraCardOptions';
   const posLabel=document.createElement('label');posLabel.textContent='Положение';
   const position=document.createElement('select');position.id=key+'Position';
   for(const [id,name] of corners)position.add(new Option(name,id));
   position.value=state.camera.positions[key];
   position.addEventListener('change',()=>{state.camera.positions[key]=position.value;persist();renderCurrentFrame();});
   posLabel.append(position);options.append(posLabel);
   const sizeLabel=document.createElement('label');sizeLabel.textContent='Размер';
   const size=document.createElement('select');size.id=key+'Size';
   for(const n of [70,85,100,125,150,180,220])size.add(new Option(n+'%',String(n)));
   size.value=String(state.camera.sizes[key]);
   if(![...size.options].some(x=>x.value===size.value))size.value='125';
   size.addEventListener('change',()=>{state.camera.sizes[key]=Number(size.value);persist();renderCurrentFrame();});
   sizeLabel.append(size);options.append(sizeLabel);
   if(key==='date'){
    const textLabel=document.createElement('label');textLabel.className='fullRow';textLabel.textContent='Надпись';
    const input=document.createElement('input');input.type='text';input.id='dateText';input.maxLength=64;
    input.value=state.camera.text;input.placeholder='PM 10:28 | JUN 16 1995';
    input.addEventListener('input',()=>{state.camera.text=input.value;persist();renderCurrentFrame();});
    textLabel.append(input);options.append(textLabel);
   }
   if(key==='battery'){
    const levelLabel=document.createElement('label');levelLabel.className='fullRow';levelLabel.textContent='Уровень заряда';
    const level=document.createElement('select');level.id='batteryLevel';
    for(const k of ['FULL','75%','50%','25%','LOW','EMPTY'])level.add(new Option(k,k));
    level.value=state.camera.batteryLevel||'LOW';
    level.addEventListener('change',()=>{state.camera.batteryLevel=level.value;persist();renderCurrentFrame();});
    levelLabel.append(level);options.append(levelLabel);
   }
   card.append(options);parent.append(card);
  }
 }
 function syncModeUI(){
  const labels={classic:'ОБЫЧНЫЙ VHS',music:'♫ В ТАКТ МУЗЫКЕ',timeline:'▤ РУЧНОЙ ТАЙМЛАЙН'};
  if(!(state.fxMode in labels))state.fxMode='classic';
  $('activeFxMode').textContent=labels[state.fxMode];
  for(const [id,mode,label] of [
   ['musicActivate','music','♫'],['timelineActivate','timeline','▤']
  ]){
   const active=state.fxMode===mode;
   $(id).textContent=active?label+' Режим включён ✓':label+' Включить только '+(mode==='music'?'музыкальные помехи':'таймлайн');
   $(id).setAttribute('aria-pressed',String(active));
  }
  for(const [id,mode] of [['fxClassic','classic'],['fxMusic','music'],['fxTimeline','timeline']]){
   $(id).classList.toggle('active',state.fxMode===mode);
   $(id).setAttribute('aria-pressed',String(state.fxMode===mode));
  }
 }
 function selectMode(mode){
  if(recording||!['classic','music','timeline'].includes(mode))return;
  state.fxMode=mode;
  resetFrameHistory();syncModeUI();persist();renderCurrentFrame();
  if(mode!=='classic'){
   const tab=mode==='music'?'music':'timeline';
   document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
   document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active',p.id==='panel-'+tab));
  }
 }
 function buildModeControls(){
  const fx=window.VHSVideoSpecialModes;
  for(const id of ['bassEffect','highEffect','timelineEffect']){
   const el=$(id);el.replaceChildren();
   fx.EFFECT_IDS.forEach((key,i)=>el.add(new Option(fx.LABELS[i],key)));
  }
  $('bassEffect').value=state.music.bassEffect;
  $('highEffect').value=state.music.highEffect;
  $('timelineEffect').value='tapeChew';
  $('bassEffect').onchange=()=>{state.music.bassEffect=$('bassEffect').value;resetFrameHistory();persist();};
  $('highEffect').onchange=()=>{state.music.highEffect=$('highEffect').value;resetFrameHistory();persist();};
  for(const [key,name] of [
   ['sensitivity','Чувствительность к музыке'],['threshold','Порог срабатывания'],
   ['strength','Сила музыкальных повреждений'],['release','Длительность затухания эффекта']
  ])control($('musicControls'),name,state.music[key],v=>{state.music[key]=v;resetFrameHistory();});
  control($('timelineControls'),'Сила выбранного события',state.timelineStrength,v=>{state.timelineStrength=v;});
  $('fxClassic').onclick=()=>selectMode('classic');
  $('fxMusic').onclick=()=>selectMode('music');
  $('fxTimeline').onclick=()=>selectMode('timeline');
  $('musicActivate').onclick=()=>selectMode(state.fxMode==='music'?'classic':'music');
  $('timelineActivate').onclick=()=>selectMode(state.fxMode==='timeline'?'classic':'timeline');
  $('usePlayhead').onclick=()=>{$('timelineStart').value=Number(source.currentTime||0).toFixed(1);};
  $('addTimelineEvent').onclick=saveTimelineEvent;
  syncModeUI();renderTimeline();
 }
 function renderTimeline(){
  const clipEvents=state.timelineEvents.filter(e=>e.clip===clipIndex).sort((a,b)=>a.time-b.time);
  $('timelineCount').textContent=clipEvents.length+' событий';
  const list=$('timelineEvents'),track=$('timelineTrack');
  list.replaceChildren();track.replaceChildren();
  if(!clipEvents.length){
   const hint=document.createElement('div');hint.className='timelineEmpty';
   hint.textContent='Пока нет событий. Укажи момент, выбери эффект и нажми «Добавить».';
   list.append(hint);
  }
  const duration=Number.isFinite(source.duration)&&source.duration>0?source.duration:1;
  const fx=window.VHSVideoSpecialModes;
  for(const event of clipEvents){
   const display=fx.LABELS[fx.EFFECT_IDS.indexOf(event.effect)]||event.effect;
   const mark=document.createElement('button');mark.type='button';mark.className='timelineMarker';
   mark.style.left=Math.max(0,Math.min(99,event.time/duration*100))+'%';
   mark.style.width=Math.max(.7,Math.min(100,event.duration/duration*100))+'%';
   mark.title=display+' · '+event.time.toFixed(1)+' с';
   mark.setAttribute('aria-label',mark.title);
   mark.addEventListener('click',()=>selectTimelineEvent(event));
   track.append(mark);
   const row=document.createElement('div');row.className='timelineEvent';
   const go=document.createElement('button');go.type='button';go.className='timelineGo';
   const title=document.createElement('strong');title.textContent=display;
   const desc=document.createElement('small');desc.textContent=event.time.toFixed(1)+' с • '+event.duration.toFixed(1)+' с • '+event.strength+'%';
   go.append(title,desc);
   go.addEventListener('click',()=>selectTimelineEvent(event));
   const del=document.createElement('button');del.type='button';del.className='timelineDelete';
   del.textContent='✕';del.title='Удалить '+display;del.setAttribute('aria-label',del.title);
   del.addEventListener('click',()=>{
    if(recording)return;
    state.timelineEvents=state.timelineEvents.filter(e=>e.id!==event.id);
    if(selectedTimelineId===event.id){selectedTimelineId='';$('addTimelineEvent').textContent='＋ Добавить повреждение';}
    persist();resetFrameHistory();renderTimeline();renderCurrentFrame();
   });
   row.append(go,del);list.append(row);
  }
  $('timelineNow').textContent=timeString(source.currentTime);
 }
 function selectTimelineEvent(event){
  if(recording||!file)return;
  selectedTimelineId=event.id;
  $('timelineStart').value=event.time.toFixed(1);
  $('timelineDuration').value=event.duration.toFixed(1);
  $('timelineEffect').value=event.effect;
  $('addTimelineEvent').textContent='✓ Сохранить изменения';
  state.timelineStrength=event.strength;
  // Slider display and slider value stay synchronized with the selected event.
  const slider=$('timelineControls').querySelector('input[type=range]');
  if(slider){slider.value=event.strength;slider.dispatchEvent(new Event('input',{bubbles:true}));}
  source.currentTime=Math.min(source.duration||event.time+1,event.time+Math.min(event.duration*.15,.15));
  updateTime();
 }
 function saveTimelineEvent(){
  if(!file||recording){textStatus('Сначала загрузи видео и останови экспорт.');return;}
  const fx=window.VHSVideoSpecialModes;
  const input={id:selectedTimelineId||('ev'+Date.now().toString(36)+Math.floor(Math.random()*999)),
   clip:clipIndex,time:Number($('timelineStart').value),duration:Number($('timelineDuration').value),
   effect:$('timelineEffect').value,strength:Number(state.timelineStrength)};
  const e=fx.cleanEvent(input);
  if(!e){textStatus('Проверь время, длительность и тип повреждения.');return;}
  if(Number.isFinite(source.duration)&&source.duration>0&&e.time>=source.duration){
   textStatus('Начало события должно быть внутри загруженного клипа.');return;
  }
  if(!selectedTimelineId&&state.timelineEvents.length>=120){textStatus('Лимит: 120 событий. Удали ненужные.');return;}
  if(selectedTimelineId)state.timelineEvents=state.timelineEvents.map(old=>old.id===selectedTimelineId?e:old);
  else state.timelineEvents.push(e);
  selectedTimelineId='';$('addTimelineEvent').textContent='＋ Добавить повреждение';
  persist();resetFrameHistory();renderTimeline();renderCurrentFrame();
  if(state.fxMode!=='timeline')selectMode('timeline');
 }
 function specialEffectsAt(time){
  const special=window.VHSVideoSpecialModes;
  if(state.fxMode==='timeline')return special.eventsAt(time,clipIndex,state.timelineEvents);
  if(state.fxMode==='music'){
   const readings=audioEngine.getLevels();
   const dt=Math.max(0,Math.min(.5,time-lastMusicTime))||.08;
   if(time<lastMusicTime-.1)lastMusicState={bass:0,high:0};
   const m=special.musicAt(readings,state.music,lastMusicState,dt);
   lastMusicState=m.levels;lastMusicTime=time;
   $('bassMeter').value=Math.round(m.raw.bass*100);
   $('highMeter').value=Math.round(m.raw.high*100);
   $('bassLevel').textContent=Math.round(m.raw.bass*100)+'%';
   $('highLevel').textContent=Math.round(m.raw.high*100)+'%';
   $('musicStatus').textContent=readings.available?
    'Анализ звука видео включён. Басы и высокие частоты управляют выбранными эффектами.':
    'Нажми ▶ для анализа звуковой дорожки. Без звука эффекты не запускаются.';
   return m.values;
  }
  return null;
 }
 function musicLoadStatus(message){
  // Network and decoder errors must be visible beside the input, not only
  // after the mixer at the bottom of the screen.
  $('musicLoadStatus').textContent=message;
  $('musicDirectStatus').textContent=message;
 }
 function isSongPageAddress(u){
  return /(?:^|\/)(?:song|songs|track|tracks|album|albums|artist|artists|playlist|wiki)\//i.test(u.pathname);
 }
 function showMusicSelection(){
  const track=state.selectedTrack;
  $('musicSelection').hidden=!track;
  if(!track)return;
  $('musicTitle').textContent=track.title||'Без названия';
  $('musicArtist').textContent=track.creator||'Автор неизвестен';
  const catalog=window.VHSVideoMusicCatalog;
  const credit=track.kind==='openverse'?catalog.attribution(track):
   track.kind==='telegram'?'Получено из твоей личной Telegram-библиотеки. Используй музыку, на которую у тебя есть права.':
   track.kind==='direct'?'Добавлено по прямой ссылке. Убедись, что у тебя есть право использовать трек.':
    'Выбран локальный аудиофайл. После перезапуска его нужно добавить заново.';
  $('musicCredit').textContent=credit;
  $('copyMusicCredit').disabled=track.kind!=='openverse';
  $('reloadMusic').hidden=!!audioEngine.musicBuffer||track.kind==='file';
  $('reloadMusic').disabled=musicLoading;
  $('clearMusicMemory').disabled=musicLoading||!audioEngine.musicBuffer;
  $('musicMemoryStatus').textContent=audioEngine.musicBuffer?
   'Временная память музыки: около '+audioEngine.getMusicMemoryMB()+' МБ. После очистки трек можно восстановить онлайн.':
   'Аудиоданные не загружены в память. '+(track.kind==='telegram'?'Сохранён идентификатор в личной Telegram-библиотеке.':'Сохранены только название и ссылка.');
 }
 async function loadMusicTrack(track,inputFile=null){
  if(recording)return musicLoadStatus('Останови экспорт перед заменой музыки.');
  if(musicAbort){musicAbort.abort();musicAbort=null;}
  const request=++musicRequest;
  musicAbort=typeof AbortController==='function'?new AbortController():null;
  musicLoading=true;
  musicLoadStatus('Подключаю дорожку к общему VHS-аудиомикшеру…');
  // Release the previous decoded song BEFORE loading another to avoid RAM spikes.
  audioEngine.setMusicBuffer(null);
  const audition=$('musicSample');
  audition.pause();audition.removeAttribute('src');audition.load();audition.hidden=true;
  revokePreviewAudio();
  showMusicSelection();
  try{
   // Called from an explicit button/file action: unlock iOS AudioContext first.
   await audioEngine.start();
   let bytes;
   if(inputFile){
    if(inputFile.size>window.VHSVideoMusicCatalog.MAX_BYTES)throw Error('Аудиофайл больше 18 МБ. Выбери более короткий.');
    bytes=await inputFile.arrayBuffer();
   }else{
    bytes=track.kind==='telegram'?
     await window.VHSVideoMusicCatalog.readBridgeAudio(track,bridge,fetch,musicAbort?.signal):
     await window.VHSVideoMusicCatalog.readAudio(track.url,fetch,musicAbort?.signal,bridge);
   }
   if(request!==musicRequest)return;
   const buffer=await audioEngine.ctx.decodeAudioData(bytes.slice(0));
   if(request!==musicRequest)return;
   if(!buffer||!Number.isFinite(buffer.duration)||buffer.duration<=0)throw Error('Браузер не смог декодировать эту музыку.');
   const pcmSize=(Number(buffer.length)||0)*(Number(buffer.numberOfChannels)||2)*4;
   if(pcmSize>120*1024*1024)throw Error('Трек слишком длинный для экономной обработки на iPhone (больше 120 МБ декодированного звука).');
   audioEngine.setMusicBuffer(buffer);
   const info={...track,duration:buffer.duration};
   state.selectedTrack=info;
   musicTrackInfo=info;
   audioEngine.setMix(state.mix);
   syncAudio(!source.paused);
   persist();
   musicLoadStatus('Музыка готова: '+timeString(buffer.duration)+'. Громкости ниже. Нажми ▶ на видео; при экспорте дорожки будут сведены вместе.');
  }catch(e){
   if(request===musicRequest)musicLoadStatus('Не удалось добавить музыку: '+e.message+' Другой трек или файл может сработать.');
  }finally{
   if(request===musicRequest){musicAbort=null;musicLoading=false;showMusicSelection();}
  }
 }
 function clearMusicFromMemory(){
  if(recording){musicLoadStatus('Во время экспорта нельзя выгружать аудиодорожку.');return;}
  if(musicAbort){musicAbort.abort();musicAbort=null;}
  musicRequest++;musicLoading=false;
  audioEngine.setMusicBuffer(null);musicTrackInfo=null;
  const previewAudio=$('musicSample');
  previewAudio.pause();previewAudio.removeAttribute('src');previewAudio.load();previewAudio.hidden=true;
  revokePreviewAudio();
  showMusicSelection();
  if(state.selectedTrack){
   musicLoadStatus(state.selectedTrack.kind==='file'?
    'Музыка удалена из оперативной памяти. Для продолжения выбери этот файл заново.':
    'Музыка удалена из оперативной памяти. '+(state.selectedTrack.kind==='telegram'?
       'Трек остаётся в твоём Telegram — нажми «↻ Восстановить».':
       'Ссылка на трек сохранена — нажми «↻ Восстановить».'));
  }else musicLoadStatus('Музыкальный буфер очищен.');
 }
 function releaseOnLeave(event){
  // Browser owns GC; drop our strong references when leaving this app.
  if(musicAbort){musicAbort.abort();musicAbort=null;}
  musicRequest++;musicLoading=false;musicSearchResults=[];musicTrackInfo=null;
  audioEngine.setMusicBuffer(null);
  const sample=$('musicSample');
  sample.pause();sample.removeAttribute('src');sample.load();
  revokePreviewAudio();
  if(!event?.persisted)audioEngine.release();
 }
 function mountRecommendedMusic(){
  const categories=[
   ['VHS / Lo-Fi','lofi ambient'],
   ['Ночной город','dark ambient'],
   ['Электронный бит','electronic dance'],
   ['Ретро-синт','synthwave instrumental'],
   ['Кино и плёнка','cinematic instrumental'],
   ['Спокойный джаз','jazz instrumental']
  ];
  const parent=$('musicRecommendationChips');parent.replaceChildren();
  for(const [name,query] of categories){
   const button=document.createElement('button');button.type='button';
   button.textContent=name;button.title='Найти '+name;
   button.addEventListener('click',()=>{
    if(musicSearchTimer){clearTimeout(musicSearchTimer);musicSearchTimer=null;}
    $('onlineMusicSearch').value=query;
    searchOnlineMusic();
   });
   parent.append(button);
  }
 }
 function revokePreviewAudio(){
  if(musicPreviewBlobURL){
   try{URL.revokeObjectURL(musicPreviewBlobURL)}catch{}
   musicPreviewBlobURL='';
  }
 }
 function bridgeStatus(msg){$('musicBridgeStatus').textContent=msg;}
 function currentBridge(){return{url:bridge.url,key:bridge.key};}
 function storeBridge(){
  const raw=$('musicBridgeUrl').value.trim().replace(/\/+$/,'');
  const secret=$('musicBridgeKey').value.trim();
  let u;try{u=new URL(raw)}catch{bridgeStatus('Неверный HTTPS-адрес Cloudflare Worker.');return false;}
  if(u.protocol!=='https:'||!u.hostname||u.username||u.password||u.search||u.hash){
   bridgeStatus('Укажи корневой HTTPS-адрес своего Worker без параметров.');return false;
  }
  if(secret.length<20){bridgeStatus('Введи секретный ключ Worker длиной от 20 символов.');return false;}
  bridge.url=u.href.replace(/\/+$/,'');bridge.key=secret;
  try{localStorage.setItem('vhs.video.music.bridge.url',bridge.url)}catch{}
  try{sessionStorage.setItem('vhs.video.music.bridge.key',bridge.key)}catch{}
  bridgeStatus('Адрес и ключ подключены. Проверь связь или открой «Мои треки из Telegram».');
  return true;
 }
 async function testBridge(){
  if(!bridge.url||!bridge.key){if(!storeBridge())return;}
  bridgeStatus('Проверяю Cloudflare Worker…');
  try{
   const status=await window.VHSVideoMusicCatalog.bridgeHealth(currentBridge(),fetch);
   bridgeStatus(status.configured?
    'Личный аудиомост отвечает. '+(status.telegram?'Библиотека Telegram включена.':'Telegram пока не настроен; доступен импорт разрешённых публичных аудиофайлов.'):
    'Worker отвечает, но секретный ключ BRIDGE_KEY ещё не настроен на сервере.');
  }catch(e){bridgeStatus('Не удалось подключить Worker: '+e.message);}
 }
 async function listTelegramMusic(){
  if(!bridge.url||!bridge.key){if(!storeBridge())return;}
  if(musicLoading)return bridgeStatus('Сначала закончи текущую загрузку музыки.');
  bridgeStatus('Загружаю названия треков из твоего Telegram…');
  try{
   const tracks=await window.VHSVideoMusicCatalog.bridgeTracks(currentBridge(),fetch);
   musicSearchResults=tracks;
   renderMusicResults();
   bridgeStatus(tracks.length?
    'В личной библиотеке '+tracks.length+' треков. Выбери «Прослушать» или «Добавить» ниже.':
    'Личная библиотека пока пуста. Отправь аудиофайл своему боту в Telegram и обнови список.');
   $('onlineMusicStatus').textContent='Показаны песни из твоей личной Telegram-библиотеки.';
  }catch(e){bridgeStatus('Не удалось открыть библиотеку: '+e.message);}
 }
 function mountPrivateBridge(){
  $('musicBridgeUrl').value=bridge.url;
  $('musicBridgeKey').value=bridge.key;
  $('saveMusicBridge').onclick=storeBridge;
  $('testMusicBridge').onclick=testBridge;
  $('refreshTelegramTracks').onclick=listTelegramMusic;
  $('disableMusicBridge').onclick=()=>{
   bridge.url='';bridge.key='';
   try{localStorage.removeItem('vhs.video.music.bridge.url')}catch{}
   try{sessionStorage.removeItem('vhs.video.music.bridge.key')}catch{}
   $('musicBridgeUrl').value='';$('musicBridgeKey').value='';
   bridgeStatus('Личный аудиомост отключён. Обычный поиск открытой музыки продолжает работать.');
  };
  bridgeStatus(bridge.url&&bridge.key?'Аудиомост указан. Нажми «Проверить».':
   'Аудиомост ещё не подключён. Для Telegram нужны собственный Cloudflare Worker и бот (инструкция в GitHub/music-bridge).');
 }
 function removeMusicTrack(){
  if(recording)return;
  if(musicAbort){musicAbort.abort();musicAbort=null;}
  musicRequest++;musicLoading=false;
  audioEngine.setMusicBuffer(null);
  musicTrackInfo=null;state.selectedTrack=null;
  const player=$('musicSample');player.pause();player.removeAttribute('src');player.load();revokePreviewAudio();
  musicLoadStatus('Музыка убрана. Оригинальный звук видео остался без изменений.');
  showMusicSelection();persist();syncAudio(!source.paused);
 }
 function renderMusicResults(){
  const parent=$('onlineMusicResults');
  parent.replaceChildren();
  if(!musicSearchResults.length){
   const hint=document.createElement('p');hint.className='emptyMusicSearch';
   hint.textContent='Нет подходящих треков. Попробуй другое название или жанр.';
   parent.append(hint);return;
  }
  for(const item of musicSearchResults){
   const row=document.createElement('div');row.className='onlineMusicResult';
   const title=document.createElement('strong');title.className='musicResultTitle';title.textContent=item.title;
   const meta=document.createElement('div');meta.className='musicResultMeta';
   meta.textContent=item.creator+' · '+item.license.toUpperCase()+' · '+(item.source||'Openverse')+(item.duration?' · '+timeString(item.duration/1000):'');
   const actions=document.createElement('div');actions.className='musicResultActions';
   const listen=document.createElement('button');listen.type='button';listen.className='button';
   listen.textContent='▶ Прослушать';
   listen.addEventListener('click',async()=>{
    const audio=$('musicSample');
    source.pause();
    listen.disabled=true;
    try{
     if(item.kind==='telegram'){
      $('onlineMusicStatus').textContent='Загружаю разрешённое аудио из личной Telegram-библиотеки для прослушивания…';
      audio.pause();audio.removeAttribute('src');audio.load();revokePreviewAudio();
      const bytes=await window.VHSVideoMusicCatalog.readBridgeAudio(item,currentBridge(),fetch);
      musicPreviewBlobURL=URL.createObjectURL(new Blob([bytes],{type:'audio/mpeg'}));
      audio.src=musicPreviewBlobURL;
     }else if(audio.src!==item.url){
      audio.pause();audio.removeAttribute('src');audio.load();revokePreviewAudio();
      audio.src=item.url;
     }
     audio.hidden=false;
     if(audio.paused)await audio.play();else audio.pause();
    }catch(e){$('onlineMusicStatus').textContent='Предпросмотр недоступен: '+e.message;}
    finally{listen.disabled=false;}
   });
   const add=document.createElement('button');add.type='button';add.className='button primary';
   add.textContent='＋ Добавить';
   add.addEventListener('click',()=>{
    $('musicSample').pause();
    loadMusicTrack({...item,kind:item.kind==='telegram'?'telegram':'openverse'});
   });
   actions.append(listen,add);row.append(title,meta,actions);parent.append(row);
  }
 }
 async function searchOnlineMusic(){
  const query=$('onlineMusicSearch').value.trim();
  if(/^https?:\/\//i.test(query)){
   try{
    const u=new URL(query),isAudio=/\.(?:mp3|m4a|wav|ogg|oga|flac|opus|webm)$/i.test(u.pathname);
    const isPage=isSongPageAddress(u);
    if(!isAudio||isPage){
     $('onlineMusicStatus').textContent='Это ссылка на страницу песни, а не на аудиофайл. Поиск: введи название песни или жанр. Для прямого добавления нужна HTTPS-ссылка на сам MP3/M4A/WAV/OGG; ссылки на страницы музыкальных сайтов Safari не может извлечь автоматически.';
     return;
    }
    $('onlineMusicStatus').textContent='Обнаружен прямой аудиофайл. Подключаю его в микшер…';
    const name=decodeURIComponent(u.pathname.split('/').pop()||'Музыка').slice(0,120);
    loadMusicTrack({kind:'direct',title:name,creator:'По прямой ссылке',url:u.href,license:'user'});
   }catch(e){$('onlineMusicStatus').textContent='Неверная ссылка: '+e.message;}
   return;
  }
  if(query.length<2){$('onlineMusicStatus').textContent='Введи название, исполнителя или жанр (минимум 2 символа).';return;}
  const token=++musicSearchToken;
  $('searchOnlineMusic').disabled=true;
  $('onlineMusicStatus').textContent='Ищу открыто лицензированные композиции…';
  try{
   const found=await window.VHSVideoMusicCatalog.search(query);
   if(token!==musicSearchToken)return;
   musicSearchResults=found;
   renderMusicResults();
   const fromCommons=found.some(x=>x.source==='Wikimedia Commons');
   $('onlineMusicStatus').textContent='Найдено '+found.length+' треков. Источник: '+(fromCommons?'Wikimedia Commons (основной каталог)':'Openverse')+'. Лицензии CC0 / Public Domain / CC BY / CC BY-SA — проверь условия перед публикацией.';
  }catch(e){if(token===musicSearchToken)$('onlineMusicStatus').textContent='Поиск недоступен: '+e.message+' Можно использовать прямую HTTPS-ссылку или файл.';}
  finally{if(token===musicSearchToken)$('searchOnlineMusic').disabled=false;}
 }
 function mountMusicLibrary(){
  const mix=$('musicMixerControls');
  control(mix,'Громкость оригинального звука видео',state.mix.videoVolume,v=>{state.mix.videoVolume=v;syncAudio(!source.paused);});
  control(mix,'Громкость добавленной музыки',state.mix.musicVolume,v=>{state.mix.musicVolume=v;syncAudio(!source.paused);});
  $('musicVideoStart').value=String(state.mix.musicStart);
  $('musicAudioOffset').value=String(state.mix.musicOffset);
  $('musicLoop').checked=!!state.mix.musicLoop;
  for(const [id,key] of [['musicVideoStart','musicStart'],['musicAudioOffset','musicOffset']]){
   $(id).onchange=()=>{
    const v=Number($(id).value);
    state.mix[key]=Number.isFinite(v)?clamp(v,0,7200):0;
    $(id).value=String(state.mix[key]);
    persist();syncAudio(!source.paused);
   };
  }
  $('musicLoop').onchange=()=>{state.mix.musicLoop=$('musicLoop').checked;persist();syncAudio(!source.paused);};
  mountRecommendedMusic();mountPrivateBridge();
  $('searchOnlineMusic').onclick=searchOnlineMusic;
  $('onlineMusicSearch').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();if(musicSearchTimer)clearTimeout(musicSearchTimer);searchOnlineMusic();}});
  $('onlineMusicSearch').addEventListener('input',()=>{
   if(musicSearchTimer)clearTimeout(musicSearchTimer);
   if($('onlineMusicSearch').value.trim().length>=3)musicSearchTimer=setTimeout(searchOnlineMusic,700);
  });
  $('addMusicUrl').onclick=()=>{
   const raw=$('musicDirectUrl').value.trim();
   musicLoadStatus('Проверяю ссылку на аудиофайл…');
   try{
    const u=new URL(raw);
    if(u.protocol!=='https:')throw Error('Нужна прямая HTTPS-ссылка.');
    const isPage=isSongPageAddress(u);
    if(isPage)throw Error('Ссылка ведёт на страницу песни. Для импорта нужен прямой адрес аудиофайла, а не адрес страницы. Можно найти трек по названию в каталоге выше.');
    const title=decodeURIComponent(u.pathname.split('/').pop()||'Аудио по ссылке').slice(0,120);
    loadMusicTrack({kind:'direct',title,creator:'По ссылке пользователя',url:u.href,license:'user'});
   }catch(e){musicLoadStatus('Проверь ссылку: '+e.message);}
  };
  $('musicFileInput').onchange=e=>{
   const selected=e.target.files?.[0];
   if(selected)loadMusicTrack({kind:'file',title:selected.name,creator:'Аудио с iPhone',license:'user'},selected);
   e.target.value='';
  };
  $('removeMusic').onclick=removeMusicTrack;
  $('clearMusicMemory').onclick=clearMusicFromMemory;
  $('reloadMusic').onclick=()=>{
   const track=state.selectedTrack;
   if(track&&(track.kind==='telegram'||track.url)&&track.kind!=='file')loadMusicTrack(track);
   else musicLoadStatus('Этот аудиофайл нужно выбрать заново на телефоне.');
  };
  $('copyMusicCredit').onclick=async()=>{
   const credit=window.VHSVideoMusicCatalog.attribution(state.selectedTrack);
   if(!credit)return;
   try{await navigator.clipboard.writeText(credit);musicLoadStatus('Авторство и ссылка на лицензию скопированы.');}
   catch{musicLoadStatus('Скопируй данные из блока «Выбранная музыка» вручную.');}
  };
  showMusicSelection();
  if(state.selectedTrack){
   musicLoadStatus(state.selectedTrack.kind==='file'?
    'Для восстановления музыки выбери локальный аудиофайл заново.':
    'Ранее выбран '+state.selectedTrack.title+'. Нажми «↻ Восстановить», чтобы загрузить музыку из интернета в память.');
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
  mountCameraControls();buildModeControls();mountMusicLibrary();
  $('vhsEnabled').onchange=()=>{state.vhsEnabled=$('vhsEnabled').checked;persist();renderCurrentFrame();};
  $('filmEnabled').onchange=()=>{state.filmEnabled=$('filmEnabled').checked;persist();renderCurrentFrame();};
  $('vhsPreset').onchange=()=>{state.preset=$('vhsPreset').value;persist();renderCurrentFrame();};
  $('outputSize').onchange=()=>{state.size=$('outputSize').value;persist();};
  $('fps').onchange=()=>{state.fps=Number($('fps').value);persist();};
  $('keepAudio').onchange=()=>{state.keepAudio=$('keepAudio').checked;persist();};
  $('exportScope').onchange=()=>{state.exportScope=$('exportScope').value;persist();};
  // Camera controls mount their own event handlers with independent corner/size state.
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
  const c=state.camera,base=Math.min(w,h),marginX=Math.max(8,w*.04),marginY=Math.max(8,h*.04);
  const positionOf=(key,tw,th)=>{
   const pos=c.positions[key]||'left-top';
   return [pos.includes('left')?marginX:w-marginX-tw,pos.includes('top')?marginY:h-marginY-th];
  };
  const sizeOf=(key,factor)=>Math.max(6,base*factor*clamp(Number(c.sizes[key]||125)/100,.45,2.8));
  function drawText(key,message,color,factor){
   const lines=String(message||'').replace(/\r\n?/g,'\n').replace(/\|/g,'\n').split('\n').slice(0,4);
   let size=sizeOf(key,factor);
   ctx.textBaseline='top';
   for(let tries=0;tries<10;tries++){
    ctx.font='700 '+size+'px ui-monospace, Menlo, Courier New, monospace';
    const measured=Math.max(0,...lines.map(line=>ctx.measureText(line).width));
    if((measured<w*.87&&size*1.23*lines.length<h*.75)||size<=6)break;
    size=Math.max(6,size*.86);
   }
   const width=Math.max(0,...lines.map(line=>ctx.measureText(line).width)),step=size*1.23;
   const [x,y]=positionOf(key,width,step*lines.length);
   for(let i=0;i<lines.length;i++){
    ctx.fillStyle='rgba(0,0,0,.7)';ctx.fillText(lines[i],x+1,y+i*step+1);
    ctx.fillStyle=color;ctx.fillText(lines[i],x,y+i*step);
   }
  }
  ctx.save();ctx.shadowColor='rgba(0,0,0,.7)';ctx.shadowBlur=Math.max(1,base*.004);
  if(c.date)drawText('date',c.text,'#f5f5f5',.078);
  if(c.play)drawText('play','PLAY','#f7f7f7',.07);
  if(c.rec){
   const sz=sizeOf('rec',.07);ctx.font='700 '+sz+'px ui-monospace, Menlo, monospace';
   const ww=ctx.measureText('REC').width+sz*.85,hh=sz*1.2,[x,y]=positionOf('rec',ww,hh);
   ctx.textBaseline='top';ctx.fillStyle='#ef5555';ctx.beginPath();
   ctx.arc(x+sz*.2,y+sz*.55,Math.max(2,sz*.15),0,Math.PI*2);ctx.fill();
   ctx.fillText('REC',x+sz*.48,y);
  }
  if(c.battery){
   const sz=sizeOf('battery',.068),ww=sz*2.15,hh=sz*.75,[x,y]=positionOf('battery',ww+sz*.25,hh);
   ctx.strokeStyle='#f5f5f5';ctx.lineWidth=Math.max(1,sz*.07);ctx.strokeRect(x,y,ww,hh);
   ctx.fillStyle='#f5f5f5';ctx.fillRect(x+ww,y+hh*.3,sz*.15,hh*.4);
   const count={FULL:4,'75%':3,'50%':2,'25%':1,LOW:1,EMPTY:0}[c.batteryLevel]??1;
   for(let i=0;i<count;i++)ctx.fillRect(x+sz*.12+i*ww*.225,y+sz*.12,ww*.17,Math.max(1,hh-sz*.24));
  }
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
  if(state.fxMode==='classic'&&state.vhsEnabled&&state.master>0){
   const signal=ctx.getImageData(0,0,iw,ih);
   const tape=window.VHSVideoGlitchFX.TAPES.find(t=>t.id===state.tape)||window.VHSVideoGlitchFX.TAPES[1];
   const preset=state.preset==='damaged'?1.25:state.preset==='camcorder'?.75:1;
   window.VHSPhotoEngine.apply(signal.data,iw,ih,{
    master:clamp(state.master/100*preset*tape.level,0,1.4),seed,
    signal:{...state.signal,noise:Math.min(100,state.signal.noise*tape.noise),tracking:Math.min(100,state.signal.tracking*tape.head),tapeSpeed:state.speed}
   });
   ctx.putImageData(signal,0,0);
  }
  if(state.fxMode!=='classic'||state.glitchEnabled||state.mode!=='vhs'){
   const signal=ctx.getImageData(0,0,iw,ih);
   const engine=forExport||recording?exportProcessor:previewProcessor;
   engine.apply(signal.data,iw,ih,{
    time,seed:clipSeed(),mode:state.fxMode==='classic'?state.mode:'vhs',
    modeStrength:state.modeStrength,splicePulse:state.fxMode==='classic'?splicePulse:0,
    tape:state.tape,density:state.eventDensity,
    manualEffects:state.fxMode==='classic'?null:specialEffectsAt(time),
    strength:state.fxMode==='classic'?(state.glitchEnabled?state.glitchStrength/100:0):1,
    effects:state.fxMode==='classic'&&state.glitchEnabled?state.glitches:{}
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
  try{drawFrame(preview);videoUI?.render();}catch(e){textStatus('Ошибка обработки: '+e.message);console.error(e);}
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
   videoUI?.render();
   tuneAdaptiveResolution(performance.now()-begin,!!recording);
  }catch(e){
   console.error(e);if(recording){exportStatus('Ошибка обработки видео: '+e.message);stopExport();}
   else textStatus('Не удалось обработать кадр: '+e.message);
  }
 }
 function updateTime(){
  $('timeCurrent').textContent=timeString(source.currentTime);
  $('timeTotal').textContent=timeString(source.duration);
  $('timelineNow').textContent=timeString(source.currentTime);
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
   source.loop=!recording&&clips.length===1;
   resetFrameHistory();
   source.src=sourceUrl;source.load();
   $('videoName').textContent=file.name;
   $('videoMeta').textContent=(file.size/1048576).toFixed(1)+' МБ';
   updateClipNav();videoUI?.sync();selectedTimelineId='';renderTimeline();
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
  source.loop=clips.length===1; // Native replay for one video without manual clicks.
  clipIndex=0;file=clips[0].file;sourceUrl=clips[0].url;
  source.src=sourceUrl;source.load();
  $('videoName').textContent=file.name;
  $('videoMeta').textContent=(file.size/1048576).toFixed(1)+' МБ';
  $('empty').hidden=true;$('play').disabled=true;$('export').disabled=true;$('seek').disabled=true;
  $('exportResult').hidden=true;updateClipNav();videoUI?.sync();renderTimeline();
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
  source.loop=!recording&&clips.length===1;
  preview.width=w;preview.height=h;
  if(clips[clipIndex])clips[clipIndex].duration=Number.isFinite(source.duration)?source.duration:0;
  $('videoMeta').textContent=source.videoWidth+' × '+source.videoHeight+' · '+timeString(source.duration);
  updateClipNav();
  selectedTimelineId='';$('addTimelineEvent').textContent='＋ Добавить повреждение';renderTimeline();
  $('play').disabled=!!recording;$('export').disabled=!!recording;$('regenerate').disabled=!!recording;$('seek').disabled=!!recording;
  $('timeTotal').textContent=timeString(source.duration);
  videoUI?.sync();
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
 function redrawAfterSeek(){updateTime();resetFrameHistory();syncAudio(!source.paused);renderCurrentFrame();}
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
  if(state.selectedTrack&&!audioEngine.musicBuffer){
   exportStatus('Выбранная музыка ещё не загружена. Открой «♫ ТРЕКИ» и нажми «Восстановить», затем повтори экспорт.');return;
  }
  if(clips.length>1&&clips.some(c=>!Number.isFinite(c.duration)||c.duration<=0)){
   exportStatus('Не удалось определить длительность всех клипов. Проверь форматы каждого видео или попробуй по одному.');return;
  }
  const [w,h]=videoDimensions(Number(state.size));
  source.loop=false; // A finite recording must never restart itself.
  recordCanvas.width=w;recordCanvas.height=h;exportProcessor.reset();adaptiveExportWidth=240;slowFrames=0;fastFrames=0;
  try{
   source.pause();
   if(clipIndex!==0)await selectClip(0,false);
   await seekToStart();
   source.loop=false; // selectClip/onLoaded may have restored preview looping.
   let stream=recordCanvas.captureStream(Number(state.fps));
   recordStream=stream;
   if(state.keepAudio||state.fxMode==='music'){
    try{
     const monitor=await ensureAudioGraph();
     await audioEngine.ctx.resume();
     // Music-driven glitches need FFT even if the output video is exported mute.
     if(state.keepAudio){
      const tracks=monitor.stream.getAudioTracks();
      for(const track of tracks)stream.addTrack(track);
     }
    }catch(e){
     exportStatus(state.fxMode==='music'?
       'Не удалось открыть звуковой анализ: '+e.message+'. Музыкальные глитчи могут отсутствовать.':
       'Звук недоступен: '+e.message+'. Продолжаю без звука.');
    }
   }
   // A playable processed frame is present before encoding starts.
   drawFrame(recordCanvas,true);
   const blobs=[];
   const rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:3_000_000});
   recording=rec;exportStopRequested=false;
   $('exportResult').hidden=true;$('export').disabled=true;$('cancel').hidden=false;$('progress').hidden=false;$('progress').value=0;
   $('play').disabled=true;$('seek').disabled=true;$('regenerate').disabled=true;$('undoGlitch').disabled=true;updateClipNav();videoUI?.sync();
   rec.ondataavailable=e=>{if(e.data?.size)blobs.push(e.data)};
   rec.onerror=e=>{exportStatus('Ошибка записи: '+(e.error?.message||'неизвестная ошибка'));};
   rec.onstop=()=>{
    const contentType=rec.mimeType||mime;
    recording=null;
    source.loop=clips.length===1;
    for(const tr of recordStream?.getVideoTracks()||[])tr.stop();
    recordStream=null;
    $('cancel').hidden=true;$('progress').hidden=true;$('export').disabled=false;
    $('play').disabled=false;$('seek').disabled=false;$('regenerate').disabled=false;$('undoGlitch').disabled=!seedHistory.length;updateClipNav();videoUI?.sync();
    finishExport(blobs,contentType);
    renderCurrentFrame();
   };
   rec.start(1000);
   try{await source.play();}catch(err){stopExport();throw err;}
   exportStatus('Запись началась. Не блокируй экран до завершения.');
  }catch(e){
   exportStatus('Экспорт не запустился: '+e.message);
   if(recording&&recording.state!=='inactive')try{recording.stop();}catch{}
   if(!recording){source.loop=clips.length===1;$('export').disabled=false;$('cancel').hidden=true;$('progress').hidden=true;$('play').disabled=false;$('seek').disabled=false;$('regenerate').disabled=false;$('undoGlitch').disabled=!seedHistory.length;updateClipNav();videoUI?.sync();}
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
  window.addEventListener('pagehide',releaseOnLeave);
  window.addEventListener('pageshow',e=>{
   if(e?.persisted){
    showMusicSelection();
    if(state.selectedTrack&&!audioEngine.musicBuffer)
     musicLoadStatus('Приложение восстановлено после закрытия страницы. Для музыки нажми «↻ Восстановить».');
   }
  });
  $('prevClip').onclick=()=>{if(recording)return;selectClip(clipIndex-1,false).catch(e=>textStatus(e.message));};
  $('nextClip').onclick=()=>{if(recording)return;selectClip(clipIndex+1,false).catch(e=>textStatus(e.message));};
  source.addEventListener('loadedmetadata',onLoaded);source.addEventListener('loadeddata',onLoaded);
  source.addEventListener('seeked',redrawAfterSeek);source.addEventListener('timeupdate',updateTime);
  source.addEventListener('ended',()=>{
   if(clipHasNext()){
    selectClip(clipIndex+1,true).catch(e=>{
     textStatus('Не удалось перейти к следующему клипу: '+e.message);
     if(recording)stopExport();
    });
    return;
   }
   if(recording){
    stopExport(); // Never loop while saving; the export must terminate.
    return;
   }
   if(clips.length>1){
    selectClip(0,true).catch(e=>textStatus('Не удалось повторить серию: '+e.message));
   }else if(file){
    // Fallback if a browser emits ended despite source.loop=true.
    source.currentTime=0;
    resetFrameHistory();
    source.play().catch(e=>textStatus('Не удалось повторить видео: '+e.message));
   }
  });
  source.addEventListener('pause',()=>{$('play').textContent='▶ Просмотр';audioEngine.suspendNoise();audioEngine.stopMusic();});
  source.addEventListener('play',()=>{try{$('musicSample').pause();syncAudio(true)}catch(e){textStatus('Музыка: '+e.message);}});
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
  if(!window.VHSVideoPlayerUI)throw Error('Модуль просмотра не загружен. Обнови страницу с интернетом.');
  videoUI=window.VHSVideoPlayerUI.create({
   source,preview,
   getState:()=>({file,recording,hasUndo:seedHistory.length>0,hasPrevious:clipIndex>0,hasNext:clipHasNext()}),
   onPlay:()=>togglePlay(),onReroll:()=>regenerateSeed(),onUndo:()=>undoSeed(),
   onPrev:()=>selectClip(clipIndex-1,false).catch(e=>textStatus(e.message)),
   onNext:()=>selectClip(clipIndex+1,false).catch(e=>textStatus(e.message)),
   onSeek:time=>{source.currentTime=time;updateTime();}
  });
  if(!window.VideoFilmCore||!window.VHSPhotoEngine||!window.VHSVideoGlitchFX||!window.VHSVideoTapeAudio||!window.VHSVideoSpecialModes||!window.VHSVideoMusicCatalog)throw Error('Не загрузились эффекты. Обнови страницу с интернетом.');
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