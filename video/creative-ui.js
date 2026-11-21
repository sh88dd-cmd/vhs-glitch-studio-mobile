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
 let faceDetector=null,faceBusy=false,faceLast=-1,autoBoxes=[],autoClip=-1;
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
  // The overlay is hidden during normal playback: never allocate/clear a
  // full-resolution transparent canvas 12 times a second when unused.
  if(!active)return;
  const frame=preview.getBoundingClientRect(),host=overlay.parentElement.getBoundingClientRect();
  overlay.style.left=Math.max(0,frame.left-host.left)+'px';
  overlay.style.top=Math.max(0,frame.top-host.top)+'px';
  overlay.style.width=frame.width+'px';
  overlay.style.height=frame.height+'px';
  // Coordinates track the visible video, including correct letterboxing.
  const w=Math.max(2,Math.min(960,preview.width||480));
  const h=Math.max(2,Math.round(w*(preview.height||270)/Math.max(1,preview.width||480)));
  if(overlay.width!==w)overlay.width=w;
  if(overlay.height!==h)overlay.height=h;
  const ctx=overlay.getContext('2d');ctx.clearRect(0,0,w,h);
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
  prevGray=null;tracked=[];trackedClip=-1;lastTrackTime=-1;
 }
 async function initFaceDetector(){
  // Prefer the browser's optimized detector, but NEVER require it. Safari
  // receives our bundled BSD-licensed Haar face cascade instead (zero network).
  if('FaceDetector' in root){
   try{faceDetector=new root.FaceDetector({fastMode:true,maxDetectedFaces:6});return true;}
   catch{}
  }
  const vision=root.tracking?.ViolaJones;
  if(!vision?.classifiers?.face)return false;
  const work=document.createElement('canvas');
  const context=work.getContext('2d',{willReadFrequently:true});
  faceDetector={
   async detect(video){
    // Keep the blocking offline Haar scan small enough for mobile Safari.
    const scale=Math.min(1,140/Math.max(video.videoWidth||1,video.videoHeight||1));
    const w=Math.max(64,Math.round(video.videoWidth*scale));
    const h=Math.max(48,Math.round(video.videoHeight*scale));
    work.width=w;work.height=h;
    context.drawImage(video,0,0,w,h);
    const pixels=context.getImageData(0,0,w,h).data;
    // Downscaled 200px frame + conservative scanning to protect iPhone memory.
    const found=vision.detect(pixels,w,h,1.1,1.28,2,.13,vision.classifiers.face);
    const sx=video.videoWidth/w,sy=video.videoHeight/h;
    return found.filter(rect=>rect.width>=16&&rect.height>=16).slice(0,6).map(rect=>({
     boundingBox:{x:rect.x*sx,y:rect.y*sy,width:rect.width*sx,height:rect.height*sy}
    }));
   }
  };
  return true;
 }
 async function detectFace(){
  if(!faceDetector||faceBusy||!opts.hasVideo()||source.readyState<2)return 0;
  const t=Number(source.currentTime)||0;
  if(t-faceLast<.48&&t>=faceLast)return autoBoxes.length;
  faceLast=t;faceBusy=true;
  try{
   // Yield one paint so the button responds before synchronous Haar scanning.
   await new Promise(resolve=>setTimeout(resolve,0));
   const found=await faceDetector.detect(source);
   if(Math.abs(t-(Number(source.currentTime)||0))>.5)return 0;
   const w=source.videoWidth,h=source.videoHeight;
   autoBoxes=(found||[]).slice(0,6).map(item=>{
    const r=item.boundingBox||item;
    return{x:clamp(r.x/w,0,1),y:clamp(r.y/h,0,1),
     w:clamp(r.width/w,.03,1),h:clamp(r.height/h,.03,1),start:t};
   });
   autoClip=opts.getClip();
   resetTracking();
   callbacks.render();
   return autoBoxes.length;
  }catch(err){
   $('touchStatus').textContent='Автообнаружение лица недоступно для этого кадра: '+err.message+'; выдели лицо пальцем.';
   return 0;
  }finally{faceBusy=false;}
 }
 function faceBoxes(ctx,time,clip){
  const cfg=c.touch;
  if(!cfg.facesEnabled)return[];
  // Detection is requested once by the user; repeated main-thread Haar scans
  // while decoding video caused severe frame stalls on iPhone Safari.
  const manual=cfg.manualFaces.filter(face=>face.clip===clip&&time>=Number(face.start||0));
  const auto=cfg.faceAutodetect&&faceDetector&&autoClip===clip?
   autoBoxes.map((f,i)=>({...f,id:'auto-'+i,clip,start:faceLast})):[];
  const anchors=[...manual,...auto].slice(-6);
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
  return tracked.slice(0,6);
 }
 function drawTouch(ctx,time,clip){
  if(c.touch.enabled)E.drawStrokes(ctx,c,clip,time);
  if(c.touch.facesEnabled){
   const boxes=faceBoxes(ctx,time,clip);
   E.drawFaces(ctx,boxes,c);
  }
 }
 const speedFactor=v=>E.forwardFactor(v);
 function speedLabel(v){return v<0?'−'+Math.abs(v).toFixed(1)+' (×'+speedFactor(v).toFixed(2)+')':'+'+v.toFixed(1)+' (×'+speedFactor(v).toFixed(1)+')';}
 function speedGraphY(v){return clamp(50-Math.log10(speedFactor(v))*43,7,93);}
 function speedValueForY(y){const f=10**((50-clamp(y,7,93))/43),r=f<1?-1/f:f;return Math.sign(r)*Math.round(clamp(Math.abs(r),1,10)*10)/10;}
 let draggingSpeedId=null;
 function renderSpeedPoints(){
  const list=$('speedPointsList'),graph=$('speedCurveGraph');
  list.replaceChildren();graph.replaceChildren();
  const duration=Math.max(.01,Number(source.duration)||1);
  const pts=(c.speed.points||[]).slice().sort((a,b)=>a.time-b.time);
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.classList.add('speedCurveLines');svg.setAttribute('viewBox','0 0 1000 200');
  svg.setAttribute('preserveAspectRatio','none');
  const interpolated=pts.length?[{time:0,rate:pts[0].rate},...pts,{time:duration,rate:pts.at(-1).rate}]:
   [{time:0,rate:c.speed.rate},{time:duration,rate:c.speed.rate}];
  const path=document.createElementNS('http://www.w3.org/2000/svg','polyline');
  path.setAttribute('points',interpolated.map(p=>clamp(p.time/duration,0,1)*1000+','+speedGraphY(p.rate)*2).join(' '));
  path.setAttribute('fill','none');path.setAttribute('stroke','#ffc18e');path.setAttribute('stroke-width','5');
  svg.append(path);graph.append(svg);
  for(const [label,y] of [['10×',7],['1×',50],['0.1×',93]]){
   const span=document.createElement('span');span.className='speedGraphLabel';span.style.top=y+'%';span.textContent=label;graph.append(span);
  }
  for(const point of pts){
   const marker=document.createElement('button');marker.className='speedPointMarker';marker.type='button';
   marker.dataset.pointId=point.id;marker.style.left=(clamp(point.time/duration,0,1)*100)+'%';
   marker.style.top=speedGraphY(point.rate)+'%';marker.title=point.time.toFixed(2)+' с · '+speedLabel(point.rate);
   graph.append(marker);
   const row=document.createElement('div');row.className='creativePointRow';
   row.textContent=point.time.toFixed(2)+' с · '+speedLabel(point.rate);
   const del=document.createElement('button');del.className='button';del.textContent='✕';del.type='button';
   del.onclick=()=>{if(opts.isRecording())return;c.speed.points=c.speed.points.filter(x=>x.id!==point.id);
    save();renderSpeedPoints();callbacks.speed();};
   row.append(del);list.append(row);
  }
  if(!pts.length)list.textContent='Коснись графика, чтобы создать точку. Перетаскивай её пальцем.';
 }
 function mountSpeed(){
  const speed=c.speed,graph=$('speedCurveGraph');
  $('speedEnabled').onchange=()=>{speed.enabled=$('speedEnabled').checked;save();callbacks.speed();};
  $('speedRate').oninput=()=>{
   speed.rate=(speed.rate<0?-1:1)*clamp($('speedRate').value,1,10);speed.enabled=true;
   refreshSpeed();save();callbacks.speed();
  };
  for(const [id,sign] of [['speedForward',1],['speedReverse',-1]]){
   $(id).onclick=()=>{speed.rate=sign*Math.abs(speed.rate||1);speed.enabled=true;refreshSpeed();save();callbacks.speed();};
  }
  $('speedReverseToggle').onchange=()=>{speed.reverse=$('speedReverseToggle').checked;
   speed.enabled=true;refreshSpeed();save();callbacks.speed();};
  $('speedCurveEnabled').onchange=()=>{speed.curveEnabled=$('speedCurveEnabled').checked;
   speed.enabled=true;refreshSpeed();save();callbacks.speed();};
  $('speedAddPoint').onclick=()=>{
   if(!opts.hasVideo()||opts.isRecording())return;
   const time=Number($('speedPointTime').value),rate=Number($('speedPointRate').value);
   if(!Number.isFinite(time)||time<0||time>source.duration||!Number.isFinite(rate)||Math.abs(rate)<1||Math.abs(rate)>10)return;
   speed.points=speed.points.filter(x=>Math.abs(x.time-time)>=.01);
   if(speed.points.length>=70)return;
   speed.points.push({id:'speed-'+Date.now().toString(36),time,rate});
   speed.curveEnabled=true;speed.enabled=true;refreshSpeed();save();callbacks.speed();
  };
  function xy(e){const r=graph.getBoundingClientRect();
   return {x:clamp((e.clientX-r.left)/Math.max(1,r.width),0,1),
    y:clamp((e.clientY-r.top)/Math.max(1,r.height),0,1)};}
  graph.addEventListener('pointerdown',e=>{
   if(!opts.hasVideo()||opts.isRecording()||e.button>0)return;
   e.preventDefault();
   const pos=xy(e),dur=Math.max(.01,Number(source.duration)||1);
   const id=e.target.closest?.('.speedPointMarker')?.dataset.pointId;
   let point=speed.points.find(p=>p.id===id)||
    speed.points.find(p=>Math.hypot(p.time/dur-pos.x,speedGraphY(p.rate)/100-pos.y)<.055);
   if(!point){if(speed.points.length>=70)return;
    point={id:'speed-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,6),
     time:Math.round(pos.x*dur*100)/100,rate:speedValueForY(pos.y*100)};
    speed.points.push(point);
   }
   draggingSpeedId=point.id;speed.enabled=true;speed.curveEnabled=true;
   $('speedPointTime').value=String(point.time);$('speedPointRate').value=String(point.rate);
   graph.setPointerCapture(e.pointerId);refreshSpeed();
  });
  graph.addEventListener('pointermove',e=>{
   if(!draggingSpeedId||!graph.hasPointerCapture(e.pointerId))return;
   const point=speed.points.find(p=>p.id===draggingSpeedId);if(!point)return;
   const pos=xy(e),dur=Math.max(.01,Number(source.duration)||1);
   point.time=Math.round(pos.x*dur*100)/100;point.rate=speedValueForY(pos.y*100);
   $('speedPointTime').value=String(point.time);$('speedPointRate').value=String(point.rate);
   renderSpeedPoints();
  });
  const finish=e=>{
   if(!draggingSpeedId)return;
   if(graph.hasPointerCapture(e.pointerId))graph.releasePointerCapture(e.pointerId);
   draggingSpeedId=null;
   speed.points.sort((a,b)=>a.time-b.time);
   for(let i=speed.points.length-1;i>0;i--)if(Math.abs(speed.points[i].time-speed.points[i-1].time)<.01)speed.points.splice(i-1,1);
   refreshSpeed();save();callbacks.speed();
  };
  graph.addEventListener('pointerup',finish);graph.addEventListener('pointercancel',finish);
  refreshSpeed();
 }
 function refreshSpeed(){
  $('speedRateText').textContent=speedLabel(c.speed.rate);
  $('speedForward').classList.toggle('active',c.speed.rate>=0);
  $('speedReverse').classList.toggle('active',c.speed.rate<0);
  $('speedReverseToggle').checked=!!c.speed.reverse;
  $('speedRate').value=String(Math.abs(c.speed.rate));
  $('speedEnabled').checked=!!c.speed.enabled;
  $('speedCurveEnabled').checked=!!c.speed.curveEnabled;
  $('speedStatus').textContent=c.speed.reverse?'Реверс работает как отдельный просмотр назад без звука; экспорт реверса пока недоступен.':
   'Минус = замедление, плюс = ускорение. Нажми на график и перетаскивай точки. Верх = быстрее, низ = медленнее.';
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
  const a=c.aging,tabs=[['cassetteLibraryTab','cassetteLibraryPage'],['cassetteAgingTab','cassetteAgingPage']];
  tabs.forEach(([id])=>$(id).onclick=()=>showSubnav(tabs,id));
  $('agingEnabled').onchange=()=>{a.enabled=$('agingEnabled').checked;refreshAging();save();};
  for(const [id,key] of [['agingAmount','amount'],['agingStart','start'],['agingEnd','end']]){
   $(id).value=String(a[key]);$(id).oninput=()=>{a[key]=Number($(id).value);refreshAging();save();};
  }
  $('agingPreviewLate').onclick=()=>{
   if(!opts.hasVideo()||opts.isRecording())return;
   source.pause();
   source.currentTime=Math.max(0,(Number(source.duration)||0)*.85-.02);
   refreshAging();callbacks.render();
  };
  refreshAging();
 }
 function refreshAging(){
  $('agingEnabled').checked=!!c.aging.enabled;
  for(const [id,key] of [['agingAmount','amount'],['agingStart','start'],['agingEnd','end']])
   $(id).value=String(c.aging[key]);
  $('agingAmountText').textContent=Math.round(c.aging.amount)+'%';
  const current=Math.round(E.agingAt(c.aging,source.currentTime||0,source.duration||0)*100);
  $('agingStatus').textContent=c.aging.enabled?
   'Старение включено. На текущем кадре разрушение: '+current+'%. От начала ('+c.aging.start+'%) до конца ('+c.aging.end+'%) оно нарастает. Чтобы увидеть сильный эффект сразу, нажми кнопку выше.':
   'Старение выключено. Включи и проверь ближе к концу ролика.';
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
  $('autoBeatGenerate').onclick=async()=>{
   if(!opts.hasVideo()||opts.isRecording()){
    $('autoBeatStatus').textContent='Сначала загрузи видео и останови экспорт.';return;
   }
   const btn=$('autoBeatGenerate');btn.disabled=true;
   try{
    const selected=$('autoBeatSource').value;
    $('autoBeatStatus').textContent=selected==='video'?'Читаю звуковую дорожку исходного видео…':'Анализирую добавленную дорожку…';
    const buffer=selected==='video'?await opts.getOriginalAudioBuffer():opts.getAudioBuffer();
    if(!buffer){
     $('autoBeatStatus').textContent='Добавь локальное аудио во вкладке «ТРЕКИ» или выбери «Звук из видео».';return;
    }
    if(opts.isRecording())return;
    const sensitivity=Number($('autoBeatSensitivity').value),effect=$('autoBeatEffect').value;
    const events=E.beatEvents(buffer,{
     sensitivity,duration:Math.min(buffer.duration,source.duration||buffer.duration),
     clip:opts.getClip(),limit:85,effect:effect==='mix'?'tapeChew':effect
    });
    if(effect==='mix')events.forEach((ev,i)=>{ev.effect=['tapeChew','vhold','rf','colorBurst'][i%4];});
    if(!events.length){$('autoBeatStatus').textContent='Не найдены отчётливые удары. Попробуй другую чувствительность или фрагмент.';return;}
    opts.onBeat(events);
    $('autoBeatStatus').textContent='Найдено '+events.length+' ударов из '+(selected==='video'?'звука самого видео':'добавленной музыки')+'. События появились во вкладке «СЦЕНЫ».';
   }catch(error){
    $('autoBeatStatus').textContent='Не удалось проанализировать дорожку: '+(error?.message||String(error));
   }finally{btn.disabled=false;}
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
  $('faceAuto').onclick=async()=>{
   if(!faceDetector){pulse('Детектор недоступен. Выдели лицо пальцем — дальше маска будет отслеживаться локально.');return;}
   if(faceBusy)return;
   c.touch.facesEnabled=true;c.touch.faceAutodetect=true;
   $('faceEnabled').checked=true;
   autoBoxes=[];autoClip=-1;faceLast=-1;resetTracking();
   pulse('Ищу лица на текущем кадре…');
   const count=await detectFace();
   save();
   pulse(count?'Найдено лиц: '+count+'. Маски движутся вслед за лицами. Для другой сцены повтори поиск.':
    'На текущем кадре лица не распознаны. Останови видео на чётком лице и повтори поиск или выдели лицо пальцем.');
  };
  $('faceMark').onclick=()=>{
   tool=tool==='face'?'':'face';$('faceMark').textContent=tool?'✓ Закончить выделение':'＋ Выделить лицо пальцем';
   updateOverlay();pulse(tool?'Обведи лицо прямоугольником на основном кадре вверху.':'Режим выделения выключен.');
   if(tool)window.scrollTo({top:0,behavior:'smooth'});
  };
  $('faceClear').onclick=()=>{
   c.touch.manualFaces=[];c.touch.faceAutodetect=false;autoBoxes=[];autoClip=-1;faceLast=-1;resetTracking();save();
   pulse('Все маски лиц убраны.');
  };
  startOverlay();initFaceDetector().then(ok=>{
   pulse(ok?'Автоматический поиск лиц работает локально; доступно и ручное выделение с трекингом.':
    'В Safari доступно ручное выделение лица с отслеживанием движения по кадрам.');
  });
 }
 function syncButtons(){
  const can=!!opts.hasVideo()&&!opts.isRecording();
  for(const id of ['touchStartDrawing','faceAuto','faceMark'])$(id).disabled=!can;
  if(!can&&tool){tool='';drawing=null;}
  if(tool||!overlay.hidden)updateOverlay();
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
