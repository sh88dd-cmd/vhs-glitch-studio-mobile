/* VHS Video Lab 0.8.0 — offline creative controls, no paid APIs.
 * Mounts once; editor owns all source files, audio graph and export.
 */
(function(root){
'use strict';
const $=id=>document.getElementById(id);
const E=root.VHSVideoCreative,clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));
function create(opts){
 const {state,source,preview,callbacks}=opts;
 const c=state.creative;
 let tool='',drawing=null,tracked=[],trackedClip=-1,lastTrackTime=-1,prevGray=null;
 let faceDetector=null,faceBusy=false,faceLast=-1,autoBoxes=[];
 let lastReverseFrame=0,reversePlaying=false;
 const overlay=$('touchOverlay');
 function save(){callbacks.save();callbacks.render();}
 function updateInput(id,v){if($(id))$(id).value=String(v);}
 function pulse(message){$('touchStatus').textContent=message;}
 function showSubnav(ids,selected){
  for(const [button,page] of ids){
   const active=button===selected;
   $(button).classList.toggle('active',active);
   $(page).hidden=!active;
  }
 }
 function range(id,obj,key,label){
  const node=$(id);node.value=String(obj[key]);
  function update(){
   obj[key]=Number(node.value);
   if(label)$(label).textContent=Math.round(obj[key])+(id==='touchRadius'||id==='facePixelSize'||id==='faceBlurSize'?'':'%');
   save();
  }
  node.addEventListener('input',update);
  updateInput(id,obj[key]);if(label)$(label).textContent=Math.round(obj[key])+(id==='touchRadius'||id==='facePixelSize'||id==='faceBlurSize'?'':'%');
 }
 function updateOverlay(){
  const active=!!tool&&!!opts.hasVideo()&&!opts.isRecording();
  overlay.hidden=!active;
  overlay.classList.toggle('is-drawing',active);
  const w=preview.width||480,h=preview.height||270;
  if(overlay.width!==w)overlay.width=w;
  if(overlay.height!==h)overlay.height=h;
  const ctx=overlay.getContext('2d');ctx.clearRect(0,0,w,h);
  if(!active)return;
  ctx.save();ctx.lineWidth=Math.max(1,w/260);ctx.strokeStyle='#f5b365';
  ctx.setLineDash([5,4]);
  if(drawing&&tool==='face'){
   const r=drawing;ctx.strokeRect(r.x*w,r.y*h,r.w*w,r.h*h);
  }
  if(drawing&&tool==='brush'){
   const pts=drawing.points;ctx.beginPath();
   for(let i=0;i<pts.length;i++){
    const [x,y]=pts[i];if(i===0)ctx.moveTo(x*w,y*h);else ctx.lineTo(x*w,y*h);
   }
   ctx.stroke();
  }
  ctx.restore();
 }
 function position(event){
  const rect=overlay.getBoundingClientRect();
  return [clamp((event.clientX-rect.left)/Math.max(1,rect.width),0,1),
   clamp((event.clientY-rect.top)/Math.max(1,rect.height),0,1)];
 }
 function finishDrawing(){
  if(!drawing)return;
  if(tool==='brush'){
   if(drawing.points.length){
    c.touch.strokes.push(drawing);if(c.touch.strokes.length>120)c.touch.strokes.shift();
    pulse('Касание записано на '+drawing.duration.toFixed(1)+' секунды. Можно продолжать рисовать.');
   }
  }else if(tool==='face'){
   if(drawing.w>.025&&drawing.h>.025){
    c.touch.manualFaces.push({...drawing,id:'face-'+Date.now().toString(36),clip:opts.getClip(),start:Number(source.currentTime)||0});
    c.touch.manualFaces=c.touch.manualFaces.slice(-6);
    c.touch.facesEnabled=true;$('faceEnabled').checked=true;
    resetTracking();
    pulse('Лицо выделено. Маска будет двигаться при воспроизведении благодаря локальному отслеживанию кадров.');
   }
  }
  drawing=null;save();updateOverlay();
 }
 function startOverlay(){
  overlay.addEventListener('pointerdown',event=>{
   if(!tool||opts.isRecording()||!opts.hasVideo())return;
   event.preventDefault();event.stopPropagation();
   const [x,y]=position(event);
   if(tool==='brush'){
    c.touch.enabled=true;$('touchEnabled').checked=true;
    const start=Number(source.currentTime)||0;
    const duration=clamp(c.touch.duration,.2,120);
    drawing={id:'touch-'+Date.now().toString(36),clip:opts.getClip(),start,end:start+duration,
     duration,mode:c.touch.brush,radius:Number(c.touch.radius),
     strength:Number(c.touch.strength),points:[[x,y]]};
   }else drawing={x,y,w:0,h:0,anchorX:x,anchorY:y};
   try{overlay.setPointerCapture(event.pointerId);}catch{}
   updateOverlay();
  });
  overlay.addEventListener('pointermove',event=>{
   if(!drawing)return;
   event.preventDefault();
   const [x,y]=position(event);
   if(tool==='brush'){
    const pts=drawing.points,last=pts[pts.length-1];
    if(Math.hypot(last[0]-x,last[1]-y)>.008&&pts.length<240)pts.push([x,y]);
   }else{
    const ax=drawing.anchorX,ay=drawing.anchorY;
    drawing.x=Math.min(ax,x);drawing.y=Math.min(ay,y);
    drawing.w=Math.abs(ax-x);drawing.h=Math.abs(ay-y);
   }
   updateOverlay();
  });
  overlay.addEventListener('pointerup',finishDrawing);
  overlay.addEventListener('pointercancel',()=>{drawing=null;updateOverlay();});
  overlay.addEventListener('lostpointercapture',()=>{if(drawing)finishDrawing();});
 }
 function resetTracking(){
  prevGray=null;tracked=[];trackedClip=-1;lastTrackTime=-1;autoBoxes=[];
 }
 async function initFaceDetector(){
  if(!('FaceDetector' in root))return false;
  try{faceDetector=new root.FaceDetector({fastMode:true,maxDetectedFaces:6});return true;}
  catch{return false;}
 }
 async function detectFace(){
  if(!faceDetector||faceBusy||!opts.hasVideo()||source.readyState<2)return;
  const t=Number(source.currentTime)||0;
  if(t-faceLast<.32&&t>=faceLast)return;
  faceLast=t;faceBusy=true;
  try{
   const found=await faceDetector.detect(source);
   if(Math.abs(t-(Number(source.currentTime)||0))>.5)return;
   const w=source.videoWidth,h=source.videoHeight;
   autoBoxes=(found||[]).slice(0,6).map(item=>{
    const r=item.boundingBox||item;
    return{x:clamp(r.x/w,0,1),y:clamp(r.y/h,0,1),
     w:clamp(r.width/w,.03,1),h:clamp(r.height/h,.03,1),start:t};
   });
   callbacks.render();
  }catch(err){
   $('touchStatus').textContent='Автообнаружение лица недоступно для этого кадра: '+err.message+'; выдели лицо пальцем.';
  }finally{faceBusy=false;}
 }
 function faceBoxes(ctx,time,clip){
  const cfg=c.touch;
  if(!cfg.facesEnabled)return[];
  if(cfg.faceAutodetect&&faceDetector)detectFace();
  const anchors=cfg.manualFaces.filter(face=>face.clip===clip&&time>=Number(face.start||0)).slice(-6);
  const identity=anchors.map(f=>f.id).join(',');
  const clipChanged=trackedClip!==clip;
  if(clipChanged||time<lastTrackTime-.09||time-lastTrackTime>.8||tracked.length!==anchors.length||
    tracked.some((x,i)=>x.id!==anchors[i].id)){
   tracked=anchors.map(f=>({...f}));prevGray=null;lastTrackTime=time;trackedClip=clip;
  }
  // Preview and export use the same offline block matching; this is motion
  // tracking, not a guarantee of successful identity detection after occlusion.
  if(anchors.length&&time>lastTrackTime+.025&&time-lastTrackTime<.8){
   const gray=E.gray(ctx,160);
   if(prevGray&&prevGray.w===gray.w&&prevGray.h===gray.h){
    tracked=E.trackBoxes(prevGray.data,gray.data,gray.w,gray.h,tracked);
   }
   prevGray=gray;lastTrackTime=time;
  }else if(anchors.length&&!prevGray){
   prevGray=E.gray(ctx,160);lastTrackTime=time;
  }
  const auto=cfg.faceAutodetect&&faceDetector&&Math.abs(time-faceLast)<.85?autoBoxes:[];
  return [...tracked,...auto].slice(0,6);
 }
 function drawTouch(ctx,time,clip){
  if(c.touch.enabled)E.drawStrokes(ctx,c,clip,time);
  if(c.touch.facesEnabled){
   const boxes=faceBoxes(ctx,time,clip);
   E.drawFaces(ctx,boxes,c);
  }
 }
 function renderSpeedPoints(){
  const list=$('speedPointsList'),graph=$('speedCurveGraph');
  list.replaceChildren();graph.replaceChildren();
  const duration=Math.max(1,Number(source.duration)||1);
  const points=(c.speed.points||[]).slice().sort((a,b)=>a.time-b.time);
  for(const point of points){
   const marker=document.createElement('button');marker.className='speedPointMarker';
   marker.type='button';marker.style.left=(clamp(point.time/duration,0,1)*100)+'%';
   marker.style.top=(50-clamp(point.rate,-10,10)*4.5)+'%';
   marker.title=point.time.toFixed(2)+' сек · '+point.rate.toFixed(1)+'×';
   marker.onclick=()=>{$('speedPointTime').value=String(point.time);$('speedPointRate').value=String(point.rate);
    if(opts.hasVideo())source.currentTime=point.time;};
   graph.append(marker);
   const row=document.createElement('div');row.className='creativePointRow';
   row.textContent=point.time.toFixed(2)+' с · '+(point.rate>0?'+':'')+point.rate.toFixed(1)+'×';
   const del=document.createElement('button');del.className='button';del.textContent='✕';del.type='button';
   del.onclick=()=>{if(opts.isRecording())return;
    c.speed.points=c.speed.points.filter(x=>x.id!==point.id);save();renderSpeedPoints();callbacks.speed();
   };
   row.append(del);list.append(row);
  }
  if(!points.length)list.textContent='Точек пока нет. Добавь первую и последнюю.';
 }
 function mountSpeed(){
  const speed=c.speed;
  $('speedEnabled').checked=!!speed.enabled;
  $('speedEnabled').onchange=()=>{speed.enabled=$('speedEnabled').checked;save();callbacks.speed();};
  $('speedRate').value=speed.rate;
  function setRate(){speed.rate=clamp($('speedRate').value,1,10);
   $('speedRateText').textContent=(speed.reverse?'−':'+')+speed.rate.toFixed(1)+'×';save();callbacks.speed();}
  $('speedRate').oninput=setRate;
  for(const [id,value] of [['speedForward',false],['speedReverse',true]]){
   $(id).onclick=()=>{speed.reverse=value;speed.enabled=true;
    $('speedEnabled').checked=true;refreshSpeed();save();callbacks.speed();};
  }
  $('speedCurveEnabled').checked=!!speed.curveEnabled;
  $('speedCurveEnabled').onchange=()=>{speed.curveEnabled=$('speedCurveEnabled').checked;
   speed.enabled=true;$('speedEnabled').checked=true;save();callbacks.speed();};
  $('speedAddPoint').onclick=()=>{
   if(!opts.hasVideo()||opts.isRecording())return;
   const time=Number($('speedPointTime').value),rate=Number($('speedPointRate').value);
   if(!Number.isFinite(time)||time<0||time>source.duration||
    !Number.isFinite(rate)||rate<-10||rate>10)return;
   const points=c.speed.points;
   const existing=points.findIndex(x=>Math.abs(x.time-time)<.01);
   if(existing>=0)points.splice(existing,1);
   else if(points.length>=70)return;
   points.push({id:'speed-'+Date.now().toString(36),time,rate});
   points.sort((a,b)=>a.time-b.time);
   speed.curveEnabled=true;speed.enabled=true;
   $('speedEnabled').checked=true;$('speedCurveEnabled').checked=true;
   renderSpeedPoints();save();callbacks.speed();
  };
  refreshSpeed();
 }
 function refreshSpeed(){
  $('speedRateText').textContent=(c.speed.reverse?'−':'+')+Number(c.speed.rate).toFixed(1)+'×';
  $('speedForward').classList.toggle('active',!c.speed.reverse);
  $('speedReverse').classList.toggle('active',!!c.speed.reverse);
  $('speedRate').value=String(c.speed.rate);
  $('speedEnabled').checked=!!c.speed.enabled;
  $('speedCurveEnabled').checked=!!c.speed.curveEnabled;
  renderSpeedPoints();
 }
 function speedRate(time){
  return E.speedAt(c.speed,time,Number(source.duration)||0);
 }
 function isReverse(){return reversePlaying;}
 function startReverse(){
  if(!opts.hasVideo()||opts.isRecording())return false;
  if(speedRate(source.currentTime)>=0)return false;
  source.pause();reversePlaying=true;lastReverseFrame=performance.now();return true;
 }
 function stopReverse(){reversePlaying=false;lastReverseFrame=0;}
 function updateSpeed(now=performance.now()){
  const rate=speedRate(source.currentTime||0);
  if(opts.isRecording()){
   // Native source.playbackRate works with positive rates; negative playback
   // uses manual frame stepping in preview only (no reverse audio claim).
   if(rate>0&&source.playbackRate!==rate)try{source.playbackRate=rate;}catch{}
   return;
  }
  if(rate<0){
   if(!source.paused&&!reversePlaying){
    source.pause();reversePlaying=true;lastReverseFrame=now;
   }
   if(reversePlaying&&lastReverseFrame&&now-lastReverseFrame>=70&&source.readyState>=2&&!source.seeking){
    const dt=Math.min(.2,(now-lastReverseFrame)/1000);
    lastReverseFrame=now;
    source.currentTime=clamp(source.currentTime+rate*dt,0,Math.max(0,source.duration-.001));
    if(source.currentTime<=.015)stopReverse();
   }
  }else{
   if(reversePlaying)stopReverse();
   if(source.playbackRate!==Math.max(.1,rate))try{source.playbackRate=Math.max(.1,rate);}catch{}
  }
 }
 function mountAging(){
  const a=c.aging;const tabs=[['cassetteLibraryTab','cassetteLibraryPage'],['cassetteAgingTab','cassetteAgingPage']];
  tabs.forEach(([id])=>$(id).onclick=()=>showSubnav(tabs,id));
  $('agingEnabled').checked=!!a.enabled;
  $('agingEnabled').onchange=()=>{a.enabled=$('agingEnabled').checked;refreshAging();save();};
  for(const [id,key] of [['agingAmount','amount'],['agingStart','start'],['agingEnd','end']]){
   $(id).value=String(a[key]);$(id).oninput=()=>{a[key]=Number($(id).value);refreshAging();save();};
  }
  refreshAging();
 }
 function refreshAging(){
  $('agingEnabled').checked=!!c.aging.enabled;
  for(const [id,key] of [['agingAmount','amount'],['agingStart','start'],['agingEnd','end']])$(id).value=String(c.aging[key]);
  $('agingAmountText').textContent=Math.round(c.aging.amount)+'%';
  $('agingStatus').textContent=c.aging.enabled?'Старение активно: эффект усиливается от '+c.aging.start+'% до '+c.aging.end+'% ролика.':'Эффект выключен.';
 }
 function mountLook(){
  const l=c.look;
  $('lookEnabled').checked=!!l.enabled;$('lookStrength').value=String(l.strength);
  $('lookStrengthText').textContent=Math.round(l.strength)+'%';
  $('lookEnabled').onchange=()=>{l.enabled=$('lookEnabled').checked;save();};
  $('lookStrength').oninput=()=>{l.strength=Number($('lookStrength').value);
   $('lookStrengthText').textContent=Math.round(l.strength)+'%';save();};
  $('lookFile').onchange=async event=>{
   const f=event.target.files?.[0];event.target.value='';
   if(!f||opts.isRecording())return;
   if(f.size>20*1024*1024){$('lookStatus').textContent='Файл больше 20 МБ. Выбери меньше.';return;}
   const url=URL.createObjectURL(f);
   try{
    const image=new Image();
    await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('Не удалось прочитать фото.'));image.src=url;});
    const canvas=document.createElement('canvas');
    const scale=Math.min(1,320/Math.max(image.naturalWidth,image.naturalHeight));
    canvas.width=Math.max(2,Math.round(image.naturalWidth*scale));
    canvas.height=Math.max(2,Math.round(image.naturalHeight*scale));
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,canvas.width,canvas.height);
    const data=ctx.getImageData(0,0,canvas.width,canvas.height);
    l.target=E.colorSample(data.data,canvas.width,canvas.height,3);
    l.enabled=true;$('lookEnabled').checked=true;
    $('lookStatus').textContent='Цветовая палитра скопирована из «'+f.name+'». Результат виден на видео.';
    save();
   }catch(err){$('lookStatus').textContent=err.message;}
   finally{URL.revokeObjectURL(url);}
  };
  if(l.target)$('lookStatus').textContent='Локальная палитра сохранена; можно изменить силу.';
 }
 function mountBeat(){
  $('autoBeatSensitivity').oninput=()=>{
   $('autoBeatSensitivityText').textContent=$('autoBeatSensitivity').value+'%';
  };
  $('autoBeatGenerate').onclick=()=>{
   if(!opts.hasVideo()||opts.isRecording()){
    $('autoBeatStatus').textContent='Сначала загрузи видео и останови экспорт.';return;
   }
   const buffer=opts.getAudioBuffer();
   if(!buffer){
    $('autoBeatStatus').textContent='Сначала добавь аудиофайл во вкладке «ТРЕКИ». Скрытых серверов и каталогов нет.';return;
   }
   const sensitivity=Number($('autoBeatSensitivity').value);
   const effect=$('autoBeatEffect').value;
   const events=E.beatEvents(buffer,{sensitivity,duration:Math.min(buffer.duration,source.duration||buffer.duration),clip:opts.getClip(),
    limit:85,effect:effect==='mix'?'tapeChew':effect});
   if(effect==='mix')events.forEach((ev,i)=>{ev.effect=['tapeChew','vhold','rf','colorBurst'][i%4];});
   if(!events.length){$('autoBeatStatus').textContent='Чёткие удары не найдены. Попробуй другой фрагмент или чувствительность.';return;}
   opts.onBeat(events);
   $('autoBeatStatus').textContent='Найдено '+events.length+' ударов. События добавлены в «СЦЕНЫ», их можно редактировать или удалять.';
  };
 }
 function mountLive(){
  let active=null;
  const finish=()=>{
   if(!active)return;
   const ev=active;active=null;
   const duration=Math.max(.12,(Number(source.currentTime)||0)-ev.time);
   ev.duration=Math.min(30,duration);
   opts.onLive(ev);
   document.querySelectorAll('[data-live-effect]').forEach(b=>b.classList.remove('is-pressed'));
   $('liveStatus').textContent='Записано: '+ev.effect+' · '+ev.duration.toFixed(2)+' c. Можно редактировать в разделе «СЦЕНЫ».';
  };
  for(const b of document.querySelectorAll('[data-live-effect]')){
   const begin=e=>{
    if(!opts.hasVideo()||opts.isRecording()||active)return;
    e.preventDefault();
    active={id:'live-'+Date.now().toString(36),clip:opts.getClip(),time:Number(source.currentTime)||0,
     duration:.25,strength:95,effect:b.dataset.liveEffect};
    b.classList.add('is-pressed');
    opts.onLiveStart(active);
    try{b.setPointerCapture(e.pointerId);}catch{}
   };
   b.addEventListener('pointerdown',begin);
   b.addEventListener('pointerup',finish);
   b.addEventListener('pointercancel',finish);
   b.addEventListener('lostpointercapture',finish);
  }
  const refs=['morphA','morphB'];
  for(const id of refs)$(id).onchange=()=>{};
  $('morphSlider').oninput=()=>{
   if(opts.isRecording())return;
   const a=opts.getCassettes().find(x=>x.id===$('morphA').value);
   const b=opts.getCassettes().find(x=>x.id===$('morphB').value);
   if(!a||!b)return;
   const v=Number($('morphSlider').value)/100;
   $('morphValueText').textContent=Math.round(v*100)+'%';
   opts.onMorph(a.settings,b.settings,v);
  };
  refreshCassettes();
 }
 function refreshCassettes(){
  const all=opts.getCassettes(),els=['morphA','morphB'];
  for(const id of els){
   const el=$(id),old=el.value;el.replaceChildren();
   for(const item of all){const opt=document.createElement('option');
    opt.value=item.id;opt.textContent=item.name;el.append(opt);
   }
   if(all.some(x=>x.id===old))el.value=old;
  }
  if(all.length>1&&$('morphB').selectedIndex<=0)$('morphB').selectedIndex=1;
 }
 function mountTouch(){
  $('touchBrushTab').onclick=()=>showSubnav([['touchBrushTab','touchBrushPage'],['touchFaceTab','touchFacePage']],'touchBrushTab');
  $('touchFaceTab').onclick=()=>showSubnav([['touchBrushTab','touchBrushPage'],['touchFaceTab','touchFacePage']],'touchFaceTab');
  $('touchEnabled').checked=!!c.touch.enabled;
  $('touchEnabled').onchange=()=>{c.touch.enabled=$('touchEnabled').checked;save();};
  $('touchBrush').value=c.touch.brush;
  $('touchBrush').onchange=()=>{c.touch.brush=$('touchBrush').value;save();};
  for(const [id,key,label] of [
   ['touchRadius','radius','touchRadiusText'],['touchStrength','strength','touchStrengthText'],
   ['facePixelSize','faceSize','facePixelText'],['faceBlurSize','faceBlur','faceBlurText']])
   range(id,c.touch,key,label);
  $('touchDuration').value=String(c.touch.duration);
  $('touchDuration').onchange=()=>{c.touch.duration=clamp($('touchDuration').value,.2,120);save();};
  $('touchStartDrawing').onclick=()=>{
   tool=tool==='brush'?'':'brush';$('touchStartDrawing').textContent=tool?'✓ Закончить рисование':'✎ Рисовать на видеокадре';
   updateOverlay();pulse(tool?'Проводи пальцем по основному видеокадру вверху страницы.':'Рисование выключено.');
   if(tool)window.scrollTo({top:0,behavior:'smooth'});
  };
  $('touchUndo').onclick=()=>{c.touch.strokes.pop();save();pulse('Последнее касание удалено.');};
  $('touchClear').onclick=()=>{c.touch.strokes=[];save();pulse('Все нарисованные помехи очищены.');};
  $('faceEnabled').checked=!!c.touch.facesEnabled;
  $('faceEnabled').onchange=()=>{c.touch.facesEnabled=$('faceEnabled').checked;save();};
  $('faceStyle').value=c.touch.faceStyle;
  $('faceStyle').onchange=()=>{c.touch.faceStyle=$('faceStyle').value;save();};
  $('faceAuto').onclick=()=>{
   if(!faceDetector){pulse('Автоматический детектор недоступен в этом Safari. Нажми «Выделить лицо пальцем» — перемещение будет отслеживаться локально.');return;}
   c.touch.facesEnabled=true;c.touch.faceAutodetect=true;
   $('faceEnabled').checked=true;faceLast=-1;detectFace();save();
   pulse('Автоматическое обнаружение включено. Если лицо потеряется, выдели его пальцем.');
  };
  $('faceMark').onclick=()=>{
   tool=tool==='face'?'':'face';$('faceMark').textContent=tool?'✓ Закончить выделение':'＋ Выделить лицо пальцем';
   updateOverlay();pulse(tool?'Обведи лицо прямоугольником на основном кадре вверху.':'Режим выделения выключен.');
   if(tool)window.scrollTo({top:0,behavior:'smooth'});
  };
  $('faceClear').onclick=()=>{
   c.touch.manualFaces=[];c.touch.faceAutodetect=false;resetTracking();save();
   pulse('Все маски лиц убраны.');
  };
  startOverlay();initFaceDetector().then(ok=>{
   pulse(ok?'Доступен автоматический детектор и ручное выделение с трекингом.':
    'В Safari доступно ручное выделение лица с отслеживанием движения по кадрам.');
  });
 }
 function syncButtons(){
  const can=!!opts.hasVideo()&&!opts.isRecording();
  for(const id of ['touchStartDrawing','faceAuto','faceMark'])$(id).disabled=!can;
  if(!can&&tool){tool='';drawing=null;}
  updateOverlay();
 }
 function refresh(){
  refreshSpeed();refreshAging();refreshCassettes();
  $('lookEnabled').checked=!!c.look.enabled;
  $('lookStrength').value=String(c.look.strength);
  $('lookStrengthText').textContent=Math.round(c.look.strength)+'%';
  $('audioDevice').value=c.audioDevice;
  $('touchEnabled').checked=!!c.touch.enabled;
  $('faceEnabled').checked=!!c.touch.facesEnabled;
  syncButtons();
 }
 function mount(){
  mountTouch();mountSpeed();mountAging();mountLook();mountBeat();mountLive();
  $('audioDevice').value=c.audioDevice;
  $('audioDevice').onchange=()=>{
   c.audioDevice=$('audioDevice').value;
   $('audioDeviceStatus').textContent=c.audioDevice==='off'?
    'Звук чистый.':'Выбран звуковой профиль: '+$('audioDevice').selectedOptions[0].text+'.';
   save();callbacks.audio();
  };
  refresh();
 }
 return Object.freeze({
  mount,refresh,syncButtons,drawTouch,resetTracking,refreshCassettes,
  speedRate,updateSpeed,startReverse,stopReverse,isReverse,get tool(){return tool;}
 });
}
root.VHSVideoCreativeUI=Object.freeze({create});
})(window);
