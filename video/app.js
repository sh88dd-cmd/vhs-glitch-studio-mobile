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
 const defaults={masterBypass:false,vhsEnabled:true,filmEnabled:false,glitchEnabled:true,preset:'classic',master:65,
  mode:'vhs',modeStrength:75,tape:'used',signalWidth:'auto',eventDensity:48,glitchStrength:85,
  fxMode:'classic',music:{bassEffect:'vhold',highEffect:'dropouts',sensitivity:60,threshold:25,strength:85,release:35},timelineEvents:[],timelineStrength:85,
  mix:{videoVolume:100,musicVolume:75,musicStart:0,musicOffset:0,musicTrimEnd:0,musicLoop:true,fadeIn:0,fadeOut:0},
  selectedTrack:null,holdEvents:[],holdBalance:50,keyframesEnabled:true,keyframes:[],creative:window.VHSVideoCreative.defaults(),cassettes:[],selectedCassetteId:null,
  filmDamage:{enabled:false,type:'edge-left',leak:70,dust:23,grain:30,scratches:22,flicker:23,halation:30},
  speed:'SP',filmId:'builtin:Нейтральный / без плёнки',filmStrength:85,
  signal:{chromaBleed:52,composite:35,edgeWave:38,tracking:54,noise:38,chromaLoss:15,ringing:19},
  glitches:glitchDefaults,
  audio:{enabled:false,mode:'linear',strength:65,hiss:48,wow:42,flutter:32,drop:32,saturation:28},
  camera:{rec:false,play:false,battery:false,date:false,counter:false,zoom:false,modeInfo:false,focus:false,frame:false,frameSize:100,frameColor:'white',
   text:'PM 10:28 | JUN 16 1995',clockStart:'1995-06-16T22:28:00',zoomValue:3,
   positions:{rec:'left-top',play:'left-top',battery:'right-top',date:'right-bottom',counter:'left-bottom',zoom:'right-bottom',modeInfo:'right-top',focus:'left-bottom'},
   sizes:{rec:125,play:125,battery:125,date:125,counter:105,zoom:105,modeInfo:105,focus:105},batteryLevel:'LOW'},
  size:'480',fps:15,exportScope:'30',keepAudio:true,seed:91823710};
 let saved=null;
 try{saved=JSON.parse(localStorage.getItem('vhs.video.settings')||'null')}catch{}
 const state={...defaults,...(saved||{}),signal:{...defaults.signal,...(saved?.signal||{})},glitches:{...glitchDefaults,...(saved?.glitches||{})},music:{...defaults.music,...(saved?.music||{})},mix:{...defaults.mix,...(saved?.mix||{})},selectedTrack:saved?.selectedTrack||null,holdEvents:(Array.isArray(saved?.holdEvents)?saved.holdEvents.slice(0,150):[]).filter(e=>e&&Number.isFinite(e.start)&&Number.isFinite(e.end)&&Number.isInteger(e.clip)).map(e=>({...e,blend:Number.isFinite(Number(e.blend))?clamp(Number(e.blend),0,100):0})),holdBalance:clamp(Number(saved?.holdBalance??50)||0,0,100),keyframesEnabled:saved?.keyframesEnabled!==false,keyframes:window.VHSVideoKeyframes.normalizeAll(saved?.keyframes),creative:window.VHSVideoCreative.hydrate(saved?.creative),cassettes:(Array.isArray(saved?.cassettes)?saved.cassettes.slice(0,80):[]),filmDamage:{...defaults.filmDamage,...(saved?.filmDamage||{})},timelineEvents:(Array.isArray(saved?.timelineEvents)?saved.timelineEvents.slice(0,150):[]).map(e=>window.VHSVideoSpecialModes.cleanEvent(e)).filter(Boolean),audio:{...defaults.audio,...(saved?.audio||{})},camera:{...defaults.camera,...(saved?.camera||{}),positions:{...defaults.camera.positions,...(saved?.camera?.positions||{})},sizes:{...defaults.camera.sizes,...(saved?.camera?.sizes||{})}}};
 // Remove the obsolete persistent bypass: new effects must remain usable.
 state.masterBypass=false;
 const LAST_FX_KEY='vhs.video.last-effects.v1';
 let lastFxSnapshot=null;
 const CASSETTE_BACKUP_KEY='vhs.video.cassette-before.v1';
 let cassetteBefore=null;
 try{
  const record=JSON.parse(localStorage.getItem(CASSETTE_BACKUP_KEY)||'null');
  if(record?.version===1&&record.settings&&typeof record.settings==='object')cassetteBefore=record.settings;
 }catch{}
 try{
  const item=JSON.parse(localStorage.getItem(LAST_FX_KEY)||'null');
  if(item?.version===1&&item.settings&&typeof item.settings==='object')lastFxSnapshot=item;
 }catch{}
 // Old network tracks cannot be restored: v0.6 supports only local files.
 if(state.selectedTrack&&!['file','video'].includes(state.selectedTrack.kind))state.selectedTrack=null;
 let sourceUrl='',file=null,clips=[],clipIndex=0,builtin={},sharedXMP=[],importedXMP=[],profiles=[],favoriteIds=[];
 let importedDB=null,recording=null,recordStream=null,exportBlob=null,exportMime='',exportOriginalFile=false;
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
 let musicRequest=0,musicLoading=false,audioStudio=null,holdActive=null,comparisonHeld=false,creativeUI=null,liveActive=null;
 let videoImportBusy=false,videoImportCommitted=false,videoImportSerial=0,videoPickerPending=false;
 const holdPreviewProcessor=window.VHSVideoGlitchFX.createProcessor(),holdExportProcessor=window.VHSVideoGlitchFX.createProcessor();
 const FILM_LIMIT=1200;
 const matches=(v,q)=>v.toLocaleLowerCase('ru').includes(q.toLocaleLowerCase('ru'));
 function persist(){try{localStorage.setItem('vhs.video.settings',JSON.stringify(state));}catch(e){console.warn('Unable to persist video settings',e);}syncSectionLights();}
 function setIndicator(el,on){
  if(!el)return;
  const enabled=!!on;
  el.classList.toggle('is-lit',enabled);
  el.dataset.indicator=enabled?'on':'off';
 }
 function syncSectionLights(){
  const engaged=!state.masterBypass;
  const hasMusic=!!audioEngine.musicBuffer;
  const hasTracks=(hasMusic&&Number(state.mix.musicVolume)>0)||audioEngine.extraAudio.some(t=>Number(t.volume)>0);
  const actualVhs=engaged&&state.fxMode==='classic'&&state.vhsEnabled&&state.master>0;
  const actualMode=engaged&&state.fxMode==='classic'&&state.mode!=='vhs'&&state.modeStrength>0;
  const actualGlitch=engaged&&state.fxMode==='classic'&&state.glitchEnabled&&state.glitchStrength>0;
  const actualFilm=engaged&&state.filmEnabled&&state.filmStrength>0;
  const actualDamage=engaged&&state.filmDamage.enabled&&
   ['leak','dust','grain','scratches','flicker','halation'].some(k=>Number(state.filmDamage[k])>0);
  const actualCamera=engaged&&['rec','play','battery','date','counter','zoom','modeInfo','focus','frame'].some(k=>state.camera[k]);
  const actualTape=engaged&&state.audio.enabled&&state.audio.strength>0;
  const actualBeat=engaged&&state.fxMode==='music'&&state.music.strength>0;
  const actualTimeline=engaged&&state.fxMode==='timeline';
  const actualKeyframes=engaged&&state.keyframesEnabled&&state.keyframes.length>0;
  const duration=audioEngine.getMusicDuration();
  const actualTrim=engaged&&hasMusic&&Number(state.mix.musicVolume)>0&&(
   Number(state.mix.musicOffset)>0.001||
   (Number(state.mix.musicTrimEnd)>0&&Number(state.mix.musicTrimEnd)<duration-.01)||
   Number(state.mix.musicStart)>0||Number(state.mix.fadeIn)>0||Number(state.mix.fadeOut)>0||
   !state.mix.musicLoop
  );
  const active={
   vhs:actualVhs||actualMode,glitch:actualGlitch,
   audio:(engaged&&(hasTracks||actualTape||actualBeat)),timeline:actualTimeline,
   film:actualFilm,filmDamage:actualDamage,camera:actualCamera,
   cassettes:engaged&&(!!state.selectedCassetteId||state.creative.aging.enabled),keyframes:actualKeyframes,frameTools:false,
   touch:engaged&&!!(state.creative.touch.enabled||state.creative.touch.facesEnabled),
   speed:engaged&&state.creative.speed.enabled,live:engaged&&state.timelineEvents.some(e=>String(e.id).startsWith('live-'))
  };
  document.querySelectorAll('.tabs [data-tab]').forEach(el=>setIndicator(el,active[el.dataset.tab]));
  const audioFlags={tracks:engaged&&hasTracks,trim:actualTrim,beat:actualBeat,tape:actualTape};
  document.querySelectorAll('[data-audio-section]').forEach(el=>setIndicator(el,audioFlags[el.dataset.audioSection]));
  for(const [id,on] of [['fxClassic',actualVhs||actualMode||actualGlitch],
    ['fxMusic',actualBeat],['fxTimeline',actualTimeline],
    ['musicActivate',actualBeat],['timelineActivate',actualTimeline],
    ['holdGlitch',engaged&&!!holdActive],['holdClear',engaged&&state.holdEvents.length>0],
    ['viewerHoldGlitch',engaged&&!!holdActive],['dockHoldGlitch',engaged&&!!holdActive],
    ['cassetteSave',engaged&&!!$('cassetteName')?.value.trim()]])setIndicator($(id),on);
  for(const group of ['vhsControls','modeStrengthControl','glitchControls','eventControls',
    'filmControls','filmDamageControls','musicControls','timelineControls','audioControls','musicMixerControls']){
   let gate=false;
   if(group==='vhsControls')gate=actualVhs;
   else if(group==='modeStrengthControl')gate=actualMode;
   else if(group==='glitchControls'||group==='eventControls')gate=actualGlitch;
   else if(group==='filmControls')gate=actualFilm;
   else if(group==='filmDamageControls')gate=actualDamage;
   else if(group==='musicControls')gate=actualBeat;
   else if(group==='timelineControls')gate=actualTimeline;
   else if(group==='audioControls')gate=actualTape;
   const rows=$(group)?.querySelectorAll('.control')||[];
   rows.forEach((row,index)=>{
    const val=Number(row.querySelector('input[type=range]')?.value);
    let rowEnabled=gate&&Number.isFinite(val)&&val>0;
    if(group==='musicMixerControls'){
     rowEnabled=engaged&&val>0&&index!==0&&hasMusic;
    }
    setIndicator(row,rowEnabled);
   });
  }
  $('glitchControls')?.querySelectorAll('details').forEach(group=>{
   setIndicator(group,actualGlitch&&!!group.querySelector('.control.is-lit'));
  });
  $('vhsControls')?.querySelectorAll('label').forEach(label=>{
   setIndicator(label,actualVhs&&!!label.querySelector('select'));
  });
  $('panel-timeline')?.querySelectorAll('.timelinePair label').forEach(label=>setIndicator(label,actualTimeline));
  setIndicator($('timelineEffect')?.closest('label'),actualTimeline);
  const trimStartChanged=engaged&&hasMusic&&Number(state.mix.musicOffset)>0.001;
  const trimEndChanged=engaged&&hasMusic&&Number(state.mix.musicTrimEnd)>0&&Number(state.mix.musicTrimEnd)<duration-.01;
  setIndicator($('musicTrimStartLabel')?.closest('.musicTrimHead'),trimStartChanged);
  setIndicator($('musicTrimEndLabel')?.closest('.musicTrimHead'),trimEndChanged);

  const switches={
   vhsEnabled:actualVhs,glitchEnabled:actualGlitch,filmEnabled:actualFilm,
   filmDamageEnabled:actualDamage,audioEnabled:actualTape,
   musicLoop:engaged&&hasMusic&&state.mix.musicLoop,
   keepAudio:false
  };
  document.querySelectorAll('.switch').forEach(row=>{
   const input=row.querySelector('input[type=checkbox]');
   if(input)setIndicator(row,switches[input.id]??(engaged&&input.checked));
  });
  $('cameraControls')?.querySelectorAll('.cameraCard').forEach(card=>{
   const on=engaged&&!!card.querySelector('.cameraCardTitle input[type=checkbox]')?.checked;
   setIndicator(card,on);
   card.querySelectorAll('.cameraCardOptions label').forEach(label=>setIndicator(label,on));
  });
  const selectors={
   modeSelect:actualMode,vhsPreset:actualVhs,tapeKind:actualVhs,signalWidth:actualVhs,
   filmSelect:actualFilm,filmLeakType:actualDamage,
   bassEffect:actualBeat,highEffect:actualBeat,
   audioMode:actualTape,outputSize:false,fps:false,exportScope:false,
   musicVideoStart:engaged&&hasMusic&&state.mix.musicStart>0,
   musicFadeIn:engaged&&hasMusic&&state.mix.fadeIn>0,
   musicFadeOut:engaged&&hasMusic&&state.mix.fadeOut>0,
   musicTrimStartInput:engaged&&hasMusic&&Number(state.mix.musicOffset)>0,
   musicTrimEndInput:engaged&&hasMusic&&Number(state.mix.musicTrimEnd)<duration-.01
  };
  for(const [id,on] of Object.entries(selectors))setIndicator($(id)?.closest('label'),on);
  setIndicator($('keyframesEnabled')?.closest('.switch'),actualKeyframes);
  $('keyframeList')?.querySelectorAll('.keyframeItem').forEach(node=>setIndicator(node,actualKeyframes));
  setIndicator($('musicTrim'),actualTrim);
  setIndicator($('musicSelection'),engaged&&hasMusic&&state.mix.musicVolume>0);
  setIndicator($('musicWaveform'),engaged&&hasMusic&&state.mix.musicVolume>0);
  setIndicator($('musicMixerControls'),engaged&&hasTracks);
  setIndicator($('timelineTrack'),actualTimeline&&state.timelineEvents.some(e=>e.clip===clipIndex));
  $('timelineEvents')?.querySelectorAll('.timelineEvent').forEach(e=>setIndicator(e,actualTimeline));
  $('cassetteShelf')?.querySelectorAll('.cassetteCard').forEach(card=>setIndicator(card,engaged&&card.classList.contains('selected')));
  $('extraTrackList')?.querySelectorAll('.extraAudioCard').forEach((card,i)=>{
   const track=audioEngine.extraAudio[i],enabled=engaged&&!!track&&Number(track.volume)>0;
   setIndicator(card,enabled);
   card.querySelectorAll('.extraAudioFields label').forEach((label,index)=>{
    const value=Number(label.querySelector('input')?.value);
    let on=enabled&&value>0;
    if(index===2)on=enabled&&!!track&&Number(track.trimEnd)<track.buffer.duration-.01;
    setIndicator(label,on);
   });
   setIndicator(card.querySelector('.extraAudioLoop'),enabled&&!!card.querySelector('input[type=checkbox]')?.checked);
  });
  $('masterFxStatus').textContent=lastFxSnapshot?
   'Последние настройки сохранены · новые эффекты доступны':
   'Все эффекты можно настраивать';
  $('allEffectsLabel').textContent='СБРОС';
  $('allEffectsToggle').disabled=!!recording;
  $('allEffectsToggle').setAttribute('aria-pressed','false');
  $('allEffectsToggle').classList.remove('is-bypassed');
  $('restoreEffects').disabled=!!recording||!lastFxSnapshot;
  document.body.classList.remove('effects-bypassed');
 }
 function resyncAfterEffectReset(){
  state.masterBypass=false;
  selectedTimelineId='';
  $('addTimelineEvent').textContent='＋ Добавить повреждение';
  syncCassetteUI(); // Refreshes VHS, GLITCH, FILM, CAMERA, FILM DAMAGE and AUDIO.
  setControlByTitle($('timelineControls'),'Сила выбранного события',state.timelineStrength);
  setControlByTitle($('musicMixerControls'),'Громкость оригинального звука видео',state.mix.videoVolume);
  setControlByTitle($('musicMixerControls'),'Громкость добавленной музыки',state.mix.musicVolume);
  $('musicVideoStart').value=String(state.mix.musicStart);
  $('musicFadeIn').value=String(state.mix.fadeIn);
  $('musicFadeOut').value=String(state.mix.fadeOut);
  $('musicLoop').checked=!!state.mix.musicLoop;
  refreshMusicTrim();
  renderTimeline();
  renderKeyframes();
  creativeUI?.refresh();
  creativeUI?.stopReverse();
  try{source.playbackRate=1;source.defaultPlaybackRate=1;}catch{}
  renderCassetteShelf();
  resetFrameHistory();
  audioEngine.setMix(state.mix);
  syncAudio(!source.paused);
  syncHoldControls();
  syncSectionLights();
  renderCurrentFrame();
 }
 function resetAllEffects(){
  if(recording)return;
  if(holdActive)finishHold();
  const utility=window.VHSVideoEffectsReset;
  if(utility.isZero(state)&&(!audioStudio||audioStudio.isMuted())){
   textStatus('Все эффекты уже равны 0%. Теперь настрой новые.');
   return; // Never overwrite a useful backup with a second empty reset.
  }
  const previous={
   version:1,created:Date.now(),settings:utility.snapshot(state),
   cassetteBefore:cassetteBefore?JSON.parse(JSON.stringify(cassetteBefore)):null,
   tracks:audioStudio?.snapshotTracks()||[]
  };
  lastFxSnapshot=previous;
  try{localStorage.setItem(LAST_FX_KEY,JSON.stringify(previous));}
  catch(err){console.warn('Last effect settings could not be persisted',err);}
  utility.zero(state);
  clearCassetteBefore();
  audioStudio?.resetTrackSettings();
  resyncAfterEffectReset();
  persist();
  textStatus('Эффекты обнулены. Можно создавать новую обработку. «Вернуть последние» восстановит прежние значения.');
 }
 function restoreLastEffects(){
  if(recording||!lastFxSnapshot)return;
  if(holdActive)finishHold();
  const before=lastFxSnapshot;
  if(!window.VHSVideoEffectsReset.restore(state,before.settings))return;
  audioStudio?.restoreTrackSettings(before.tracks);
  if(before.cassetteBefore)setCassetteBefore(before.cassetteBefore);else clearCassetteBefore();
  lastFxSnapshot=null;
  try{localStorage.removeItem(LAST_FX_KEY);}catch{}
  resyncAfterEffectReset();
  persist();
  textStatus('Последние настройки возвращены. Исходные видео, звуковые дорожки и кассеты сохранены.');
 }
 function showAudioSection(key='tracks'){
  document.querySelectorAll('[data-audio-section]').forEach(b=>b.classList.toggle('active',b.dataset.audioSection===key));
  document.querySelectorAll('.audioArea').forEach(p=>p.classList.toggle('active',p.id==='audioArea-'+key));
 }
 function showMainTab(key){
  document.querySelectorAll('.tabs button[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===key));
  document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active',p.id==='panel-'+key));
  if(key==='keyframes')renderKeyframes();
  if(key==='frameTools')syncFrameTools();
  if(['touch','speed','live','cassettes'].includes(key))creativeUI?.refresh();
  // Safari may clamp scrollY after switching to a shorter tab without emitting
  // a scroll event. Re-evaluate the dock once the new layout has settled.
  requestAnimationFrame(()=>videoUI?.updateVisibility());
 }

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
 function resetFrameHistory(){creativeUI?.resetTracking();previewProcessor.reset();exportProcessor.reset();holdPreviewProcessor.reset();holdExportProcessor.reset();lastMusicState={bass:0,high:0};lastMusicTime=0;}
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
  audioEngine.setMix(state.masterBypass?{...state.mix,videoVolume:100,musicVolume:0}:state.mix);
  const held=holdStrengthsAt(source.currentTime||0,clipIndex);
  const age=window.VHSVideoCreative.agingAt(state.creative.aging,source.currentTime||0,source.duration||0);
  const audioCfg={...state.audio,
   enabled:!state.masterBypass&&(state.audio.enabled||age>.005),
   strength:Math.max(Number(state.audio.strength)||0,age*88),
   hiss:Math.max(Number(state.audio.hiss)||0,age*80),
   drop:Math.max(Number(state.audio.drop)||0,age*65),
   device:state.creative.audioDevice,
   holdGlitch:!state.masterBypass&&active?held.audio:0,seed:clipSeed()};
  audioEngine.update(audioCfg,source.currentTime||0,active);
  audioEngine.syncMusic(globalVideoTime(),active&&!state.masterBypass);
}
 function setSeed(value){state.seed=value>>>0;resetFrameHistory();$('undoGlitch').disabled=!seedHistory.length;persist();renderCurrentFrame();videoUI?.sync();}
 function regenerateSeed(){if(!file||recording)return;seedHistory.push(state.seed>>>0);if(seedHistory.length>50)seedHistory.shift();let next=randomSeed();if(next===state.seed)next=(next+1)>>>0;setSeed(next);}
 function undoSeed(){if(!file||recording||!seedHistory.length)return;setSeed(seedHistory.pop());}
 // Per-event balance is saved on each press: old events stay VIDEO-only.
 // Slider affects the HOLD effect, not other user-enabled video/audio filters.
 function holdStrengthsAt(time,index){
  let video=0,audio=0;
  const mix=(event,intensity)=>{
   const b=clamp(Number(event.blend??0)||0,0,100);
   video=Math.max(video,intensity*clamp((100-b)/50,0,1));
   audio=Math.max(audio,intensity*clamp(b/50,0,1));
  };
  for(const event of state.holdEvents){
   if(event.clip===index&&time>=event.start&&time<event.end)mix(event,.94);
  }
  if(holdActive&&holdActive.clip===index&&time>=holdActive.start)mix(holdActive,1);
  return{video,audio};
 }
 function holdBalanceText(value){
  const n=clamp(Math.round(Number(value)||0),0,100);
  return n===0?'ТОЛЬКО ВИДЕО':n===100?'ТОЛЬКО ЗВУК':n===50?'ВИДЕО + ЗВУК':
   n<50?'ВИДЕО 100% · ЗВУК '+n*2+'%':
    'ВИДЕО '+(200-n*2)+'% · ЗВУК 100%';
 }
 function syncHoldBalance(){
  for(const [rangeId,labelId] of [['holdBlendMain','holdBlendValueMain'],['holdBlendViewer','holdBlendValueViewer']]){
   $(rangeId).value=String(state.holdBalance);
   $(rangeId).disabled=!!recording;
   $(labelId).textContent=holdBalanceText(state.holdBalance);
   $(rangeId).style.setProperty('--hold-balance',state.holdBalance+'%');
  }
 }
 function syncHoldControls(){
  const usable=!!file&&!recording&&!state.masterBypass&&source.readyState>=2;
  for(const b of document.querySelectorAll('.holdGlitch')){
   b.disabled=!usable;b.classList.toggle('is-holding',!!holdActive);
   b.setAttribute('aria-pressed',holdActive?'true':'false');
  }
  $('holdClear').disabled=!state.holdEvents.length||!!recording;
  $('holdStatus').textContent=state.holdEvents.length+' записей';
  syncHoldBalance();
 }
 function beginHold(){
  if(!file||recording||state.masterBypass||holdActive||source.readyState<2)return;
  const time=Number(source.currentTime)||0;
  holdActive={clip:clipIndex,start:time,end:time,blend:state.holdBalance};
  resetFrameHistory();syncHoldControls();syncAudio(!source.paused);renderCurrentFrame();
 }
 function finishHold(){
  if(!holdActive)return;
  const event=holdActive;holdActive=null;
  const duration=Number(source.duration)||0;
  event.end=clamp(Math.max(event.start+.12,Number(source.currentTime)||0),event.start+.1,Math.max(event.start+.12,duration));
  state.holdEvents.push(event);
  if(state.holdEvents.length>120)state.holdEvents.shift();
  persist();resetFrameHistory();syncHoldControls();syncAudio(!source.paused);renderCurrentFrame();
 }
 function mountHoldControls(){
  for(const id of ['holdBlendMain','holdBlendViewer']){
   $(id).addEventListener('input',()=>{
    if(recording)return;
    state.holdBalance=clamp(Number($(id).value)||0,0,100);
    if(holdActive)holdActive.blend=state.holdBalance;
    syncHoldBalance();
    syncAudio(!source.paused);
    persist();renderCurrentFrame();
   });
  }
  syncHoldBalance();
  for(const button of document.querySelectorAll('.holdGlitch')){
   button.addEventListener('pointerdown',e=>{
    if(button.disabled)return;e.preventDefault();
    try{button.setPointerCapture(e.pointerId)}catch{}
    beginHold();
   });
   button.addEventListener('pointerup',e=>{e.preventDefault();finishHold();});
   button.addEventListener('pointercancel',finishHold);
   button.addEventListener('lostpointercapture',finishHold);
   button.addEventListener('keydown',e=>{if((e.key===' '||e.key==='Enter')&&!e.repeat){e.preventDefault();beginHold();}});
   button.addEventListener('keyup',e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();finishHold();}});
  }
  window.addEventListener('blur',finishHold);
  $('holdClear').onclick=()=>{
   if(recording)return;finishHold();state.holdEvents=[];persist();syncHoldControls();syncAudio(!source.paused);resetFrameHistory();renderCurrentFrame();
  };
  syncHoldControls();
 }
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
  const corners=[
   ['left-top','Слева сверху'],['center-top','По центру сверху'],['right-top','Справа сверху'],
   ['left-bottom','Слева снизу'],['center-bottom','По центру снизу'],['right-bottom','Справа снизу']
  ];
  const frameCard=document.createElement('section');frameCard.className='cameraCard cameraFrameCard';
  const frameHead=document.createElement('div');frameHead.className='cameraCardTitle';
  const frameName=document.createElement('strong');frameName.textContent='Уголки видоискателя · 4 угла';
  const frameToggle=document.createElement('label');frameToggle.className='cameraSwitch';
  const frameCheck=document.createElement('input');frameCheck.type='checkbox';frameCheck.id='cameraFrameOn';
  frameCheck.checked=!!state.camera.frame;
  frameCheck.onchange=()=>{state.camera.frame=frameCheck.checked;persist();renderCurrentFrame();};
  frameToggle.append(frameCheck,document.createTextNode(' Вкл.'));frameHead.append(frameName,frameToggle);frameCard.append(frameHead);
  const frameOptions=document.createElement('div');frameOptions.className='cameraCardOptions';
  const scaleLabel=document.createElement('label');scaleLabel.textContent='Длина уголков';
  const scaleSelect=document.createElement('select');scaleSelect.id='cameraFrameSize';
  for(const size of [60,80,100,120,140,160])scaleSelect.add(new Option(size+'%',String(size)));
  scaleSelect.value=String(state.camera.frameSize||100);
  scaleSelect.onchange=()=>{state.camera.frameSize=Number(scaleSelect.value);persist();renderCurrentFrame();};
  scaleLabel.append(scaleSelect);frameOptions.append(scaleLabel);
  const colorLabel=document.createElement('label');colorLabel.textContent='Цвет уголков';
  const colorSelect=document.createElement('select');colorSelect.id='cameraFrameColor';
  for(const [value,label] of [['white','Белый'],['green','Зелёный'],['red','Красный']])
   colorSelect.add(new Option(label,value));
  colorSelect.value=state.camera.frameColor||'white';
  colorSelect.onchange=()=>{state.camera.frameColor=colorSelect.value;persist();renderCurrentFrame();};
  colorLabel.append(colorSelect);frameOptions.append(colorLabel);
  const frameHint=document.createElement('p');frameHint.className='hint fullRow';
  frameHint.textContent='Все включённые индикаторы автоматически размещаются внутри уголков, без наложения друг на друга. Положение и размер каждого индикатора ниже можно менять отдельно.';
  frameOptions.append(frameHint);frameCard.append(frameOptions);parent.append(frameCard);
  const descriptions={rec:'REC / Запись',play:'PLAY / Воспроизведение',date:'Дата и время (секунды идут)',battery:'Батарея',counter:'Счётчик кассеты',zoom:'Индикатор ZOOM',modeInfo:'Режим SP / LP / EP',focus:'Индикатор автофокуса'};
  for(const key of ['rec','play','date','battery','counter','zoom','modeInfo','focus']){
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
   for(const n of [20,30,40,50,60,70,85,100,125,150,180,220])size.add(new Option(n+'%',String(n)));
   size.value=String(state.camera.sizes[key]);
   if(![...size.options].some(x=>x.value===size.value))size.value='125';
   size.addEventListener('change',()=>{state.camera.sizes[key]=Number(size.value);persist();renderCurrentFrame();});
   sizeLabel.append(size);options.append(sizeLabel);
   if(key==='date'){
    const clockLabel=document.createElement('label');clockLabel.className='fullRow';
    clockLabel.textContent='Стартовые дата и время (с секундами)';
    const input=document.createElement('input');input.type='datetime-local';input.step='1';input.id='cameraClockStart';
    input.value=state.camera.clockStart||'1995-06-16T22:28:00';
    input.addEventListener('change',()=>{
     if(!Number.isFinite(new Date(input.value).getTime()))return;
     state.camera.clockStart=input.value.length===16?input.value+':'+(state.camera.clockStart||'00').slice(-2):input.value;persist();renderCurrentFrame();
    });
    clockLabel.append(input);options.append(clockLabel);
    const secondsLabel=document.createElement('label');secondsLabel.className='fullRow';
    secondsLabel.textContent='Секунды начала (00–59)';
    const seconds=document.createElement('input');seconds.type='number';seconds.min='0';seconds.max='59';seconds.step='1';
    seconds.value=(state.camera.clockStart||'1995-06-16T22:28:00').split(':')[2]||'00';
    seconds.onchange=()=>{
     const sec=String(clamp(Math.floor(Number(seconds.value)||0),0,59)).padStart(2,'0');
     state.camera.clockStart=(state.camera.clockStart||'1995-06-16T22:28:00').slice(0,16)+':'+sec;
     seconds.value=sec;persist();renderCurrentFrame();
    };
    secondsLabel.append(seconds);options.append(secondsLabel);
    const extraLabel=document.createElement('label');extraLabel.className='fullRow';extraLabel.textContent='Дополнительная подпись (необязательно)';
    const extra=document.createElement('input');extra.type='text';extra.id='dateText';extra.maxLength=64;
    extra.value=state.camera.text==='PM 10:28 | JUN 16 1995'?'':state.camera.text||'';
    extra.placeholder='Например: ЛЕТО 1997';
    extra.oninput=()=>{state.camera.text=extra.value;persist();renderCurrentFrame();};
    extraLabel.append(extra);options.append(extraLabel);
    const hint=document.createElement('p');hint.className='hint fullRow';
    hint.textContent='Часы идут от установленного времени по таймкоду видео и при экспорте сохраняют тот же отсчёт.';
    options.append(hint);
   }
   if(key==='zoom'){
    const z=document.createElement('label');z.className='fullRow';z.textContent='Число на индикаторе ZOOM (без цифрового увеличения)';
    const input=document.createElement('input');input.type='number';input.min='1';input.max='20';input.step='.5';input.value=state.camera.zoomValue||3;
    input.addEventListener('change',()=>{state.camera.zoomValue=clamp(Number(input.value)||1,1,20);persist();renderCurrentFrame();});
    z.append(input);options.append(z);
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
  $('activeFxMode').textContent=state.masterBypass?'ВСЁ ВЫКЛЮЧЕНО':labels[state.fxMode];
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
  if(mode==='music'&&state.music.strength===0){
   Object.assign(state.music,{sensitivity:60,threshold:25,strength:85,release:35});
   for(const [key,label] of [['sensitivity','Чувствительность к музыке'],['threshold','Порог срабатывания'],
    ['strength','Сила музыкальных повреждений'],['release','Длительность затухания эффекта']])
     setControlByTitle($('musicControls'),label,state.music[key]);
  }
  if(mode==='timeline'&&state.timelineStrength===0){
   state.timelineStrength=85;
   setControlByTitle($('timelineControls'),'Сила выбранного события',85);
  }
  resetFrameHistory();syncModeUI();persist();renderCurrentFrame();
  if(mode!=='classic'){
   showMainTab(mode==='music'?'audio':'timeline');
   if(mode==='music')showAudioSection('beat');
  }
 }
 function updateKeyframePlayhead(){
  const marker=$('keyframePlayhead');
  if(!marker)return;
  const duration=Number(source.duration)||1;
  marker.style.left=clamp((Number(source.currentTime)||0)/duration*100,0,100)+'%';
 }
 function renderKeyframes(){
  const engine=window.VHSVideoKeyframes;
  const track=$('keyframeTrack').value;
  const list=$('keyframeList'),markers=$('keyframeMarkers');
  list.replaceChildren();markers.replaceChildren();
  $('keyframesEnabled').checked=state.keyframesEnabled!==false;
  const entries=state.keyframes.filter(item=>item.clip===clipIndex&&item.track===track)
   .sort((a,b)=>a.time-b.time);
  const duration=Math.max(1,Number(source.duration)||1);
  for(const item of entries){
   const dot=document.createElement('button');dot.type='button';dot.className='keyframeMarker';
   dot.style.left=clamp(item.time/duration*100,0,100)+'%';
   dot.setAttribute('aria-label',item.time.toFixed(2)+' секунд · '+item.value+' процентов');
   dot.title=dot.getAttribute('aria-label');
   dot.onclick=()=>{
    $('keyframeTime').value=String(item.time);$('keyframeValue').value=String(item.value);
    $('keyframeValueRange').value=String(item.value);
    if(file&&!recording)source.currentTime=item.time;
   };
   markers.append(dot);
   const row=document.createElement('div');row.className='keyframeItem';
   const go=document.createElement('button');go.type='button';go.className='button';
   go.textContent=item.time.toFixed(2)+' с · '+item.value+'%';
   go.onclick=dot.onclick;
   const del=document.createElement('button');del.type='button';del.className='button keyframeDelete';
   del.textContent='✕';del.title='Удалить точку';del.setAttribute('aria-label','Удалить ключевой кадр '+item.time);
   del.disabled=!!recording;
   del.onclick=()=>{
    if(recording)return;
    state.keyframes=state.keyframes.filter(e=>e.id!==item.id);
    persist();resetFrameHistory();renderKeyframes();renderCurrentFrame();
   };
   row.append(go,del);list.append(row);
  }
  if(!entries.length){
   const empty=document.createElement('p');empty.className='hint';
   empty.textContent='Для этого эффекта пока нет ключевых кадров. Добавь минимум две точки.';
   list.append(empty);
  }
  $('keyframeStatus').textContent='Клип '+(clipIndex+1)+' · '+entries.length+' точек для «'+engine.TRACKS[track]+'». Значения между точками меняются плавно.';
  updateKeyframePlayhead();
 }
 function addKeyframe(){
  if(!file||recording){$('keyframeStatus').textContent='Сначала выбери видео и останови экспорт.';return;}
  const track=$('keyframeTrack').value,time=Number($('keyframeTime').value),
   value=Number($('keyframeValue').value),duration=Number(source.duration);
  if(!Number.isFinite(time)||time<0||!Number.isFinite(value)||value<0||value>100||
   !Number.isFinite(duration)||duration<=0||time>duration){
   $('keyframeStatus').textContent='Время должно быть внутри ролика, а сила — от 0 до 100%.';
   return;
  }
  const item=window.VHSVideoKeyframes.normalize({id:'kf-'+Date.now().toString(36),clip:clipIndex,track,time,value});
  if(!item)return;
  const exist=state.keyframes.findIndex(old=>old.clip===clipIndex&&old.track===track&&Math.abs(old.time-item.time)<.001);
  if(exist<0&&state.keyframes.length>=120){
   $('keyframeStatus').textContent='Достигнут предел 120 точек на проект.';return;
  }
  if(exist>=0)state.keyframes.splice(exist,1);
  state.keyframes=window.VHSVideoKeyframes.normalizeAll([...state.keyframes,item]);
  state.keyframesEnabled=true;
  if((track==='vhs'||track==='glitch')&&state.fxMode!=='classic'){
   state.fxMode='classic';syncModeUI();
  }
  if(track==='vhs'&&Object.values(state.signal).every(x=>Number(x)===0)){
   Object.assign(state.signal,defaults.signal);
   syncCassetteUI();
  }
  if(track==='glitch'){
   if(Object.values(state.glitches).every(x=>Number(x)===0)){
    Object.assign(state.glitches,glitchDefaults);
    mountGlitchControls();
   }
   if(state.eventDensity===0)state.eventDensity=48;
  }
  persist();resetFrameHistory();renderKeyframes();renderCurrentFrame();
 }
 function mountKeyframes(){
  $('keyframesEnabled').checked=state.keyframesEnabled!==false;
  $('keyframesEnabled').onchange=()=>{
   state.keyframesEnabled=$('keyframesEnabled').checked;
   persist();resetFrameHistory();renderCurrentFrame();
  };
  $('keyframeTrack').onchange=renderKeyframes;
  $('keyframeValue').addEventListener('input',()=>{$('keyframeValueRange').value=$('keyframeValue').value;});
  $('keyframeValueRange').addEventListener('input',()=>{$('keyframeValue').value=$('keyframeValueRange').value;});
  $('keyframeUseTime').onclick=()=>{
   if(!file)return;
   $('keyframeTime').value=(Number(source.currentTime)||0).toFixed(2);
  };
  $('keyframeAdd').onclick=addKeyframe;
  renderKeyframes();
 }
 function syncCompareButtons(){
  const disabled=!file||recording||source.readyState<2;
  for(const id of ['compareMain','compareViewer']){
   $(id).disabled=disabled;
   $(id).classList.toggle('is-holding',comparisonHeld&&!disabled);
  }
 }
 function setComparing(enabled){
  const usable=!!file&&!recording&&source.readyState>=2;
  const next=!!enabled&&usable;
  if(comparisonHeld===next)return;
  comparisonHeld=next;
  if(!next)resetFrameHistory(); // avoid temporal effect ghosting after raw frames
  syncCompareButtons();
  renderCurrentFrame();
 }
 function mountCompare(){
  for(const id of ['compareMain','compareViewer']){
   const node=$(id);
   node.addEventListener('pointerdown',event=>{
    if(node.disabled)return;
    if(event.cancelable)event.preventDefault();
    try{node.setPointerCapture?.(event.pointerId);}catch{}
    setComparing(true);
   });
   node.addEventListener('contextmenu',event=>event.preventDefault());
   node.addEventListener('pointercancel',()=>setComparing(false));
   node.addEventListener('lostpointercapture',()=>setComparing(false));
   // Keyboard accessibility: Space/Enter hold also compares the original.
   node.addEventListener('keydown',e=>{if(e.code==='Space'||e.code==='Enter'){e.preventDefault();setComparing(true);}});
   node.addEventListener('keyup',e=>{if(e.code==='Space'||e.code==='Enter')setComparing(false);});
   node.addEventListener('blur',()=>setComparing(false));
  }
  window.addEventListener('pointerup',()=>setComparing(false));
  window.addEventListener('pointercancel',()=>setComparing(false));
  window.addEventListener('blur',()=>setComparing(false));
  document.addEventListener('visibilitychange',()=>{if(document.hidden)setComparing(false);});
  syncCompareButtons();
 }
 function frameTimestamp(seconds){
  const millis=Math.round(Math.max(0,Number(seconds)||0)*1000);
  const total=Math.floor(millis/1000);
  return String(Math.floor(total/3600)).padStart(2,'0')+':'+
   String(Math.floor(total/60)%60).padStart(2,'0')+':'+
   String(total%60).padStart(2,'0')+'.'+String(millis%1000).padStart(3,'0');
 }
 function syncFrameTools(){
  const ready=!!file&&!recording&&source.readyState>=2;
  for(const id of ['frameBack','frameForward','frameSavePng'])$(id).disabled=!ready||framePngBusy;
  $('frameTimeExact').textContent=frameTimestamp(source.currentTime||0);
 }
 function stepFrame(direction){
  if(!file||recording||source.readyState<2)return;
  source.pause();
  const fps=clamp(Number($('frameStepFps').value)||30,1,120);
  const duration=Number(source.duration);
  if(!Number.isFinite(duration)||duration<=0)return;
  const count=Math.round((Number(source.currentTime)||0)*fps);
  const target=clamp((count+direction)/fps,0,Math.max(0,duration-.001));
  source.currentTime=target;
  $('frameToolStatus').textContent='Переход к '+frameTimestamp(target)+'. На iPhone Safari показывает ближайший декодируемый кадр.';
  syncFrameTools();
 }
 let framePngUrl='',framePngBusy=false;
 async function saveFramePng(){
  if(!file||recording||source.readyState<2||framePngBusy)return;
  framePngBusy=true;source.pause();
  const capturedAt=Number(source.currentTime)||0;
  $('frameSavePng').disabled=true;
  try{
   const [w,h]=videoDimensions(1920);
   const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
   if($('frameSaveEffects').checked){
    // The same renderer and timestamp as the encoded video, not a screenshot
    // of the scaled preview and not the temporary BEFORE/AFTER comparison.
    exportProcessor.reset();holdExportProcessor.reset();
    drawFrame(canvas,true);
    exportProcessor.reset();holdExportProcessor.reset();
   }else window.VHSVideoCleanPath.drawClean(source,canvas);
   if(typeof canvas.toBlob!=='function')throw Error('Этот Safari не поддерживает PNG из Canvas.');
   const png=await new Promise((resolve,reject)=>{
    canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Не удалось создать PNG.')),'image/png');
   });
   if(framePngUrl)URL.revokeObjectURL(framePngUrl);
   framePngUrl=URL.createObjectURL(png);
   const name=(file.name||'video').replace(/\.[^.]+$/,'').slice(0,50);
   const link=$('framePngDownload');link.href=framePngUrl;
   link.download=name+'_frame_'+capturedAt.toFixed(3).replace('.','-')+'.png';
   link.hidden=false;
   $('frameToolStatus').textContent='PNG готов: '+w+' × '+h+' пикс. Нажми «Скачать созданный PNG» для сохранения в iPhone.';
   // Safari can block an automatic download after an async toBlob; leave the
   // visible link for a second direct user tap.
  }catch(err){$('frameToolStatus').textContent='PNG не создан: '+err.message;}
  finally{framePngBusy=false;syncFrameTools();renderCurrentFrame();}
 }
 function mountFrameTools(){
  $('frameBack').onclick=()=>stepFrame(-1);
  $('frameForward').onclick=()=>stepFrame(1);
  $('frameSavePng').onclick=saveFramePng;
  syncFrameTools();
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
  updateKeyframePlayhead();
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
  if(state.fxMode==='timeline')return special.eventsAt(time,clipIndex,liveActive?[...state.timelineEvents,{...liveActive,duration:Math.max(.15,time-liveActive.time+.14)}]:state.timelineEvents);
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
 function musicLoadStatus(message){$('musicLoadStatus').textContent=message;}
 function musicDuration(){return audioEngine.getMusicDuration();}
 function trimState(){
  const duration=musicDuration();
  if(!duration)return{duration:0,start:0,end:0};
  const start=clamp(Number(state.mix.musicOffset)||0,0,Math.max(0,duration-.1));
  const end=state.mix.musicTrimEnd>0?clamp(Number(state.mix.musicTrimEnd),start+.05,duration):duration;
  return{duration,start,end};
 }
 function refreshMusicTrim(){
  const {duration,start,end}=trimState();
  $('musicTrim').hidden=!duration;
  if(!duration){audioStudio?.redrawMain();return;}
  for(const id of ['musicTrimStartRange','musicTrimEndRange'])$(id).max=String(duration);
  $('musicTrimStartRange').value=String(start);
  $('musicTrimEndRange').value=String(end);
  $('musicTrimStartInput').value=String(Number(start.toFixed(2)));
  $('musicTrimEndInput').value=String(Number(end.toFixed(2)));
  $('musicTrimStartLabel').textContent=timeString(start);
  $('musicTrimEndLabel').textContent=timeString(end);
  $('musicTrimDuration').textContent='Длительность выбранного отрывка: '+(end-start).toFixed(1)+' сек. из '+duration.toFixed(1)+' сек.';
  audioStudio?.redrawMain();
 }
 function changeMusicTrim(edge,value){
  const {duration,start,end}=trimState();
  if(!duration||recording)return;
  const requested=Number(value);
  if(!Number.isFinite(requested))return;
  if(edge==='start')state.mix.musicOffset=clamp(requested,0,Math.max(0,end-.1));
  else state.mix.musicTrimEnd=clamp(requested,Math.min(duration,start+.1),duration);
  audioEngine.setMix(state.mix);
  syncAudio(!source.paused);persist();refreshMusicTrim();
 }
 function showMusicSelection(){
  const track=state.selectedTrack;
  $('musicSelection').hidden=!track;
  if(track){
   $('musicTitle').textContent=track.title||'Без названия';
   $('musicArtist').textContent=track.kind==='video'?'Аудиодорожка из видео': 'Локальный аудиофайл';
   $('musicMemoryStatus').textContent=musicDuration()?
    'Длительность: '+timeString(musicDuration())+(track.kind==='video'?' · звук читается из видео локально.':' · загружен в память для обработки.') :
    'Файл нужно выбрать заново после перезапуска приложения.';
  }
  refreshMusicTrim();
 }
 function clearMusicSource(){audioEngine.setMusicBuffer(null);}
 async function prepareMusicVideo(inputFile,request){
  // Never play the second video in a hidden <video>. iOS Safari may interrupt
  // the primary video, including leaving the primary play control unresponsive.
  const bytes=await window.VHSVideoAudioExtract.extract(inputFile);
  if(request!==musicRequest)return 0;
  const buffer=await audioEngine.ctx.decodeAudioData(bytes);
  if(request!==musicRequest)return 0;
  if(!buffer||!Number.isFinite(buffer.duration)||buffer.duration<=0)
   throw Error('Safari не смог декодировать извлечённую аудиодорожку.');
  const pcm=buffer.length*buffer.numberOfChannels*4;
  if(pcm>120*1024*1024)
   throw Error('Дорожка слишком длинная для памяти iPhone. Выбери более короткое видео.');
  audioEngine.setMusicBuffer(buffer);
  return buffer.duration;
 }
 async function loadMusicTrack(inputFile,kind='file'){
  if(recording){musicLoadStatus('Нельзя менять музыку во время экспорта.');return;}
  if(!inputFile)return;
  const request=++musicRequest;musicLoading=true;
  clearMusicSource();state.selectedTrack=null;showMusicSelection();
  musicLoadStatus(kind==='video'?'Извлекаю только звуковые данные из видео, не включая видеоплеер…':'Открываю аудиофайл…');
  try{
   await audioEngine.start();
   if(request!==musicRequest)return;
   let duration;
   if(kind==='video'){
    duration=await prepareMusicVideo(inputFile,request);
   }else{
    if(inputFile.size>100*1024*1024)throw Error('Аудиофайл больше 100 МБ. Выбери файл поменьше.');
    const bytes=await inputFile.arrayBuffer();
    if(request!==musicRequest)return;
    const buffer=await audioEngine.ctx.decodeAudioData(bytes);
    if(request!==musicRequest)return;
    if(!buffer||!Number.isFinite(buffer.duration)||buffer.duration<=0)throw Error('Safari не может прочитать это аудио.');
    const pcmSize=buffer.length*buffer.numberOfChannels*4;
    const extraPcm=audioEngine.extraAudio.reduce((sum,t)=>sum+t.buffer.length*t.buffer.numberOfChannels*4,0);
    if(pcmSize>120*1024*1024||pcmSize+extraPcm>160*1024*1024)
     throw Error('Недостаточно памяти для всех аудиодорожек. Убери одну из дополнительных или выбери файл короче.');
    audioEngine.setMusicBuffer(buffer);
    duration=buffer.duration;
   }
   if(request!==musicRequest)return;
   state.selectedTrack={kind,title:inputFile.name,duration};
   if(lastFxSnapshot&&state.mix.musicVolume===0){
    state.mix.musicVolume=75; // A newly added track is audible after a clean reset.
    setControlByTitle($('musicMixerControls'),'Громкость добавленной музыки',75);
   }
   state.mix.musicOffset=0;
   state.mix.musicTrimEnd=duration;
   audioEngine.setMix(state.mix);syncAudio(!source.paused);
   showMusicSelection();persist();
   musicLoadStatus('Готово: '+timeString(duration)+'. Выбери нужный отрывок ниже. Дорожка будет звучать в просмотре и сохраняться вместе с обработанным видео.');
  }catch(e){
   if(request===musicRequest){
    clearMusicSource();state.selectedTrack=null;showMusicSelection();persist();
    musicLoadStatus('Не удалось добавить дорожку: '+e.message);
   }
  }finally{if(request===musicRequest)musicLoading=false;}
 }
 function removeMusicTrack(){
  if(recording){musicLoadStatus('Останови экспорт перед удалением музыки.');return;}
  musicRequest++;musicLoading=false;clearMusicSource();
  state.selectedTrack=null;state.mix.musicOffset=0;state.mix.musicTrimEnd=0;
  audioEngine.setMix(state.mix);syncAudio(!source.paused);
  showMusicSelection();persist();
  musicLoadStatus('Дорожка удалена. Оригинальный звук видео сохранён.');
 }
 function releaseOnLeave(event){
  musicRequest++;musicLoading=false;
  clearMusicSource();audioStudio?.clear();
  if(!event?.persisted)audioEngine.release();
 }
 function mountMusicLibrary(){
  const mix=$('musicMixerControls');
  control(mix,'Громкость оригинального звука видео',state.mix.videoVolume,v=>{state.mix.videoVolume=v;syncAudio(!source.paused);});
  control(mix,'Громкость добавленной музыки',state.mix.musicVolume,v=>{state.mix.musicVolume=v;syncAudio(!source.paused);});
  $('musicVideoStart').value=String(state.mix.musicStart);
  $('musicVideoStart').onchange=()=>{
   const v=Number($('musicVideoStart').value);
   state.mix.musicStart=Number.isFinite(v)?clamp(v,0,7200):0;
   $('musicVideoStart').value=String(state.mix.musicStart);
   persist();syncAudio(!source.paused);
  };
  for(const [id,key] of [['musicFadeIn','fadeIn'],['musicFadeOut','fadeOut']]){
   $(id).value=String(state.mix[key]||0);
   $(id).onchange=()=>{state.mix[key]=clamp(Number($(id).value)||0,0,30);audioEngine.setMix(state.mix);persist();syncAudio(!source.paused);};
  }
  $('musicLoop').checked=!!state.mix.musicLoop;
  $('musicLoop').onchange=()=>{state.mix.musicLoop=$('musicLoop').checked;persist();syncAudio(!source.paused);};
  $('musicFileInput').onchange=e=>{
   const selected=e.target.files?.[0];
   if(selected)loadMusicTrack(selected,'file');
   e.target.value='';
  };
  $('musicVideoInput').onchange=e=>{
   const selected=e.target.files?.[0];
   if(selected)loadMusicTrack(selected,'video');
   e.target.value='';
  };
  for(const [id,edge] of [['musicTrimStartRange','start'],['musicTrimEndRange','end']]){
   $(id).oninput=()=>changeMusicTrim(edge,$(id).value);
  }
  for(const [id,edge] of [['musicTrimStartInput','start'],['musicTrimEndInput','end']]){
   $(id).onchange=()=>changeMusicTrim(edge,$(id).value);
  }
  $('musicTrimReset').onclick=()=>{
   const duration=musicDuration();if(!duration||recording)return;
   state.mix.musicOffset=0;state.mix.musicTrimEnd=duration;
   audioEngine.setMix(state.mix);syncAudio(!source.paused);persist();refreshMusicTrim();
  };
  audioStudio=window.VHSVideoAudioStudio.create({
   engine:audioEngine,mix:state.mix,sync:()=>syncAudio(!source.paused),
   status:musicLoadStatus,isRecording:()=>!!recording,onChange:()=>{persist();refreshMusicTrim();}
  });
  $('removeMusic').onclick=removeMusicTrack;
  showMusicSelection();
  if(state.selectedTrack)musicLoadStatus('После перезапуска выбери локальный файл или видео заново: '+state.selectedTrack.title);
 }
 function mountFilmDamageControls(){
  const box=$('filmDamageControls');box.replaceChildren();
  $('filmDamageEnabled').checked=!!state.filmDamage.enabled;
  $('filmDamageEnabled').onchange=()=>{
   state.filmDamage.enabled=$('filmDamageEnabled').checked;
   if(state.filmDamage.enabled&&['leak','dust','grain','scratches','flicker','halation'].every(k=>state.filmDamage[k]===0)){
    state.filmDamage.leak=70;
    setControlByTitle($('filmDamageControls'),'Сила засветов',70);
   }
   persist();renderCurrentFrame();
  };
  $('filmLeakType').value=state.filmDamage.type;
  $('filmLeakType').onchange=()=>{
   state.filmDamage.type=$('filmLeakType').value;
   if(!state.filmDamage.enabled&&['leak','dust','grain','scratches','flicker','halation'].every(k=>Number(state.filmDamage[k])===0)){
    state.filmDamage.leak=70;
    setControlByTitle($('filmDamageControls'),'Сила засветов',70);
   }
   if(!state.filmDamage.enabled)enableAfterZero('damage');
   persist();renderCurrentFrame();
  };
  const names={leak:'Сила засветов',dust:'Пыль и грязь',grain:'Живое зерно',scratches:'Царапины',
   flicker:'Мерцание экспозиции',halation:'Свечение света (halation)'};
  for(const [id,label] of Object.entries(names))
   control(box,label,state.filmDamage[id],v=>{state.filmDamage[id]=v;});
 }
 const CASSETTE_FIELDS=['vhsEnabled','filmEnabled','glitchEnabled','preset','master','mode','modeStrength','tape','signalWidth',
  'eventDensity','glitchStrength','fxMode','music','speed','filmId','filmStrength','signal','glitches','audio','camera','filmDamage'];
 function cassetteSnapshot(){
  const result={};
  for(const key of CASSETTE_FIELDS)result[key]=JSON.parse(JSON.stringify(state[key]));
  return result;
 }
 function setCassetteBefore(snapshot){
  cassetteBefore=JSON.parse(JSON.stringify(snapshot));
  try{localStorage.setItem(CASSETTE_BACKUP_KEY,JSON.stringify({version:1,settings:cassetteBefore}));}catch{}
 }
 function clearCassetteBefore(){
  cassetteBefore=null;
  try{localStorage.removeItem(CASSETTE_BACKUP_KEY);}catch{}
 }
 function cancelCassette(){
  if(recording||!state.selectedCassetteId)return;
  if(cassetteBefore){
   applyCassetteSnapshot(cassetteBefore,null);
  }else{
   // Old 0.7.5 installs have no prior-cassette snapshot. In that one case
   // disable the cassette's processing without wiping media or audio.
   const neutral=JSON.parse(JSON.stringify(state));
   window.VHSVideoEffectsReset.zero(neutral);
   applyCassetteSnapshot(neutral,null);
  }
  clearCassetteBefore();
  renderCassetteShelf();
  $('cassetteStatus').textContent='Кассета снята. Настройки до её выбора восстановлены (для старой кассеты — эффекты обнулены).';
 }
 function selectCassette(cassette){
  if(recording)return;
  if(state.selectedCassetteId===cassette.id){cancelCassette();return;}
  if(!state.selectedCassetteId||!cassetteBefore)setCassetteBefore(cassetteSnapshot());
  applyCassetteSnapshot(cassette.settings,cassette.id);
  renderCassetteShelf();
  $('cassetteStatus').textContent='Применена кассета «'+cassette.name+'». Нажми на неё ещё раз или «✕ Снять кассету» для отмены.';
 }
 function applyCassetteSnapshot(snapshot,id){
  if(recording)return;
  if(!snapshot||typeof snapshot!=='object')return;
  for(const key of CASSETTE_FIELDS){
   if(!Object.prototype.hasOwnProperty.call(snapshot,key))continue;
   const value=snapshot[key],original=defaults[key];
   if(value===null||(Array.isArray(value))||typeof value!==typeof original)continue;
   if(original&&typeof original==='object'){
    state[key]={...original,...state[key],...value};
    if(key==='camera'){
     state.camera.positions={...defaults.camera.positions,...state.camera.positions,...value.positions};
     state.camera.sizes={...defaults.camera.sizes,...state.camera.sizes,...value.sizes};
    }
   }else state[key]=value;
  }
  state.selectedCassetteId=id;
  syncCassetteUI();persist();resetFrameHistory();syncAudio(!source.paused);renderCurrentFrame();
 }
 function setControlByTitle(parent,title,value){
  if(!parent||value===undefined)return;
  for(const item of parent.querySelectorAll('.control')){
   if(item.querySelector('strong')?.textContent!==title)continue;
   const slider=item.querySelector('input[type="range"]'),count=item.querySelector('em');
   if(slider)slider.value=String(value);
   if(count)count.textContent=String(value)+'%';
  }
 }
 function syncCassetteUI(){
  for(const [id,key] of [['vhsEnabled','vhsEnabled'],['filmEnabled','filmEnabled'],['glitchEnabled','glitchEnabled']])
   $(id).checked=!!state[key];
  $('vhsPreset').value=state.preset;$('tapeKind').value=state.tape;
  $('signalWidth').value=state.signalWidth;$('modeSelect').value=state.mode;
  $('filmSelect').value=state.filmId;
  $('audioEnabled').checked=!!state.audio.enabled;$('audioMode').value=state.audio.mode;
  setControlByTitle($('vhsControls'),'Общая сила VHS',state.master);
  const sig={chromaBleed:'Растекание цвета',composite:'Артефакты композитного сигнала',edgeWave:'Нестабильность видеострок',
   tracking:'Помехи видеоголовки (1–4 полосы)',noise:'Шум и снег',chromaLoss:'Выпадения цвета',ringing:'Контурное эхо'};
  for(const [key,label] of Object.entries(sig))setControlByTitle($('vhsControls'),label,state.signal[key]);
  setControlByTitle($('modeStrengthControl'),'Сила режима (MiniDV / CRT / Night Vision)',state.modeStrength);
  setControlByTitle($('filmControls'),'Сила плёнки',state.filmStrength);
  for(const [key,label] of [['strength','Сила деградации аудио'],['hiss','Шипение ленты'],['wow','Плавание звука / Wow'],
   ['flutter','Дрожание звука / Flutter'],['drop','Выпадения звука'],['saturation','Перегрузка и насыщение']])
   setControlByTitle($('audioControls'),label,state.audio[key]);
  mountGlitchControls();
  $('eventControls').replaceChildren();
  control($('eventControls'),'Частота случайных сбоев',state.eventDensity,v=>{state.eventDensity=v;resetFrameHistory();});
  control($('eventControls'),'Общая сила дополнительных помех',state.glitchStrength,v=>{state.glitchStrength=v;resetFrameHistory();});
  for(const [key,label] of [['sensitivity','Чувствительность к музыке'],['threshold','Порог срабатывания'],
   ['strength','Сила музыкальных повреждений'],['release','Длительность затухания эффекта']])
   setControlByTitle($('musicControls'),label,state.music[key]);
  $('bassEffect').value=state.music.bassEffect;$('highEffect').value=state.music.highEffect;
  mountCameraControls();mountFilmDamageControls();syncModeUI();renderFilmSelect();
  const sp=$('vhsControls').querySelector('select');if(sp)sp.value=state.speed;
 }
 function builtInCassettes(){
  const base=Object.fromEntries(CASSETTE_FIELDS.map(k=>[k,JSON.parse(JSON.stringify(defaults[k]))]));
  const make=(id,name,patch)=>({id,name,builtin:true,settings:{...JSON.parse(JSON.stringify(base)),...patch}});
  return [
   make('builtin-home','ДОМАШНЯЯ VHS · 1997',{vhsEnabled:true,tape:'used',preset:'classic',master:57,
    filmDamage:{...base.filmDamage,enabled:true,type:'edge-left',leak:40,dust:8,grain:20,scratches:8,flicker:12,halation:12}}),
   make('builtin-chewed','ЗАЖЁВАННАЯ · RENTAL',{vhsEnabled:true,tape:'chewed',preset:'damaged',master:85,
    eventDensity:85,glitchStrength:90,glitchEnabled:true,glitches:{...base.glitches,tapeChew:85,dropouts:83,headClog:75}}),
   make('builtin-film','ЗАСВЕЧЕННАЯ ПЛЁНКА',{filmEnabled:true,vhsEnabled:false,filmDamage:{...base.filmDamage,enabled:true,type:'random',
    leak:80,dust:40,scratches:48,grain:57,halation:70,flicker:39}}),
   make('builtin-hi8','HI8 · ЧИСТАЯ ЗАПИСЬ',{vhsEnabled:true,tape:'hi8',preset:'camcorder',master:40,
    filmDamage:{...base.filmDamage,enabled:false},glitchEnabled:false})
  ];
 }
 function renderCassetteShelf(){
  const shelf=$('cassetteShelf');shelf.replaceChildren();
  const all=[...builtInCassettes(),...(Array.isArray(state.cassettes)?state.cassettes:[])];
  for(const cassette of all){
   if(!cassette||!cassette.settings)continue;
   const card=document.createElement('div');card.className='cassetteCard';
   card.classList.toggle('selected',state.selectedCassetteId===cassette.id);
   const face=document.createElement('button');face.type='button';face.className='cassetteFace';
   face.setAttribute('aria-label',(state.selectedCassetteId===cassette.id?'Снять кассету ':'Применить кассету ')+cassette.name);
   face.setAttribute('aria-pressed',String(state.selectedCassetteId===cassette.id));
   const top=document.createElement('div');top.className='cassetteTop';
   top.textContent=cassette.builtin?'VHS VIDEO LAB  ·  FACTORY TAPE':'VHS VIDEO LAB  ·  MY TAPE';
   const reels=document.createElement('div');reels.className='cassetteReels';
   reels.innerHTML='<span class="cassetteReel"></span><span class="cassetteReel"></span>';
   const stripe=document.createElement('div');stripe.className='cassetteLabel';stripe.textContent=cassette.name;
   face.append(top,reels,stripe);
   face.onclick=()=>selectCassette(cassette);
   const footer=document.createElement('div');footer.className='cassetteFooter';
   const name=document.createElement('span');name.textContent=cassette.builtin?'ВСТРОЕННАЯ':'МОЯ КАССЕТА';
   footer.append(name);
   if(state.selectedCassetteId===cassette.id){const checked=document.createElement('span');checked.textContent='✓ ВЫБРАНА';checked.className='cassetteSelectedTag';footer.append(checked);}
   if(!cassette.builtin){
    const del=document.createElement('button');del.className='cassetteDelete';del.type='button';del.textContent='Удалить';
    del.onclick=()=>{if(recording)return;if(state.selectedCassetteId===cassette.id)cancelCassette();state.cassettes=state.cassettes.filter(x=>x.id!==cassette.id);persist();renderCassetteShelf();};
    footer.append(del);
   }
   card.append(face,footer);shelf.append(card);
  }
  $('cassetteDeselect').disabled=recording||!state.selectedCassetteId;
  syncSectionLights();
 }
 function mountCassetteShelf(){
  $('cassetteDeselect').onclick=cancelCassette;
  $('cassetteSave').onclick=()=>{
   if(recording)return;
   const name=$('cassetteName').value.trim().slice(0,44);
   if(!name){$('cassetteStatus').textContent='Введи название кассеты.';return;}
   if(state.cassettes.length>=40){$('cassetteStatus').textContent='Максимум 40 своих кассет.';return;}
   const item={id:'user-'+Date.now().toString(36)+'-'+Math.floor(Math.random()*1000),name,settings:cassetteSnapshot()};
   state.cassettes.push(item);
   if(!state.selectedCassetteId||!cassetteBefore)setCassetteBefore(cassetteSnapshot());
   state.selectedCassetteId=item.id;persist();renderCassetteShelf();
   $('cassetteName').value='';$('cassetteStatus').textContent='Кассета сохранена: '+name;
  };
  $('cassetteExport').onclick=()=>{
   const blob=new Blob([JSON.stringify({kind:'VHS_VIDEO_CASSETTES',version:1,cassettes:state.cassettes},null,2)],{type:'application/json'});
   const link=document.createElement('a'),url=URL.createObjectURL(blob);
   link.href=url;link.download='VHS_VIDEO_CASSETTES.json';document.body.append(link);link.click();link.remove();
   setTimeout(()=>URL.revokeObjectURL(url),2000);
   $('cassetteStatus').textContent='Файл JSON создан. Сохрани его через меню iPhone.';
  };
  $('cassetteImport').onchange=async e=>{
   const file=e.target.files?.[0];e.target.value='';
   if(!file||recording)return;
   try{
    if(file.size>300000)throw Error('JSON-файл слишком большой.');
    const content=JSON.parse(await file.text());
    if(content?.kind!=='VHS_VIDEO_CASSETTES'||!Array.isArray(content.cassettes))throw Error('Не найден архив видеокассет.');
    let n=0;
    for(const item of content.cassettes){
     if(state.cassettes.length>=40)break;
     if(!item||typeof item.name!=='string'||!item.settings||typeof item.settings!=='object')continue;
     const settings=Object.fromEntries(CASSETTE_FIELDS.filter(k=>k in item.settings).map(k=>[k,item.settings[k]]));
     state.cassettes.push({id:'import-'+Date.now().toString(36)+'-'+n,name:item.name.slice(0,44),settings});n++;
    }
    persist();renderCassetteShelf();$('cassetteStatus').textContent='Импортировано '+n+' кассет.';
   }catch(err){$('cassetteStatus').textContent='Не удалось импортировать: '+err.message;}
  };
  renderCassetteShelf();
 }
 function enableAfterZero(group){
  // Reactivate an effect on the user's next deliberate adjustment.
  if(group==='vhs'){
   state.vhsEnabled=true;
   if(state.master===0)state.master=65;
   $('vhsEnabled').checked=true;
   setControlByTitle($('vhsControls'),'Общая сила VHS',state.master);
  }else if(group==='glitch'){
   state.glitchEnabled=true;
   if(state.glitchStrength===0)state.glitchStrength=85;
   $('glitchEnabled').checked=true;
   setControlByTitle($('eventControls'),'Общая сила дополнительных помех',state.glitchStrength);
  }else if(group==='film'){
   state.filmEnabled=true;
   if(state.filmStrength===0)state.filmStrength=85;
   $('filmEnabled').checked=true;
   setControlByTitle($('filmControls'),'Сила плёнки',state.filmStrength);
  }else if(group==='damage'){
   state.filmDamage.enabled=true;
   $('filmDamageEnabled').checked=true;
  }else if(group==='audio'){
   state.audio.enabled=true;
   if(state.audio.strength===0)state.audio.strength=65;
   $('audioEnabled').checked=true;
   setControlByTitle($('audioControls'),'Сила деградации аудио',state.audio.strength);
  }
  persist();syncAudio(!source.paused);renderCurrentFrame();
 }
 function enableAfterResetInput(input){
  if(!input||input.type!=='range'||Number(input.value)<=0)return;
  if(input.closest('#filmDamageControls')&&!state.filmDamage.enabled)enableAfterZero('damage');
  else if(input.closest('#filmControls')&&!state.filmEnabled)enableAfterZero('film');
  else if(input.closest('#audioControls')&&!state.audio.enabled)enableAfterZero('audio');
  else if(input.closest('#vhsControls')&&!state.vhsEnabled)enableAfterZero('vhs');
  else if(input.closest('#glitchControls')&&!state.glitchEnabled)enableAfterZero('glitch');
  else if(input.closest('#eventControls')&&!state.glitchEnabled)enableAfterZero('glitch');
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
  tapes.onchange=()=>{
   state.tape=tapes.value;
   if(!state.vhsEnabled||state.master===0)enableAfterZero('vhs');
   persist();resetFrameHistory();renderCurrentFrame();
  };
  $('signalWidth').value=state.signalWidth;
  $('signalWidth').onchange=()=>{
   state.signalWidth=$('signalWidth').value;resetFrameHistory();persist();renderCurrentFrame();
  };
  $('modeSelect').value=state.mode;
  $('modeSelect').onchange=()=>{
   state.mode=$('modeSelect').value;
   if(state.mode!=='vhs'&&state.modeStrength===0){
    state.modeStrength=75;
    setControlByTitle($('modeStrengthControl'),'Сила режима (MiniDV / CRT / Night Vision)',75);
   }
   persist();resetFrameHistory();renderCurrentFrame();
  };
  $('glitchEnabled').checked=state.glitchEnabled;
  $('glitchEnabled').onchange=()=>{
   state.glitchEnabled=$('glitchEnabled').checked;
   if(state.glitchEnabled&&state.glitchStrength===0){
    state.glitchStrength=85;
    if(Object.values(state.glitches).every(v=>Number(v)===0))Object.assign(state.glitches,glitchDefaults);
    syncCassetteUI();
   }
   persist();resetFrameHistory();renderCurrentFrame();
  };
  for(const [name,fn] of [
    ['gentleGlitch',d=>d.group==='digital'?0:Math.min(d.default,22)],
    ['chaosGlitch',d=>Math.min(100,Math.round(d.default*1.75))],
    ['offGlitch',()=>0]
  ])$(name).onclick=()=>{
    for(const def of glitchMeta)state.glitches[def.id]=fn(def);
    if(name==='chaosGlitch')state.eventDensity=80;
    if(name==='gentleGlitch')state.eventDensity=35;
    if(name==='offGlitch')state.eventDensity=0;
    if(name!=='offGlitch'){
     state.glitchEnabled=true;
     if(state.glitchStrength===0)state.glitchStrength=85;
     $('glitchEnabled').checked=true;
    }
    mountEventControls();mountGlitchControls();
    setControlByTitle($('eventControls'),'Общая сила дополнительных помех',state.glitchStrength);
    persist();resetFrameHistory();renderCurrentFrame();
  };
  const audio=$('audioControls');
  for(const [id,label] of [
    ['strength','Сила деградации аудио'],['hiss','Шипение ленты'],
    ['wow','Плавание звука / Wow'],['flutter','Дрожание звука / Flutter'],
    ['drop','Выпадения звука'],['saturation','Перегрузка и насыщение']
  ])control(audio,label,state.audio[id],v=>{state.audio[id]=v;syncAudio();});
  $('audioEnabled').checked=state.audio.enabled;
  $('audioEnabled').onchange=()=>{
   state.audio.enabled=$('audioEnabled').checked;
   if(state.audio.enabled&&state.audio.strength===0){
    state.audio.strength=65;
    setControlByTitle($('audioControls'),'Сила деградации аудио',65);
   }
   syncAudio();persist();
  };
  $('audioMode').value=state.audio.mode;
  $('audioMode').onchange=()=>{state.audio.mode=$('audioMode').value;syncAudio();persist();};
  control($('filmControls'),'Сила плёнки',state.filmStrength,v=>state.filmStrength=v);
  $('vhsEnabled').checked=state.vhsEnabled;$('filmEnabled').checked=state.filmEnabled;
  $('vhsPreset').value=state.preset;
  $('outputSize').value=state.size;$('fps').value=String(state.fps);
  $('exportScope').value=state.exportScope;
  $('keepAudio').checked=state.keepAudio;
  mountCameraControls();mountFilmDamageControls();buildModeControls();mountMusicLibrary();mountCassetteShelf();
  $('vhsEnabled').onchange=()=>{
   state.vhsEnabled=$('vhsEnabled').checked;
   if(state.vhsEnabled&&state.master===0){
    state.master=65;
    if(Object.values(state.signal).every(v=>Number(v)===0))Object.assign(state.signal,defaults.signal);
    syncCassetteUI();
   }
   persist();renderCurrentFrame();
  };
  $('filmEnabled').onchange=()=>{
   state.filmEnabled=$('filmEnabled').checked;
   if(state.filmEnabled&&state.filmStrength===0){
    state.filmStrength=85;setControlByTitle($('filmControls'),'Сила плёнки',85);
   }
   persist();renderCurrentFrame();
  };
  $('vhsPreset').onchange=()=>{
   state.preset=$('vhsPreset').value;
   if(!state.vhsEnabled||state.master===0)enableAfterZero('vhs');
   persist();renderCurrentFrame();
  };
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
  window.VHSVideoCameraOSD.draw(ctx,w,h,state.camera,state.speed,globalVideoTime());
 }
 function drawFrame(canvas,forExport=false){
  if(!file||source.readyState<2||!source.videoWidth)return;
  // A zero-effects frame must never pass through the 192–240px VHS signal
  // buffer: that downsample was blurring the original even after "Reset all".
  const atTime=source.currentTime||0;
  // Tape aging runs once in its dedicated damage pass below. Turning it on
  // must not multiply VHS, film-damage and grain passes on every iPhone frame.
  const frameState=window.VHSVideoKeyframes.effective(state,clipIndex,atTime);
  const holdVideo=holdStrengthsAt(atTime,clipIndex).video;
  const clean=comparisonHeld&&canvas===preview||!window.VHSVideoCleanPath.hasVisualEffects(frameState,holdVideo);
  const touch=frameState.creative?.touch;
  const hasLocalEdits=!!(touch&&((touch.enabled&&touch.strokes?.length)||
   (touch.facesEnabled&&(touch.manualFaces?.length||touch.faceAutodetect))));
  // Face/brush effects must not route the *entire* picture through a 240px
  // VHS buffer when no global visual filter is enabled.
  const withoutLocal={...frameState,creative:{...frameState.creative,
   touch:{...touch,enabled:false,facesEnabled:false}}};
  const localOnly=hasLocalEdits&&!window.VHSVideoCleanPath.hasVisualEffects(withoutLocal,holdVideo);
  if(canvas===preview){
   // Full original quality is provided by the native video element, not a
   // continuously redrawn 1080p canvas (too costly for mobile Safari).
   $('videoStage').querySelector('.stageCanvas').classList.toggle('native-clean',clean);
   const [width,height]=videoDimensions(clean?960:localOnly?1280:520);
   if(canvas.width!==width)canvas.width=width;
   if(canvas.height!==height)canvas.height=height;
  }
  if(clean||localOnly){
   window.VHSVideoCleanPath.drawClean(source,canvas);
   if(localOnly&&!comparisonHeld)creativeUI?.drawTouch(canvas.getContext('2d'),atTime,clipIndex);
   return;
  }
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
  const time=source.currentTime||0;
  const image=ctx.getImageData(0,0,iw,ih);
  if(frameState.creative?.look?.enabled&&frameState.creative.look.target&&frameState.creative.look.strength>0)
   window.VHSVideoCreative.transfer(image.data,iw,ih,frameState.creative.look.target,frameState.creative.look.strength);
  if(!state.masterBypass&&frameState.filmEnabled){
   const f=selectedFilm(),strength=frameState.filmStrength/100;
   if(f?.type==='builtin')window.VideoFilmCore.filmBuiltin(image.data,builtin[f.name],strength);
   else if(f?.fields)window.VideoFilmCore.filmXMP(image.data,f,strength);
  }
  if(!state.masterBypass&&frameState.filmDamage.enabled)window.VHSVideoFilmDamage.apply(image.data,iw,ih,{...frameState.filmDamage,time:globalVideoTime(),seed:clipSeed()});
  ctx.putImageData(image,0,0);
  creativeUI?.drawTouch(ctx,atTime,clipIndex);
  if(!state.masterBypass)drawOsd(ctx,iw,ih);
  const frameIndex=Math.floor(time*(Number(state.fps)||15));
  // A mechanical tape splice is strongest at real clip joins.
  const splicePulse=Math.max(
   clipIndex>0?clamp(1-time/.33,0,1):0,
   clipHasNext()&&Number.isFinite(source.duration)?clamp(1-(source.duration-time)/.30,0,1):0
  );
  const seed=(clipSeed()^Math.imul(frameIndex+1,0x9e3779b9))>>>0;
  if(!state.masterBypass&&frameState.fxMode==='classic'&&frameState.vhsEnabled&&frameState.master>0){
   const signal=ctx.getImageData(0,0,iw,ih);
   const tape=window.VHSVideoGlitchFX.TAPES.find(t=>t.id===state.tape)||window.VHSVideoGlitchFX.TAPES[1];
   const preset=state.preset==='damaged'?1.25:state.preset==='camcorder'?.75:1;
   window.VHSPhotoEngine.apply(signal.data,iw,ih,{
    master:clamp(frameState.master/100*preset*tape.level,0,1.4),seed,
    signal:{...frameState.signal,noise:Math.min(100,frameState.signal.noise*tape.noise),tracking:Math.min(100,frameState.signal.tracking*tape.head),tapeSpeed:state.speed}
   });
   ctx.putImageData(signal,0,0);
  }
  if(!state.masterBypass&&(frameState.fxMode!=='classic'||frameState.glitchEnabled||frameState.mode!=='vhs')){
   const signal=ctx.getImageData(0,0,iw,ih);
   const engine=forExport||recording?exportProcessor:previewProcessor;
   engine.apply(signal.data,iw,ih,{
    time,seed:clipSeed(),mode:state.fxMode==='classic'?state.mode:'vhs',
    modeStrength:state.modeStrength,splicePulse:state.fxMode==='classic'?splicePulse:0,
    tape:state.tape,density:state.eventDensity,
    manualEffects:state.fxMode==='classic'?null:specialEffectsAt(time),
    strength:state.fxMode==='classic'?(frameState.glitchEnabled?frameState.glitchStrength/100:0):1,
    effects:state.fxMode==='classic'&&frameState.glitchEnabled?state.glitches:{}
   });
   ctx.putImageData(signal,0,0);
  }
  const intensity=holdStrengthsAt(time,clipIndex).video;
  if(!state.masterBypass&&intensity>0){
   const signal=ctx.getImageData(0,0,iw,ih);
   const engine=forExport||recording?holdExportProcessor:holdPreviewProcessor;
   engine.apply(signal.data,iw,ih,{
    time,seed:clipSeed(),mode:'vhs',tape:state.tape,strength:1,density:0,
    manualEffects:{tapeChew:intensity,vhold:intensity*.77,dropouts:intensity*.85,
     colorBurst:intensity*.77,rf:intensity*.8,headClog:intensity*.45}
   });
   ctx.putImageData(signal,0,0);
  }
  // Independent aging overlay: visible in every mode and in saved video.
  const age=window.VHSVideoCreative.agingAt(frameState.creative?.aging,time,source.duration||0);
  if(!state.masterBypass&&age>.002){
   const agedImage=ctx.getImageData(0,0,iw,ih);
   window.VHSVideoCreative.damageTape(agedImage.data,iw,ih,age,time,clipSeed());
   ctx.putImageData(agedImage,0,0);
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
  // Always schedule the next paint first. A broken speed plug-in must never
  // kill video painting while the native audio clock continues running.
  loopId=requestAnimationFrame(tick);
  try{creativeUI?.updateSpeed(now);}
  catch(err){
   console.error('Speed synchronization failed',err);
   creativeUI?.stopReverse();
   try{source.playbackRate=1;}catch{}
  }
  if(!file||(source.paused&&!creativeUI?.isReverse())||source.ended)return;
  const fps=recording?Number(state.fps):
   $('videoStage').querySelector('.stageCanvas').classList.contains('native-clean')?6:12;
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
   creativeUI?.syncButtons();
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
  updateKeyframePlayhead();syncFrameTools();
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
 async function waitVideoReady(options={}){
  const timeoutMs=Number(options.timeoutMs)||12000;
  const subject=options.subject||'видео';
  // Safari on iPhone may emit only loadedmetadata for a local blob URL until
  // the user starts playback. Accept valid metadata, unlock Play, and decode
  // the first actual frame when the user presses ▶.
  const ready=()=>source.readyState>=1&&source.videoWidth>0&&source.videoHeight>0;
  if(ready())return{hasFrame:source.readyState>=2};
  return await new Promise((resolve,reject)=>{
   let settled=false;
   const remove=()=>{clearTimeout(timer);
    for(const name of ['loadedmetadata','loadeddata','canplay','error','abort'])
     source.removeEventListener(name,events[name]);
   };
   function done(err){
    if(settled)return;settled=true;remove();
    if(err)reject(err);else resolve({hasFrame:source.readyState>=2});
   }
   const mediaMessage=()=>{
    const code=Number(source.error?.code)||0;
    return code===4?'Safari не поддерживает формат или кодек этого видео.':
     code===3?'Safari не смог декодировать видео (кодек, повреждение или память).':
     code===2?'Не удалось прочитать видео. Проверь файл.':
     'Safari не смог открыть файл видео.';
   };
   const events={
    loadedmetadata:()=>{if(ready())done();},
    loadeddata:()=>{if(ready())done();},
    canplay:()=>{if(ready())done();},
    error:()=>done(Error(mediaMessage())),
    abort:()=>done(Error('Чтение видео было прервано.'))
   };
   for(const [name,callback] of Object.entries(events))source.addEventListener(name,callback);
   const timer=setTimeout(()=>done(Error('Safari не получил данные файла «'+subject+
    '» за '+Math.round(timeoutMs/1000)+
    ' сек. Возможно, ролик из iCloud не был полностью передан или содержит неподдерживаемый кодек.')),timeoutMs);
   if(ready())done();
  });
 }
 function importStatus(message,showHelp=false){
  const node=$('videoImportStatus');
  if(node)node.textContent=message;
  if($('videoImportHelp'))$('videoImportHelp').hidden=!showHelp;
 }
 function resetVideoPickerState(){
  videoPickerPending=false;
 }
 function pickerWithoutFile(){
  resetVideoPickerState();
  importStatus('Safari не передал видео из выбора. Если ты выбирал ролик (а не отменил выбор), попробуй «Через Файлы» ниже.',true);
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
 async function loadVideo(input,origin='gallery'){
  const list=Array.from(input||[]).slice(0,10);
  resetVideoPickerState();
  if(!list.length){pickerWithoutFile();return;}
  if(recording)throw Error('Нельзя сменить ролик во время экспорта.');
  if(videoImportBusy)throw Error('Другое видео ещё подготавливается. Дождись завершения.');
  const first=list[0];
  if(!first||!Number.isFinite(first.size)||first.size===0)
   throw Error('Файл пустой или ещё не загрузился с iCloud. Сохрани его в «Файлы» и повтори выбор.');
  if(list.some(f=>!f||f.size===0))
   throw Error('В подборке есть пустой файл. Попробуй выбрать ролики по одному.');
  if(list.some(f=>f.type&&f.type.startsWith('image/')))
   throw Error('В списке обнаружена фотография, а не видео.');
  if(typeof URL.createObjectURL!=='function')throw Error('Браузер не умеет открывать локальные файлы.');
  const bytes=list.reduce((n,f)=>n+f.size,0);
  const summary=(bytes/1048576).toFixed(1)+' МБ';
  const request=++videoImportSerial;
  const previous={clips,file,clipIndex,sourceUrl,position:Number(source.currentTime)||0,playing:!source.paused};
  const candidate=[];
  try{
   for(const f of list)candidate.push({file:f,url:URL.createObjectURL(f),duration:0});
  }catch(e){
   candidate.forEach(clip=>URL.revokeObjectURL(clip.url));
   throw Error('Не удалось получить доступ к видео из галереи: '+e.message);
  }
  videoImportBusy=true;videoImportCommitted=false;
  importStatus('Файл передан из '+(origin==='files'?'«Файлов»':'галереи')+
   ': '+first.name+' · '+summary+'. Проверяю декодирование первого кадра…',false);
  textStatus('Открываю видео '+first.name+'…');
  try{
   source.pause();audioEngine.suspendNoise();
   source.preload='auto';
   source.src=candidate[0].url;
   source.load();
   const videoReady=await waitVideoReady({timeoutMs:18000,subject:first.name});
   if(request!==videoImportSerial)throw Error('Импорт был прерван новым выбором.');
   // Commit only after real first-frame decode. Keep previous Object URLs
   // until then: a failed Photos import must not destroy the old edit.
   clips=candidate;clipIndex=0;file=first;sourceUrl=candidate[0].url;videoImportCommitted=true;
   resetFrameHistory();seedHistory=[];$('undoGlitch').disabled=true;
   state.holdEvents=[];state.keyframes=[];state.keyframesEnabled=true;
   state.creative.touch.strokes=[];state.creative.touch.manualFaces=[];
   state.creative.speed.points=[];state.creative.live.events=[];
   creativeUI?.resetTracking();
   comparisonHeld=false;
   if(framePngUrl){URL.revokeObjectURL(framePngUrl);framePngUrl='';}
   $('framePngDownload').hidden=true;
   persist();
   source.loop=clips.length===1;
   $('videoName').textContent=file.name;
   $('videoMeta').textContent=summary;
   $('empty').hidden=true;
   $('exportResult').hidden=true;
   selectedTimelineId='';$('addTimelineEvent').textContent='＋ Добавить повреждение';
   updateClipNav();videoUI?.sync();renderTimeline();onLoaded(true);
   // Revoke old resources after successful commit; never touch candidate URLs.
   previous.clips.forEach(entry=>URL.revokeObjectURL(entry.url));
   importStatus('Видео принято: '+first.name+' · '+summary+'. '+
    (!videoReady.hasFrame?'Нажми ▶: Safari подготовит первый кадр при воспроизведении.':
    list.length>1?'Проверяю остальные клипы…':'Готово к просмотру.'),false);
   if(list.length>1){
    for(let j=1;j<clips.length;j++){
     clips[j].duration=await probeClipDuration(clips[j]);
     importStatus('Видео загружено. Дополнительных клипов проверено: '+j+' / '+(clips.length-1)+'.',false);
    }
    updateClipNav();
    if(clips.some(clip=>!Number.isFinite(clip.duration)||clip.duration<=0))
     importStatus('Основной клип загружен, но один из остальных имеет неизвестную длительность. Он может быть несовместим с Safari.',true);
   }
  }catch(e){
   candidate.forEach(entry=>{try{URL.revokeObjectURL(entry.url);}catch{}});
   if(previous.sourceUrl){
    // Recover the previously working video. No extra hidden video players.
    clips=previous.clips;file=previous.file;clipIndex=previous.clipIndex;sourceUrl=previous.sourceUrl;
    source.src=previous.sourceUrl;source.preload='metadata';
    source.load();
    const restore=()=>{try{source.currentTime=previous.position;}catch{}};
    if(source.readyState>=1)restore();
    else source.addEventListener('loadedmetadata',restore,{once:true});
   }else{
    clips=[];file=null;sourceUrl='';clipIndex=0;
    source.removeAttribute('src');source.load();
    $('videoName').textContent='Видеофайл не выбран';$('videoMeta').textContent='—';
    $('empty').hidden=false;
    for(const id of ['play','export','seek','regenerate','openViewer'])$(id).disabled=true;
   }
   importStatus('Видео не открылось: '+e.message+' Попробуй выбрать тот же ролик через «Файлы».',true);
   textStatus('Импорт не выполнен. '+e.message);
   updateClipNav();videoUI?.sync();
  }finally{
   source.preload='metadata';
   videoImportBusy=false;videoImportCommitted=false;
  }
 }
 function onLoaded(force=false){
  if((videoImportBusy&&!videoImportCommitted&&force!==true)||!source.videoWidth||!source.videoHeight)return;
  const renderState=window.VHSVideoKeyframes.effective(state,clipIndex,source.currentTime||0);
  const [w,h]=videoDimensions(window.VHSVideoCleanPath.hasVisualEffects(renderState,holdStrengthsAt(source.currentTime||0,clipIndex).video)?520:960);
  source.loop=!recording&&clips.length===1;
  preview.width=w;preview.height=h;
  if(clips[clipIndex])clips[clipIndex].duration=Number.isFinite(source.duration)?source.duration:0;
  $('videoMeta').textContent=source.videoWidth+' × '+source.videoHeight+' · '+timeString(source.duration);
  updateClipNav();
  selectedTimelineId='';$('addTimelineEvent').textContent='＋ Добавить повреждение';renderTimeline();
  const frameReady=source.readyState>=2;
  $('empty').hidden=frameReady;
  if(!frameReady){
   $('empty').querySelector('strong').textContent='ВИДЕО ПОЛУЧЕНО';
   $('empty').querySelector('span').textContent='Нажми ▶ для загрузки первого кадра';
  }
  $('play').disabled=!!recording;$('export').disabled=!!recording||!frameReady;
  $('regenerate').disabled=!!recording;$('seek').disabled=!!recording;
  $('timeTotal').textContent=timeString(source.duration);
  videoUI?.sync();syncHoldControls();syncFrameTools();syncCompareButtons();renderKeyframes();creativeUI?.refresh();
  textStatus(!frameReady?'Файл распознан. Нажми ▶ для первого кадра (особенность Safari на iPhone).':
   clips.length>1?'Монтаж: '+clips.length+' клипов. VHS + FILM применяются ко всей серии.':'Видео готово. Нажми ▶ или перемести ползунок. Оригинал не изменяется.');
  if(frameReady&&!videoImportBusy&&file)
   importStatus('Видео готово: '+file.name+' · первый кадр доступен. Можно смотреть и обрабатывать.',false);
  renderCurrentFrame();
 }
 async function togglePlay(){
  if(!file||recording)return;
  try{
   if(creativeUI?.isReverse()){creativeUI.stopReverse();$('play').textContent='▶ Просмотр';return;}
   if(state.creative.speed.enabled&&creativeUI?.speedRate(source.currentTime||0)<0){
    if(source.currentTime<=.03)source.currentTime=Math.max(0,(source.duration||0)-.04);
    if(creativeUI.startReverse()){$('play').textContent='Ⅱ Пауза';return;}
   }
   if(source.paused){
    // source.play() must run during the original tap gesture. Awaiting an
    // AudioContext first can prevent video from starting on iPhone Safari.
    const playback=source.play();
    audioEngine.start().then(()=>syncAudio(true)).catch(err=>{
     if(!audioErrorShown){textStatus('Звук недоступен: '+err.message);audioErrorShown=true;}
    });
    await playback;
    $('play').textContent='Ⅱ Пауза';
   }else{source.pause();$('play').textContent='▶ Просмотр';}
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
  exportOriginalFile=false;
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
 let beatAudioCache={file:null,buffer:null};
 async function getVideoBeatAudio(){
  const selected=file;
  if(!selected)throw Error('Сначала выбери видео.');
  if(beatAudioCache.file===selected&&beatAudioCache.buffer)return beatAudioCache.buffer;
  await audioEngine.start();
  let bytes;
  if(/\.(mp4|mov|m4v)$/i.test(selected.name||'')){
   bytes=await window.VHSVideoAudioExtract.extract(selected);
  }else{
   if(selected.size>100*1024*1024)throw Error('Анализ этого формата ограничен 100 МБ; для больших роликов нужен MP4/MOV с AAC.');
   bytes=await selected.arrayBuffer();
  }
  let buffer;
  try{buffer=await audioEngine.ctx.decodeAudioData(bytes.slice(0));}
  catch(e){throw Error('Не удалось декодировать звук видео. Поддерживается MP4/MOV с AAC; для других кодеков добавь отдельную дорожку.');}
  if(buffer.length*buffer.numberOfChannels*4>250*1024*1024)throw Error('Звуковая дорожка слишком длинная для памяти устройства.');
  if(file!==selected)throw Error('За время анализа видео сменилось — запусти снова.');
  beatAudioCache={file:selected,buffer};return buffer;
 }
 async function beginExport(){
  if(!file||recording)return;
  if(state.creative.speed.enabled&&state.creative.speed.reverse){
    exportStatus('Реверс пока доступен только в предпросмотре. Для экспорта назад необходим отдельный покадровый кодировщик.');
    return;
  }
  // If a single, entire clip has not been changed, return its real bytes.
  // Canvas/MediaRecorder would otherwise re-encode and reduce quality even
  // though the user explicitly set every video/audio effect to zero.
  const held=holdStrengthsAt(source.currentTime||0,clipIndex);
  if(window.VHSVideoCleanPath.canCopyOriginal(state,{
   clipCount:clips.length,duration:Number(source.duration),
   holdVideo:held.video,holdAudio:held.audio,
   extraTracks:audioEngine.extraAudio,musicLoaded:!!audioEngine.musicBuffer
  })){
   if(downloadUrl)URL.revokeObjectURL(downloadUrl);
   exportBlob=file;exportMime=file.type||'application/octet-stream';
   exportOriginalFile=true;
   downloadUrl=URL.createObjectURL(file);
   const link=$('download');link.href=downloadUrl;
   link.download=file.name||'original_video';
   $('exportResult').hidden=false;
   $('cancel').hidden=true;$('progress').hidden=true;
   exportStatus('Готово: оригинальный файл без фильтров и без повторного сжатия · '+
    (file.size/1048576).toFixed(1)+' МБ. Исходное разрешение и кадры сохранены.');
   return;
  }
  if(!preview.captureStream){exportStatus('Захват Canvas недоступен в этом браузере. Нужен экспорт через WebCodecs.');return;}
  const mime=chooseMime();
  if(!mime){exportStatus('Этот браузер не поддерживает доступный видеокодек. Требуется альтернативный WebCodecs-экспорт.');return;}
  if(!Number.isFinite(source.duration)||source.duration<=0){exportStatus('Неизвестная длительность видео.');return;}
  if(state.selectedTrack&&!musicDuration()){
   exportStatus('Музыка после перезапуска не загружена. Добавь аудиофайл или видео заново в разделе «♫ ТРЕКИ».');return;
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
   $('play').disabled=true;$('seek').disabled=true;$('regenerate').disabled=true;$('undoGlitch').disabled=true;updateClipNav();videoUI?.sync();syncHoldControls();syncFrameTools();syncCompareButtons();syncSectionLights();
   rec.ondataavailable=e=>{if(e.data?.size)blobs.push(e.data)};
   rec.onerror=e=>{exportStatus('Ошибка записи: '+(e.error?.message||'неизвестная ошибка'));};
   rec.onstop=()=>{
    const contentType=rec.mimeType||mime;
    recording=null;
    source.loop=clips.length===1;
    for(const tr of recordStream?.getVideoTracks()||[])tr.stop();
    recordStream=null;
    $('cancel').hidden=true;$('progress').hidden=true;$('export').disabled=false;
    $('play').disabled=false;$('seek').disabled=false;$('regenerate').disabled=false;$('undoGlitch').disabled=!seedHistory.length;updateClipNav();videoUI?.sync();syncHoldControls();syncFrameTools();syncCompareButtons();syncSectionLights();
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
  const f=exportOriginalFile&&exportBlob instanceof File?exportBlob:
   new File([exportBlob],name,{type:exportMime});
  try{
   if(navigator.canShare?.({files:[f]}))await navigator.share({files:[f],title:'VHS Video Lab'});
   else exportStatus('Системная отправка недоступна для этого файла. Используй «Скачать».');
  }catch(e){if(e.name!=='AbortError')exportStatus('Не удалось поделиться: '+e.message);}
 }
 function mountVideoCapture(){
  if(!window.VHSVideoLiveCamera?.mount){
   console.warn('Видеокамера с эффектами не загрузилась.');
   return;
  }
  window.VHSVideoLiveCamera.mount({
   // Capture uses the current selected VHS, GLITCH, FILM, cassette and
   // viewfinder settings, but never mutates saved editor configuration.
   getFilmProfile:()=>{
    const selected=selectedFilm();
    if(!selected)return null;
    if(selected.type==='builtin')return{
     type:'builtin',recipe:builtin[selected.name],name:selected.name
    };
    return selected;
   },
   getSettings:()=>({
    masterBypass:state.masterBypass,
    vhsEnabled:state.vhsEnabled,master:state.master,
    preset:state.preset,tape:state.tape,
    signal:state.signal,signalWidth:state.signalWidth,
    eventDensity:state.eventDensity,speed:state.speed,
    filmEnabled:state.filmEnabled,filmId:state.filmId,
    filmStrength:state.filmStrength,
    glitchEnabled:state.glitchEnabled,glitchStrength:state.glitchStrength,
    glitches:state.glitches,mode:state.mode,modeStrength:state.modeStrength,
    filmDamage:state.filmDamage,camera:state.camera,
    selectedCassetteId:state.selectedCassetteId,
    creative:state.creative
   }),
   onImport:async captured=>{
    await loadVideo([captured],'camera');
    showMainTab('vhs');
   }
  });
 }
 function initEvents(){
  document.querySelectorAll('.tabs button[data-tab]').forEach(button=>button.addEventListener('click',()=>showMainTab(button.dataset.tab)));
  document.querySelectorAll('[data-audio-section]').forEach(button=>button.addEventListener('click',()=>showAudioSection(button.dataset.audioSection)));
  $('allEffectsToggle').onclick=resetAllEffects;
  $('restoreEffects').onclick=restoreLastEffects;
  // Capturing delegates cover controls generated later (camera, imported audio, presets).
  // Defer indicator repaint until the native input/change listeners have saved their state.
  let lightFrame=0;
  const scheduleLights=()=>{
   if(lightFrame)return;
   lightFrame=requestAnimationFrame(()=>{lightFrame=0;syncSectionLights();});
  };
  document.addEventListener('input',e=>{enableAfterResetInput(e.target);scheduleLights();});
  document.addEventListener('change',scheduleLights);
  mountHoldControls();mountFrameTools();mountCompare();
  for(const [id,origin] of [['videoInput','gallery'],['videoFilesInput','files'],['videoClipsInput','clips']]){
   const input=$(id);
   input.addEventListener('click',()=>{
    if(recording||videoImportBusy)return;
    videoPickerPending=true;
    importStatus(origin==='files'?'Ожидаю файл из приложения «Файлы»…':
     'Ожидаю, пока iPhone передаст выбранное видео. Если оно в iCloud, подготовка может занять время…',false);
   });
   input.addEventListener('cancel',pickerWithoutFile);
   input.addEventListener('change',e=>{
    const files=Array.from(e.target.files||[]);
    resetVideoPickerState();
    input.value='';
    if(!files.length){pickerWithoutFile();return;}
    loadVideo(files,origin).catch(err=>{
     importStatus('Не удалось начать импорт: '+err.message,true);
     textStatus('Не удалось выбрать видео: '+err.message);
    });
   });
  }
  window.addEventListener('focus',()=>{
   if(!videoPickerPending)return;
   setTimeout(()=>{
    if(!videoPickerPending||videoImportBusy)return;
    importStatus('Ожидаю передачу видео из галереи. Если окно уже закрылось и файл не появился, попробуй «Через Файлы».',true);
   },2000);
  });
  window.addEventListener('pagehide',releaseOnLeave);
  window.addEventListener('pageshow',e=>{if(e?.persisted)showMusicSelection();});
  $('prevClip').onclick=()=>{if(recording)return;selectClip(clipIndex-1,false).catch(e=>textStatus(e.message));};
  $('nextClip').onclick=()=>{if(recording)return;selectClip(clipIndex+1,false).catch(e=>textStatus(e.message));};
  source.addEventListener('loadedmetadata',onLoaded);source.addEventListener('loadeddata',onLoaded);source.addEventListener('canplay',onLoaded);
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
  source.addEventListener('play',()=>{try{syncAudio(true)}catch(e){textStatus('Музыка: '+e.message);}});
  source.addEventListener('error',()=>{
   if(!videoImportBusy){
    textStatus('Safari не смог декодировать выбранный ролик. Попробуй совместимый MP4 H.264 или другой экспорт видео.');
    importStatus('Ошибка декодирования: '+(file?.name||'видео')+'. Если через «Файлы» тоже не открывается, проблема может быть в кодеке или повреждении файла.',true);
   }
   $('export').disabled=true;
  });
  $('seek').oninput=()=>{if(recording||!source.duration)return;source.currentTime=Number($('seek').value)/1000*source.duration;};
  $('play').onclick=togglePlay;
  $('regenerate').onclick=regenerateSeed;
  $('undoGlitch').onclick=undoSeed;
  $('filmSearch').oninput=renderFilmSelect;
  $('filmSelect').onchange=()=>{
   if(!$('filmSelect').value)return;
   state.filmId=$('filmSelect').value;state.filmEnabled=true;$('filmEnabled').checked=true;
   if(state.filmStrength===0){state.filmStrength=85;setControlByTitle($('filmControls'),'Сила плёнки',85);}
   persist();renderCurrentFrame();
  };
  $('filmImport').onchange=async e=>{
   for(const f of [...(e.target.files||[])])try{await importPresets(f)}catch(err){$('filmImportStatus').textContent='Ошибка: '+err.message;}
   e.target.value='';
  };
  $('export').onclick=()=>beginExport().catch(e=>exportStatus('Ошибка экспорта: '+e.message));
  $('cancel').onclick=stopExport;
  $('share').onclick=shareExport;
 }
 async function init(){
  mountControls();mountKeyframes();initEvents();mountVideoCapture();
  const mixSnapshots=(a,b,v)=>{
   if(typeof a==='number'&&typeof b==='number')return a+(b-a)*v;
   if(a&&b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b)){
    const result={...a};
    for(const key of Object.keys(b))if(key in a)result[key]=mixSnapshots(a[key],b[key],v);
    return result;
   }
   return v<.5?a:b;
  };
  creativeUI=window.VHSVideoCreativeUI.create({
   state,source,preview,
   hasVideo:()=>!!file&&source.readyState>=2,
   isRecording:()=>!!recording,
   getClip:()=>clipIndex,
   getAudioBuffer:()=>audioEngine.musicBuffer,
   getOriginalAudioBuffer:()=>getVideoBeatAudio(),
   getCassettes:()=>[...builtInCassettes(),...state.cassettes],
   callbacks:{
    save:()=>persist(),
    render:()=>{renderCurrentFrame();syncAudio(!source.paused);},
    audio:()=>syncAudio(!source.paused),
    speed:()=>{creativeUI?.updateSpeed();syncAudio(!source.paused);renderCurrentFrame();},
   },
   onBeat:events=>{
    if(recording)return;
    const manual=state.timelineEvents.filter(e=>!(String(e.id).startsWith('auto-')&&e.clip===clipIndex));
    state.timelineEvents=[...manual,...events].slice(0,120);
    state.fxMode='timeline';syncModeUI();persist();renderTimeline();resetFrameHistory();renderCurrentFrame();
   },
   onLiveStart:ev=>{
    if(recording)return;liveActive=ev;state.fxMode='timeline';
    syncModeUI();renderCurrentFrame();
   },
   onLive:ev=>{
    if(recording)return;liveActive=null;
    const event=window.VHSVideoSpecialModes.cleanEvent(ev);
    if(event)state.timelineEvents=[...state.timelineEvents,event].slice(-120);
    state.fxMode='timeline';syncModeUI();persist();renderTimeline();renderCurrentFrame();
   },
   onMorph:(a,b,v)=>{
    if(recording)return;
    const snap={};
    for(const key of CASSETTE_FIELDS)if(Object.prototype.hasOwnProperty.call(a,key)&&Object.prototype.hasOwnProperty.call(b,key))
     snap[key]=mixSnapshots(a[key],b[key],v);
    applyCassetteSnapshot(snap,null);
    renderCassetteShelf();
   }
  });
  creativeUI.mount();
  if(!window.VHSVideoPlayerUI)throw Error('Модуль просмотра не загружен. Обнови страницу с интернетом.');
  videoUI=window.VHSVideoPlayerUI.create({
   source,preview,
   getState:()=>({file,recording,hasUndo:seedHistory.length>0,hasPrevious:clipIndex>0,hasNext:clipHasNext()}),
   onPlay:()=>togglePlay(),onReroll:()=>regenerateSeed(),onUndo:()=>undoSeed(),
   onPrev:()=>selectClip(clipIndex-1,false).catch(e=>textStatus(e.message)),
   onNext:()=>selectClip(clipIndex+1,false).catch(e=>textStatus(e.message)),
   onSeek:time=>{source.currentTime=time;updateTime();}
  });
  if(!window.VideoFilmCore||!window.VHSPhotoEngine||!window.VHSVideoGlitchFX||!window.VHSVideoTapeAudio||!window.VHSVideoAudioExtract||!window.VHSVideoFilmDamage||!window.VHSVideoAudioStudio||!window.VHSVideoSpecialModes||!window.VHSVideoEffectsReset||!window.VHSVideoCleanPath||!window.VHSVideoCameraOSD||!window.VHSVideoKeyframes||!window.VHSVideoHelpContent||!window.VHSVideoHelpIllustrations||!window.VHSVideoHelpUI||!window.VHSVideoCreative||!window.VHSVideoCreativeUI)throw Error('Не загрузились эффекты. Обнови страницу с интернетом.');
  window.VHSVideoHelpUI.mount();
  try{builtin=await (await fetch('../looks.json')).json();}catch{throw Error('Не удалось загрузить 23 встроенных плёнки.');}
  importedDB=await openVideoDB();
  const [savedXMP,fromPhoto]=await Promise.all([readAll(importedDB,'xmp'),readSharedPhotoProfiles()]);
  importedXMP=savedXMP.slice(0,FILM_LIMIT);
  sharedXMP=fromPhoto.slice(0,FILM_LIMIT);
  try{const prev=JSON.parse(localStorage.getItem('vhs.mobile.settings')||'null');favoriteIds=Array.isArray(prev?.favoriteFilms)?prev.favoriteFilms:[];}catch{}
  rebuildFilmList();renderCassetteShelf();
  $('filmImportStatus').textContent=fromPhoto.length?
   'Автоматически обнаружены '+fromPhoto.length+' XMP-профилей из фото-версии в этом браузере.':
   'Локальная XMP-библиотека фото-версии пока недоступна. Можно импортировать ZIP либо резервную копию.';
  loopId=requestAnimationFrame(tick);
  syncSectionLights();syncHoldControls();
  if('serviceWorker'in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(console.warn);
 }
 init().catch(e=>{textStatus('Ошибка запуска: '+e.message);console.error(e);});
})();